-- Find items by description text (and/or item type): where each one is, who holds it,
-- and the flags that stop dwarves using it (forbidden, dumped, in a job, at the depot).
if not need_map() then return end
local text = (ARGS.search or ''):lower()
local itype = ARGS.type and df.item_type[ARGS.type:upper()]
local limit = math.min(ARGS.limit or 20, 200)

local function where(it)
  local holder = dfhack.items.getHolderUnit(it)
  if holder then return 'held by ' .. unit_name(holder) end
  local cont = dfhack.items.getContainer(it)
  local x, y, z = dfhack.items.getPosition(it)
  if not x then return 'nowhere?' end
  local b = dfhack.buildings.findAtTile(x, y, z)
  local inside = cont and (' in ' .. dfhack.df2utf(dfhack.items.getReadableDescription(cont))) or ''
  if b and df.building_stockpilest:is_instance(b) then return ('stockpile #%d (%d,%d,%d)%s'):format(b.id, x, y, z, inside) end
  if b and it.flags.in_building then return ('%s #%d (%d,%d,%d)'):format(df.building_type[b:getType()], b.id, x, y, z) end
  for _, d in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
    if d.type == df.civzone_type.Dump and d.z == z and x >= d.x1 and x <= d.x2 and y >= d.y1 and y <= d.y2 then
      return ('dump zone #%d (%d,%d,%d)'):format(d.id, x, y, z)
    end
  end
  return ('loose at %d,%d,%d%s'):format(x, y, z, inside)
end

local list = itype and df.global.world.items.other[df.item_type[itype]] or df.global.world.items.other.IN_PLAY
local found, total = {}, 0
for _, it in ipairs(list) do
  if not it.flags.removed and (not itype or it:getType() == itype) then
    local desc = dfhack.df2utf(dfhack.items.getReadableDescription(it))
    if text == '' or desc:lower():find(text, 1, true) then
      total = total + 1
      if #found < limit then
        local f = it.flags
        local blocks = {}
        for _, k in ipairs({'forbid', 'dump', 'in_job', 'trader', 'rotten', 'garbage_collect', 'owned', 'artifact'}) do
          if f[k] then blocks[#blocks + 1] = k end
        end
        table.insert(found, {id = it.id, item = desc, where = where(it), flags = #blocks > 0 and table.concat(blocks, ',') or nil,
          value = dfhack.items.getValue(it)})
      end
    end
  end
end
emit({search = ARGS.search, type = ARGS.type, total = total, shown = #found, items = found})
