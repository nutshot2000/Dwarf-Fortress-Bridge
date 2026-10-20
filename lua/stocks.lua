-- Item inventory. No filter: counts per item type. With type: breakdown by
-- description, plus a few locations.
if not need_map() then return end
local filter = ARGS.type and ARGS.type:upper() or nil
local text = ARGS.search and ARGS.search:lower() or nil

local function usable(it)
  local f = it.flags
  return not (f.garbage_collect or f.trader or f.hostile or f.removed or f.spider_web)
end

local counts, available, details, available_details, where = {}, {}, {}, {}, {}
for _, it in ipairs(df.global.world.items.other.IN_PLAY) do
  if usable(it) then
    local t = df.item_type[it:getType()]
    if not filter or t == filter then
      local desc
      if filter or text then desc = dfhack.df2utf(dfhack.items.getReadableDescription(it)) end
      if not text or desc:lower():find(text, 1, true) then
        counts[t] = (counts[t] or 0) + it.stack_size
        available[t] = (available[t] or 0) + (stock_available(it) and it.stack_size or 0)
        if filter or text then
          local key = desc:gsub('%s*%[%d+%]$', '')
          details[key] = (details[key] or 0) + it.stack_size
          if stock_available(it) then available_details[key] = (available_details[key] or 0) + it.stack_size end
          if #where < 15 then
            local x, y, z = dfhack.items.getPosition(it)
            table.insert(where, {item = desc, id = it.id, x = x, y = y, z = z,
              forbidden = it.flags.forbid or nil, in_use = it.flags.in_job or nil,
              installed = it.flags.in_building or nil, carried = (it.flags.in_inventory and dfhack.items.getHolderUnit(it)) and true or nil,
              in_container = (it.flags.in_inventory and not dfhack.items.getHolderUnit(it)) and true or nil,
              available = stock_available(it)})
          end
        end
      end
    end
  end
end

if filter or text then
  local list = {}
  for k, v in pairs(details) do table.insert(list, {item = k, count = v, available = available_details[k] or 0}) end
  table.sort(list, function(a, b) return a.count > b.count end)
  while #list > 40 do table.remove(list) end
  emit({totals = counts, available_totals = available, items = list, some_locations = where,
    note = 'Totals include installed and allocated inventory; available excludes installed, reserved, carried, forbidden, rotten, dumped and owned items.'}) return
end
local list = {}
for k, v in pairs(counts) do table.insert(list, {type = k, count = v, available = available[k] or 0}) end
table.sort(list, function(a, b) return a.count > b.count end)
emit({item_types = list})
