-- Levers: list levers and what they are linked to, link a lever to a target building
-- (bridge, door, hatch, floodgate, grate, bars, cage...), and pull levers.
if not need_map() then return end
local action = ARGS.action or 'list'

local LINKABLE = {Bridge = true, Door = true, Hatch = true, Floodgate = true, GrateWall = true, GrateFloor = true,
  BarsVertical = true, BarsFloor = true, Cage = true, Chain = true, Weapon = true, GearAssembly = true}

local function bname(b)
  return df.building_type[b:getType()] .. (b.name ~= '' and (' "' .. dfhack.df2utf(b.name) .. '"') or '') ..
    ('#%d @%d,%d,%d'):format(b.id, b.centerx, b.centery, b.z)
end
local function targets_of(lever)
  local t = {}
  for _, m in ipairs(lever.linked_mechanisms) do
    local ref = dfhack.items.getGeneralRef(m, df.general_ref_type.BUILDING_HOLDER)
    local b = ref and ref:getBuilding()
    if b then table.insert(t, bname(b)) end
  end
  return t
end
local function pending(lever)
  local p = {}
  for _, j in ipairs(lever.jobs) do table.insert(p, dfhack.job.getName(j)) end
  return p
end
local function levers()
  local out = {}
  for _, b in ipairs(df.global.world.buildings.other.TRAP) do
    if b.trap_type == df.trap_type.Lever then table.insert(out, b) end
  end
  return out
end

if action == 'list' then
  local ls, tg = {}, {}
  for _, l in ipairs(levers()) do
    table.insert(ls, {id = l.id, x = l.centerx, y = l.centery, z = l.z,
      built = l:getBuildStage() >= l:getMaxBuildStage(), state = l.state == 1 and 'pulled' or 'off',
      linked_to = targets_of(l), jobs = pending(l)})
  end
  for _, b in ipairs(df.global.world.buildings.all) do
    if LINKABLE[df.building_type[b:getType()]] then table.insert(tg, bname(b)) end
  end
  local mech = 0
  for _, it in ipairs(df.global.world.items.other.TRAPPARTS) do
    if not it.flags.in_job and not it.flags.forbid and not it.flags.in_building then mech = mech + 1 end
  end
  emit({levers = ls, linkable_buildings = tg, free_mechanisms = mech,
    hint = 'Each link needs 2 free mechanisms (mechanic\'s workshop: construct mechanisms).'}) return
end

-- lock / unlock a door or hatch (target_id, or x,y,z): forbidden doors stop every creature that is not a
-- building destroyer, and the fort's own dwarves too, so lock entrances only once everyone is inside.
if action == 'lock' or action == 'unlock' then
  local b = ARGS.target_id and df.building.find(ARGS.target_id)
    or (ARGS.x and dfhack.buildings.findAtTile(ARGS.x, ARGS.y, ARGS.z))
  if not b or not b.door_flags then emit({error = 'No door or hatch at that id/position'}) return end
  b.door_flags.forbidden = action == 'lock'
  if action == 'lock' then b.door_flags.closed = true end
  emit({ok = true, id = b.id, building = bname(b), locked = b.door_flags.forbidden,
    note = action == 'lock' and 'Locked. Walk groups ignore locks, so reachability checks still pass; dwarves will not use it until unlocked.' or nil}) return
end

local lever = df.building.find(ARGS.lever_id or -1)
if not lever or not df.building_trapst:is_instance(lever) or lever.trap_type ~= df.trap_type.Lever then
  emit({error = 'No lever ' .. tostring(ARGS.lever_id)}) return
end

if action == 'link' then
  local target = df.building.find(ARGS.target_id or -1)
  if not target then emit({error = 'No building ' .. tostring(ARGS.target_id)}) return end
  if lever:getBuildStage() < lever:getMaxBuildStage() then emit({error = 'Lever is not built yet'}) return end
  local job = df.job:new()
  job.id = df.global.job_next_id
  df.global.job_next_id = df.global.job_next_id + 1
  job.job_type = df.job_type.LinkBuildingToTrigger
  job.completion_timer = -1
  job.pos:assign(xyz2pos(lever.centerx, lever.centery, lever.z))
  -- Like the game's UI, pick two specific mechanisms up front: one for the lever end (trigger) and one
  -- for the target end. Leaving them as open job_items gets the job cancelled ("No mechanism for target").
  local mechs = {}
  for _, it in ipairs(df.global.world.items.other.TRAPPARTS) do
    local f = it.flags
    if not (f.in_job or f.forbid or f.in_building or f.in_inventory or f.trader or f.removed or f.garbage_collect) then
      local x, y, z = dfhack.items.getPosition(it)
      if x and dfhack.maps.canWalkBetween(xyz2pos(x, y, z), xyz2pos(lever.centerx, lever.centery, lever.z)) then
        table.insert(mechs, it)
        if #mechs == 2 then break end
      end
    end
  end
  if #mechs < 2 then job:delete() emit({error = 'Need 2 free, reachable mechanisms (have ' .. #mechs .. ')'}) return end
  job.general_refs:insert('#', {new = df.general_ref_building_holderst, building_id = lever.id})
  job.general_refs:insert('#', {new = df.general_ref_building_triggertargetst, building_id = target.id})
  lever.jobs:insert('#', job)
  dfhack.job.linkIntoWorld(job, true)
  dfhack.job.attachJobItem(job, mechs[1], df.job_role_type.LinkToTrigger, -1, -1)
  dfhack.job.attachJobItem(job, mechs[2], df.job_role_type.LinkToTarget, -1, -1)
  dfhack.job.checkBuildingsNow()
  emit({ok = true, queued = 'Link ' .. bname(lever) .. ' -> ' .. bname(target), jobs = pending(lever),
    warning = 'Once linked, a door or hatch is locked and only the lever moves it. Pull the lever to open it, or dwarves on either side get cut off.'}) return
end

if action == 'pull' then
  local job = df.job:new()
  job.job_type = df.job_type.PullLever
  job.pos:assign(xyz2pos(lever.centerx, lever.centery, lever.z))
  job.flags.do_now = ARGS.urgent or false
  job.general_refs:insert('#', {new = df.general_ref_building_holderst, building_id = lever.id})
  lever.jobs:insert('#', job)
  dfhack.job.linkIntoWorld(job, true)
  dfhack.job.checkBuildingsNow()
  emit({ok = true, queued = 'Pull ' .. bname(lever), linked_to = targets_of(lever)}) return
end
emit({error = 'Unknown action ' .. action})
