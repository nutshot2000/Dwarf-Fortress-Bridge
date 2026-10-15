-- Livestock and pets: list, pasture assignment, slaughter marks, training, taming level.
if not need_map() then return end
local action = ARGS.action or 'list'

local function caste_flag(u, flag)
  return try(function()
    return df.creature_raw.find(u.race).caste[u.caste].flags[flag]
  end, false)
end
local function pasture_of(u)
  for _, r in ipairs(u.general_refs) do
    if df.general_ref_building_civzone_assignedst:is_instance(r) then return r.building_id end
  end
end
local function own_animal(u)
  return dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not dfhack.units.isCitizen(u)
     and dfhack.units.isAnimal(u) and dfhack.units.isOwnCiv(u)
end
local function info(u)
  return {id = u.id, name = unit_name(u), race = dfhack.units.getRaceName(u),
    sex = u.sex == 0 and 'F' or (u.sex == 1 and 'M' or nil),
    age = try(function() return math.floor(dfhack.units.getAge(u)) end),
    pos = pos_of(u.pos), pasture = pasture_of(u),
    grazer = caste_flag(u, 'GRAZER') or nil, milkable = caste_flag(u, 'MILKABLE') or nil,
    lays_eggs = caste_flag(u, 'LAYS_EGGS') or nil, pet_value = nil,
    slaughter = u.flags2.slaughter or nil, caged = u.flags1.caged or nil,
    training = df.animal_training_level[u.training_level], pregnant = (u.pregnancy_timer > 0) or nil}
end
local function zone(id)
  local z = df.building.find(id or -1)
  if z and df.building_civzonest:is_instance(z) then return z end
end
local function unassign(u)
  for i = #u.general_refs - 1, 0, -1 do
    local r = u.general_refs[i]
    if df.general_ref_building_civzone_assignedst:is_instance(r) then
      local z = zone(r.building_id)
      if z then
        for k = #z.assigned_units - 1, 0, -1 do
          if z.assigned_units[k] == u.id then z.assigned_units:erase(k) end
        end
      end
      u.general_refs:erase(i)
      r:delete()
    end
  end
end
local function targets()
  local out = {}
  for _, id in ipairs(ARGS.unit_ids or {ARGS.unit_id}) do
    local u = df.unit.find(id)
    if u then table.insert(out, u) end
  end
  return out
end

if action == 'list' then
  local list = {}
  for _, u in ipairs(df.global.world.units.active) do
    if own_animal(u) then table.insert(list, info(u)) end
  end
  local pens = {}
  for _, z in ipairs(df.global.world.buildings.other.ANY_ZONE) do
    if z.type == df.civzone_type.Pen or z.type == df.civzone_type.Pond then
      table.insert(pens, {id = z.id, type = df.civzone_type[z.type], x = z.x1, y = z.y1, x2 = z.x2, y2 = z.y2, z = z.z,
        assigned = #z.assigned_units})
    end
  end
  emit({animals = list, pastures = pens}) return
end

local us = targets()
if #us == 0 then emit({error = 'Give unit_id or unit_ids (see action=list)'}) return end
local done = {}
for _, u in ipairs(us) do
  if action == 'pasture' then
    local z = zone(ARGS.zone_id)
    if not z then emit({error = 'No zone ' .. tostring(ARGS.zone_id)}) return end
    unassign(u)
    u.general_refs:insert('#', {new = df.general_ref_building_civzone_assignedst, building_id = z.id})
    z.assigned_units:insert('#', u.id)
  elseif action == 'unpasture' then
    unassign(u)
  elseif action == 'slaughter' then
    u.flags2.slaughter = true
  elseif action == 'unslaughter' then
    u.flags2.slaughter = false
  elseif action == 'train' then
    if not dfhack.units.assignTrainer(u) then emit({error = 'Could not assign a trainer to ' .. unit_name(u)}) return end
  else
    emit({error = 'Unknown action ' .. action}) return
  end
  table.insert(done, info(u))
end
emit({ok = true, action = action, animals = done})
