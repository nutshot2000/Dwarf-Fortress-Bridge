-- Remember dig designations placed on hidden tiles, and put back the ones the game drops when digging reveals
-- them "damp" (soil or rock next to an aquifer or standing water). DF cancels such a designation once, silently;
-- designating the same tile again confirms it. A bedroom wing over a light aquifer lost the next two tiles
-- each time its corridor advanced, so it never got dug.
-- ARGS.action: record (x1,y1,x2,y2,z1,z2: remember the designated hidden tiles there), forget (same rect),
-- reconfirm (re-designate remembered tiles that are now revealed, still wall and undesignated).
if not need_map() then return end
local KEY = 'df-bridge/dig-memory'
local mem = dfhack.persistent.getSiteData(KEY, {}) or {}
local action = ARGS.action or 'reconfirm'

local function rect(fn)
  local z1, z2 = math.min(ARGS.z1, ARGS.z2 or ARGS.z1), math.max(ARGS.z1, ARGS.z2 or ARGS.z1)
  for z = z1, z2 do for x = ARGS.x1, ARGS.x2 do for y = ARGS.y1, ARGS.y2 do fn(x, y, z, x .. ',' .. y .. ',' .. z) end end end
end

if action == 'record' then
  local n = 0
  rect(function(x, y, z, k)
    local f = dfhack.maps.getTileFlags(x, y, z)
    if f and f.hidden and f.dig ~= 0 then mem[k] = f.dig n = n + 1 end
  end)
  dfhack.persistent.saveSiteData(KEY, mem)
  emit({recorded = n}) return
end

if action == 'forget' then
  local n = 0
  rect(function(_, _, _, k) if mem[k] then mem[k] = nil n = n + 1 end end)
  dfhack.persistent.saveSiteData(KEY, mem)
  emit({forgotten = n}) return
end

-- reconfirm
local claimed = {}
for _, j in require('utils').listpairs(df.global.world.jobs.list) do
  claimed[j.pos.x .. ',' .. j.pos.y .. ',' .. j.pos.z] = true
end
local S = df.tiletype_shape
local redone, at, left = 0, {}, 0
for k, code in pairs(mem) do
  local x, y, z = k:match('^(-?%d+),(-?%d+),(-?%d+)$')
  x, y, z = tonumber(x), tonumber(y), tonumber(z)
  local f = x and dfhack.maps.getTileFlags(x, y, z)
  local tt = f and dfhack.maps.getTileType(x, y, z)
  local wall = tt and df.tiletype.attrs[tt].shape == S.WALL
  if not wall then
    mem[k] = nil -- dug (or gone): done
  elseif f.dig ~= 0 or claimed[k] then
    left = left + 1 -- still waiting for a miner
  elseif not f.hidden then
    f.dig = code
    dfhack.maps.getTileBlock(x, y, z).flags.designated = true
    mem[k] = nil -- a second designation sticks
    redone = redone + 1
    if #at < 6 then at[#at + 1] = k end
  else
    mem[k] = nil -- hidden and undesignated: someone removed it on purpose
  end
end
dfhack.persistent.saveSiteData(KEY, mem)
emit({redesignated = redone, at = at, remembered = left})
