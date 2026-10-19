-- Interesting things happening right now, for the camera tour in quiet moments.
-- Each scene: category (matches the player's preferences), a label, a unit to follow and a base score.
-- Categories: crafting, building, military, farming, animals, social, kids, visitors, mood, diplomacy.
if not need_map() then return end

local CAT = {}
local function cat(names, c, base) for _, n in ipairs(names) do CAT[n] = {c, base} end end
cat({'Dig', 'DigChannel', 'CarveUpwardStaircase', 'CarveDownwardStaircase', 'CarveUpDownStaircase', 'CarveRamp',
     'ConstructBuilding', 'SmoothWall', 'SmoothFloor', 'DetailWall', 'DetailFloor', 'CarveFortification'}, 'building', 1.5)
cat({'PlantSeeds', 'HarvestPlants', 'ProcessPlants', 'MillPlants', 'GatherPlants'}, 'farming', 1.0)
cat({'ShearCreature', 'MilkCreature', 'SlaughterAnimal', 'TrainAnimal', 'TameAnimal', 'TrainHuntingAnimal',
     'TrainWarAnimal', 'CollectEggs', 'ButcherAnimal'}, 'animals', 1.3)
cat({'StrangeMoodCrafter', 'StrangeMoodJeweller', 'StrangeMoodForge', 'StrangeMoodMagmaForge', 'StrangeMoodCarpenter',
     'StrangeMoodMason', 'StrangeMoodBowyer', 'StrangeMoodTanner', 'StrangeMoodWeaver', 'StrangeMoodGlassmaker',
     'StrangeMoodMechanics', 'StrangeMoodBrooding', 'StrangeMoodFell'}, 'mood', 4.0)
-- anything else done at a workshop counts as crafting
local IGNORE = {Sleep = 1, Eat = 1, Drink = 1, DrinkItem = 1, CleanSelf = 1, Rest = 1, StoreItemInStockpile = 1,
  StoreItemInBag = 1, TradeAtDepot = 1, StoreItemInBin = 1, StoreItemInVehicle = 1, StoreItemInLocation = 1, PickupEquipment = 1,
  BringItemToDepot = 1, Clean = 1, CleanPatient = 1, RecoverWounded = 1, GetProvisions = 1}

local function best_skill(u)
  local b = 0
  for _, s in ipairs(u.status.current_soul and u.status.current_soul.skills or {}) do
    if s.rating > b then b = s.rating end
  end
  return b
end

local scenes = {}
local function add(c, base, u, label)
  table.insert(scenes, {cat = c, score = base, id = u.id, x = u.pos.x, y = u.pos.y, z = u.pos.z, label = label})
end

for _, u in ipairs(citizens()) do
  local name = unit_name(u):match('^[^,]+')
  local j = u.job.current_job
  local jt = j and df.job_type[j.job_type]
  if jt and CAT[jt] then
    local c, base = CAT[jt][1], CAT[jt][2]
    if c == 'building' and (jt == 'DetailWall' or jt == 'DetailFloor') then base = base + best_skill(u) / 10 end
    add(c, base, u, name .. ': ' .. dfhack.job.getName(j))
  elseif jt and not IGNORE[jt] and dfhack.job.getHolder(j) then
    -- workshop work: the more skilled the dwarf, the better the show (legendary crafters make masterworks)
    local s = best_skill(u)
    -- "legendary" only when the dwarf is legendary at THIS job's skill, not at something else
    local js = try(function() return df.job_type.attrs[j.job_type].skill end, -1)
    local jsk = (js and js >= 0) and try(function() return dfhack.units.getNominalSkill(u, js, true) end, 0) or 0
    add('crafting', 1.5 + s / 6, u, name .. ': ' .. dfhack.job.getName(j) .. (jsk >= 15 and ' (legendary)' or ''))
  elseif not jt then
    if u.military.squad_id >= 0 then add('military', 1.4, u, name .. ' training with the squad')
    elseif #u.social_activities > 0 then add('social', 2.0, u, name .. ' socialising')
    elseif not dfhack.units.isAdult(u) then add('kids', 1.0, u, name .. ' playing')
    end
  end
  local last = scenes[#scenes]
  if last and last.id == u.id and dfhack.units.isNoble and dfhack.units.isNoble(u) then
    last.score = last.score + 0.3
  end
end
-- diplomacy: the broker trading at the depot, nobles in a meeting with a diplomat, merchants at the depot
for _, u in ipairs(citizens()) do
  local j = u.job.current_job
  if j and df.job_type[j.job_type] == 'TradeAtDepot' then
    add('diplomacy', 3.0, u, unit_name(u):match('^[^,]+') .. ' trading at the depot')
  end
  for _, r in ipairs(u.specific_refs) do
    if r.type == df.specific_ref_type.ACTIVITY and try(function() return r.data.activity.unit_noble == u.id end, false) then
      -- Name the visitor: not every noble meeting is with a diplomat (petitioners, messengers, citizens).
      local actor = try(function() return df.unit.find(r.data.activity.unit_actor) end, nil)
      add('diplomacy', 3.2, u, unit_name(u):match('^[^,]+') .. ' in a meeting with ' ..
        (actor and unit_name(actor):match('^[^,]+') or 'a visitor'))
    end
  end
end
local merchants = 0
for _, u in ipairs(df.global.world.units.active) do
  if merchants < 2 and dfhack.units.isActive(u) and not dfhack.units.isDead(u) and u.flags1.merchant
     and not dfhack.maps.getTileFlags(u.pos).hidden then
    merchants = merchants + 1
    add('diplomacy', 2.4, u, unit_name(u):match('^[^,]+') .. ' (merchant) with the caravan')
  end
end
-- visitors (bards, scholars, mercenaries) in and around the fort
for _, u in ipairs(df.global.world.units.active) do
  if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and u.flags2.visitor
     and not dfhack.maps.getTileFlags(u.pos).hidden then
    add('visitors', #u.social_activities > 0 and 2.2 or 1.1, u, unit_name(u):match('^[^,]+') .. ' (visitor)' ..
      (#u.social_activities > 0 and ' performing/socialising' or ''))
  end
end
emit(scenes)
