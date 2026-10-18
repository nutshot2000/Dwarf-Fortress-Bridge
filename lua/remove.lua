if not need_map() then return end
local b=df.building.find(ARGS.building_id)
if not b then emit({error='No building '..tostring(ARGS.building_id)}) return end
local built=b:getBuildStage()>0
local out={building=b.id,type=df.building_type[b:getType()],name=b.name,
  x=b.centerx,y=b.centery,z=b.z,built_or_started=built,dry_run=ARGS.dry_run~=false,jobs={}}
for _,j in ipairs(b.jobs) do out.jobs[#out.jobs+1]={id=j.id,name=dfhack.job.getName(j)} end
if built and not ARGS.allow_built then
  out.error='Building is already built or construction has started. Explicit allow_built=true is required for removal.'
elseif not out.dry_run then
  out.removed_immediately=dfhack.buildings.deconstruct(b)
  out.removal_queued=not out.removed_immediately
  out.guidance='Verify removal after waiting if queued. Only then clear released loose items with df_dump and resume the obstructed construction.'
end
emit(out)
