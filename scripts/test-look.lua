-- Run through df_lua with args.look_path pointing to lua/look.lua.
-- A synthetic map checks visibility without reading any hidden game terrain.
local args, report = ...
local flags = {}
local function tile(x, y)
  return flags[y * 7 + x] or {hidden = false, water_table = false, dig = 0, flow_size = 0}
end
flags[8] = {hidden = false, water_table = true, dig = 0, flow_size = 0}
flags[9] = {hidden = true, water_table = true, dig = 0, flow_size = 0}
flags[10] = {hidden = true, water_table = true, dig = df.tile_dig_designation.UpDownStair, flow_size = 0}
flags[11] = {hidden = false, water_table = true, dig = df.tile_dig_designation.Default, flow_size = 0}
flags[12] = {hidden = false, water_table = true, dig = 0, flow_size = 2, liquid_type = false}
flags[16] = {hidden = true, water_table = false, dig = 0, flow_size = 0}
flags[17] = {hidden = false, water_table = false, dig = 0, flow_size = 7, liquid_type = false}
local pile = {id=1,name='Wet test pile',x1=3,x2=3,y1=2,y2=2,z=0,room={},
  getType=function() return df.building_type.Stockpile end,
  getBuildStage=function() return 1 end, getMaxBuildStage=function() return 1 end}
local result
local env = setmetatable({
  ARGS = {x = 3, y = 3, z = 0, radius = 3},
  need_map = function() return true end,
  try = function(fn, default) local ok,v = pcall(fn) if ok then return v end return default end,
  emit = function(value) result = value end,
  df = setmetatable({global = {world = {buildings = {all = {pile}}, units = {active = {}}}}}, {__index = df}),
  dfhack = setmetatable({maps = {
    getTileSize = function() return 7, 7, 1 end,
    getTileType = function(x,y) return y == 2 and (x == 1 or x == 2) and df.tiletype.FrozenWall or df.tiletype.StoneWall end,
    getTileFlags = tile,
  }}, {__index = dfhack}),
}, {__index = _ENV})
assert(loadfile(assert(args.look_path, 'args.look_path is required'), 't', env))()
assert(result.rows[2]:sub(2, 2) == 'A', 'exposed aquifer must be marked')
assert(result.rows[2]:sub(3, 3) == '?', 'hidden aquifer must remain hidden')
assert(result.rows[2]:sub(4, 4) == 'i', 'hidden designation must not disclose aquifer')
assert(result.rows[2]:sub(5, 5) == 'A', 'known hazard must take priority over dig designation')
assert(result.rows[2]:sub(6, 6) == '2', 'aquifer marker must not hide liquid depth')
assert(#result.aquifer_tiles == 3, 'warning must exclude hidden aquifers')
assert(result.aquifer_tiles[1].x == 1 and result.aquifer_tiles[2].x == 4 and result.aquifer_tiles[3].x == 5,
  'warning coordinates must match exposed tiles')
assert(#result.ice_tiles == 1 and result.ice_tiles[1].x == 1, 'only exposed ice may be reported')
assert(result.rows[3]:sub(2,2) == 'I' and result.rows[3]:sub(3,3) == '?', 'hidden ice must remain hidden')
assert(result.rows[3]:sub(4,4) == '~', 'stockpile must not obscure water')
assert(#result.flooded_buildings == 1 and result.flooded_buildings[1].depth == 7, 'flooded pile warning missing')
report({passed = 11, map_mutated = false})
