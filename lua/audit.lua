-- Room/zone audit against the wiki's requirements (dwarffortresswiki.org: Zone, Tavern, Temple,
-- Health care, Library, Noble). Reports per zone what is met, what is missing, and warnings.
if not need_map() then return end
local site = dfhack.world.getCurrentSite()

local RANKS = {0, 100, 250, 500, 1000, 1500, 2500, 10000}
local BED = {'Meager Quarters', 'Modest Quarters', 'Quarters', 'Decent Quarters', 'Fine Quarters', 'Great Bedroom', 'Grand Bedroom', 'Royal Bedroom'}
local DINE = {'Meager Dining Room', 'Modest Dining Room', 'Dining Room', 'Decent Dining Room', 'Fine Dining Room', 'Great Dining Room', 'Grand Dining Room', 'Royal Dining Room'}
local OFFICE = {'Meager Office', 'Modest Office', 'Office', 'Decent Office', 'Splendid Office', 'Throne Room', 'Opulent Throne Room', 'Royal Throne Room'}
local TOMB = {'Grave', "Servant's Burial Chamber", 'Burial Chamber', 'Tomb', 'Fine Tomb', 'Mausoleum', 'Grand Mausoleum', 'Royal Mausoleum'}
-- wiki Noble "Needs" table: quarters, dining, office, tomb (rank index 1..8, nil = none), chests, cabinets, racks, stands
local NOBLE = {
  BOOKKEEPER = {office = 1}, MANAGER = {office = 1},
  SHERIFF = {bed = 2, dine = 2, office = 2, chests = 1, cabinets = 1, racks = 1, stands = 1},
  CAPTAIN_OF_THE_GUARD = {bed = 3, dine = 3, office = 3, chests = 1, cabinets = 1, racks = 1, stands = 1},
  DUNGEON_MASTER = {bed = 3, dine = 3, office = 3, chests = 1, cabinets = 1, racks = 1, stands = 1},
  MAYOR = {bed = 4, dine = 4, office = 4, chests = 2, cabinets = 1, racks = 1, stands = 1},
  BARON = {bed = 4, dine = 4, office = 4, tomb = 4, chests = 2, cabinets = 1, racks = 1, stands = 1},
  COUNT = {bed = 6, dine = 6, office = 6, tomb = 6, chests = 3, cabinets = 2, racks = 2, stands = 2},
  DUKE = {bed = 7, dine = 7, office = 7, tomb = 7, chests = 5, cabinets = 3, racks = 3, stands = 3},
  GENERAL = {bed = 3, dine = 3, office = 4, tomb = 1, chests = 2, cabinets = 1, racks = 3, stands = 3},
  MONARCH = {bed = 8, dine = 8, office = 8, tomb = 8, chests = 10, cabinets = 5, racks = 5, stands = 5},
}

local zones = {}
for _, z in ipairs(df.global.world.buildings.other.ANY_ZONE) do table.insert(zones, z) end

local function in_zone(z, x, y) return z.z and x >= z.x1 and x <= z.x2 and y >= z.y1 and y <= z.y2 and dfhack.buildings.containsTile(z, x, y) end
local function contents(z)
  local c = {}
  for _, b in ipairs(df.global.world.buildings.all) do
    if b.z == z.z and not df.building_civzonest:is_instance(b) and not df.building_stockpilest:is_instance(b)
       and in_zone(z, b.centerx, b.centery) then
      local t = df.building_type[b:getType()]
      if b:getBuildStage() >= b:getMaxBuildStage() then c[t] = (c[t] or 0) + 1 else c[t .. '(unbuilt)'] = (c[t .. '(unbuilt)'] or 0) + 1 end
    end
  end
  return c
end
local function piles_in(z)
  local n = {}
  for _, s in ipairs(df.global.world.buildings.other.STOCKPILE) do
    if s.z == z.z and in_zone(z, s.x1, s.y1) then table.insert(n, s) end
  end
  return n
end
local function tiles(z)
  local n = 0
  for x = z.x1, z.x2 do for y = z.y1, z.y2 do if dfhack.buildings.containsTile(z, x, y) then n = n + 1 end end end
  return n
end
-- largest square of open, walkable, building-free floor inside the zone (the wiki's dance floor)
local function dance_floor(z)
  local W, H = z.x2 - z.x1 + 1, z.y2 - z.y1 + 1
  local occupied = {}
  for _, b in ipairs(df.global.world.buildings.all) do
    if b.z == z.z and not df.building_civzonest:is_instance(b) and not df.building_stockpilest:is_instance(b) then
      for x = b.x1, b.x2 do for y = b.y1, b.y2 do occupied[y * 1000 + x] = true end end
    end
  end
  local best, dp = 0, {}
  for j = 0, H - 1 do
    dp[j] = {}
    for i = 0, W - 1 do
      local x, y = z.x1 + i, z.y1 + j
      local tt = dfhack.maps.getTileType(x, y, z.z)
      local shape = tt and df.tiletype_shape[df.tiletype.attrs[tt].shape]
      local open = dfhack.buildings.containsTile(z, x, y) and (shape == 'FLOOR' or shape == 'PEBBLES') and not occupied[y * 1000 + x]
      if open then
        local up = j > 0 and dp[j - 1][i] or 0
        local left = i > 0 and dp[j][i - 1] or 0
        local diag = (i > 0 and j > 0) and dp[j - 1][i - 1] or 0
        dp[j][i] = 1 + math.min(up, left, diag)
        if dp[j][i] > best then best = dp[j][i] end
      else dp[j][i] = 0 end
    end
  end
  return best
end
local function overlaps(z)
  local others = {}
  for _, o in ipairs(zones) do
    if o.id ~= z.id and o.z == z.z and o.x1 <= z.x2 and o.x2 >= z.x1 and o.y1 <= z.y2 and o.y2 >= z.y1 then
      local shared = false
      for x = math.max(z.x1, o.x1), math.min(z.x2, o.x2) do
        for y = math.max(z.y1, o.y1), math.min(z.y2, o.y2) do
          if dfhack.buildings.containsTile(z, x, y) and dfhack.buildings.containsTile(o, x, y) then shared = true break end
        end
        if shared then break end
      end
      if shared then table.insert(others, (o.name ~= '' and o.name or df.civzone_type[o.type]) .. '#' .. o.id) end
    end
  end
  return others
end
-- Room value per the wiki formula: floor 1/4/7 x material value (raw/smoothed/constructed),
-- wall 1/5/9 x material value, plus furniture item values. Engravings are not counted (estimate is low).
local function tile_matval(x, y, z)
  local v = 1
  pcall(function()
    local mi = dfhack.maps.getTileType(x, y, z) and dfhack.matinfo.decode(dfhack.maps.getTileMaterial and dfhack.maps.getTileMaterial(x, y, z) or nil)
    if mi and mi.material then v = math.max(1, mi.material.material_value) end
  end)
  return v
end
local function room_value(z)
  local v = 0
  for x = z.x1, z.x2 do
    for y = z.y1, z.y2 do
      if dfhack.buildings.containsTile(z, x, y) then
        local tt = dfhack.maps.getTileType(x, y, z.z)
        if tt then
          local a = df.tiletype.attrs[tt]
          local shape, mat, special = df.tiletype_shape[a.shape], df.tiletype_material[a.material], df.tiletype_special[a.special]
          local mv = tile_matval(x, y, z.z)
          if shape == 'FLOOR' then
            v = v + mv * (mat == 'CONSTRUCTION' and 7 or (special == 'SMOOTH' and 4 or 1))
          elseif shape == 'WALL' then
            v = v + mv * (mat == 'CONSTRUCTION' and 9 or (special == 'SMOOTH' and 5 or 1))
          end
        end
      end
    end
  end
  for _, b in ipairs(df.global.world.buildings.all) do
    if b.z == z.z and not df.building_civzonest:is_instance(b) and not df.building_stockpilest:is_instance(b)
       and in_zone(z, b.centerx, b.centery) then
      for _, ci in ipairs(b.contained_items) do
        if ci.use_mode == df.building_item_role_type.PERM then v = v + dfhack.items.getValue(ci.item) end
      end
    end
  end
  return v
end
local function rank_index(v)
  local r = 1
  for i, t in ipairs(RANKS) do if v >= t then r = i end end
  return r
end
local function rank_of(desc, list)
  for i, n in ipairs(list) do if desc and desc:find(n, 1, true) then return i end end
end
local function location_of(z)
  if z.location_id < 0 then return nil end
  for _, b in ipairs(site.buildings) do if b.id == z.location_id then return b end end
end
local function staff(loc)
  local s = {}
  for _, o in ipairs(loc.occupations) do
    if o.unit_id >= 0 then local t = df.occupation_type[o.type] s[t] = (s[t] or 0) + 1 end
  end
  return s
end

local report = {}
for _, z in ipairs(zones) do
  local t = df.civzone_type[z.type]
  local c = contents(z)
  local ok, missing, warn = {}, {}, {}
  local function need(cond, good, bad) if cond then table.insert(ok, good) else table.insert(missing, bad) end end
  local owner = z.assigned_unit_id >= 0 and df.unit.find(z.assigned_unit_id)
  local value = room_value(z)
  local names = (t == 'Bedroom' and BED) or (t == 'DiningHall' and DINE) or (t == 'Office' and OFFICE) or (t == 'Tomb' and TOMB)
  local desc = names and (names[rank_index(value)] .. ' (value ~' .. value .. ')') or ('value ~' .. value)
  if #overlaps(z) > 0 and not location_of(z) and names then desc = names[1] .. ' (overlapped: counts as 0)' end
  local loc = location_of(z)
  local ov = overlaps(z)
  if #ov > 0 and not loc then table.insert(warn, 'overlaps ' .. table.concat(ov, ', ') .. ': overlapping zones are valued at 0') end
  if z.spec_sub_flag and z.spec_sub_flag.active == false then table.insert(warn, 'zone is inactive') end

  if t == 'Bedroom' then
    need((c.Bed or 0) > 0, 'bed', 'a bed')
    need(owner, 'owner: ' .. (owner and unit_name(owner) or ''), 'an owner (df_rooms assign)')
    if (c.Cabinet or 0) == 0 then table.insert(warn, 'no cabinet: clothes get scattered') end
    if (c.Box or 0) == 0 then table.insert(warn, 'no chest for belongings') end
  elseif t == 'Dormitory' then
    need((c.Bed or 0) > 0, (c.Bed or 0) .. ' beds', 'beds')
    table.insert(warn, 'dorm sleepers get an "embarrassed, no proper room" thought; bedrooms are better')
  elseif t == 'DiningHall' then
    need((c.Table or 0) > 0, (c.Table or 0) .. ' tables', 'a table')
    if (c.Chair or 0) < (c.Table or 0) then table.insert(warn, 'fewer chairs than tables') end
  elseif t == 'Office' then
    need((c.Chair or 0) > 0, 'chair', 'a chair (required)')
    need(owner, 'owner: ' .. (owner and unit_name(owner) or ''), 'an owner')
    if (c.Table or 0) == 0 then table.insert(warn, 'no table next to the chair: bad thought if they eat there') end
  elseif t == 'Tomb' then
    need((c.Coffin or 0) > 0 or (c.Slab or 0) > 0, 'coffin/slab', 'a coffin or memorial slab')
  elseif t == 'Dungeon' then
    need((c.Cage or 0) > 0 or (c.Chain or 0) > 0, 'cage/chain', 'a metal cage or a rope/chain')
  elseif t == 'ArcheryRange' then
    need((c.ArcheryTarget or 0) > 0, 'archery target', 'an archery target (1-tile walkable perimeter, not adjacent)')
  elseif t == 'Pen' then
    need(#z.assigned_units > 0, #z.assigned_units .. ' animals assigned', 'assigned animals (df_animals pasture)')
  elseif t == 'Barracks' then
    local used = false
    for _, id in ipairs(df.global.plotinfo.main.fortress_entity.squads) do
      local sq = df.squad.find(id)
      for _, r in ipairs(sq and sq.rooms or {}) do if r.building_id == z.id then used = true end end
    end
    need(used, 'assigned to a squad', 'a squad (df_military barracks)')
  end

  if loc then
    local lt = df.abstract_building_type[loc:getType()]
    local ci = loc.contents
    local st = staff(loc)
    local floor = dance_floor(z)
    if lt == 'INN_TAVERN' then
      need((c.Box or 0) > 0, 'chest for mugs', 'a chest (mugs must be in a chest, not a bin)')
      need(ci.count_goblets >= ci.desired_goblets, ('goblets %d/%d'):format(ci.count_goblets, ci.desired_goblets), ('goblets %d/%d'):format(ci.count_goblets, ci.desired_goblets))
      local drinkpile = false
      for _, s in ipairs(piles_in(z)) do if s.settings.flags.food then drinkpile = true end end
      need(drinkpile, 'drink stockpile', 'a drink stockpile in the tavern')
      need((st.TAVERN_KEEPER or 0) > 0, 'tavern keeper', 'a tavern keeper (df_location)')
      need((c.Table or 0) > 0 and (c.Chair or 0) > 0, 'tables and chairs', 'tables and chairs')
      need(ci.count_instruments >= ci.desired_instruments, ('instruments %d/%d'):format(ci.count_instruments, ci.desired_instruments), ('instruments %d/%d'):format(ci.count_instruments, ci.desired_instruments))
      need(floor >= 5, ('dance floor %dx%d'):format(floor, floor), ('a 5x5 open dance floor (largest now %dx%d)'):format(floor, floor))
      if (st.PERFORMER or 0) == 0 then table.insert(warn, 'no performer assigned') end
      table.insert(warn, 'serving drink risks drunken brawls: keep the hospital staffed')
    elseif lt == 'TEMPLE' then
      local v = ci.location_value
      table.insert(ok, ('value %d: %s'):format(v, v >= 10000 and 'temple complex' or v >= 2000 and 'temple' or 'shrine (temple needs 2000)'))
      need(floor >= 5, ('dance floor %dx%d'):format(floor, floor), ('a 5x5 (25-tile) open dance floor (largest now %dx%d)'):format(floor, floor))
      need((c.Box or 0) > 0, 'chest for instruments', 'a chest for instruments')
      need(ci.count_instruments > 0, 'instruments ' .. ci.count_instruments, 'instruments (optional, improves worship)')
    elseif lt == 'HOSPITAL' then
      need((c.Bed or 0) > 0, (c.Bed or 0) .. ' beds', 'beds')
      need((c.Table or 0) > 0, 'surgery table', 'a table for surgery')
      need((c.TractionBench or 0) > 0, 'traction bench', 'a traction bench (mechanic: table + mechanism + rope/chain)')
      need((c.Box or 0) > 0, 'supply chest', 'chests for supplies')
      need((st.DOCTOR or 0) + (st.DIAGNOSTICIAN or 0) > 0, 'doctor/diagnostician', 'a doctor or diagnostician (df_location)')
      for _, k in ipairs({'thread', 'cloth', 'splints', 'crutches', 'powder', 'buckets', 'soap'}) do
        local have, want = ci['count_' .. k], ci['desired_' .. k]
        if want and want > 0 and have < want then table.insert(missing, ('%s %d/%d'):format(k, have, want)) end
      end
    elseif lt == 'LIBRARY' then
      need((c.Bookcase or 0) > 0, 'bookcase', 'bookcases')
      need((c.Box or 0) > 0, 'chest for writing materials', 'a chest for writing materials')
      need((c.Table or 0) > 0 and (c.Chair or 0) > 0, 'desk (table + chair)', 'tables and chairs to write at')
      need((st.SCHOLAR or 0) > 0, 'scholar', 'scholars (df_location)')
      need(ci.count_paper > 0, 'writing materials ' .. ci.count_paper, 'blank scrolls/quires')
    end
  end

  table.insert(report, {id = z.id, type = t, name = z.name ~= '' and dfhack.df2utf(z.name) or nil,
    location = loc and df.abstract_building_type[loc:getType()] or nil, at = ('%d,%d,%d'):format(z.x1, z.y1, z.z),
    tiles = tiles(z), quality = desc and dfhack.df2utf(desc) or nil, furniture = c,
    ok = ok, missing = missing, warnings = warn})
end

-- noble room demands
local nobles = {}
local ent = df.global.plotinfo.main.fortress_entity
for _, a in ipairs(ent.positions.assignments) do
  local pos
  for _, p in ipairs(ent.positions.own) do if p.id == a.position_id then pos = p end end
  local req = pos and NOBLE[pos.code]
  if req and a.histfig >= 0 then
    local hf = df.historical_figure.find(a.histfig)
    local u = hf and df.unit.find(hf.unit_id)
    local have = {}
    for _, z in ipairs(zones) do
      if u and z.assigned_unit_id == u.id then
        local r = (#overlaps(z) > 0) and 1 or rank_index(room_value(z))
        local kind = df.civzone_type[z.type]
        if kind == 'Bedroom' then have.bed = r
        elseif kind == 'DiningHall' then have.dine = r
        elseif kind == 'Office' then have.office = r
        elseif kind == 'Tomb' then have.tomb = r end
      end
    end
    local issues = {}
    local function chk(k, list)
      if req[k] and (have[k] or 0) < req[k] then
        table.insert(issues, ('needs %s (has %s)'):format(list[req[k]], have[k] and list[have[k]] or 'none'))
      end
    end
    chk('bed', BED) chk('dine', DINE) chk('office', OFFICE) chk('tomb', TOMB)
    for _, k in ipairs({'chests', 'cabinets', 'racks', 'stands'}) do
      if req[k] then table.insert(issues, ('wants %d %s in their rooms'):format(req[k], k)) end
    end
    table.insert(nobles, {position = pos.code, holder = u and unit_name(u) or '?', satisfied = #issues == 0, issues = issues})
  end
end

emit({zones = report, nobles = nobles,
  rules = 'Overlapping zones are valued at 0 (locations keep their value). Quality ranks: Meager 0, Modest 100, (plain) 250, Decent 500, Fine 1000, Great 1500, Grand 2500, Royal 10000.'})
