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
  wood = count(O.WOOD, usable),
}

-- amount still to be produced by existing orders, keyed like the refill jobs ("MakeBarrel", "CustomReaction:BREW_DRINK_FROM_PLANT", "MakeTool:ITEM_TOOL_LARGE_POT")
local pending = {}
local function key(job_type, reaction_name, item_subtype)
  local k = df.job_type[job_type]
  if reaction_name ~= '' then k = k .. ':' .. reaction_name end
  if job_type == df.job_type.MakeTool and item_subtype >= 0 then
    local d = df.itemdef_toolst.find(item_subtype)
    if d then k = k .. ':' .. d.id end
  end
  return k
end
for _, o in ipairs(df.global.world.manager_orders.all) do
  local k = key(o.job_type, o.reaction_name, o.item_subtype)
  pending[k] = (pending[k] or 0) + o.amount_left
end
-- jobs already waiting in a workshop count too: an order's amount_left drops as soon as its job is made, and a
-- job queued straight at a workshop (df_workshop add) has no order at all. Ten brews queued at the still used to
-- get another 22 brew orders on top.
for _, j in utils.listpairs(df.global.world.jobs.list) do
  local k = key(j.job_type, j.reaction_name, j.item_subtype)
  pending[k] = (pending[k] or 0) + 1
end
emit({stock = stock, pending = pending})
