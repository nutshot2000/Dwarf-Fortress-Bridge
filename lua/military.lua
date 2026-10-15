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
