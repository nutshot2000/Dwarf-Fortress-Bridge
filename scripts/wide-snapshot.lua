-- Dev helper: flatten plotinfo and the fort entity (scalars, plus sizes of vectors) for diffing.
local seen = {}
local out = {}
local function walk(v, path, depth)
  if depth > 4 or #path > 200 then return end
  local t = type(v)
  if t ~= 'userdata' then out[path] = tostring(v) return end
  local ok, addr = pcall(function() return tostring(v):match('0x%x+') end)
  if ok and addr then
    if seen[addr] then return end
    seen[addr] = true
  end
  local okn, n = pcall(function() return #v end)
  if okn and type(n) == 'number' then
    out[path .. '#'] = tostring(n)
    if n > 64 then return end
  end
  pcall(function()
    for k, x in pairs(v) do walk(x, path .. '.' .. tostring(k), depth + 1) end
  end)
end
walk(df.global.plotinfo, 'plotinfo', 0)
walk(df.historical_entity.find(df.global.plotinfo.group_id), 'ent', 0)
local u = df.unit.find(ARGS.unit_id)
walk(u.flags1, 'unit.flags1', 0) walk(u.flags2, 'unit.flags2', 0) walk(u.flags3, 'unit.flags3', 0)
walk(u.flags4, 'unit.flags4', 0)
out['unit.profession'] = tostring(u.profession)
emit(out)
