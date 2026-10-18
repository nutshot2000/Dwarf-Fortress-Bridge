if not need_map() then return end
local bad={}
local function wall(x,y,z)
  local f=dfhack.maps.getTileFlags(x,y,z)
  if not f or f.hidden then return false end
  local a=df.tiletype.attrs[dfhack.maps.getTileType(x,y,z)]
  if a.shape==df.tiletype_shape.WALL then return true end
  local b=dfhack.buildings.findAtTile(x,y,z)
  return b and b:getType()==df.building_type.Door and b:getBuildStage()>=b:getMaxBuildStage()
end
for _,r in ipairs(ARGS.rooms) do
  local failures={}
  local w,h=r.w or 3,r.h or 3
  for x=r.x,r.x+w-1 do for y=r.y,r.y+h-1 do
    local f=dfhack.maps.getTileFlags(x,y,ARGS.z)
    if not f or f.hidden then failures[#failures+1]={x=x,y=y,reason='interior not excavated/visible'}
    else
      local a=df.tiletype.attrs[dfhack.maps.getTileType(x,y,ARGS.z)]
      if a.shape~=df.tiletype_shape.FLOOR or f.flow_size>0 then failures[#failures+1]={x=x,y=y,reason='interior must be dry floor'} end
    end
  end end
  for x=r.x-1,r.x+w do for y=r.y-1,r.y+h do
    if (x==r.x-1 or x==r.x+w or y==r.y-1 or y==r.y+h)
      and not (ARGS.allow_open_doorway and x==(r.door_x or r.x+w//2) and y==r.door_y) and not wall(x,y,ARGS.z) then
      failures[#failures+1]={x=x,y=y,reason='missing or unverified enclosing wall'}
    end
  end end
  if #failures>0 then bad[#bad+1]={room=r,failures=failures} end
end
emit({ok=#bad==0,invalid_rooms=bad,guidance='Finish dry-floor excavation and enclosing walls. Furnishing allows only the planned entrance to remain open for door placement; zoning requires completed doors too. Use df_room_plan repair, wait and verify enclosed=true.'})
