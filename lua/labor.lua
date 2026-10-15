-- Labors and work details. DF only applies work details when its screen is used,
-- so membership changes also set the unit's labors directly (as DFHack autofish does).
if not need_map() then return end
local details = df.global.plotinfo.labor_info.work_details
local action = ARGS.action or 'list'

local function find_detail(name)
  name = (name or ''):lower()
  for _, w in ipairs(details) do if w.name:lower() == name then return w end end
end
local function labors_of(w)
  local t = {}
  for i, name in ipairs(df.unit_labor) do
    if name ~= 'NONE' and w.allowed_labors[i] then table.insert(t, name) end
  end
  return t
end
local function unit_labors(u)
  local t = {}
  for i, name in ipairs(df.unit_labor) do
    if name ~= 'NONE' and u.status.labors[i] then table.insert(t, name) end
  end
  return t
end
local function in_detail(w, id)
  for k, v in ipairs(w.assigned_units) do if v == id then return k end end
end

if action == 'list' then
  local out = {}
  for _, w in ipairs(details) do
    local names = {}
    for _, id in ipairs(w.assigned_units) do
      local u = df.unit.find(id)
      if u then table.insert(names, ('%d %s'):format(id, unit_name(u))) end
    end
    table.insert(out, {name = w.name, mode = df.work_detail_mode[w.flags.mode], labors = labors_of(w), units = names})
  end
  local units = {}
  for _, u in ipairs(citizens()) do
    table.insert(units, {id = u.id, name = unit_name(u), labors = unit_labors(u)})
  end
  emit({work_details = out, units = units}) return
end

local u = df.unit.find(ARGS.unit_id or -1)
if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end

if action == 'enable' or action == 'disable' then
  local on = action == 'enable'
  local done = {}
  for _, name in ipairs(ARGS.labors or {}) do
    local idx = df.unit_labor[name:upper()]
    if not idx then emit({error = 'Unknown labor ' .. name}) return end
    u.status.labors[idx] = on
    table.insert(done, name:upper())
  end
  emit({ok = true, unit = unit_name(u), [action .. 'd'] = done, labors = unit_labors(u)}) return
end

if action == 'detail_add' or action == 'detail_remove' then
  local w = find_detail(ARGS.detail)
  if not w then emit({error = 'No work detail "' .. tostring(ARGS.detail) .. '"'}) return end
  local add = action == 'detail_add'
  local k = in_detail(w, u.id)
  if add and not k then w.assigned_units:insert('#', u.id) end
  if not add and k then w.assigned_units:erase(k) end
  for i, name in ipairs(df.unit_labor) do
    if name ~= 'NONE' and w.allowed_labors[i] then u.status.labors[i] = add end
  end
  emit({ok = true, unit = unit_name(u), detail = w.name, member = add, labors = unit_labors(u)}) return
end

emit({error = 'Unknown action ' .. action})
