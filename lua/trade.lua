-- Trade: caravans, depots, sending goods to the depot, and the trade screen (when open).
if not need_map() then return end
local action = ARGS.action or 'status'
-- Esc does not close the trade screen (it lives inside the main dwarfmode screen); clear its open flag.
if action == 'close' then
  df.global.game.main_interface.trade.open = false
  emit({closed = true, focus = dfhack.gui.getCurFocus(true)})
  return
end
local T = df.global.game.main_interface.trade
local function value_with_contents(it,mer,seen)
  seen=seen or {}
  if seen[it.id] then return 0 end
  seen[it.id]=true
  local n=dfhack.items.getValue(it,mer)
  for _,c in ipairs(dfhack.items.getContainedItems(it)) do n=n+value_with_contents(c,mer,seen) end
  return n
end

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
     or f.trader or f.owned or f.garbage_collect or f.on_fire or f.in_job then return false end
  -- in_inventory also marks items inside bins; those can be traded (send takes them out of the bin first).
  -- Only refuse items a creature is holding.
  if f.in_inventory and dfhack.items.getHolderUnit(it) then return false end
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

-- A requested trader stands at the depot until trading starts and hauls nothing meanwhile: release them while
-- goods are still on their way, and after the deal.
if action == 'release' then
  local n = 0
  for _, d in ipairs(depots()) do d.trade_flags.trader_requested = false d.trade_flags.anyone_can_trade = false end
  for _, j in require('utils').listpairs(df.global.world.jobs.list) do
    if j.job_type == df.job_type.TradeAtDepot then dfhack.job.removeJob(j) n = n + 1 end
  end
  emit({ok = true, released = n}) return
end

if action == 'send' or action == 'goods' then
  local depot = depots()[1]
  if ARGS.depot_id then depot = df.building.find(ARGS.depot_id) end
  if not depot then emit({error = 'No trade depot. Build one with df_build key=D.'}) return end
  local text = (ARGS.search or ''):lower()
  -- An explicit item_ids list is the request itself: it is never cut, by the default 20 or by a `limit` meant to
  -- shorten the listing (limit=5 with 54 ids once sent 5 items to a caravan).
  local limit = ARGS.item_ids and #ARGS.item_ids or math.min(ARGS.limit or 20, 200)
  local sent,protected,banned = {},{},{}
  -- a noble's export ban (mandate mode 0): trading a matching item is a crime, so never send one
  local bans = {}
  for _, m in ipairs(df.global.world.mandates.all) do if m.mode == 0 then bans[#bans + 1] = m end end
  local function is_banned(it)
    for _, m in ipairs(bans) do
      if it:getType() == m.item_type and (m.item_subtype < 0 or it:getSubtype() == m.item_subtype)
         and (m.mat_type < 0 or (it:getMaterial() == m.mat_type and (m.mat_index < 0 or it:getMaterialIndex() == m.mat_index))) then
        return true
      end
    end
  end
  for _, it in ipairs(df.global.world.items.other.IN_PLAY) do
    if #sent >= limit then break end
    local ok = (ARGS.item_ids == nil) and (text ~= '' or action=='goods')
    if ARGS.item_ids then for _, id in ipairs(ARGS.item_ids) do if id == it.id then ok = true end end end
    if ok and text ~= '' then ok = dfhack.items.getReadableDescription(it):lower():find(text, 1, true) ~= nil end
    -- never send artifacts by search: losing one angers its owner, its god or a noble (item_ids still allowed)
    if ok and it.flags.artifact and not ARGS.item_ids then ok = false end
    ok = ok and tradeable(it, depot)
    if ok and #bans > 0 and is_banned(it) then
      ok = false
      if #banned < 10 then banned[#banned + 1] = dfhack.df2utf(dfhack.items.getReadableDescription(it)) end
    end
    if ok then
      local contents={}
      for _,c in ipairs(dfhack.items.getContainedItems(it)) do
        contents[#contents+1]={id=c.id,item=dfhack.df2utf(dfhack.items.getReadableDescription(c)),value=value_with_contents(c)}
      end
      local entry={id=it.id,item=dfhack.df2utf(dfhack.items.getReadableDescription(it)),
        value=dfhack.items.getValue(it),value_with_contents=value_with_contents(it),contents=contents,
        at_depot=dfhack.items.getHolderBuilding(it)==depot}
      if #contents>0 and not ARGS.allow_contents then
        -- Food and booze barrels can hold dozens of stacks: list contents only with show_contained=true.
        if not ARGS.show_contained then entry.contents=nil entry.content_count=#contents end
        if #protected<20 then protected[#protected+1]=entry end
      else
        if action=='send' and not ARGS.dry_run then
          -- an item marked inside a bin is never hauled (no job appears): set it on the bin's own tile first
          if dfhack.items.getContainer(it) then
            local x, y, z = dfhack.items.getPosition(it)
            if x and dfhack.items.moveToGround(it, xyz2pos(x, y, z)) then entry.unpacked = true end
          end
          it.flags.forbid = false dfhack.items.markForTrade(it,depot)
        end
        sent[#sent+1]=entry
      end
    end
  end
  local preview=action=='goods' or ARGS.dry_run
  -- a big send lists only the first items; the totals cover all of them
  local total_value, shown = 0, {}
  for i, e in ipairs(sent) do total_value = total_value + e.value_with_contents if i <= 15 then shown[i] = e end end
  emit({ok=true,dry_run=preview,marked=not preview and #sent or 0,candidates=#sent,total_value=total_value,
    items=shown, more=#sent > 15 and (#sent - 15) or nil,
    protected_containers=protected,
    export_banned=#banned > 0 and banned or nil,
    guidance='Nonempty containers are protected by default, including booze and seed barrels. Inspect contents, then explicitly set allow_contents=true if intended. value excludes contents; value_with_contents includes them.'}) return
end

-- The diplomacy meeting's requests screen (what the fort asks the caravan to bring). Its tabs are not
-- entity_sell_category values: tab i shows category taking_requests_tablist[i], and the priorities are indexed by
-- category (Sand: tab 46, priority[49]). Work by category name, as DFHack's trade-agreement overlay does.
if action == 'requests' then
  local D = df.global.game.main_interface.diplomacy
  if not (D.open and D.taking_requests) then
    emit({error = "The diplomacy requests screen is not open. Click the DIPLOMACY button (df_screen click text='DIPLOMACY'), go through the dialog to the trade requests, then call again."}) return
  end
  local pri = D.environment.dipev.sell_requests.priority
  local function cat_name(c) return df.entity_sell_category[c] or tostring(c) end
  local function norm(s) return (s:upper():gsub('[%s_]', '')) end
  if not ARGS.category then
    local tabs = {}
    for i, c in ipairs(D.taking_requests_tablist) do
      local p, n = pri[c], 0
      for j = 0, #p - 1 do if p[j] > 0 then n = n + 1 end end
      tabs[#tabs + 1] = {tab = i, category = cat_name(c), items = #p, requested = n}
    end
    emit({tabs = tabs, selected_tab = D.taking_requests_selected_tab}) return
  end
  local cat
  for _, c in ipairs(D.taking_requests_tablist) do if norm(cat_name(c)) == norm(ARGS.category) then cat = c end end
  if not cat then emit({error = 'No requests tab for ' .. ARGS.category .. ': call action=requests without category to list them.'}) return end
  local p = pri[cat]
  if ARGS.priority ~= nil then
    local idx = ARGS.indices
    if not idx then idx = {} for j = 0, #p - 1 do idx[#idx + 1] = j end end
    for _, j in ipairs(idx) do
      if j < 0 or j >= #p then emit({error = ('Index %d out of range: %s has %d items (0-%d). Nothing changed.'):format(j, cat_name(cat), #p, #p - 1)}) return end
    end
    for _, j in ipairs(idx) do p[j] = ARGS.priority end
  end
  local items = {}
  for j = 0, #p - 1 do items[#items + 1] = {index = j, priority = p[j]} end
  emit({category = cat_name(cat), items = items,
    note = 'Item names are only on the game screen: open this tab there (df_screen read) to match the indices.'}) return
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
          value = dfhack.items.getValue(it, T.mer), value_with_contents=value_with_contents(it,T.mer),selected = fl.selected or nil,
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
  local flags = T.goodflag[idx]
  for _, i in ipairs(ARGS.indices or {}) do
    if flags[i] then
      flags[i].selected = (action == 'select') n = n + 1
      -- A container's contents are the "contained" rows right after it (hidden from action=screen). Marking only
      -- the container row buys or sells the empty bin: a "Cloth Bin" worth 588 came home as a 10-value bin.
      local j = i + 1
      while flags[j] and flags[j].contained do
        flags[j].selected = (action == 'select')
        j = j + 1
      end
    end
  end
  local total = {0, 0}
  for s = 0, 1 do
    local seen={}
    for i, it in ipairs(T.good[s]) do
      if T.goodflag[s][i].selected then total[s + 1] = total[s + 1] + value_with_contents(it,T.mer,seen) end
    end
  end
  emit({ok = true, changed = n, selected_value = {merchant = total[1], fort = total[2]},
    hint = 'Totals include container contents without double-counting. No fixed ratio guarantees acceptance; use the native Value/Trader Profit/Allowed Weight footer and merchant reply. Offer more profit or reduce purchases after refusal.'}) return
end
emit({error = 'Unknown action ' .. action})
