-- Minecarts: hauling routes, their stops, stockpile links, departure conditions and carts.
-- Track carving and track stops are placed by the JS side through quickfort; this script does the rest.
if not need_map() then return end
local utils = require('utils')
local H = df.global.plotinfo.hauling
local action = ARGS.action or 'list'

local DIRS = {n = 'North', s = 'South', e = 'East', w = 'West', north = 'North', south = 'South', east = 'East', west = 'West'}
local MODES = {push = 'Push', ride = 'Ride', guide = 'Guide'}

local function route_by(id_or_name)
  for _, r in ipairs(H.routes) do
    if r.id == tonumber(id_or_name) or (type(id_or_name) == 'string' and r.name:lower() == id_or_name:lower()) then return r end
  end
end
local function stop_by(r, id)
  for _, s in ipairs(r.stops) do if s.id == id then return s end end
end
local function cart_of(r)
  if #r.vehicle_ids == 0 then return nil end
  local v = utils.binsearch(df.global.world.vehicles.active, r.vehicle_ids[0], 'id')
  local it = v and df.item.find(v.item_id)
  if not it then return nil end
  local x, y, z = dfhack.items.getPosition(it)
  return {item_id = it.id, item = dfhack.df2utf(dfhack.items.getReadableDescription(it)), at = x and (x .. ',' .. y .. ',' .. z)}
end
local function cond_text(c)
  local s = df.stop_depart_condition.T_mode[c.mode] .. ' ' .. df.stop_depart_condition.T_direction[c.direction]
  if c.flags.at_most and c.load_percent == 0 then s = s .. ' when empty'
  elseif c.load_percent > 0 then s = s .. (' when %s %d%% full'):format(c.flags.at_most and 'at most' or 'at least', c.load_percent) end
  if c.timeout > 0 then s = s .. (' or after %d ticks'):format(c.timeout) end
  return s
end
local function describe(r)
  local stops = {}
  for _, s in ipairs(r.stops) do
    local links, conds = {}, {}
    for _, l in ipairs(s.stockpiles) do
      local b = df.building.find(l.building_id)
      links[#links + 1] = ('%s stockpile %d%s'):format(l.mode.give and 'gives to' or 'takes from', l.building_id,
        b and b.name ~= '' and (' "' .. b.name .. '"') or '')
    end
    for _, c in ipairs(s.conditions) do conds[#conds + 1] = cond_text(c) end
    stops[#stops + 1] = {id = s.id, name = s.name ~= '' and s.name or nil, at = s.pos.x .. ',' .. s.pos.y .. ',' .. s.pos.z,
      links = links, depart = #conds > 0 and conds or 'no condition (the cart waits here)'}
  end
  return {id = r.id, name = r.name ~= '' and r.name or ('Route ' .. r.id), stops = stops, cart = cart_of(r) or 'none'}
end

if action == 'list' then
  local routes = {}
  for _, r in ipairs(H.routes) do routes[#routes + 1] = describe(r) end
  local free = {}
  for _, v in ipairs(df.global.world.vehicles.active) do
    if v.route_id == -1 then
      local it = df.item.find(v.item_id)
      if it then
        local x, y, z = dfhack.items.getPosition(it)
        free[#free + 1] = {item_id = it.id, item = dfhack.df2utf(dfhack.items.getReadableDescription(it)), at = x and (x .. ',' .. y .. ',' .. z)}
      end
    end
  end
  local stops = {}
  for _, b in ipairs(df.global.world.buildings.other.TRAP) do
    if b.trap_type == df.trap_type.TrackStop then
      stops[#stops + 1] = {id = b.id, at = b.centerx .. ',' .. b.centery .. ',' .. b.z,
        built = b:getBuildStage() >= b:getMaxBuildStage(), friction = b.track_stop_info.friction,
        dump = b.track_stop_info.track_flags.use_dump and (b.track_stop_info.dump_x_shift ~= 0 and (b.track_stop_info.dump_x_shift > 0 and 'east' or 'west')
          or (b.track_stop_info.dump_y_shift > 0 and 'south' or 'north')) or nil}
    end
  end
  emit({routes = routes, free_carts = free, track_stops = stops,
    hint = 'A route needs track between its stops, a track stop at each stop (1 mechanism), a stockpile link (take at the loading stop; the unloading stop dumps onto a stockpile or links give), a departure condition per stop, and a cart (df_order job=MakeMinecart; then action=assign).'})
  return
end

local r = route_by(ARGS.route or ARGS.route_id)
if not r then emit({error = 'No route ' .. tostring(ARGS.route or ARGS.route_id) .. ' (df_minecart list)'}) return end

if action == 'link' then
  local s = stop_by(r, ARGS.stop_id or 1)
  if not s then emit({error = 'No stop ' .. tostring(ARGS.stop_id) .. ' on route ' .. r.id}) return end
  local pile = df.building.find(ARGS.stockpile_id or -1)
  if not pile or not df.building_stockpilest:is_instance(pile) then emit({error = 'No stockpile ' .. tostring(ARGS.stockpile_id)}) return end
  local give = ARGS.mode == 'give'
  for _, l in ipairs(s.stockpiles) do if l.building_id == pile.id then emit({error = 'Already linked'}) return end end
  s.stockpiles:insert('#', {new = df.route_stockpile_link, building_id = pile.id, mode = give and {give = true} or {take = true}})
  pile.linked_stops:insert('#', s)
  emit({ok = true, route = describe(r)}) return
end

if action == 'condition' then
  local s = stop_by(r, ARGS.stop_id or 1)
  if not s then emit({error = 'No stop ' .. tostring(ARGS.stop_id) .. ' on route ' .. r.id}) return end
  if ARGS.clear then
    for i = #s.conditions - 1, 0, -1 do local c = s.conditions[i] s.conditions:erase(i) c:delete() end
  end
  if ARGS.direction then
    local dir = DIRS[tostring(ARGS.direction):lower()]
    local mode = MODES[tostring(ARGS.mode or 'push'):lower()]
    if not dir or not mode then emit({error = 'direction n|s|e|w, mode push|ride|guide'}) return end
    local c = df.stop_depart_condition:new()
    c.direction = df.stop_depart_condition.T_direction[dir]
    c.mode = df.stop_depart_condition.T_mode[mode]
    c.load_percent = ARGS.load_percent or 0
    c.timeout = ARGS.timeout or 0
    c.flags.at_most = ARGS.at_most or false
    s.conditions:insert('#', c)
  end
  emit({ok = true, route = describe(r)}) return
end

if action == 'assign' then
  local before = cart_of(r)
  if before then emit({ok = true, note = 'Route already has a cart', route = describe(r)}) return end
  local G = dfhack.BASE_G or _G
  local p = G.print G.print = function() end
  local ok, err = pcall(dfhack.run_script, 'assign-minecarts', tostring(r.id), '-q')
  G.print = p
  local after = cart_of(r)
  if not after then emit({error = 'No free minecart to assign' .. (ok and '' or (': ' .. tostring(err))) .. '. Make one (df_order job=MakeMinecart) and wait for it.'}) return end
  emit({ok = true, route = describe(r)}) return
end

if action == 'rename' then
  if ARGS.name then r.name = ARGS.name end
  emit({ok = true, route = describe(r)}) return
end

emit({error = 'Unknown action ' .. action})
