-- Walking distances between named points: a breadth-first search over walkable tiles the way dwarves move
-- (8 directions on a level, stairs up/down, ramps), from each point to every other. Shows how far apart
-- the places dwarves shuttle between really are, and which are unreachable.
-- ARGS.points: {{name=, x=, y=, z=}, ...}; ARGS.max_steps caps each search (default 600).
if not need_map() then return end
local S = df.tiletype_shape
local pts = ARGS.points or {}
if #pts < 2 then emit({error = 'points needs at least two {name, x, y, z}'}) return end
local MAX = ARGS.max_steps or 600

local function shape(x, y, z)
  local tt = dfhack.maps.getTileType(x, y, z)
  if not tt then return nil end
  local s = df.tiletype.attrs[tt].shape
  if s == S.WALL or s == S.EMPTY or s == S.NONE or s == S.BRANCH or s == S.TRUNK_BRANCH or s == S.TWIG then return nil end
  local f = dfhack.maps.getTileFlags(x, y, z)
  if f.hidden or f.flow_size > 3 then return nil end
  return s
end
local function key(x, y, z) return (z * 1000 + y) * 1000 + x end

local function search(p)
  local dist = {[key(p.x, p.y, p.z)] = 0}
  local q, h = {{p.x, p.y, p.z}}, 1
  local function push(x, y, z, d)
    local k = key(x, y, z)
    if not dist[k] then dist[k] = d q[#q + 1] = {x, y, z} end
  end
  while h <= #q do
    local x, y, z = q[h][1], q[h][2], q[h][3]
    h = h + 1
    local d = dist[key(x, y, z)]
    local s = shape(x, y, z)
    if s and d < MAX then
      for dx = -1, 1 do for dy = -1, 1 do
        if (dx ~= 0 or dy ~= 0) and shape(x + dx, y + dy, z) then push(x + dx, y + dy, z, d + 1) end
      end end
      if s == S.STAIR_UP or s == S.STAIR_UPDOWN then
        local s2 = shape(x, y, z + 1)
        if s2 == S.STAIR_DOWN or s2 == S.STAIR_UPDOWN then push(x, y, z + 1, d + 1) end
      end
      if s == S.STAIR_DOWN or s == S.STAIR_UPDOWN then
        local s2 = shape(x, y, z - 1)
        if s2 == S.STAIR_UP or s2 == S.STAIR_UPDOWN then push(x, y, z - 1, d + 1) end
      end
      -- a ramp leads up to the neighbouring tiles one level higher; the tiles beside a ramp below lead down
      for dx = -1, 1 do for dy = -1, 1 do
        if s == S.RAMP and shape(x + dx, y + dy, z + 1) then push(x + dx, y + dy, z + 1, d + 1) end
        if shape(x + dx, y + dy, z - 1) == S.RAMP then push(x + dx, y + dy, z - 1, d + 1) end
      end end
    end
  end
  return dist
end

local out, worst = {}, nil
for i, a in ipairs(pts) do
  local dist = search(a)
  local row = {}
  for j, b in ipairs(pts) do
    if j > i then
      local d = dist[key(b.x, b.y, b.z)]
      row[b.name] = d or ('unreachable within ' .. MAX)
      if d and (not worst or d > worst.steps) then worst = {from = a.name, to = b.name, steps = d} end
    end
  end
  out[a.name] = row
end
emit({distances = out, longest = worst,
  note = 'Steps are tiles walked (a diagonal step or a stair counts as one). Compare a route before and after a change.'})
