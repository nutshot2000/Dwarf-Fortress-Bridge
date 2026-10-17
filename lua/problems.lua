-- Early-warning scan: things a careful overseer would notice before they spiral.
if not need_map() then return end
local issues = {}
local function add(sev, msg) table.insert(issues, {severity = sev, issue = msg}) end

local cits = citizens()
local pop = #cits

local usable = stock_usable
local function count(t)
  local n = 0
  for _, it in ipairs(try(function() return df.global.world.items.other[t] end, {})) do
    if usable(it) then n = n + it.stack_size end
  end
  return n
end
local drink = count('DRINK')
local food = count('FOOD') + count('MEAT') + count('FISH') + count('CHEESE') + count('EGG') + count('PLANT')
if drink < pop * 2 then add('high', ('Drink very low: %d for %d dwarves. Brew now (still + plants/fruit).'):format(drink, pop))
elseif drink < pop * 5 then add('medium', ('Drink low: %d for %d dwarves.'):format(drink, pop)) end
if food < pop * 2 then add('high', ('Food very low: %d for %d dwarves. Farm, fish, hunt or cook.'):format(food, pop))
elseif food < pop * 5 then add('medium', ('Food low: %d for %d dwarves.'):format(food, pop)) end

-- moods, stress, needs
for _, u in ipairs(cits) do
  local name = unit_name(u)
  if u.mood >= 0 and df.mood_type[u.mood] ~= 'Baby' then
    local m = df.mood_type[u.mood]
    local sev = (m == 'Berserk' or m == 'Melancholy' or m == 'Traumatized' or m == 'Possessed') and 'high' or 'medium'
    local j = u.job.current_job
    -- "working" only once every required item has been brought; before that the dwarf is waiting on materials
    local working = j and df.job_type[j.job_type]:find('^StrangeMood') ~= nil and #j.items >= try(function() return #j.job_items.elements end, try(function() return #j.job_items end, 0))
    local left = (not working and u.job.mood_timeout > 0) and (' ~%d days left before insanity;'):format(u.job.mood_timeout // 1230) or ''
    add(working and 'low' or sev, ('%s is in a %s mood%s%s.'):format(name, m, left,
      working and ' (working on the artifact; leave the workshop alone)'
      or (m == 'Fey' or m == 'Secretive' or m == 'Macabre' or m == 'Fell' or m == 'Possessed')
        and ' (needs a free workshop and materials or will go insane: see df_mood)' or ''))
  end
  local s = unit_stress(u)
  if s and s > 100000 then add('high', ('%s is badly stressed (%d).'):format(name, s))
  elseif s and s > 50000 then add('medium', ('%s is stressed (%d).'):format(name, s)) end
  if u.counters2.thirst_timer > 50000 then add('high', name .. ' is dehydrated.') end
  if u.counters2.hunger_timer > 75000 then add('high', name .. ' is starving.') end
end

-- livestock and pets: starving animals and grazers left out of a pasture
for _, u in ipairs(df.global.world.units.active) do
  if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not dfhack.units.isCitizen(u)
     and dfhack.units.isTame(u) and dfhack.units.isOwnCiv(u) then
    local name = unit_name(u)
    if u.counters2.hunger_timer > 75000 then add('high', name .. ' (animal) is starving.') end
    if try(function() return dfhack.units.isGrazer(u) end, false) then
      local penned = false
      for _, r in ipairs(u.general_refs) do
        if df.general_ref_building_civzone_assignedst:is_instance(r) then penned = true end
      end
      if not penned and not u.flags1.caged then
        add('medium', name .. ' is a grazer without a pasture: it will starve (df_animals pasture).')
      end
    end
  end
end

-- diplomat meetings: a noble stuck in a meeting with no place blocks trading (broker) until the visitor leaves
for _, u in ipairs(cits) do
  for _, r in ipairs(u.specific_refs) do
    if r.type == df.specific_ref_type.ACTIVITY then
      local a = try(function() return r.data.activity end)
      if a and try(function() return a.unit_noble end) == u.id and a.place == -1 then
        add('high', ('%s is stuck in a diplomat meeting with no meeting room: give them an Office zone (Decent quality is best) or the meeting and depot trading stall.'):format(unit_name(u)))
      end
    end
  end
end

-- hostiles
local hostile = {}
for _, u in ipairs(df.global.world.units.active) do
  if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not u.flags1.caged
     and not try(function() return dfhack.maps.getTileFlags(u.pos).hidden end, true)
     and try(function() return dfhack.units.isDanger(u) end, false) then
    table.insert(hostile, ('%s at %d,%d,%d'):format(unit_name(u), u.pos.x, u.pos.y, u.pos.z))
  end
end
if #hostile > 0 then
  add('high', ('%d hostile/dangerous creature(s) on the map: %s'):format(#hostile,
    table.concat(hostile, '; ', 1, math.min(#hostile, 5))))
end

-- infrastructure
local counts = {}
for _, b in ipairs(df.global.world.buildings.all) do
  local t = df.building_type[b:getType()]
  if b:getBuildStage() >= b:getMaxBuildStage() then counts[t] = (counts[t] or 0) + 1 end
end
local beds = counts.Bed or 0
if beds < pop then add(beds == 0 and 'medium' or 'low', ('Only %d beds for %d dwarves.'):format(beds, pop)) end
local stills = 0
for _, b in ipairs(df.global.world.buildings.other.WORKSHOP_STILL or {}) do
  if b:getBuildStage() >= b:getMaxBuildStage() then stills = stills + 1 end
end
if stills == 0 then add('medium', 'No still built: dwarves need alcohol to work well.') end
-- brewing needs an empty barrel or large pot per batch; food fills them up silently
local empty = 0
for _, it in ipairs(df.global.world.items.other.BARREL) do
  if stock_available(it) and #dfhack.items.getContainedItems(it) == 0 then empty = empty + 1 end
end
for _, it in ipairs(df.global.world.items.other.TOOL) do
  if stock_available(it) and it.subtype.id == 'ITEM_TOOL_LARGE_POT'
     and #dfhack.items.getContainedItems(it) == 0 then empty = empty + 1 end
end
local pending_containers = 0
for _, o in ipairs(df.global.world.manager_orders.all) do
  if o.amount_left > 0 then
    local pot = o.job_type == df.job_type.MakeTool and o.item_subtype >= 0
      and df.itemdef_toolst.find(o.item_subtype)
    if o.job_type == df.job_type.MakeBarrel or (pot and pot.id == 'ITEM_TOOL_LARGE_POT') then
      pending_containers = pending_containers + o.amount_left
    end
  end
end
if stills > 0 then
  local warning = container_warning(empty, pending_containers, drink, pop, ARGS.empty_storage_target)
  if warning then add(warning.severity, warning.issue) end
end
if (counts.FarmPlot or 0) == 0 then add('medium', 'No farm plots.') end
if (counts.Table or 0) == 0 or (counts.Chair or 0) == 0 then add('low', 'No tables/chairs: dwarves will eat on the floor.') end

local idle = 0
for _, u in ipairs(cits) do if not u.job.current_job then idle = idle + 1 end end
if pop > 0 and idle > pop / 2 then add('low', ('%d of %d dwarves idle: designate more work.'):format(idle, pop)) end

local ORDER = {high = 1, medium = 2, low = 3}
local construction = suspended_construction()
if #construction.review > 0 then
  local ids = {}
  for i = 1, math.min(5, #construction.review) do ids[#ids + 1] = tostring(construction.review[i].id) end
  add('medium', ('%d suspended construction job(s) need review (job IDs %s; materials assigned or not required). Review df_jobs action=suspended and resolve danger/obstructions before resuming; plans awaiting materials are listed separately.'):format(#construction.review, table.concat(ids, ', ')))
end
table.sort(issues, function(a, b) return ORDER[a.severity] < ORDER[b.severity] end)
emit({population = pop, drink = drink, food = food, issues = issues,
  food_containers = {available = empty, queued = pending_containers, reserve_target = ARGS.empty_storage_target or 5},
  suspended_construction = {review = construction.review, waiting_for_materials_count = #construction.waiting_for_materials}})
