if not need_map() then return end
local api = reqscript('internal/quickfort/api')
local command = reqscript('internal/quickfort/command')
local cell = ARGS.key
if ARGS.w or ARGS.h then cell = cell .. ('(%dx%d)'):format(ARGS.w or 1,ARGS.h or 1) end
local data,cursor = api.normalize_data(cell,{x=ARGS.x,y=ARGS.y,z=ARGS.z})
local ctx = api.init_api_ctx({mode='build',dry_run=true},cursor)
ctx.preview = {tiles={},bounds={},total_tiles=0,invalid_tiles=0}
for z,grid in pairs(data) do command.do_command_raw('build',z,grid,ctx) end
local tiles,items = {},{}
local known_tiles = {}
for z,rows in pairs(ctx.preview.tiles) do for y,row in pairs(rows) do for x,valid in pairs(row) do
  local f,o = dfhack.maps.getTileFlags(x,y,z)
  local why = {}
  if f then
    if f.hidden then why[#why+1]='unrevealed'
    else
      local a=df.tiletype.attrs[dfhack.maps.getTileType(x,y,z)]
      if not valid then
        if f.flow_size > 1 or (f.liquid_type and f.flow_size > 0) then why[#why+1]='liquid depth '..f.flow_size end
        if o.building ~= 0 then
          local b=dfhack.buildings.findAtTile(x,y,z)
          why[#why+1]=b and ('occupied by '..df.building_type[b:getType()]..' #'..b.id) or 'building occupancy'
        end
        why[#why+1]='tile shape '..df.tiletype_shape[a.shape]
        if ARGS.key=='b' and f.outside then why[#why+1]='bed requires inside space' end
      end
      known_tiles[z..','..x..','..y]=true
    end
  else why[#why+1]='off map' end
  if not valid then
    if #why==0 then why[1]='native placement rule rejected this tile (for example, doors need an adjacent wall)' end
    tiles[#tiles+1]={x=x,y=y,z=z,reasons=why}
  end
end end end
for _,it in ipairs(df.global.world.items.other.IN_PLAY) do
  if it.flags.on_ground and not it.flags.removed then
    local x,y,z=dfhack.items.getPosition(it)
    if x and known_tiles[z..','..x..','..y] then
      local jobs={}
      for _,ref in ipairs(it.specific_refs) do
        if ref.type==df.specific_ref_type.JOB and ref.data.job then jobs[#jobs+1]=ref.data.job.id end
      end
      items[#items+1]={id=it.id,item=dfhack.df2utf(dfhack.items.getReadableDescription(it)),x=x,y=y,z=z,
        reserved=it.flags.in_job,forbidden=it.flags.forbid,jobs=jobs}
    end
  end
end
table.sort(tiles,function(a,b) return a.y==b.y and a.x<b.x or a.y<b.y end)
local stats=api.clean_stats(ctx.stats)
if stats.build_designated then stats.build_designated.label='Buildings that would be designated (preview only)' end
emit({dry_run=true,key=ARGS.key,stats=stats,invalid_tiles=tiles,ground_items=items,
  can_place=(stats.build_designated and stats.build_designated.value>0 or false),
  guidance='Native Quickfort checks the entire footprint; tiles without a specific obvious reason are omitted. Ground items are observations, not proof of obstruction. Reserved items may be construction materials. wb=bowyer, wu=butcher. Use df_help topic=keys.'})
