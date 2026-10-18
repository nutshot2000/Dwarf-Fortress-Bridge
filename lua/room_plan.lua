if not need_map() then return end
local key='df-bridge/room-plans'
local plans=dfhack.persistent.getSiteData(key,{})
local action=ARGS.action or 'status'
if action=='protect' then
  if ARGS.z==nil or not ARGS.rooms or #ARGS.rooms==0 then emit({error='protect requires z and rooms'}) return end
  for _,r in ipairs(ARGS.rooms) do
    local w,h=r.w or 3,r.h or 3
    local dx,dy=r.door_x or r.x+w//2,r.door_y
    if not dy or not (((dy==r.y-1 or dy==r.y+h) and dx>=r.x and dx<r.x+w)
      or ((dx==r.x-1 or dx==r.x+w) and dy>=r.y and dy<r.y+h)) then
      emit({error='Doorway must be on one edge of its room perimeter, not inside the room or on a corner.',room=r}) return
    end
    local id=('%d,%d,%d'):format(r.x,r.y,ARGS.z)
    plans[id]={id=id,x=r.x,y=r.y,z=ARGS.z,w=w,h=h,door_x=dx,door_y=dy}
  end
  dfhack.persistent.saveSiteData(key,plans)
elseif action=='forget' then
  if not ARGS.id or not plans[ARGS.id] then emit({error='Specify an existing protected plan id'}) return end
  plans[ARGS.id]=nil dfhack.persistent.saveSiteData(key,plans)
end
local layouts={}
for _,r in pairs(plans) do layouts[#layouts+1]=r end
-- Existing bedroom zones are protected even when another model created them.
for _,b in ipairs(df.global.world.buildings.other.ANY_ZONE) do
  if b.type==df.civzone_type.Bedroom then
    local x1,y1,x2,y2=30000,30000,-1,-1
    for x=b.x1,b.x2 do for y=b.y1,b.y2 do
      if dfhack.buildings.containsTile(b,x,y) then
        local f=dfhack.maps.getTileFlags(x,y,b.z)
        if f and not f.hidden then
          local a=df.tiletype.attrs[dfhack.maps.getTileType(x,y,b.z)]
          local at=dfhack.buildings.findAtTile(x,y,b.z)
          if a.shape==df.tiletype_shape.FLOOR and not (at and at:getType()==df.building_type.Door) then
            x1=math.min(x1,x) y1=math.min(y1,y) x2=math.max(x2,x) y2=math.max(y2,y)
          end
        end
      end
    end end
    if x2>=x1 then layouts[#layouts+1]={id='zone-'..b.id,x=x1,y=y1,z=b.z,w=x2-x1+1,h=y2-y1+1,zone=b.id} end
  end
end
local protected,status={},{}
for _,r in ipairs(layouts) do
  local missing,unsafe,unknown={},{},0
  for x=r.x,r.x+r.w-1 do for y=r.y,r.y+r.h-1 do
    local f=dfhack.maps.getTileFlags(x,y,r.z)
    if f and not f.hidden and df.tiletype.attrs[dfhack.maps.getTileType(x,y,r.z)].shape==df.tiletype_shape.FLOOR then
      protected[r.z..','..x..','..y]={x=x,y=y,z=r.z,room=r.id,reason='existing room floor'}
    end
  end end
  for x=r.x-1,r.x+r.w do for y=r.y-1,r.y+r.h do
    if (x==r.x-1 or x==r.x+r.w or y==r.y-1 or y==r.y+r.h)
      and not (x==r.door_x and y==r.door_y) then
      local f=dfhack.maps.getTileFlags(x,y,r.z)
      local b=dfhack.buildings.findAtTile(x,y,r.z)
      local door=b and b:getType()==df.building_type.Door
      if not door then
        protected[r.z..','..x..','..y]={x=x,y=y,z=r.z,room=r.id}
        if f and not f.hidden then
          local a=df.tiletype.attrs[dfhack.maps.getTileType(x,y,r.z)]
          if a.shape~=df.tiletype_shape.WALL then missing[#missing+1]={x=x,y=y,z=r.z} end
          if f.dig~=df.tile_dig_designation.No then unsafe[#unsafe+1]={x=x,y=y,z=r.z,designation=df.tile_dig_designation[f.dig]} end
        else unknown=unknown+1 end
      end
    end
  end end
  status[#status+1]={id=r.id,zone=r.zone,x=r.x,y=r.y,z=r.z,w=r.w,h=r.h,
    missing_walls=missing,unsafe_designations=unsafe,unrevealed_boundary_tiles=unknown}
end
if ARGS.internal then return {protected=protected,rooms=status} end
local damaged=0
for _,r in ipairs(status) do
  r.missing_wall_count=#r.missing_walls r.unsafe_designation_count=#r.unsafe_designations
  if r.missing_wall_count>0 then damaged=damaged+1 end
  if not ARGS.detail then
    while #r.missing_walls>6 do table.remove(r.missing_walls) end
    while #r.unsafe_designations>6 do table.remove(r.unsafe_designations) end
  end
end
emit({room_count=#status,damaged_rooms=damaged,rooms=status,guidance='Protected room boundaries block destructive bridge dig orders. Missing walls require repair; they are not automatically rebuilt. Coordinate lists are samples unless detail=true. Doorways stay open. Use forget only for intentional remodelling; existing bedroom zones remain protected.'})
