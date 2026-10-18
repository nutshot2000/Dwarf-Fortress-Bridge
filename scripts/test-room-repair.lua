-- Synthetic room lifecycle: no changes to the running fortress.
local args,report=...
local state='complete'
local plan={id='10,10,1',x=10,y=10,z=1,w=3,h=3,door_x=11,door_y=13}
local zone={id=77,x1=10,x2=12,y1=10,y2=12,z=1,type=df.civzone_type.Bedroom}
local function building(kind,built)
  return {id=88,type=df.construction_type.Wall,getType=function() return kind end,
    getBuildStage=function() return built and 1 or 0 end,getMaxBuildStage=function() return 1 end}
end
local fakeDF=setmetatable({global={world={buildings={other={ANY_ZONE={zone}}}}}}, {__index=df})
local fakeHack=setmetatable({
  persistent={getSiteData=function() return {saved=plan} end},
  buildings={containsTile=function() return true end,findAtTile=function(x,y)
    if x==11 and y==13 and state~='missing-door' then return building(df.building_type.Door,state~='pending-door') end
    if x==9 and y==10 and state=='pending-wall' then return building(df.building_type.Construction,false) end
  end},
  maps={getTileFlags=function() return {hidden=false,flow_size=0,dig=df.tile_dig_designation.No} end,
    getTileType=function(x,y)
      if x==10 and y==10 and state=='stairs' then return df.tiletype.StoneStairUD end
      if (x>=10 and x<=12 and y>=10 and y<=12) or (x==11 and y==13)
        or (x==9 and y==10 and (state=='pending-wall' or state=='missing-wall')) then return df.tiletype.StoneFloor1 end
      return df.tiletype.StoneWall
    end}}, {__index=dfhack})
local function audit(s)
  state=s
  local result
  local env=setmetatable({ARGS={detail=true},df=fakeDF,dfhack=fakeHack,need_map=function() return true end,emit=function(v) result=v end},{__index=_ENV})
  assert(loadfile(args.root..'/lua/room_plan.lua','t',env))()
  assert(result.room_count==1,'saved plan and zone must deduplicate')
  return result.rooms[1]
end
assert(audit('complete').enclosed,'complete room must be enclosed')
assert(not audit('missing-door').enclosed,'missing door must fail enclosure')
assert(not audit('pending-door').enclosed,'pending door is not finished enclosure')
local p=audit('pending-wall')
assert(not p.enclosed and p.pending_wall_count==1 and p.missing_wall_count==0,'pending walls must be reported separately')
assert(not audit('missing-wall').enclosed,'open wall must fail enclosure')
assert(#audit('stairs').invalid_interior==1,'stair shaft must be unsuitable room interior')
report({passed=12,map_mutated=false})
