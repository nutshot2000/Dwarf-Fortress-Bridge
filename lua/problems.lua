-- Early-warning scan: things a careful overseer would notice before they spiral.
if not need_map() then return end
local issues = {}
local function add(sev, msg) table.insert(issues, {severity = sev, issue = msg}) end

local cits = citizens()
local pop = #cits

local function usable(it)
  local f = it.flags
  return not (f.rotten or f.forbid or f.garbage_collect or f.trader or f.dump or f.hostile or f.removed)
end
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
  if u.mood >= 0 then
    local m = df.mood_type[u.mood]
    local sev = (m == 'Berserk' or m == 'Melancholy' or m == 'Traumatized' or m == 'Possessed') and 'high' or 'medium'
    add(sev, ('%s is in a %s mood%s.'):format(name, m,
      (m == 'Fey' or m == 'Secretive' or m == 'Macabre' or m == 'Fell' or m == 'Possessed')
        and ' (needs a free workshop and materials or will go insane)' or ''))
  end
  local s = unit_stress(u)
  if s and s > 100000 then add('high', ('%s is badly stressed (%d).'):format(name, s))
  elseif s and s > 50000 then add('medium', ('%s is stressed (%d).'):format(name, s)) end
  if u.counters2.thirst_timer > 50000 then add('high', name .. ' is dehydrated.') end
  if u.counters2.hunger_timer > 75000 then add('high', name .. ' is starving.') end
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
for _, b in ipairs(df.global.world.buildings.other.WORKSHOP_STILL or {}) do stills = stills + 1 end
if stills == 0 then add('medium', 'No still built: dwarves need alcohol to work well.') end
if (counts.FarmPlot or 0) == 0 then add('medium', 'No farm plots.') end
if (counts.Table or 0) == 0 or (counts.Chair or 0) == 0 then add('low', 'No tables/chairs: dwarves will eat on the floor.') end

local idle = 0
for _, u in ipairs(cits) do if not u.job.current_job then idle = idle + 1 end end
if pop > 0 and idle > pop / 2 then add('low', ('%d of %d dwarves idle: designate more work.'):format(idle, pop)) end

local ORDER = {high = 1, medium = 2, low = 3}
table.sort(issues, function(a, b) return ORDER[a.severity] < ORDER[b.severity] end)
emit({population = pop, drink = drink, food = food, issues = issues})
