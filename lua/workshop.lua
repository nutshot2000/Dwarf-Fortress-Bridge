-- Workshops: list them with their queued jobs and available tasks, add tasks
-- directly (like the in-game "Add task" button, no manager needed), or cancel.
if not need_map() then return end
local workshops = require('dfhack.workshops')
local utils = require('utils')
local action = ARGS.action or 'list'

local function is_shop(b)
  return df.building_workshopst:is_instance(b) or df.building_furnacest:is_instance(b)
end
local function shop_type(b)
  local bt = df.building_type[b:getType()]
  local sub = df.building_workshopst:is_instance(b) and df.workshop_type[b.type] or df.furnace_type[b.type]
  return bt .. ':' .. tostring(sub)
end
local function task_list(b)
  local jobs = workshops.getJobs(b:getType(), b:getSubtype(), b:getCustomType()) or {}
  local list = {}
  for _, j in pairs(jobs) do table.insert(list, j) end
  table.sort(list, function(a, c) return a.name < c.name end)
  return list
end
local function queued(b)
  local out = {}
  for _, j in ipairs(b.jobs) do
    local worker = dfhack.job.getWorker(j)
    table.insert(out, {name = dfhack.job.getName(j), repeating = j.flags['repeat'] or nil,
      worker = worker and unit_name(worker) or nil, suspended = j.flags.suspend or nil})
  end
  return out
end

if action == 'list' then
  local out = {}
  for _, b in ipairs(df.global.world.buildings.all) do
    if is_shop(b) then
      local entry = {id = b.id, type = shop_type(b), x = b.centerx, y = b.centery, z = b.z,
        built = b:getBuildStage() >= b:getMaxBuildStage(), jobs = queued(b)}
      if ARGS.building_id == b.id or ARGS.show_tasks then
        entry.tasks = {}
        for _, t in ipairs(task_list(b)) do table.insert(entry.tasks, dfhack.df2utf(t.name)) end
      end
      table.insert(out, entry)
    end
  end
  emit({workshops = out, hint = 'Pass building_id to see the task names it accepts.'}) return
end

local b = df.building.find(ARGS.building_id or -1)
if not b or not is_shop(b) then emit({error = 'No workshop ' .. tostring(ARGS.building_id)}) return end

if action == 'cancel' then
  local idx = ARGS.index or 0
  local j = b.jobs[idx]
  if not j then emit({error = 'No job at index ' .. idx}) return end
  dfhack.job.removeJob(j)
  emit({ok = true, jobs = queued(b)}) return
end

if action == 'add' then
  if b:getBuildStage() < b:getMaxBuildStage() then emit({error = 'Workshop is not built yet'}) return end
  local want = (ARGS.task or ''):lower()
  local pick
  for _, t in ipairs(task_list(b)) do
    if t.name:lower() == want then pick = t break end
  end
  -- substring match: prefer native jobs over raw reactions (reactions often need extra reagents)
  for pass = 1, 2 do
    if pick then break end
    for _, t in ipairs(task_list(b)) do
      local is_reaction = t.job_fields and t.job_fields.reaction_name
      if (pass == 1) ~= (is_reaction and true or false) and t.name:lower():find(want, 1, true) then pick = t break end
    end
  end
  if not pick then emit({error = 'No task matching "' .. want .. '". List tasks with action=list building_id=' .. b.id}) return end
  local count = math.min(ARGS.count or 1, 10)
  if #b.jobs + count > 10 then emit({error = 'Workshop queue is full (10 jobs max)'}) return end
  for _ = 1, count do
    local job = df.job:new()
    job.id = df.global.job_next_id
    df.global.job_next_id = df.global.job_next_id + 1
    job.completion_timer = -1
    job.pos:assign(xyz2pos(b.centerx, b.centery, b.z))
    if pick.job_fields then job:assign(pick.job_fields) end
    job.flags['repeat'] = ARGS['repeat'] or false
    for _, item in ipairs(pick.items or {}) do
      local f = utils.clone(item, true)
      f.new = true
      job.job_items.elements:insert('#', f)
    end
    job.general_refs:insert('#', {new = df.general_ref_building_holderst, building_id = b.id})
    b.jobs:insert('#', job)
    dfhack.job.linkIntoWorld(job, true)
  end
  emit({ok = true, added = pick.name, count = count, jobs = queued(b)}) return
end
emit({error = 'Unknown action ' .. action})
