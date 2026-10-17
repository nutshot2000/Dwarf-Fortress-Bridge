if not need_map() then return end
local sx, sy, sz = dfhack.maps.getTileSize()
local z = ARGS.z or df.global.window_z
local r = math.min(math.max(ARGS.radius or 15, 3), 40)
-- default centre: middle of the player's current view
local cx = ARGS.x or (df.global.window_x + 40)
local cy = ARGS.y or (df.global.window_y + 25)
local x1, x2 = math.max(cx - r, 0), math.min(cx + r, sx - 1)
local y1, y2 = math.max(cy - r, 0), math.min(cy + r, sy - 1)

local SHAPE = df.tiletype_shape
local MAT = df.tiletype_material
local DIG = { Default = 'd', UpDownStair = 'i', Channel = 'h', Ramp = 'r', DownStair = 'j', UpStair = 'u' }
local GRASS = { GRASS_LIGHT = true, GRASS_DARK = true, GRASS_DRY = true, GRASS_DEAD = true }

local function tile_glyph(x, y)
  local tt = dfhack.maps.getTileType(x, y, z)
  if not tt then return ' ' end
  local fl = dfhack.maps.getTileFlags(x, y, z)
  -- Exposed aquifer tiles are a digging hazard even when designated. Never
  -- disclose aquifer information on hidden tiles.
  if not fl.hidden and fl.water_table and fl.flow_size == 0 then return 'A' end
  local dig = df.tile_dig_designation[fl.dig]
  if dig and DIG[dig] then return DIG[dig] end
  if fl.hidden then return '?' end
  if fl.flow_size > 0 then
    if fl.liquid_type then return '!' end
    return fl.flow_size >= 4 and '~' or tostring(fl.flow_size)
  end
  local a = df.tiletype.attrs[tt]
  local shape, mat = SHAPE[a.shape], MAT[a.material]
  if shape == 'WALL' then
    if mat == 'SOIL' then return '%' end
    if mat == 'MINERAL' then return '*' end
    if mat == 'CONSTRUCTION' then return '+' end
    if mat == 'TREE' then return 'T' end
    if mat == 'FROZEN_LIQUID' then return 'I' end
    return '#'
  elseif shape == 'FLOOR' or shape == 'PEBBLES' then
    if GRASS[mat] then return ',' end
    if mat == 'CONSTRUCTION' then return '=' end
    return '.'
  elseif shape == 'EMPTY' or shape == 'ENDLESS_PIT' then return ' '
  elseif shape == 'RAMP' then return '^'
  elseif shape == 'RAMP_TOP' then return 'v'
  elseif shape == 'STAIR_UP' then return '<'
  elseif shape == 'STAIR_DOWN' then return '>'
  elseif shape == 'STAIR_UPDOWN' then return 'X'
  elseif shape == 'FORTIFICATION' then return 'F'
  elseif shape == 'BOULDER' then return 'o'
  elseif shape == 'SAPLING' then return 't'
  elseif shape == 'SHRUB' then return '"'
  elseif shape == 'BROOK_BED' or shape == 'BROOK_TOP' then return '~'
  elseif shape == 'TRUNK_BRANCH' or shape == 'BRANCH' or shape == 'TWIG' then return 'T'
  end
  return '.'
end

local BGLYPH = {
  Workshop = 'W', Furnace = 'W', Stockpile = 'S', FarmPlot = 'P', Door = 'D', Hatch = 'D',
  Bed = 'B', Table = 'K', Chair = 'C', Box = 'C', Cabinet = 'C', TradeDepot = 'W', Well = 'L',
  Construction = 'c', Wagon = 'G',
}

-- buildings: collect from the building list (cheaper than per-tile lookups)
local grid_b, blist = {}, {}
for _, b in ipairs(df.global.world.buildings.all) do
  if b.z == z and b.x2 >= x1 and b.x1 <= x2 and b.y2 >= y1 and b.y1 <= y2 then
    local btype = df.building_type[b:getType()]
    if btype ~= 'Civzone' then
      local g = BGLYPH[btype] or 'f'
      if b:getBuildStage() < b:getMaxBuildStage() then g = 'c' end
      for bx = math.max(b.x1, x1), math.min(b.x2, x2) do
        for by = math.max(b.y1, y1), math.min(b.y2, y2) do
          local inside = not b.room.extents or dfhack.buildings.containsTile(b, bx, by)
          if inside then grid_b[by * 100000 + bx] = g end
        end
      end
      local sub = try(function()
        if btype == 'Workshop' then return df.workshop_type[b.type] end
        if btype == 'Furnace' then return df.furnace_type[b.type] end
      end)
      table.insert(blist, {id = b.id, type = sub and (btype .. ':' .. sub) or btype,
        name = b.name ~= '' and b.name or nil, x = b.x1, y = b.y1, x2 = b.x2, y2 = b.y2,
        built = b:getBuildStage() >= b:getMaxBuildStage()})
    end
  end
end

local grid_u, ulist = {}, {}
for _, u in ipairs(df.global.world.units.active) do
  local p = u.pos
  if p.z == z and p.x >= x1 and p.x <= x2 and p.y >= y1 and p.y <= y2
     and dfhack.units.isActive(u) and not dfhack.units.isDead(u) then
    local kind, g = 'other', 'a'
    if dfhack.units.isCitizen(u) then kind, g = 'citizen', '@'
    elseif try(function() return dfhack.units.isDanger(u) end, false) then kind, g = 'hostile', 'E' end
    grid_u[p.y * 100000 + p.x] = g
    table.insert(ulist, {id = u.id, name = unit_name(u), kind = kind, x = p.x, y = p.y,
      job = unit_job(u)})
  end
end

local rows, aquifer_tiles = {}, {}
for y = y1, y2 do
  local line = {}
  for x = x1, x2 do
    local k = y * 100000 + x
    local fl = dfhack.maps.getTileFlags(x, y, z)
    if fl and not fl.hidden and fl.water_table then
      aquifer_tiles[#aquifer_tiles + 1] = {x = x, y = y}
    end
    line[#line + 1] = grid_u[k] or grid_b[k] or tile_glyph(x, y)
  end
  rows[#rows + 1] = table.concat(line)
end

emit({
  z = z, x1 = x1, y1 = y1, x2 = x2, y2 = y2, map_size = {x = sx, y = sy, z = sz},
  rows = rows, units = ulist, buildings = blist, aquifer_tiles = aquifer_tiles,
})
