-- Burrows and alerts: create burrows, paint rectangles, assign units, civilian alert on/off.
if not need_map() then return end
local B = df.global.plotinfo.burrows
local A = df.global.plotinfo.alerts
local action = ARGS.action or 'list'
local function bname(b) return (b.name ~= '' and dfhack.df2utf(b.name)) or ('Burrow ' .. b.id) end

local function find(ref)
  if type(ref) == 'number' then return df.burrow.find(ref) end
  if ref then return dfhack.burrows.findByName(ref) end
end
local function binfo(b)
  local tiles = 0
  for _, blk in ipairs(dfhack.burrows.listBlocks(b)) do
    for x = 0, 15 do for y = 0, 15 do
      if dfhack.burrows.isAssignedBlockTile(b, blk, x, y) then tiles = tiles + 1 end
    end end
  end
  return {id = b.id, name = bname(b), tiles = tiles, units = #b.units}
end
local function alert_info()
  local list = {}
  for i, a in ipairs(A.list) do
    local bs = {}
    for _, id in ipairs(a.burrows) do table.insert(bs, id) end
    table.insert(list, {index = i, id = a.id, name = a.name, burrows = bs, active = (i == A.civ_alert_idx) or nil})
  end
  return list
end

if action == 'list' then
  local out = {}
  for _, b in ipairs(B.list) do table.insert(out, binfo(b)) end
  emit({burrows = out, alerts = alert_info()}) return
end

if action == 'create' then
  local b = df.burrow:new()
  b.id = B.next_id
  B.next_id = B.next_id + 1
  b.name = ARGS.name or ('Burrow ' .. b.id)
  B.list:insert('#', b)
  emit({ok = true, burrow = binfo(b)}) return
end

if action == 'alert_on' or action == 'alert_off' then
  if action == 'alert_off' then
    A.civ_alert_idx = 0
    -- Ending the alert does not free anyone: a dwarf assigned to a burrow still only works inside it, which
    -- quietly stops jobs elsewhere (a door removal waited days). Release them with clear_units=true.
    local tied, cleared = 0, 0
    for _, u in ipairs(citizens()) do
      for _, b in ipairs(df.global.plotinfo.burrows.list) do
        if dfhack.burrows.isAssignedUnit(b, u) then
          if ARGS.clear_units then dfhack.burrows.setAssignedUnit(b, u, false) cleared = cleared + 1 else tied = tied + 1 end
        end
      end
    end
    emit({ok = true, alerts = alert_info(), released_assignments = cleared > 0 and cleared or nil,
      warning = tied > 0 and (tied .. ' citizen burrow assignment(s) remain: those dwarves still work only inside their burrows. Repeat with clear_units=true to release them.') or nil}) return
  end
  local b = find(ARGS.burrow)
  if not b then emit({error = 'No burrow ' .. tostring(ARGS.burrow)}) return end
  -- reuse or create an alert that restricts civilians to this burrow
  local idx
  for i, a in ipairs(A.list) do
    if i > 0 and #a.burrows == 1 and a.burrows[0] == b.id then idx = i end
  end
  if not idx then
    local a = df.alert_statest:new()
    a.id = A.next_id
    A.next_id = A.next_id + 1
    a.name = 'Civilian alert: ' .. bname(b)
    a.burrows:insert('#', b.id)
    A.list:insert('#', a)
    idx = #A.list - 1
  end
  A.civ_alert_idx = idx
  emit({ok = true, alerts = alert_info()}) return
end

local b = find(ARGS.burrow)
if not b then emit({error = 'No burrow ' .. tostring(ARGS.burrow) .. ' (name or id)'}) return end

if action == 'add_rect' or action == 'remove_rect' then
  local on = action == 'add_rect'
  local z1, z2 = ARGS.z1 or ARGS.z, ARGS.z2 or ARGS.z
  local n = 0
  for z = math.min(z1, z2), math.max(z1, z2) do
    for x = math.min(ARGS.x1, ARGS.x2), math.max(ARGS.x1, ARGS.x2) do
      for y = math.min(ARGS.y1, ARGS.y2), math.max(ARGS.y1, ARGS.y2) do
        if dfhack.burrows.setAssignedTile(b, xyz2pos(x, y, z), on) then n = n + 1 end
      end
    end
  end
  emit({ok = true, changed_tiles = n, burrow = binfo(b)}) return
end
if action == 'clear_tiles' then dfhack.burrows.clearTiles(b) emit({ok = true, burrow = binfo(b)}) return end

if action == 'add_units' or action == 'remove_units' then
  local on = action == 'add_units'
  local list = {}
  if ARGS.all_citizens then list = citizens()
  else for _, id in ipairs(ARGS.unit_ids or {}) do local u = df.unit.find(id) if u then table.insert(list, u) end end end
  for _, u in ipairs(list) do dfhack.burrows.setAssignedUnit(b, u, on) end
  emit({ok = true, changed_units = #list, burrow = binfo(b)}) return
end
if action == 'clear_units' then dfhack.burrows.clearUnits(b) emit({ok = true, burrow = binfo(b)}) return end
emit({error = 'Unknown action ' .. action})
