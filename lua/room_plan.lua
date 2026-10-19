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
  -- One plan by id, a list of ids, or every saved plan on level z (bedroom zones stay protected regardless).
  local n=0
  for _,id in ipairs(ARGS.ids or {ARGS.id}) do if plans[id] then plans[id]=nil n=n+1 end end
  if ARGS.z~=nil and not ARGS.id and not ARGS.ids then
    for id,p in pairs(plans) do if p.z==ARGS.z then plans[id]=nil n=n+1 end end
  end
  if n==0 then emit({error='No saved plan matched. Pass id (from status), ids, or z to forget every saved plan on a level.'}) return end
  dfhack.persistent.saveSiteData(key,plans)
  local left=0 for _ in pairs(plans) do left=left+1 end
  emit({forgotten=n,saved_plans_left=left}) return
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
    if x2>=x1 then
      local r={id='zone-'..b.id,x=x1,y=y1,z=b.z,w=x2-x1+1,h=y2-y1+1,zone=b.id}
      for _,p in pairs(plans) do
        if p.x==r.x and p.y==r.y and p.z==r.z and p.w==r.w and p.h==r.h then
          r.door_x=p.door_x r.door_y=p.door_y
        end
      end
      for i=#layouts,1,-1 do local p=layouts[i]
        if p.x==r.x and p.y==r.y and p.z==r.z and p.w==r.w and p.h==r.h then table.remove(layouts,i) end
      end
      layouts[#layouts+1]=r
    end
  end
end
local protected,status={},{}
for _,r in ipairs(layouts) do
  local missing,unsafe,pending,doors,interior,unknown={},{},{},{},{},0
  for x=r.x,r.x+r.w-1 do for y=r.y,r.y+r.h-1 do
    local f=dfhack.maps.getTileFlags(x,y,r.z)
    local shape=f and not f.hidden and df.tiletype.attrs[dfhack.maps.getTileType(x,y,r.z)].shape
    if shape==df.tiletype_shape.FLOOR then
      protected[r.z..','..x..','..y]={x=x,y=y,z=r.z,room=r.id,reason='existing room floor'}
    end
    if shape~=df.tiletype_shape.FLOOR or (f and f.flow_size>0) then
      interior[#interior+1]={x=x,y=y,z=r.z,reason=shape and ('interior must be dry floor, found '..df.tiletype_shape[shape]) or 'unrevealed interior'}
    end
  end end
  for x=r.x-1,r.x+r.w do for y=r.y-1,r.y+r.h do
    if (x==r.x-1 or x==r.x+r.w or y==r.y-1 or y==r.y+r.h)
      and not (x==r.door_x and y==r.door_y) then
      local f=dfhack.maps.getTileFlags(x,y,r.z)
      local b=dfhack.buildings.findAtTile(x,y,r.z)
      local door=b and b:getType()==df.building_type.Door
      if door then doors[#doors+1]={x=x,y=y,z=r.z,built=b:getBuildStage()>=b:getMaxBuildStage(),id=b.id} end
      if not door then
        protected[r.z..','..x..','..y]={x=x,y=y,z=r.z,room=r.id}
        if f and not f.hidden then
          local a=df.tiletype.attrs[dfhack.maps.getTileType(x,y,r.z)]
          if a.shape~=df.tiletype_shape.WALL then
            if b and b:getType()==df.building_type.Construction and b.type==df.construction_type.Wall then
              pending[#pending+1]={x=x,y=y,z=r.z,building_id=b.id}
            else missing[#missing+1]={x=x,y=y,z=r.z} end
          end
          if f.dig~=df.tile_dig_designation.No then unsafe[#unsafe+1]={x=x,y=y,z=r.z,designation=df.tile_dig_designation[f.dig]} end
        else unknown=unknown+1 end
      end
    end
  end end
  status[#status+1]={id=r.id,zone=r.zone,x=r.x,y=r.y,z=r.z,w=r.w,h=r.h,
    door_x=r.door_x,door_y=r.door_y,doors=doors,pending_walls=pending,invalid_interior=interior,
    missing_walls=missing,unsafe_designations=unsafe,unrevealed_boundary_tiles=unknown}
end
if ARGS.internal then return {protected=protected,rooms=status} end
local damaged=0
for _,r in ipairs(status) do
  r.missing_wall_count=#r.missing_walls r.unsafe_designation_count=#r.unsafe_designations
  r.pending_wall_count=#r.pending_walls
  if r.door_x then
    local d=dfhack.buildings.findAtTile(r.door_x,r.door_y,r.z)
    r.door_complete=d and d:getType()==df.building_type.Door and d:getBuildStage()>=d:getMaxBuildStage() or false
    r.door=d and {id=d.id,x=r.door_x,y=r.door_y,built=r.door_complete} or nil
  else r.door_complete=#r.doors>0
    for _,d in ipairs(r.doors) do if not d.built then r.door_complete=false end end
  end
  r.enclosed=r.missing_wall_count==0 and r.pending_wall_count==0 and r.door_complete and r.unrevealed_boundary_tiles==0 and #r.invalid_interior==0
  r.state=r.enclosed and 'enclosed' or #r.invalid_interior>0 and 'unsuitable_interior'
    or r.unrevealed_boundary_tiles>0 and 'unverified_boundary' or r.missing_wall_count>0 and 'needs_walls'
    or r.pending_wall_count>0 and 'walls_pending' or r.door and 'door_pending' or 'needs_door'
  local steps={enclosed='Audit furniture/ownership, then tidy preview.',unsuitable_interior='Inspect interior. Preserve shafts and relocate the bedroom when it overlaps stairs.',
    unverified_boundary='Inspect visible layout; do not guess through hidden terrain.',needs_walls='Preview repair, confirm the corridor entrance, then apply.',
    walls_pending='Wait; inspect suspended jobs. Repeat repair after walls complete to place the door.',door_pending='Wait; inspect suspended jobs before resuming a door job.',needs_door='Run repair with the original doorway coordinates if not already known.'}
  r.next_step=steps[r.state]
  if not r.enclosed then damaged=damaged+1 end
  r.invalid_interior_count=#r.invalid_interior
  -- A finished room needs no repair data; keep the summary short unless detail=true.
  if r.enclosed and not ARGS.detail then
    status[_]={id=r.id,zone=r.zone,x=r.x,y=r.y,z=r.z,w=r.w,h=r.h,state=r.state,door=r.door,next_step=r.next_step}
  elseif not ARGS.detail then
    while #r.missing_walls>6 do table.remove(r.missing_walls) end
    while #r.unsafe_designations>6 do table.remove(r.unsafe_designations) end
    while #r.invalid_interior>2 do table.remove(r.invalid_interior) end
  end
end
-- z narrows the report to one level (protection itself always covers every level).
if ARGS.z~=nil and action=='status' then
  local keep={} damaged=0
  for _,r in ipairs(status) do if r.z==ARGS.z then keep[#keep+1]=r if not r.enclosed then damaged=damaged+1 end end end
  status=keep
end
emit({room_count=#status,damaged_rooms=damaged,rooms=status,guidance='Repair: df_room_plan action=repair id=... previews wall/door jobs; dry_run=false queues them. If the entrance is unknown, supply door_x,door_y on the perimeter first. Pending walls/doors are not enclosure: wait, inspect suspended jobs, then recheck enclosed=true. Never wall over an entrance, corridor, stair or furniture. Clear loose clutter with a bounded df_dump after repairs. Coordinate lists are samples unless detail=true.'})
