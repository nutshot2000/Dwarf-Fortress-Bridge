local utils = require('utils')
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

if action == 'status' then
  -- per soldier: gear worn vs assigned, empty uniform slots, what they are doing; per squad: routine and orders
  local A = df.global.plotinfo.alerts
  local out = {}
  for _, s in ipairs(df.global.world.squads.all) do
    if s.entity_id == df.global.plotinfo.group_id and (not ARGS.squad_id or ARGS.squad_id == s.id) then
      local orders = {}
      for _, o in ipairs(s.orders) do orders[#orders + 1] = tostring(o._type):match('squad_order_(%w+)') or '?' end
      local rt = A.routines[s.cur_routine_idx]
      local members = {}
      for _, p in ipairs(s.positions) do
        local u = hf_unit(p.occupant)
        if u then
          local inv = {}
          for _, x in ipairs(u.inventory) do inv[x.item.id] = true end
          local worn, empty = 0, {}
          for _, id in ipairs(p.equipment.assigned_items) do if inv[id] then worn = worn + 1 end end
          for sl = 0, 6 do for _, sp in ipairs(p.equipment.uniform[sl]) do
            if #sp.assigned == 0 then empty[#empty + 1] = df.item_type[sp.item_type] end
          end end
          members[#members + 1] = {name = unit_name(u), worn = worn .. '/' .. #p.equipment.assigned_items,
            empty_slots = #empty > 0 and table.concat(empty, ',') or nil,
            at = u.pos.x .. ',' .. u.pos.y .. ',' .. u.pos.z, doing = unit_job(u)}
        end
      end
      -- A failed add (or a death in the squad) can leave a dwarf pointing at the squad without holding a
      -- position: they go off to "train with the squad" instead of working. Clear the stale link.
      local stale = {}
      for _, u in ipairs(citizens()) do
        if u.military.squad_id == s.id then
          local held = false
          for _, p in ipairs(s.positions) do if p.occupant == u.hist_figure_id then held = true end end
          if not held then
            u.military.squad_id, u.military.squad_position = -1, -1
            stale[#stale + 1] = unit_name(u)
          end
        end
      end
      out[#out + 1] = {id = s.id, name = dfhack.df2utf(s.alias ~= '' and s.alias or dfhack.translation.translateName(s.name, true)),
        routine = rt and rt.name, orders = orders, members = members,
        released_stale = #stale > 0 and stale or nil}
    end
  end
  emit({squads = out, hint = 'worn < assigned: soldiers still fetching; empty_slots: run action=equip or make that gear.'}) return
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
  -- unit_id or unit_ids (one call per soldier: addToSquad takes a single unit).
  local ids = ARGS.unit_ids or {ARGS.unit_id}
  if #ids == 0 then emit({error = 'add needs unit_id or unit_ids'}) return end
  local failed = {}
  for _, id in ipairs(ids) do
    -- With the leader slot (0) vacant, "first free slot" picks it and fails: the leader slot is reserved for the
    -- squad's noble. Fall back to each free slot after it.
    local ok = dfhack.military.addToSquad(id, sq.id, -1)
    for i = 1, #sq.positions - 1 do
      if ok then break end
      if sq.positions[i].occupant == -1 then ok = dfhack.military.addToSquad(id, sq.id, i) end
    end
    if not ok then failed[#failed + 1] = id end
  end
  if #failed == #ids then emit({error = 'addToSquad failed (unit already in a squad, squad full, or leader slot vacant)', unit_ids = failed}) return end
  emit({ok = true, failed = #failed > 0 and failed or nil, squad = squad_info(sq)}) return
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

if action == 'equip' then
  -- Assign free matching items to every empty uniform slot of squad_id, the way the game's
  -- equipment pass does (slot.assigned + plotinfo.equipment assigned/unassigned index).
  -- Use when dwarves stay unequipped although matching gear exists.
  local E = df.global.plotinfo.equipment
  local taken = {}
  for _, p in ipairs(sq.positions) do for s = 0, 6 do for _, sp in ipairs(p.equipment.uniform[s]) do
    for _, id in ipairs(sp.assigned) do taken[id] = true end end end end
  local function is_metal(it)
    local m = dfhack.matinfo.decode(it)
    return m and m.material and m.material.flags.IS_METAL
  end
  local function fits(sp, it, u)
    if it.flags.forbid or it.flags.trader or it.flags.removed then return false end
    if it.flags.in_job then return false end
    if it.flags.in_inventory then
      -- in_inventory also marks items in bins (fine); of gear a creature carries, only this soldier's own counts
      local holder = dfhack.items.getHolderUnit(it)
      if holder and not (u and holder.id == u.id) then return false end
    end
    if sp.item_subtype >= 0 and it:getSubtype() ~= sp.item_subtype then return false end
    if sp.mattype >= 0 and (it:getMaterial() ~= sp.mattype or it:getMaterialIndex() ~= sp.matindex) then return false end
    if df.item_type[sp.item_type] == 'WEAPON' then
      local d = it.subtype
      if d.id == 'ITEM_WEAPON_PICK' then return false end
      local ranged = d.skill_ranged >= 0
      if sp.indiv_choice.melee and ranged then return false end
      if sp.indiv_choice.ranged and not ranged then return false end
    elseif sp.material_class == df.entity_material_category.Armor and not is_metal(it)
        and df.item_type[sp.item_type] ~= 'SHIELD' then -- any shield beats none
      return false
    end
    return true
  end
  local done, missing = {}, {}
  for pi, p in ipairs(sq.positions) do
    if p.occupant >= 0 then
      local hf = df.historical_figure.find(p.occupant)
      local u = hf and df.unit.find(hf.unit_id)
      for s = 0, 6 do
        for _, sp in ipairs(p.equipment.uniform[s]) do
          -- gloves and boots are single items: a slot wants a pair
          local tname = df.item_type[sp.item_type]
          local want = (tname == 'GLOVES' or tname == 'SHOES') and 2 or 1
          while #sp.assigned < want do
            -- search every item of the type: freed gear can be missing from the unassigned index
            -- the most valuable fitting item (a bronze shield over a wooden one, steel over copper); what the
            -- soldier already wears wins ties, so a re-equip does not swap gear for nothing
            -- real armour before clothing: a silk dress is worth more than leather armour but protects nothing
            local function score(it)
              return try(function() return it.subtype.armorlevel end, 0) * 1e6 + dfhack.items.getValue(it)
            end
            local pick, best = nil, -1
            if u then
              for _, inv in ipairs(u.inventory) do
                local it = inv.item
                if it:getType() == sp.item_type and not taken[it.id] and fits(sp, it, u) then
                  local v = score(it)
                  if v > best then pick, best = it, v end
                end
              end
            end
            for _, it in ipairs(df.global.world.items.other[df.item_type[sp.item_type]]) do
              if not taken[it.id] and fits(sp, it, u) then
                local v = score(it)
                if v > best then pick, best = it, v end
              end
            end
            if not pick then break end
            local id = pick.id
            local un = E.items_unassigned[sp.item_type]
            local i = utils.linear_index(un, id)
            if i then un:erase(i) end
            local as = E.items_assigned[sp.item_type]
            if not utils.linear_index(as, id) then utils.insert_sorted(as, id) end
            sp.assigned:insert('#', id)
            utils.insert_sorted(p.equipment.assigned_items, id) -- dwarves fetch what is listed here
            taken[id] = true
            table.insert(done, (u and unit_name(u) or ('pos ' .. pi)) .. ': ' .. dfhack.df2utf(dfhack.items.getReadableDescription(df.item.find(id))))
          end
          if #sp.assigned == 0 then
            do
              table.insert(missing, (u and unit_name(u):match('^(%S+)') or ('pos ' .. pi)) .. ' ' .. df.item_type[sp.item_type])
            end
          end
        end
      end
    end
  end
  -- keep each position's assigned_items consistent with its slots (older assignments included)
  local synced = 0
  for _, p in ipairs(sq.positions) do
    for s = 0, 6 do for _, sp in ipairs(p.equipment.uniform[s]) do for _, id in ipairs(sp.assigned) do
      if not utils.linear_index(p.equipment.assigned_items, id) then
        utils.insert_sorted(p.equipment.assigned_items, id) synced = synced + 1
      end
    end end end
  end
  emit({ok = true, assigned = done, still_missing = missing, synced = synced,
    hint = 'Dwarves now collect the assigned items. still_missing = make or buy those.'}) return
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
  local E = df.global.plotinfo.equipment
  for _, pos in ipairs(sq.positions) do
    local eq = pos.equipment
    -- Wiping the slots alone leaves the old gear in assigned_items, and soldiers keep fetching all of it:
    -- release every old assignment back to the unassigned index too.
    for i = #eq.assigned_items - 1, 0, -1 do
      local id = eq.assigned_items[i]
      local it = df.item.find(id)
      if it then
        local t = it:getType()
        local as = E.items_assigned[t]
        local k = as and utils.linear_index(as, id)
        if k then as:erase(k) end
        local un = E.items_unassigned[t]
        if un and not utils.linear_index(un, id) then utils.insert_sorted(un, id) end
      end
      eq.assigned_items:erase(i)
    end
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
        spec.color = info.item_color
        pcall(function() spec.indiv_choice:assign(info.indiv_choice) end)
        slot:insert('#', spec)
      end
    end
    eq.flags.replace_clothing = ARGS.replace_clothing or false
    -- Without exact_matches the game fills a "metal armor" body slot with any ARMOR item, wool dresses included.
    eq.flags.exact_matches = u.flags.exact_matches
    set = set + 1
  end
  -- Do not set plotinfo.equipment.update here: the game's own pass then re-fills "metal armor" body slots with
  -- wool dresses and cloth gloves over our assignments. The JS side runs action=equip right after this.
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
  for _, id in ipairs(ARGS.unit_ids or (ARGS.unit_id and {ARGS.unit_id}) or {}) do
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
  -- soldiers ignore targets the game does not count as hostile (werebeasts in human form, visitors)
  local calm = {}
  for _, id in ipairs(o.units) do
    local t = df.unit.find(id)
    if t and not dfhack.units.isDanger(t) then table.insert(calm, unit_name(t)) end
  end
  emit({ok = true, squad = squad_info(sq), warning = #calm > 0 and
    ('Not hostile right now, soldiers will ignore the order: ' .. table.concat(calm, ', ') ..
     '. Station the squad nearby instead and it will fight once the target turns hostile.') or nil}) return
end
emit({error = 'Unknown action ' .. action})
