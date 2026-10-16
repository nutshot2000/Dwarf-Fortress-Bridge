-- Squads: list, create, add/remove members, station, kill orders, cancel.
if not need_map() then return end
local ent = df.historical_entity.find(df.global.plotinfo.group_id)
local action = ARGS.action or 'list'

local function hf_unit(hfid)
  if hfid < 0 then return nil end
  local hf = df.historical_figure.find(hfid)
  return hf and df.unit.find(hf.unit_id)
end
local function squad_info(sq)
  local members = {}
  for i, p in ipairs(sq.positions) do
    local u = hf_unit(p.occupant)
    if u then table.insert(members, ('%d: #%d %s'):format(i, u.id, unit_name(u))) end
  end
  local orders = {}
  for _, o in ipairs(sq.orders) do
    table.insert(orders, try(function() return dfhack.df2utf(o:getDescription()) end, df.squad_order_type[o:getType()]))
  end
  return {id = sq.id, name = try(function() return dfhack.df2utf(dfhack.military.getSquadName(sq.id)) end),
    slots = #sq.positions, members = members, orders = orders}
end
local function get_squad()
  local sq = df.squad.find(ARGS.squad_id or -1)
  local ours = false
  for _, id in ipairs(ent.squads) do if sq and id == sq.id then ours = true end end
  if not ours then
    emit({error = 'Squad ' .. tostring(ARGS.squad_id) .. ' is not one of this fort\'s squads. Use action=list.'})
    return nil
  end
  return sq
end

if action == 'list' then
  local out = {}
  for _, id in ipairs(ent.squads) do
    local sq = df.squad.find(id)
    if sq then table.insert(out, squad_info(sq)) end
  end
  -- leader positions that could get a squad
  local leaders = {}
  for _, a in ipairs(ent.positions.assignments) do
    for _, p in ipairs(ent.positions.own) do
      if p.id == a.position_id and p.squad_size > 0 then
        local u = hf_unit(a.histfig)
        table.insert(leaders, {position = p.code, holder = u and unit_name(u) or nil,
          has_squad = a.squad_id >= 0, squad_size = p.squad_size})
      end
    end
  end
  emit({squads = out, leader_positions = leaders}) return
end

if action == 'create' then
  local code = (ARGS.position or 'MILITIA_COMMANDER'):upper()
  local asn
  for _, a in ipairs(ent.positions.assignments) do
    for _, p in ipairs(ent.positions.own) do
      if p.id == a.position_id and p.code == code then asn = a end
    end
  end
  if not asn then emit({error = 'No position ' .. code}) return end
  if asn.histfig < 0 then emit({error = code .. ' is vacant: appoint someone with df_noble first.'}) return end
  local sq = dfhack.military.makeSquad(asn.id)
  if not sq then emit({error = 'makeSquad failed (squad may already exist for ' .. code .. ')'}) return end
  if ARGS.name then sq.alias = ARGS.name end
  -- seat the position holder as squad leader
  local u = hf_unit(asn.histfig)
  if u and sq.positions[0].occupant < 0 and u.military.squad_id < 0 then
    sq.positions[0].occupant = asn.histfig
    u.military.squad_id = sq.id
    u.military.squad_position = 0
  end
  emit({ok = true, squad = squad_info(sq)}) return
end

if action == 'add' then
  local sq = get_squad() if not sq then return end
  local ok = dfhack.military.addToSquad(ARGS.unit_id, sq.id, -1)
  if not ok then emit({error = 'addToSquad failed (unit already in a squad, squad full, or leader slot vacant)'}) return end
  emit({ok = true, squad = squad_info(sq)}) return
end

if action == 'remove' then
  local ok = dfhack.military.removeFromSquad(ARGS.unit_id)
  emit({ok = ok}) return
end

local sq = get_squad() if not sq then return end

local ROUTINES = {off = 0, off_duty = 0, staggered = 1, staggered_training = 1, constant = 2, constant_training = 2, ready = 3}
if action == 'train' then
  local r = ROUTINES[(ARGS.routine or 'staggered'):lower()]
  if not r then emit({error = 'routine must be off, staggered, constant or ready'}) return end
  sq.cur_routine_idx = r
  emit({ok = true, squad = squad_info(sq), routine = df.global.plotinfo.alerts.routines[r].name,
    hint = 'Squads train in a barracks: create a zone type B and use action=barracks.'}) return
end

if action == 'barracks' then
  local z = df.building.find(ARGS.zone_id or -1)
  if not z or not df.building_civzonest:is_instance(z) then emit({error = 'No zone ' .. tostring(ARGS.zone_id)}) return end
  local flags = {sleep = ARGS.sleep or false, train = ARGS.train ~= false, indiv_eq = true, squad_eq = true}
  local ok, err = pcall(function() dfhack.military.updateRoomAssignments(sq.id, z.id, flags) end)
  if not ok then emit({error = 'updateRoomAssignments failed: ' .. tostring(err)}) return end
  emit({ok = true, squad = squad_info(sq), barracks = z.id, flags = flags}) return
end

if action == 'uniform' then
  local e = df.global.plotinfo.main.fortress_entity or ent
  local want = ARGS.template and tostring(ARGS.template):lower() or 'melee, leather armor'
  local u
  for _, t in ipairs(e.uniforms) do
    if tostring(t.id) == want or t.name:lower() == want or t.name:lower():find(want, 1, true) then u = t break end
  end
  if not u then
    local names = {}
    for _, t in ipairs(e.uniforms) do table.insert(names, t.id .. ': ' .. t.name) end
    emit({error = 'No uniform template ' .. want, templates = names}) return
  end
  local set = 0
  for _, pos in ipairs(sq.positions) do
    local eq = pos.equipment
    for s = 0, 6 do
      local slot = eq.uniform[s]
      for i = #slot - 1, 0, -1 do local sp = slot[i] slot:erase(i) sp:delete() end
      for k, itype in ipairs(u.uniform_item_types[s]) do
        local spec = df.squad_uniform_spec:new()
        spec.item = -1
        spec.item_type = itype
        spec.item_subtype = u.uniform_item_subtypes[s][k]
        local info = u.uniform_item_info[s][k]
        spec.material_class = info.material_class
        spec.mattype = info.mattype
        spec.matindex = info.matindex
        pcall(function() spec.indiv_choice:assign(info.indiv_choice) end)
        slot:insert('#', spec)
      end
    end
    eq.flags.replace_clothing = ARGS.replace_clothing or false
    set = set + 1
  end
  -- tell the game to redo equipment assignment (its Military screen sets these when a uniform changes)
  local upd = df.global.plotinfo.equipment.update
  for _, k in ipairs({'weapon', 'armor', 'shoes', 'shield', 'helm', 'gloves', 'ammo', 'pants', 'backpack', 'quiver', 'flask'}) do upd[k] = true end
  emit({ok = true, squad = squad_info(sq), uniform = u.name, positions = set,
    hint = 'Dwarves equip whatever matching items exist; make or buy armour and weapons.'}) return
end

if action == 'cancel' then
  for i = #sq.orders - 1, 0, -1 do
    local o = sq.orders[i]
    sq.orders:erase(i)
    o:delete()
  end
  emit({ok = true, squad = squad_info(sq)}) return
end
if action == 'station' then
  local o = df.squad_order_movest:new()
  o.pos = xyz2pos(ARGS.x, ARGS.y, ARGS.z)
  o.point_id = -1
  o.year, o.year_tick = df.global.cur_year, df.global.cur_year_tick
  sq.orders:insert('#', o)
  emit({ok = true, squad = squad_info(sq)}) return
end
if action == 'kill' then
  local o = df.squad_order_kill_listst:new()
  for _, id in ipairs(ARGS.unit_ids or {}) do
    local t = df.unit.find(id)
    if t then
      o.units:insert('#', id)
      if t.hist_figure_id >= 0 then o.histfigs:insert('#', t.hist_figure_id) end
    end
  end
  if #o.units == 0 then o:delete() emit({error = 'No valid target units'}) return end
  o.title = 'Kill'
  o.year, o.year_tick = df.global.cur_year, df.global.cur_year_tick
  sq.orders:insert('#', o)
  emit({ok = true, squad = squad_info(sq)}) return
end
emit({error = 'Unknown action ' .. action})
