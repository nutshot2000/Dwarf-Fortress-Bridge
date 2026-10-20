if not need_map() then return end
local api=reqscript('internal/quickfort/api')
local command=reqscript('internal/quickfort/command')
local room_env=setmetatable({ARGS={internal=true},emit=function() end,need_map=need_map},{__index=_ENV})
local rooms=assert(loadfile(ARGS.room_plan_path,'t',room_env))()
local data,hazard={},{}
for iy,row in ipairs(ARGS.cells) do
  data[iy-1]={} hazard[iy-1]={}
  for ix,text in ipairs(row) do
    -- "`" is quickfort's explicit empty cell; the raw command API would report it as an invalid key.
    if text~='' and text~='`' then
      data[iy-1][ix-1]=text
      -- Erasing, smoothing, engraving, gathering plants (p) and chopping trees (t) do not breach walls.
      if not text:match('^[xsept]%s*%(') and not ({x=true,s=true,e=true,p=true,t=true})[text] then hazard[iy-1][ix-1]=text end
    end
  end
end
local preview=api.init_api_ctx({mode='dig',dry_run=true,priority=ARGS.priority or 4},{x=ARGS.x,y=ARGS.y,z=ARGS.z})
preview.preview={tiles={},bounds={},total_tiles=0,invalid_tiles=0}
for dz=0,(ARGS.levels or 1)-1 do
  local shifted=api.normalize_data({[0]=hazard},{x=ARGS.x,y=ARGS.y,z=ARGS.z-dz})
  for z,grid in pairs(shifted) do command.do_command_raw('dig',z,grid,preview) end
end
local conflicts={}
for z,rows in pairs(preview.preview.tiles) do for y,row in pairs(rows) do for x,valid in pairs(row) do
  local protected=rooms.protected[z..','..x..','..y]
  if valid and protected then conflicts[#conflicts+1]=protected end
end end end
if #conflicts>0 and not ARGS.allow_room_changes then
  emit({error='Dig order would breach protected room walls. Nothing was designated. Narrow the excavation to the interiors/corridor; use allow_room_changes=true only for intentional remodelling.',conflicts=conflicts}) return
end
local ctx=api.init_api_ctx({mode='dig',dry_run=ARGS.dry_run,priority=ARGS.priority or 4},{x=ARGS.x,y=ARGS.y,z=ARGS.z})
for dz=0,(ARGS.levels or 1)-1 do
  local shifted=api.normalize_data({[0]=data},{x=ARGS.x,y=ARGS.y,z=ARGS.z-dz})
  for z,grid in pairs(shifted) do command.do_command_raw('dig',z,grid,ctx) end
end
-- Report only the counters that fired, as {label=value}; the full table is mostly zeros.
local stats={}
for _,s in pairs(api.clean_stats(ctx.stats)) do
  if type(s)=='table' and s.value and s.value~=0 then stats[s.label]=s.value end
end
emit({dry_run=ARGS.dry_run or false,stats=stats,protected_walls_preserved=true,
  intentional_room_changes=ARGS.allow_room_changes and #conflicts or 0})
