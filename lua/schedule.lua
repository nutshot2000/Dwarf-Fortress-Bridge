-- Military scheduling: per-squad routines (alerts) x 12 months x orders, patrol waypoints/routes,
-- and switching every squad to an alert routine at once.
if not need_map() then return end
local action = ARGS.action or 'list'
local ent = df.global.plotinfo.main.fortress_entity
local A = df.global.plotinfo.alerts
local WP = df.global.plotinfo.waypoints
local MONTHS = {'Granite', 'Slate', 'Felsite', 'Hematite', 'Malachite', 'Galena', 'Limestone', 'Sandstone',
  'Timber', 'Moonstone', 'Opal', 'Obsidian'}

local function routine_idx(r)
  if r == nil then return nil end
  if type(r) == 'number' then return r end
  local want = tostring(r):lower()
  for i, rt in ipairs(A.routines) do
    if rt.name:lower() == want or rt.name:lower():find(want, 1, true) then return i end
  end
end
local function squads()
  local t = {}
  for _, id in ipairs(ent.squads) do local s = df.squad.find(id) if s then table.insert(t, s) end end
  return t
end
local function order_desc(o)
  local t = df.squad_order_type[o:getType()]
  if t == 'PATROL_ROUTE' then
    for _, r in ipairs(WP.routes) do if r.id == o.route_id then return 'patrol ' .. r.name end end
    return 'patrol route ' .. o.route_id
  elseif t == 'DEFEND_BURROWS' then
    local names = {}
    for _, id in ipairs(o.burrows) do local b = df.burrow.find(id) table.insert(names, b and b.name or tostring(id)) end
    return 'defend ' .. table.concat(names, ',')
  elseif t == 'MOVE' then return ('station %d,%d,%d'):format(o.pos.x, o.pos.y, o.pos.z)
  elseif t == 'TRAIN' then return 'train' end
  return t
end
local function month_summary(sq, r)
  local out = {}
  for m = 0, 11 do
    local e = sq.schedule.routine[r].month[m]
    local parts = {}
    for _, so in ipairs(e.orders) do table.insert(parts, order_desc(so.order) .. ' x' .. so.min_count) end
    out[MONTHS[m + 1]] = #parts > 0 and table.concat(parts, '; ') or 'off duty'
  end
  return out
end
local function find_burrow(ref)
  if type(ref) == 'number' then return df.burrow.find(ref) end
  return ref and dfhack.burrows.findByName(ref)
end

-- ---------- waypoints / routes ----------
if action == 'routes' then
  local pts, rts = {}, {}
  for _, p in ipairs(WP.points) do table.insert(pts, {id = p.id, name = p.name, x = p.pos.x, y = p.pos.y, z = p.pos.z}) end
  for _, r in ipairs(WP.routes) do
    local ids = {} for _, id in ipairs(r.points) do table.insert(ids, id) end
    table.insert(rts, {id = r.id, name = r.name, points = ids})
  end
  emit({points = pts, routes = rts}) return
end
if action == 'add_point' then
  local p = df.pointst:new()
  p.id = WP.next_point_id
  WP.next_point_id = WP.next_point_id + 1
  p.name = ARGS.name or ('Point ' .. p.id)
  p.pos = xyz2pos(ARGS.x, ARGS.y, ARGS.z)
  p.tile = 33 p.fg_color = 11 p.bg_color = 1
  WP.points:insert('#', p)
  emit({ok = true, point = {id = p.id, name = p.name, x = ARGS.x, y = ARGS.y, z = ARGS.z}}) return
end
if action == 'add_route' then
  local r = df.routest:new()
  r.id = WP.next_route_id
  WP.next_route_id = WP.next_route_id + 1
  r.name = ARGS.name or ('Route ' .. r.id)
  for _, id in ipairs(ARGS.point_ids or {}) do r.points:insert('#', id) end
  WP.routes:insert('#', r)
  emit({ok = true, route = {id = r.id, name = r.name, points = ARGS.point_ids}}) return
end

-- ---------- alerts ----------
if action == 'alert' then
  local r = routine_idx(ARGS.routine)
  if not r then emit({error = 'Unknown routine ' .. tostring(ARGS.routine)}) return end
  local n = 0
  for _, sq in ipairs(squads()) do sq.cur_routine_idx = r n = n + 1 end
  emit({ok = true, routine = A.routines[r].name, squads = n}) return
end

-- ---------- schedules ----------
if action == 'list' then
  local out, rnames = {}, {}
  for i, rt in ipairs(A.routines) do table.insert(rnames, i .. ': ' .. rt.name) end
  for _, sq in ipairs(squads()) do
    if not ARGS.squad_id or ARGS.squad_id == sq.id then
      local per = {}
      for i, rt in ipairs(A.routines) do
        if not ARGS.routine or routine_idx(ARGS.routine) == i then per[rt.name] = month_summary(sq, i) end
      end
      table.insert(out, {squad = sq.id, name = dfhack.df2utf(dfhack.military.getSquadName(sq.id)),
        active_routine = A.routines[sq.cur_routine_idx] and A.routines[sq.cur_routine_idx].name, schedule = per})
    end
  end
  emit({routines = rnames, squads = out}) return
end

if action == 'set' then
  local sq = df.squad.find(ARGS.squad_id or -1)
  if not sq then emit({error = 'No squad ' .. tostring(ARGS.squad_id)}) return end
  local r = routine_idx(ARGS.routine)
  if not r then emit({error = 'Unknown routine ' .. tostring(ARGS.routine)}) return end
  local months = {}
  if not ARGS.months or ARGS.months == 'all' then for m = 0, 11 do table.insert(months, m) end
  else
    for _, name in ipairs(ARGS.months) do
      for i, mn in ipairs(MONTHS) do if mn:lower() == tostring(name):lower() then table.insert(months, i - 1) end end
    end
  end
  local kind = (ARGS.order or 'train'):lower()
  local function make_order()
    local o
    if kind == 'train' then o = df.squad_order_trainst:new()
    elseif kind == 'patrol' then
      o = df.squad_order_patrol_routest:new()
      o.route_id = ARGS.route_id or -1
    elseif kind == 'defend' then
      local b = find_burrow(ARGS.burrow)
      if not b then return nil, 'No burrow ' .. tostring(ARGS.burrow) end
      o = df.squad_order_defend_burrowsst:new()
      o.burrows:insert('#', b.id)
    elseif kind == 'station' then
      o = df.squad_order_movest:new()
      o.pos = xyz2pos(ARGS.x, ARGS.y, ARGS.z)
      o.point_id = ARGS.point_id or -1
    elseif kind == 'off' then return false
    else return nil, 'order must be train, patrol, defend, station or off' end
    o.year, o.year_tick = df.global.cur_year, df.global.cur_year_tick
    return o
  end
  local slots = #sq.positions
  local min = ARGS.min_count or slots
  for _, m in ipairs(months) do
    local e = sq.schedule.routine[r].month[m]
    for i = #e.orders - 1, 0, -1 do
      local so = e.orders[i]
      e.orders:erase(i)
      pcall(function() so.order:delete() end)
      so:delete()
    end
    local o, err = make_order()
    if o == nil then emit({error = err}) return end
    if o then
      local so = df.squad_schedule_order:new()
      so.order = o
      so.min_count = min
      so.positions:resize(slots)
      for p = 0, slots - 1 do so.positions[p] = true end
      e.orders:insert('#', so)
    end
    for p = 0, #e.order_assignments - 1 do e.order_assignments[p].assigned_order_idx = o and 0 or -1 end
  end
  emit({ok = true, squad = sq.id, routine = A.routines[r].name, schedule = month_summary(sq, r)}) return
end
emit({error = 'Unknown action ' .. action})
