-- Locations (tavern, hospital, temple, library, guildhall) and their occupations
-- (tavern keeper, performer, scholar, scribe, doctor, diagnostician, surgeon, bone doctor).
if not need_map() then return end
local action = ARGS.action or 'list'
local site = dfhack.world.getCurrentSite()

local function lname(b)
  local n = try(function() return dfhack.translation.translateName(b.name, true) end)
  return n and dfhack.df2utf(n) or ('location ' .. b.id)
end
local function locations()
  local t = {}
  for _, b in ipairs(site.buildings) do
    local tp = df.abstract_building_type[b:getType()]
    if tp == 'INN_TAVERN' or tp == 'HOSPITAL' or tp == 'TEMPLE' or tp == 'LIBRARY' or tp == 'GUILDHALL' then
      table.insert(t, b)
    end
  end
  return t
end
local function occ_info(o)
  local u = o.unit_id >= 0 and df.unit.find(o.unit_id)
  return {id = o.id, type = df.occupation_type[o.type], holder = u and unit_name(u) or 'vacant'}
end
local function zones_of(b)
  local z = {}
  for _, zone in ipairs(df.global.world.buildings.other.ANY_ZONE) do
    if zone.location_id == b.id then table.insert(z, zone.id) end
  end
  return z
end

if action == 'list' then
  local out = {}
  for _, b in ipairs(locations()) do
    local occ = {}
    for _, o in ipairs(b.occupations) do table.insert(occ, occ_info(o)) end
    table.insert(out, {id = b.id, type = df.abstract_building_type[b:getType()], name = lname(b),
      zones = zones_of(b), occupations = occ})
  end
  emit({locations = out, hint = 'Create one with df_zone location=tavern|hospital|temple|library|guildhall.'}) return
end

local loc
for _, b in ipairs(locations()) do if b.id == ARGS.location_id then loc = b end end
if not loc then emit({error = 'No location ' .. tostring(ARGS.location_id) .. ' (see action=list)'}) return end

local function detach(o)
  if o.unit_id >= 0 then
    local u = df.unit.find(o.unit_id)
    if u then
      for i = #u.occupations - 1, 0, -1 do if u.occupations[i] == o then u.occupations:erase(i) end end
    end
  end
  o.unit_id = -1
  o.histfig_id = -1
end

if action == 'assign' then
  local otype = df.occupation_type[(ARGS.occupation or ''):upper()]
  if not otype then emit({error = 'occupation must be one of TAVERN_KEEPER, PERFORMER, SCHOLAR, SCRIBE, DOCTOR, DIAGNOSTICIAN, SURGEON, BONE_DOCTOR'}) return end
  local u = df.unit.find(ARGS.unit_id or -1)
  if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end
  local slot
  for _, o in ipairs(loc.occupations) do
    if o.type == otype and o.unit_id < 0 then slot = o break end
  end
  if not slot then
    slot = df.occupation:new()
    slot.id = df.global.occupation_next_id
    df.global.occupation_next_id = df.global.occupation_next_id + 1
    slot.type = otype
    slot.location_id = loc.id
    slot.site_id = site.id
    slot.group_id = df.global.plotinfo.group_id
    slot.unit_id = -1
    slot.histfig_id = -1
    df.global.world.occupations.all:insert('#', slot)
    loc.occupations:insert('#', slot)
  end
  slot.unit_id = u.id
  slot.histfig_id = u.hist_figure_id
  u.occupations:insert('#', slot)
  emit({ok = true, location = lname(loc), occupation = occ_info(slot)}) return
end

if action == 'remove' then
  local n = 0
  for _, o in ipairs(loc.occupations) do
    if o.unit_id == ARGS.unit_id or o.id == ARGS.occupation_id then detach(o) n = n + 1 end
  end
  emit({ok = true, cleared = n}) return
end
emit({error = 'Unknown action ' .. action})
