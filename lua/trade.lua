-- Trade: caravans, depots, sending goods to the depot, and the trade screen (when open).
if not need_map() then return end
local action = ARGS.action or 'status'
local T = df.global.game.main_interface.trade

local function depots()
  local out = {}
  for _, b in ipairs(df.global.world.buildings.other.TRADE_DEPOT) do table.insert(out, b) end
  return out
end
local function caravans()
  local out = {}
  for i, c in ipairs(df.global.plotinfo.caravans) do
    local civ = df.historical_entity.find(c.entity)
    table.insert(out, {index = i,
      civ = civ and dfhack.df2utf(dfhack.translation.translateName(civ.name, true)) or nil,
      race = civ and try(function() return df.creature_raw.find(civ.race).name[1] end) or nil,
      state = try(function() return df.caravan_state.T_trade_state[c.trade_state] end, c.trade_state),
      time_remaining = c.time_remaining,
      wealth_offered = try(function() return #c.goods end)})
  end
  return out
end
local function tradeable(it, depot)
  local f = it.flags
  if f.hostile or f.removed or f.dead_dwarf or f.spider_web or f.construction or f.encased or f.murder
     or f.trader or f.owned or f.garbage_collect or f.on_fire or f.in_job or f.in_inventory then return false end
  if f.in_building and dfhack.items.getHolderBuilding(it) ~= depot then return false end
  local x, y, z = dfhack.items.getPosition(it)
  return x and dfhack.maps.canWalkBetween(xyz2pos(x, y, z), xyz2pos(depot.centerx, depot.centery, depot.z))
end

if action == 'status' then
  local ds = {}
  for _, d in ipairs(depots()) do
    table.insert(ds, {id = d.id, x = d.centerx, y = d.centery, z = d.z,
      built = d:getBuildStage() >= d:getMaxBuildStage(), items_inside = #d.contained_items})
  end
  local broker = dfhack.units.getUnitsByNobleRole('broker')
  emit({caravans = caravans(), depots = ds, trade_screen_open = T.open,
    broker = broker[1] and unit_name(broker[1]) or 'none (appoint BROKER with df_noble)',
    hint = 'Mark goods with action=send. Trading happens on the in-game trade screen: open it from the depot, then use action=screen / select.'}) return
end

if action == 'send' then
  local depot = depots()[1]
  if ARGS.depot_id then depot = df.building.find(ARGS.depot_id) end
  if not depot then emit({error = 'No trade depot. Build one with df_build key=D.'}) return end
  local text = (ARGS.search or ''):lower()
  local limit = math.min(ARGS.limit or 20, 200)
  local sent = {}
  for _, it in ipairs(df.global.world.items.other.IN_PLAY) do
    if #sent >= limit then break end
    local ok = (ARGS.item_ids == nil) and text ~= ''
    if ARGS.item_ids then for _, id in ipairs(ARGS.item_ids) do if id == it.id then ok = true end end end
    if ok and text ~= '' then ok = dfhack.items.getReadableDescription(it):lower():find(text, 1, true) ~= nil end
    if ok and tradeable(it, depot) then
      it.flags.forbid = false
      dfhack.items.markForTrade(it, depot)
      table.insert(sent, {id = it.id, item = dfhack.df2utf(dfhack.items.getReadableDescription(it)),
        value = dfhack.items.getValue(it)})
    end
  end
  emit({ok = true, marked = #sent, items = sent}) return
end

-- trade screen
if not T.open then emit({error = 'The trade screen is not open. Open it from the depot (needs a caravan and the broker at the depot).'}) return end
local SIDES = {merchant = 0, fort = 1}
if action == 'screen' then
  local out = {}
  for side, idx in pairs(SIDES) do
    local list = {}
    for i, it in ipairs(T.good[idx]) do
      local fl = T.goodflag[idx][i]
      if not fl.contained or ARGS.show_contained then
        table.insert(list, {index = i, item = dfhack.df2utf(dfhack.items.getReadableDescription(it)),
          value = dfhack.items.getValue(it, T.mer), selected = fl.selected or nil,
          requested = try(function() return dfhack.items.isRequestedTradeGood(it, T.mer) end) or nil})
      end
    end
    out[side] = list
  end
  emit({merchant = out.merchant, fort = out.fort, counter_offer = T.counter_offer}) return
end
if action == 'select' or action == 'deselect' then
  local idx = SIDES[ARGS.side or 'fort']
  if not idx then emit({error = 'side must be merchant or fort'}) return end
  local n = 0
  for _, i in ipairs(ARGS.indices or {}) do
    if T.goodflag[idx][i] then T.goodflag[idx][i].selected = (action == 'select') n = n + 1 end
  end
  local total = {0, 0}
  for s = 0, 1 do
    for i, it in ipairs(T.good[s]) do
      if T.goodflag[s][i].selected then total[s + 1] = total[s + 1] + dfhack.items.getValue(it, T.mer) end
    end
  end
  emit({ok = true, changed = n, selected_value = {merchant = total[1], fort = total[2]},
    hint = 'Offer roughly 1.2-1.5x what you take. Press Trade on the screen to propose the deal.'}) return
end
emit({error = 'Unknown action ' .. action})
