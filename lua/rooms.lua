-- Zones: list them, or assign/unassign an owner (bedrooms, offices, tombs, dining halls).
if not need_map() then return end
local action = ARGS.action or 'list'
local function zinfo(z)
  local owner = z.assigned_unit_id >= 0 and df.unit.find(z.assigned_unit_id)
  return {id = z.id, type = df.civzone_type[z.type], name = z.name ~= '' and dfhack.df2utf(z.name) or nil,
    x = z.x1, y = z.y1, x2 = z.x2, y2 = z.y2, z = z.z, owner = owner and unit_name(owner) or nil,
    active = z.spec_sub_flag and z.spec_sub_flag.active or nil}
end
if action == 'list' then
  local out = {}
  for _, z in ipairs(df.global.world.buildings.other.ANY_ZONE) do table.insert(out, zinfo(z)) end
  emit({zones = out}) return
end
local z = df.building.find(ARGS.zone_id or -1)
if not z or not df.building_civzonest:is_instance(z) then emit({error = 'No zone ' .. tostring(ARGS.zone_id)}) return end
local u = nil
if action == 'assign' then
  u = df.unit.find(ARGS.unit_id or -1)
  if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end
end
dfhack.buildings.setOwner(z, u)
emit({ok = true, zone = zinfo(z)})
