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
  return {id = j.id, name = dfhack.df2utf(dfhack.job.getName(j)), x = j.pos.x, y = j.pos.y, z = j.pos.z,
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
elseif action == 'do_now' then j.flags.do_now = true
else emit({error = 'Unknown action ' .. action}) return end
emit({ok = true, job = jinfo(j)})
