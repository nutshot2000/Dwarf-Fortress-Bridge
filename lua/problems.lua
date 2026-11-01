-- Early-warning scan: things a careful overseer would notice before they spiral.
if not need_map() then return end
local issues = {}
local function add(sev, msg) table.insert(issues, {severity = sev, issue = msg}) end

local cits = citizens()
local pop = #cits
local access=citizen_access_report(cits)
for _,u in ipairs(access.isolated) do
  if u.behind_locked_door then
    add('high',('Shut out: %s (#%d) at %d,%d,%d can reach the others only through a locked door or hatch. Unlock it (door_flags.forbidden) until they are back.'):format(u.name,u.id,u.x,u.y,u.z))
  else
    add('high',('Potentially trapped: %s (#%d) at %d,%d,%d has no walking connection to the main citizen group. Inspect/reopen a safe passage; do not remove bedroom walls blindly.'):format(u.name,u.id,u.x,u.y,u.z))
  end
end

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
      -- Only a visiting actor (diplomat, liaison) blocks trade; citizens bringing matters to their leader
      -- is routine and also reports place == -1.
      local actor = a and try(function() return df.unit.find(a.unit_actor) end)
      local visitor = actor and not dfhack.units.isCitizen(actor)
      if a and visitor and try(function() return a.unit_noble end) == u.id and a.place == -1 then
        add('high', ('%s is stuck in a meeting with %s and no meeting room: give them an Office zone (Decent quality is best) or the meeting and depot trading stall.'):format(unit_name(u), unit_name(actor)))
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
-- children and babies sleep with their parents: only adults need a bed of their own
local adults = 0
for _, u in ipairs(cits) do if not dfhack.units.isBaby(u) and not dfhack.units.isChild(u) then adults = adults + 1 end end
if beds < adults then add(beds == 0 and 'medium' or 'low', ('Only %d beds for %d adult dwarves.'):format(beds, adults)) end
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
local unvalidated_orders=0
for _, o in ipairs(df.global.world.manager_orders.all) do
  if o.amount_left > 0 then
    if not o.status.validated then unvalidated_orders=unvalidated_orders+1 end
    local pot = o.job_type == df.job_type.MakeTool and o.item_subtype >= 0
      and df.itemdef_toolst.find(o.item_subtype)
    if o.job_type == df.job_type.MakeBarrel or (pot and pot.id == 'ITEM_TOOL_LARGE_POT') then
      pending_containers = pending_containers + o.amount_left
    end
  end
end
if unvalidated_orders>0 and #dfhack.units.getUnitsByNobleRole('manager')==0 then
  add('high',('%d work order(s) cannot validate: no active MANAGER. Appoint one with df_noble, or repair the noble index if already assigned.'):format(unvalidated_orders))
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
-- An idle dwarf without item hauling cannot help with the backlog (miners' details often drop it).
local nohaul = {}
for _, u in ipairs(cits) do
  if not u.job.current_job and not dfhack.units.isBaby(u) and not dfhack.units.isChild(u)
     and not u.status.labors[df.unit_labor.HAUL_ITEM] then nohaul[#nohaul + 1] = ('%s #%d'):format(unit_name(u), u.id) end
end
if #nohaul > 0 then
  add('low', ('Idle without item hauling: %s. df_labor enable HAUL_ITEM (and HAUL_STONE/WOOD/FOOD/FURNITURE) so they help with hauling.'):format(table.concat(nohaul, '; ')))
end

-- DF forbids the gear of everyone who dies (citizens and invaders), so after a fight weapons, armour and clothes
-- lie on the floor untouched until someone unforbids them.
local GEAR = {WEAPON = true, ARMOR = true, HELM = true, GLOVES = true, SHOES = true, PANTS = true, SHIELD = true,
  AMMO = true, AMULET = true, RING = true, EARRING = true, BRACELET = true, CROWN = true}
local forbidden_gear = 0
for _, it in ipairs(df.global.world.items.other.IN_PLAY) do
  local f = it.flags
  -- foreign: gear the undead or invaders carried (even a raised citizen's own pick); haulers ignore it.
  if (f.forbid or f.foreign) and f.on_ground and not f.trader and not f.owned and GEAR[df.item_type[it:getType()]] then
    forbidden_gear = forbidden_gear + 1
  end
end
if forbidden_gear >= 5 then
  add('low', ('%d weapons/armour/clothes on the floor that haulers ignore (forbidden, or "foreign" gear dropped by the dead and the undead): clear flags.forbid and flags.foreign with df_lua and make sure a weapon/armour stockpile exists.'):format(forbidden_gear))
end

-- Sky holes: an indoor tile the dwarves can walk to with open sky right above it. Invaders climb walls in v50 and
-- drop through such holes behind a raised drawbridge (an unroofed stair top let an undead siege in).
do
  local anchor = cits[1] and cits[1].pos
  if anchor then
    local x1, y1, z1, x2, y2, z2 = anchor.x, anchor.y, anchor.z, anchor.x, anchor.y, anchor.z
    for _, u in ipairs(cits) do
      x1, y1, z1 = math.min(x1, u.pos.x), math.min(y1, u.pos.y), math.min(z1, u.pos.z)
      x2, y2, z2 = math.max(x2, u.pos.x), math.max(y2, u.pos.y), math.max(z2, u.pos.z)
    end
    local S = df.tiletype_shape
    local walk = {[S.FLOOR] = true, [S.STAIR_UP] = true, [S.STAIR_DOWN] = true, [S.STAIR_UPDOWN] = true, [S.RAMP] = true}
    local open = {[S.EMPTY] = true, [S.STAIR_DOWN] = true, [S.RAMP_TOP] = true}
    local holes = {}
    for z = z1, z2 do for x = x1 - 5, x2 + 5 do for y = y1 - 5, y2 + 5 do
      local tt = dfhack.maps.getTileType(x, y, z)
      local above = dfhack.maps.getTileType(x, y, z + 1)
      if tt and above and walk[df.tiletype.attrs[tt].shape] and open[df.tiletype.attrs[above].shape] then
        local f, fa = dfhack.maps.getTileFlags(x, y, z), dfhack.maps.getTileFlags(x, y, z + 1)
        -- a hatch cover on the opening is a gate of its own (lock it in a siege), not a hole
        local b = dfhack.buildings.findAtTile(xyz2pos(x, y, z + 1))
        local hatch = b and b:getType() == df.building_type.Hatch
        if not hatch and not f.outside and not f.hidden and fa.outside and #holes < 5
           and dfhack.maps.canWalkBetween(xyz2pos(x, y, z), anchor) then
          holes[#holes + 1] = ('%d,%d,%d'):format(x, y, z)
        end
      end
    end end end
    if #holes > 0 then
      add('medium', ('Open sky above indoor tiles (%s): climbers can drop in there even with the gate shut. Build a floor (df_build key=Cf) on the open tile one level up.'):format(table.concat(holes, '; ')))
    end
  end
end

-- Tree felling needs an axe per woodcutter; squad weapon slots (the game's own pass likes battle axes) can
-- reserve every axe in the fort, and the felling jobs then wait forever.
local fell = 0
for _, j in require('utils').listpairs(df.global.world.jobs.list) do
  if j.job_type == df.job_type.FellTree and not dfhack.job.getWorker(j) then fell = fell + 1 end
end
if fell > 0 then
  local reserved = {}
  for _, id in ipairs(df.global.plotinfo.equipment.items_assigned.WEAPON) do reserved[id] = true end
  local free_axes = 0
  for _, it in ipairs(df.global.world.items.other.WEAPON) do
    if it.subtype.id:find('AXE') and not it.subtype.id:find('TRAINING') and not reserved[it.id] and not it.flags.trader
       and not it.flags.forbid and not dfhack.items.getHolderUnit(it) then free_axes = free_axes + 1 end
  end
  local armed_cutter = false
  for _, u in ipairs(cits) do
    if u.status.labors[df.unit_labor.CUTWOOD] then
      for _, inv in ipairs(u.inventory) do
        local it = inv.item
        if it:getType() == df.item_type.WEAPON and it.subtype.id:find('AXE') then armed_cutter = true end
      end
    end
  end
  if free_axes == 0 and not armed_cutter then
    add('medium', ('%d trees marked for felling but no free axe: every axe is carried or reserved for a squad. Free one (give a soldier another weapon) or make/buy axes.'):format(fell))
  end
end

-- Corpses and body parts never go away by themselves: without a refuse stockpile or the dump standing orders
-- (and gather_refuse_outside for the surface) they lie where they fell and give "saw a dead body" thoughts.
local lying = 0
for _, t in ipairs({'CORPSE', 'CORPSEPIECE'}) do
  for _, it in ipairs(df.global.world.items.other[t]) do
    local f = it.flags
    if f.on_ground and not f.in_building and not f.dead_dwarf and not f.dump then lying = lying + 1 end
  end
end
local refuse_pile = false
for _, b in ipairs(df.global.world.buildings.other.STOCKPILE) do if b.settings.flags.refuse then refuse_pile = true end end
local dump_zone = false
for _, b in ipairs(df.global.world.buildings.all) do
  if df.building_civzonest:is_instance(b) and b.type == df.civzone_type.Dump then dump_zone = true break end
end
local dumping = (df.global.standing_orders_dump_corpses or 0) ~= 0 and dump_zone
if lying >= 20 and not refuse_pile and not dumping then
  add('low', ('%d corpses/body parts lying around%s. They stay forever: make a refuse stockpile (df_stockpile type=r) or a dump zone with df_standing dump_corpses/dump_bones/dump_skulls=1, plus gather_refuse_outside=1 for the surface.'):format(
    lying, refuse_pile and '' or ' and no refuse stockpile'))
end

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
