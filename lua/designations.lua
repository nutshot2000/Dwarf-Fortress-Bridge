if not need_map() then return end
local z=ARGS.z or df.global.window_z
local limit=ARGS.limit or 50
local entries,total={},0
local counts={}
local function add(kind,x,y,zz)
  if zz~=z or (ARGS.kind and ARGS.kind~=kind) then return end
  total=total+1 counts[kind]=(counts[kind] or 0)+1
  if #entries<limit then entries[#entries+1]={kind=kind,x=x,y=y,z=zz} end
end
for _,b in ipairs(df.global.world.map.map_blocks) do
  if b.map_pos.z==z then for x=0,15 do for y=0,15 do
    local f=b.designation[x][y]
    if f.dig~=df.tile_dig_designation.No then add(df.tile_dig_designation[f.dig],b.map_pos.x+x,b.map_pos.y+y,z) end
    if f.smooth~=0 then add(f.smooth==1 and 'smooth' or 'engrave',b.map_pos.x+x,b.map_pos.y+y,z) end
  end end end
end
for _,p in ipairs(df.global.world.plants.all) do
  if p.pos.z==z and dfhack.designations.isPlantMarked(p) then
    add(p.tree_info and 'chop' or 'gather',p.pos.x,p.pos.y,p.pos.z)
  end
end
emit({z=z,total=total,counts=counts,entries=entries,shown=#entries,
  note='Tree felling uses plant marks, not tile dig flags. Chop marks can exist while the map still displays T.'})
