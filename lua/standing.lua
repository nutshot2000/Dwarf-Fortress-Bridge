-- Standing orders (the Labor -> Standing orders screen). Names drop the standing_orders_ prefix.
local PREFIX = 'standing_orders_'
local function all()
  local t = {}
  for k, v in pairs(df.global) do
    k = tostring(k)
    if k:sub(1, #PREFIX) == PREFIX then t[k:sub(#PREFIX + 1)] = v end
  end
  return t
end
if not ARGS.name then emit({standing_orders = all(), hint = 'set with name=<key> value=<0/1> (auto_loom: 0 off, 1 dyed thread only, 2 all thread)'}) return end
local key = PREFIX .. ARGS.name:lower():gsub('^' .. PREFIX, '')
if all()[key:sub(#PREFIX + 1)] == nil then emit({error = 'No standing order ' .. ARGS.name}) return end
local v = ARGS.value
if type(v) == 'boolean' then v = v and 1 or 0 end
df.global[key] = v
emit({ok = true, [key:sub(#PREFIX + 1)] = df.global[key]})
