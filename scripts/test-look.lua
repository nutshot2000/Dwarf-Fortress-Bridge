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
local result
local env = setmetatable({
  ARGS = {x = 3, y = 3, z = 0, radius = 3},
  need_map = function() return true end,
  emit = function(value) result = value end,
  df = setmetatable({global = {world = {buildings = {all = {}}, units = {active = {}}}}}, {__index = df}),
  dfhack = setmetatable({maps = {
    getTileSize = function() return 7, 7, 1 end,
    getTileType = function() return df.tiletype.StoneWall end,
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
report({passed = 7, map_mutated = false})
