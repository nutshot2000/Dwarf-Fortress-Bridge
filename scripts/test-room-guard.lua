-- Native Quickfort previews against unrevealed rock: no digging or revelation.
local args,report=...
local p
for _,b in ipairs(df.global.world.map.map_blocks) do
  local f=b.designation[4][4]
  if f.hidden and b.map_pos.x>0 and b.map_pos.y>0 then
    p={x=b.map_pos.x+4,y=b.map_pos.y+4,z=b.map_pos.z} break
  end
end
assert(p,'need an unrevealed map block for room guard preview')
local plans={test={id='test',x=p.x,y=p.y,z=p.z,w=3,h=3,door_x=p.x+1,door_y=p.y+3}}
local fake=setmetatable({persistent={getSiteData=function() return plans end}}, {__index=dfhack})
local function run(cells,x,y,allow)
  local result
  local env=setmetatable({ARGS={cells=cells,x=x,y=y,z=p.z,dry_run=true,
    allow_room_changes=allow,room_plan_path=args.root..'/lua/room_plan.lua'},
    dfhack=fake,need_map=function() return true end,emit=function(v) result=v end}, {__index=_ENV})
  assert(loadfile(args.root..'/lua/guarded_dig.lua','t',env))()
  return result
end
local before=dfhack.maps.getTileFlags(p.x-1,p.y,p.z).dig
local denied=run({{'d(2x1)'}},p.x-1,p.y)
assert(denied.error and #denied.conflicts>0,'a rectangle crossing the planned wall must fail')
assert(dfhack.maps.getTileFlags(p.x-1,p.y,p.z).dig==before,'rejected request must leave the wall unchanged')
local allowed=run({{'d(3x3)'}},p.x,p.y)
assert(not allowed.error and allowed.stats.dig_designated.value==9,'interior excavation must remain available')
local remodel=run({{'d'}},p.x-1,p.y,true)
assert(not remodel.error and remodel.intentional_room_changes==1,'explicit remodelling preview must work')
local erase=run({{'x'}},p.x-1,p.y)
assert(not erase.error,'clearing designations must not be blocked by wall protection')
assert(dfhack.maps.getTileFlags(p.x-1,p.y,p.z).dig==before,'previews must not mutate designations')
report({passed=6,map_mutated=false})
