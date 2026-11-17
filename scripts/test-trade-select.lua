-- df_trade select / deselect with an out-of-range index: an error, and no row marked (1.5.16 regression: the earlier
-- rows of the same call were marked before the bad index raised). Synthetic trade screen: nothing in the game changes.
local args,report=...
-- A DF vector: 0-based, and reading past the end raises instead of returning nil.
local function vec(items)
  local v={}
  for i,x in ipairs(items) do v[i-1]=x end
  return setmetatable(v,{__len=function() return #items end,
    __index=function(_,k) error('index out of bounds: '..tostring(k)) end})
end
local function dfipairs(t)
  if getmetatable(t) and getmetatable(t).__len then
    return function(v,i) i=i+1 if i<#v then return i,v[i] end end,t,-1
  end
  return ipairs(t)
end
local function screen()
  -- fort side: a bin (row 1) with its contents (rows 2-3), then a barrel (row 4)
  local flags={[0]={},[1]={}}
  local rows={{},{},{contained=true},{contained=true},{}}
  for i,r in ipairs(rows) do r.selected=false rows[i]=r end
  flags[1]=vec(rows)
  flags[0]=vec({{selected=false}})
  local goods={[0]=vec({{id=1}}),[1]=vec({{id=10},{id=11},{id=12},{id=13},{id=14}})}
  return {open=true,goodflag=flags,good=goods,mer=nil}
end
local function run(T,a)
  local result
  local fakeDF=setmetatable({global={game={main_interface={trade=T}}}},{__index=df})
  local fakeHack=setmetatable({items={getValue=function() return 10 end,getContainedItems=function() return {} end}},
    {__index=dfhack})
  local env=setmetatable({ARGS=a,df=fakeDF,dfhack=fakeHack,ipairs=dfipairs,need_map=function() return true end,
    emit=function(v) result=v end},{__index=_ENV})
  assert(loadfile(args.root..'/lua/trade.lua','t',env))()
  return result
end
local function marked(T)
  local n=0
  for s=0,1 do for i=0,#T.goodflag[s]-1 do if T.goodflag[s][i].selected then n=n+1 end end end
  return n
end

local T=screen()
local r=run(T,{action='select',side='fort',indices={0,4,5}})
assert(r.error and r.error:find('index 5'),'an out-of-range index must be refused, got '..tostring(r.error))
assert(marked(T)==0,'nothing may be marked when one index is bad')
r=run(T,{action='select',side='fort',indices={-1}})
assert(r.error and marked(T)==0,'a negative index must be refused')
r=run(T,{action='select',side='merchant',indices={1}})
assert(r.error and marked(T)==0,'the merchant side has one row: index 1 is out of range')
r=run(T,{action='select',side='fort',indices={1,4}})
assert(r.ok and r.changed==2,'valid indices must be selected')
assert(marked(T)==4,'a container row also marks its contained rows (1, 2, 3 and 4)')
r=run(T,{action='deselect',side='fort',indices={1,9}})
assert(r.error and marked(T)==4,'a bad deselect changes nothing either')
report({passed=6,map_mutated=false})
