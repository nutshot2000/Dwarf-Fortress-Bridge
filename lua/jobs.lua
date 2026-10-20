-- Every job in the fort (the Tasks screen): list/filter, cancel, suspend/resume, do-now.
if not need_map() then return end
local utils = require('utils')
local action = ARGS.action or 'list'
if action == 'suspended' then
  local out = suspended_construction()
  out.guidance = 'Review suspended jobs with assigned materials (or no material requirements) for resolved interruptions before df_jobs resume job_id=... . Plans still awaiting materials are listed separately. Nothing was resumed automatically.'
  emit(out) return
end

local function find_job(id)
  for _, j in utils.listpairs(df.global.world.jobs.list) do
    if j.id == id then return j end
  end
end
local function jinfo(j)
  local w = dfhack.job.getWorker(j)
  local b = dfhack.job.getHolder(j)
  -- jobs such as "Destroy building" carry no position (-30000): report their building's centre instead
  local x, y, z = j.pos.x, j.pos.y, j.pos.z
  if x < -1000 and b then x, y, z = b.centerx, b.centery, b.z end
  return {id = j.id, name = dfhack.df2utf(dfhack.job.getName(j)), x = x, y = y, z = z,
    worker = w and unit_name(w) or nil, building = b and b.id or nil,
    suspended = j.flags.suspend or nil, do_now = j.flags.do_now or nil, repeating = j.flags['repeat'] or nil}
end

if action == 'list' then
  local filter = ARGS.filter and ARGS.filter:lower()
  local list, counts = {}, {}
  for _, j in utils.listpairs(df.global.world.jobs.list) do
    local name = dfhack.job.getName(j)
    counts[name] = (counts[name] or 0) + 1
    if not filter or name:lower():find(filter, 1, true) then
      if #list < (ARGS.limit or 40) then table.insert(list, jinfo(j)) end
    end
  end
  local summary = {}
  for k, v in pairs(counts) do table.insert(summary, {job = dfhack.df2utf(k), count = v}) end
  table.sort(summary, function(a, b) return a.count > b.count end)
  emit({summary = summary, jobs = list}) return
end

local j = find_job(ARGS.job_id or -1)
if not j then emit({error = 'No job ' .. tostring(ARGS.job_id)}) return end
if action == 'cancel' then
  local info = jinfo(j)
  dfhack.job.removeJob(j)
  emit({ok = true, cancelled = info}) return
elseif action == 'suspend' then j.flags.suspend = true
elseif action == 'resume' then j.flags.suspend = false
elseif action == 'do_now' then
  j.flags.do_now = true
  -- A workshop works its queue front to back and ignores do_now, so move the job to the front
  -- (behind a job someone is already working on).
  local b = dfhack.job.getHolder(j)
  if b and b.jobs then
    local idx
    for i = 0, #b.jobs - 1 do if b.jobs[i] == j then idx = i break end end
    local front = (#b.jobs > 0 and b.jobs[0] ~= j and dfhack.job.getWorker(b.jobs[0])) and 1 or 0
    if idx and idx > front then b.jobs:erase(idx) b.jobs:insert(front, j) end
  end
else emit({error = 'Unknown action ' .. action}) return end
emit({ok = true, job = jinfo(j)})
