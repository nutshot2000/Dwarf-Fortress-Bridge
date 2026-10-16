-- Mark loose items for dumping (dwarves haul them to a garbage dump zone), unmark them, or just count.
-- Skips items already in a stockpile, in a dump zone, inside buildings/containers, forbidden or in jobs.
if not need_map() then return end
local action = ARGS.action or 'count'
local types = ARGS.types or {'BOULDER'}
local z1 = ARGS.z1 or ARGS.z
local z2 = ARGS.z2 or ARGS.z or z1
if not z1 then emit({error = 'give z, or z1 and z2'}) return end
if z1 > z2 then z1, z2 = z2, z1 end

local function in_box(x, y)
  if ARGS.x1 and (x < math.min(ARGS.x1, ARGS.x2 or ARGS.x1) or x > math.max(ARGS.x1, ARGS.x2 or ARGS.x1)) then return false end
  if ARGS.y1 and (y < math.min(ARGS.y1, ARGS.y2 or ARGS.y1) or y > math.max(ARGS.y1, ARGS.y2 or ARGS.y1)) then return false end
  return true
end

local dumps = {}
for _, z in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
  if z.type == df.civzone_type.Dump then
    table.insert(dumps, {id = z.id, at = ('%d,%d,%d'):format(z.x1, z.y1, z.z), w = z.x2 - z.x1 + 1, h = z.y2 - z.y1 + 1})
  end
end
local function in_dump(x, y, z)
  for _, d in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
    if d.type == df.civzone_type.Dump and d.z == z and x >= d.x1 and x <= d.x2 and y >= d.y1 and y <= d.y2 then return true end
  end
end

local changed, skipped, by_z = 0, 0, {}
for _, t in ipairs(types) do
  for _, it in ipairs(try(function() return df.global.world.items.other[t] end, {})) do
    local f = it.flags
    if f.on_ground and not f.removed and not f.in_job and not f.forbid then
      local x, y, z = dfhack.items.getPosition(it)
      if z and z >= z1 and z <= z2 and in_box(x, y) then
        local b = dfhack.buildings.findAtTile(x, y, z)
        local stored = b and df.building_stockpilest:is_instance(b)
        if stored or in_dump(x, y, z) then
          skipped = skipped + 1
        elseif action == 'mark' and not f.dump then
          f.dump = true changed = changed + 1
          by_z[tostring(z)] = (by_z[tostring(z)] or 0) + 1
        elseif action == 'unmark' and f.dump then
          f.dump = false changed = changed + 1
          by_z[tostring(z)] = (by_z[tostring(z)] or 0) + 1
        elseif action == 'count' then
          changed = changed + 1
          by_z[tostring(z)] = (by_z[tostring(z)] or 0) + 1
        end
      end
    end
  end
end

local out = {action = action, items = changed, by_z = by_z, skipped_stored = skipped, dump_zones = dumps}
if action == 'mark' and #dumps == 0 then
  out.warning = 'No garbage dump zone: make one (df_zone type d) or the marked items stay put.'
end
emit(out)
