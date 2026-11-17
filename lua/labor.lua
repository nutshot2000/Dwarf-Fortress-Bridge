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
local unit_labors = enabled_labors -- prelude
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
    table.insert(units, {id = u.id, name = unit_name(u), labors = unit_labors(u),
      specialized = u.flags4.only_do_assigned_jobs or nil})
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
  -- The full list is ~80 names; action=list shows it when needed.
  local out = {ok = true, unit = unit_name(u), [action .. 'd'] = done, labor_count = #unit_labors(u)}
  if autolabor_legacy() and #u.burrows == 0 and u.military.squad_id < 0 then
    out.note = 'DFHack autolabor (legacy mode) rewrites this unit\'s labors within a day; it leaves alone only units in a burrow or a squad.'
  end
  emit(out) return
end

-- Specialize = the citizen sheet's "only do assigned jobs": the unit keeps the labors of its own work details.
-- Under DFHack autolabor in legacy mode work details are off and autolabor rewrites the labors anyway.
if action == 'specialize' or action == 'unspecialize' then
  local on = action == 'specialize'
  u.flags4.only_do_assigned_jobs = on
  local removed = {}
  if on then
    local mine = {}
    for _, w in ipairs(details) do if in_detail(w, u.id) then mine[#mine + 1] = w end end
    for _, name in ipairs(enabled_labors(u)) do
      local i, keep = df.unit_labor[name], false
      for _, w in ipairs(mine) do keep = keep or w.allowed_labors[i] end
      if not keep then u.status.labors[i] = false table.insert(removed, name) end
    end
  end
  emit({ok = true, unit = unit_name(u), specialized = on, removed = removed, labors = unit_labors(u),
    warning = on and autolabor_legacy() and 'DFHack autolabor runs in legacy mode: it ignores specialization and will hand the labors back. Put the unit in a burrow (autolabor skips those) or switch autolabor to modern mode.' or nil}) return
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
