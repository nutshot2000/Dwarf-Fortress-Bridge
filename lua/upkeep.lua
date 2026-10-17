-- Stock levels for df_upkeep, plus the work orders already queued for each refill job,
-- so the caller only tops up what is short and never stacks duplicate orders.
if not need_map() then return end
local utils = require('utils')

local usable, free = stock_usable, stock_available
local function count(list, pred)
  local n = 0
  for _, it in ipairs(list) do if pred(it) then n = n + (it.stack_size or 1) end end
  return n
end
local O = df.global.world.items.other
local function empty(it) return free(it) and #dfhack.items.getContainedItems(it) == 0 end

local pop = #citizens()
local stock = {
  pop = pop,
  drink = count(O.DRINK, usable),
  empty_barrels = count(O.BARREL, empty),
  empty_pots = count(O.TOOL, function(it) return empty(it) and it.subtype.id == 'ITEM_TOOL_LARGE_POT' end),
  free_beds = count(O.BED, free),
  free_doors = count(O.DOOR, free),
  free_cabinets = count(O.CABINET, free),
  free_chests = count(O.BOX, function(it) return empty(it) end),
  goblets = count(O.GOBLET, free),
  soap = count(O.BAR, function(it)
    local m = dfhack.matinfo.decode(it)
    return usable(it) and m and m:toString():find('soap') ~= nil
  end),
  fuel = count(O.BAR, function(it)
    local m = dfhack.matinfo.decode(it)
    local n = m and m:toString() or ''
    return usable(it) and (n:find('coal') or n:find('coke')) ~= nil
  end),
  plants = count(O.PLANT, usable),
}

-- amount still to be produced by existing orders, keyed like the refill jobs ("MakeBarrel", "CustomReaction:BREW_DRINK_FROM_PLANT", "MakeTool:ITEM_TOOL_LARGE_POT")
local pending = {}
for _, o in ipairs(df.global.world.manager_orders.all) do
  local k = df.job_type[o.job_type]
  if o.reaction_name ~= '' then k = k .. ':' .. o.reaction_name end
  if o.job_type == df.job_type.MakeTool and o.item_subtype >= 0 then
    local d = df.itemdef_toolst.find(o.item_subtype)
    if d then k = k .. ':' .. d.id end
  end
  pending[k] = (pending[k] or 0) + o.amount_left
end
emit({stock = stock, pending = pending})
