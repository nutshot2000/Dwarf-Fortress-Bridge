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
-- Common jobs missing from dfhack.workshops' catalogue (it lists mostly reactions for craftsdwarfs).
local function boulder() return {item_type = df.item_type.BOULDER, mat_type = 0, mat_index = -1, quantity = 1,
  flags2 = {non_economic = true}} end
local EXTRA = {
  Craftsdwarfs = {
    {name = 'make rock crafts', job_fields = {job_type = df.job_type.MakeCrafts, mat_type = 0}, items = {boulder()}},
    {name = 'make rock mug', job_fields = {job_type = df.job_type.MakeGoblet, mat_type = 0}, items = {boulder()}},
    {name = 'make rock short sword (training)', job_fields = {job_type = df.job_type.MakeWeapon, mat_type = 0}, items = {boulder()}},
    {name = 'make wood crafts', job_fields = {job_type = df.job_type.MakeCrafts, material_category = {wood = true}},
      items = {{item_type = df.item_type.WOOD, quantity = 1}}},
    {name = 'make bone crafts', job_fields = {job_type = df.job_type.MakeCrafts, material_category = {bone = true}},
      items = {{item_type = -1, quantity = 1, flags1 = {}, flags2 = {bone = true, body_part = true}}}},
  },
}
local function task_list(b)
  -- dfhack.workshops prints debug lines ("adding: <ore>" plus a table dump) while it builds the
  -- smelter list; mute print around the call so they don't flood the result.
  local G = dfhack.BASE_G or _G -- modules see the real global table, not this script's environment
  local p, pa = G.print, G.printall
  G.print, G.printall = function() end, function() end
  local ok, jobs = pcall(workshops.getJobs, b:getType(), b:getSubtype(), b:getCustomType())
  G.print, G.printall = p, pa
  jobs = ok and jobs or {}
  local list = {}
  for _, j in pairs(jobs) do table.insert(list, j) end
  local sub = df.building_workshopst:is_instance(b) and df.workshop_type[b.type]
  for _, j in ipairs(sub and EXTRA[sub] or {}) do table.insert(list, j) end
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
    -- With building_id, report just that workshop (with its task list).
    -- without show_tasks, filter picks workshops by type or name ("Masons", "Quarry"); with it, it filters task names
    local wf = ARGS.filter and not ARGS.show_tasks and not ARGS.building_id and ARGS.filter:lower()
    local shop_ok = is_shop(b) and (not wf or shop_type(b):lower():find(wf, 1, true)
      or dfhack.df2utf(b.name or ''):lower():find(wf, 1, true))
    if shop_ok and (not ARGS.building_id or ARGS.building_id == b.id) then
      local entry = {id = b.id, type = shop_type(b), x = b.centerx, y = b.centery, z = b.z,
        built = b:getBuildStage() >= b:getMaxBuildStage(), jobs = queued(b)}
      if ARGS.building_id == b.id or ARGS.show_tasks then
        entry.tasks = {}
        local flt = ARGS.filter and ARGS.filter:lower()
        for _, t in ipairs(task_list(b)) do
          if not flt or t.name:lower():find(flt, 1, true) then table.insert(entry.tasks, dfhack.df2utf(t.name)) end
        end
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
  -- Indexing past the end of a DF vector raises instead of returning nil.
  if idx < 0 or idx >= #b.jobs then emit({error = ('No job at index %d (queue has %d)'):format(idx, #b.jobs), jobs = queued(b)}) return end
  local j = b.jobs[idx]
  dfhack.job.removeJob(j)
  emit({ok = true, jobs = queued(b)}) return
end

if action == 'add' then
  if b:getBuildStage() < b:getMaxBuildStage() then emit({error = 'Workshop is not built yet'}) return end
  local want = dfhack.utf2df((ARGS.task or '')):lower()
  -- An empty name matches every task, and the first alphabetically can be destructive ("Melt a metal object").
  if want == '' then emit({error = 'task is required (a task name or substring). List tasks with action=list building_id=' .. b.id}) return end
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
  -- dfhack.workshops gives every reagent the first one's item type (the edged tool of 'make wooden chair'
  -- becomes a second log, so nothing can ever fill it): take each reagent's type from the reaction raw.
  local rname = pick.job_fields and pick.job_fields.reaction_name
  for _, r in ipairs(rname and df.global.world.raws.reactions.reactions or {}) do
    if r.code == rname then
      for _, it in ipairs(pick.items or {}) do
        local g = try(function() return r.reagents[it.reagent_index] end)
        if g and it.item_type ~= g.item_type then
          it.item_type, it.item_subtype = g.item_type, g.item_subtype
          it.vector_id = g.item_type >= 0 and df.job_item_vector_id[df.item_type[g.item_type]]
            or df.job_item_vector_id.IN_PLAY
        end
      end
      break
    end
  end
  local count = math.min(ARGS.count or 1, 10)
  if #b.jobs + count > 10 then emit({error = 'Workshop queue is full (10 jobs max)'}) return end
  for _ = 1, count do
    local job = df.job:new()
    job.id = df.global.job_next_id
    df.global.job_next_id = df.global.job_next_id + 1
    job.completion_timer = -1
    -- Native jobs use -1 for unspecified material, not the struct's zero
    -- default (which means inorganic material and displays 'unknown material').
    job.pos:assign(xyz2pos(b.centerx, b.centery, b.z))
    if pick.job_fields then job:assign(pick.job_fields) end
    if not pick.job_fields or pick.job_fields.mat_type == nil then job.mat_type = -1 end
    if not pick.job_fields or pick.job_fields.mat_index == nil then job.mat_index = -1 end
    if df.building_workshopst:is_instance(b) and b.type == df.workshop_type.Carpenters
       and not (pick.job_fields and pick.job_fields.reaction_name) then
      job.material_category.wood = true
    end
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
  -- The JS side runs lua/inputs.lua over these filters and appends missing-material warnings.
  local inputs = {}
  for _, item in ipairs(pick.items or {}) do table.insert(inputs, job_item_filter(item)) end
  local magma = df.building_furnacest:is_instance(b) and df.furnace_type[b.type]:find('^Magma') ~= nil
  emit({ok = true, added = dfhack.df2utf(pick.name), count = count, jobs = queued(b),
    preflight = {items = inputs, building_id = b.id, magma = magma,
      job_type = pick.job_fields and pick.job_fields.job_type or nil}}) return
end
emit({error = 'Unknown action ' .. action})
