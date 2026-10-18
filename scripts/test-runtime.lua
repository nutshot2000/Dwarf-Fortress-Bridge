-- Synthetic, read-only regression checks; helpers come from the bridge prelude.
local args, report, helpers = ...
local passed = 0
local function check(condition, message)
  assert(condition, message)
  passed = passed + 1
end
local function item(flag) return {flags = flag or {}} end
check(helpers.available(item()), 'loose stock should be available')
for _, flag in ipairs({'rotten', 'forbid', 'garbage_collect', 'trader', 'dump', 'hostile', 'removed',
    'spider_web', 'in_building', 'owned'}) do
  check(not helpers.usable(item({[flag] = true})), flag .. ' must not count as usable stock')
end
check(helpers.usable(item({in_job = true})) and not helpers.available(item({in_job = true})),
  'reserved stock stays in inventory but is not available')
check(not helpers.available(item({in_inventory = true})), 'carried or equipped items are not spare stock')
check(not helpers.warning(4, 1, 115, 7), 'queued reserve refill must prevent a false shortage')
check(not helpers.warning(5, 0, 115, 7), 'adequate empty containers must not warn')
check(not helpers.warning(2, 0, 115, 7, 2), 'reserve warning must respect a lower configured target')
check(helpers.warning(0, 5, 10, 7).severity == 'high', 'zero containers still blocks new brewing despite pending orders')
local low = helpers.warning(4, 0, 115, 7)
check(low.severity == 'low' and low.issue:find('Brewing can still'), 'small reserve must not claim brewing stalled')

local holder = {id = 42, getBuildStage = function() return 0 end,
  x1=1,x2=1,y1=2,y2=2,z=3,
  getMaxBuildStage = function() return 1 end, getType = function() return df.building_type.Hatch end}
local job = {id = 17, job_type = df.job_type.ConstructBuilding, flags = {suspend = true}, items = {},
  job_items = {elements = {{quantity = 1}}}, pos = {x = 1,y = 2,z = 3}}
check(helpers.construction(job, holder).state == 'waiting_for_materials', 'unfunded plans are not interrupted jobs')
job.items = {{item=df.global.world.items.other.IN_PLAY[0]}}
check(helpers.construction(job, holder).state == 'review_suspension', 'allocated construction needs review')
check(job.flags.suspend, 'diagnosis must not automatically resume an intentionally suspended job')
job.flags.suspend = false
check(not helpers.construction(job, holder), 'running construction must not be flagged')
job.flags.suspend, job.items, job.job_items.elements = true, {}, {}
check(helpers.construction(job, holder).state == 'review_suspension', 'jobs requiring no items must not be labelled as waiting for materials')

-- DF vectors have zero-based indexing and a custom ipairs iterator.
local function vector(values)
  local out = {_vector = true}
  for i, value in ipairs(values) do out[i - 1] = value end
  return setmetatable(out, {__len = function() return #values end})
end
local function iter(values)
  if not values._vector then return ipairs(values) end
  return function(_, i) i = i + 1 if i < #values then return i, values[i] end end, values, -1
end
local function unit(options)
  options.id = options.id or 1
  options.name = options.name or 'Founder'
  options.mood = -1
  options.pos = {x = options.hidden and 99 or 1, y = 1, z = 1}
  options.flags1 = {tame = options.tame or false, caged = false}
  options.reports = {log = {Combat = vector(options.combat or {}),
    Hunting = vector(options.hunting or {}), Sparring = vector(options.sparring or {})}}
  return options
end
local function heartbeat(actors, since, report_animals)
  local result
  local reports = vector({{id = 10}, {id = 11}, {id = 12}})
  local fake_df = setmetatable({global = {cur_year = 100, cur_year_tick = 120,
    pause_state = true, plotinfo = {caravans = {}},
    world = {status = {reports = reports}, units = {active = actors}}},
    report = {find = function(id) return {id = id, text = 'A real combat report'} end}}, {__index = df})
  local fake_dfhack = setmetatable({units = {
    isActive = function(u) return not u.dead end, isDead = function(u) return u.dead or false end,
    isDanger = function(u) return u.danger or false end, isCitizen = function(u) return u.citizen or false end,
    isTame = function(u) return u.tame or false end, isOwnCiv = function(u) return u.own or false end},
    maps = {getTileFlags = function(p) return {hidden = p.x == 99} end}}, {__index = dfhack})
  local env = setmetatable({ARGS = {since = since,report_animal_combat=report_animals}, df = fake_df, dfhack = fake_dfhack, ipairs = iter,
    try = helpers.try, need_map = function() return true end, unit_name = function(u) return u.name end,
    citizens = function() return {unit({citizen = true})} end,
    citizen_access_report = function() return {isolated={}} end,
    emit = function(value) result = value end}, {__index = _ENV})
  assert(loadfile(args.heartbeat_path, 't', env))()
  return result
end
local realFight = heartbeat({unit({citizen = true, combat = {11}})}, 10)
check(realFight.hostiles == 0 and #realFight.combat == 1, 'non-dangerous attackers must still trigger combat detection')
check(#heartbeat({unit({tame = true, own = true, combat = {11}})}, 10).combat == 1, 'owned animal combat must be detected')
local reported=heartbeat({unit({tame=true,own=true,combat={11}})},10,true)
check(#reported.combat==0 and #reported.animal_combat==1,'report mode must retain animal reports without stopping')
check(#heartbeat({unit({citizen=true,combat={11}})},10,true).combat==1,'animal report mode must still stop for citizen combat')
check(#heartbeat({unit({combat = {11}})}, 10).combat == 0, 'unowned wildlife must not trigger fortress combat')
check(#heartbeat({unit({citizen = true, hidden = true, combat = {11}})}, 10).combat == 0, 'hidden units must not be disclosed')
check(#heartbeat({unit({citizen = true, combat = {11}, hunting = {11}})}, 10).combat == 0, 'routine hunting must not interrupt')
check(#heartbeat({unit({citizen = true, combat = {11}, sparring = {11}})}, 10).combat == 0, 'sparring must not interrupt')
check(#heartbeat({unit({citizen = true, combat = {11}})}, 11).combat == 0, 'old combat must not trigger repeatedly')
check(#heartbeat({unit({citizen = true, combat = {11}})}, nil).combat == 0, 'initial snapshot must not replay old combat')
local drinking = unit({citizen = true})
drinking.body = {wounds = {{syndrome_id = 60}}}
check(#heartbeat({drinking}, 10).combat == 0, 'inebriation syndrome wounds are not combat')
report({passed = passed, map_mutated = false})
