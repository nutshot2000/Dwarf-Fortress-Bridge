-- df_noble repair twice in a row: the responsibility index must not grow (1.5.16 regression: `#` on a DFHack enum
-- is 0, so only index 0 was cleared and every repair appended the manager, broker... once more).
-- Synthetic fortress entity: no changes to the running fortress.
local args,report=...
local R=df.entity_position_responsibility
-- A DF vector: resize/insert('#', v) and a length, nothing else.
local function vec()
  return setmetatable({n=0},{__len=function(v) return v.n end,__index={
    resize=function(v,n) for i=n,v.n-1 do v[i]=nil end v.n=n end,
    insert=function(v,_,x) v[v.n]=x v.n=v.n+1 end}})
end
local abt={}
for r=math.max(R._first_item,0),R._last_item do abt[r]=vec() end
local manager={id=1,code='MANAGER',responsibilities={MANAGE_PRODUCTION=true}}
local broker={id=2,code='BROKER',responsibilities={TRADE=true,ESTABLISH_COLONY_TRADE_AGREEMENTS=true}}
local vacant={id=3,code='BOOKKEEPER',responsibilities={ACCOUNTING=true}}
local ent={id=99,positions={own={manager,broker,vacant},
  assignments={{id=6,position_id=1,histfig=8043},{id=7,position_id=2,histfig=8044},{id=8,position_id=3,histfig=-1}}},
  assignments_by_type=abt}
local fakeDF=setmetatable({
  global={plotinfo={group_id=99,main={fortress_entity=ent}}},
  historical_entity={find=function(id) return id==99 and ent or nil end}},{__index=df})
local function repair()
  local result
  local env=setmetatable({ARGS={action='repair'},df=fakeDF,need_map=function() return true end,
    emit=function(v) result=v end},{__index=_ENV})
  assert(loadfile(args.root..'/lua/noble.lua','t',env))()
  assert(result and result.ok,'repair must succeed')
  local sizes={}
  for r=math.max(R._first_item,0),R._last_item do sizes[r]=#abt[r] end
  return sizes,result.indexed_responsibilities
end
-- a stale index left by an older bridge: the manager listed 4 times
for _=1,4 do abt[R.MANAGE_PRODUCTION]:insert('#',ent.positions.assignments[1]) end
local first,n1=repair()
local second,n2=repair()
assert(n1==3 and n2==3,'three responsibilities held by two filled posts, got '..tostring(n1)..' then '..tostring(n2))
assert(first[R.MANAGE_PRODUCTION]==1,'stale duplicates must be cleared, got '..first[R.MANAGE_PRODUCTION])
assert(first[R.ACCOUNTING]==0,'a vacant post must not be indexed')
for r,size in pairs(first) do
  assert(second[r]==size,('responsibility %s grew from %d to %d on the second repair'):format(R[r],size,second[r]))
end
report({passed=4,map_mutated=false})
