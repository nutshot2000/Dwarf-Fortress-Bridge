-- Mark loose items for dumping (dwarves haul them to a garbage dump zone), unmark them, or just count.
-- Skips items already in a stockpile, in a dump zone, inside buildings/containers, forbidden or in jobs.
if not need_map() then return end
local action = ARGS.action or 'count'
local types = ARGS.types or {'BOULDER'}
if action == 'unforbid' then
  -- the game forbids whatever lands in a dump; make it usable again (it is not re-hauled)
  local n = 0
  for _, it in ipairs(df.global.world.items.other.IN_PLAY) do
    if it.flags.forbid and it.flags.on_ground then
      local x, y, z = dfhack.items.getPosition(it)
      for _, d in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
        if x and d.type == df.civzone_type.Dump and d.z == z and x >= d.x1 and x <= d.x2 and y >= d.y1 and y <= d.y2 then
          it.flags.forbid = false it.flags.dump = false n = n + 1 break
        end
      end
    end
  end
  emit({action = action, unforbidden = n}) return
end
local z1 = ARGS.z1 or ARGS.z
local z2 = ARGS.z2 or ARGS.z or z1
if not z1 then emit({error = 'give z, or z1 and z2'}) return end
if z1 > z2 then z1, z2 = z2, z1 end

local function in_box(x, y)
  if ARGS.x1 and (x < math.min(ARGS.x1, ARGS.x2 or ARGS.x1) or x > math.max(ARGS.x1, ARGS.x2 or ARGS.x1)) then return false end
  if ARGS.y1 and (y < math.min(ARGS.y1, ARGS.y2 or ARGS.y1) or y > math.max(ARGS.y1, ARGS.y2 or ARGS.y1)) then return false end
  return true
end

local dumps = {}
for _, z in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
  if z.type == df.civzone_type.Dump then
    table.insert(dumps, {id = z.id, at = ('%d,%d,%d'):format(z.x1, z.y1, z.z), w = z.x2 - z.x1 + 1, h = z.y2 - z.y1 + 1})
  end
end
local function in_dump(x, y, z)
  for _, d in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
    if d.type == df.civzone_type.Dump and d.z == z and x >= d.x1 and x <= d.x2 and y >= d.y1 and y <= d.y2 then return true end
  end
end

local changed, skipped, by_z, excluded = 0, 0, {}, {}
local excluded_counts={}
for _, t in ipairs(types) do
  for _, it in ipairs(try(function() return df.global.world.items.other[t] end, {})) do
    local f = it.flags
    if f.on_ground and not f.removed then
      local x, y, z = dfhack.items.getPosition(it)
      if z and z >= z1 and z <= z2 and in_box(x, y) then
        local b = dfhack.buildings.findAtTile(x, y, z)
        local stored = b and df.building_stockpilest:is_instance(b)
        local reason=f.in_job and 'reserved_by_job' or f.forbid and 'forbidden' or stored and 'stockpile' or in_dump(x,y,z) and 'dump_zone'
        if reason then
          skipped = skipped + 1
          excluded_counts[reason]=(excluded_counts[reason] or 0)+1
          if #excluded<20 then
            local owners={}
            if f.in_job then for _,ref in ipairs(it.specific_refs) do
              if ref.type==df.specific_ref_type.JOB and ref.data.job then
                local job=ref.data.job local holder=dfhack.job.getHolder(job)
                owners[#owners+1]={job_id=job.id,building_id=holder and holder.id}
              end
            end end
            excluded[#excluded+1]={id=it.id,item=dfhack.df2utf(dfhack.items.getReadableDescription(it)),x=x,y=y,z=z,reason=reason,reserved_by=owners}
          end
        elseif action == 'mark' and not f.dump then
          f.dump = true changed = changed + 1
          by_z[tostring(z)] = (by_z[tostring(z)] or 0) + 1
        elseif action == 'unmark' and f.dump then
          f.dump = false changed = changed + 1
          by_z[tostring(z)] = (by_z[tostring(z)] or 0) + 1
        elseif action == 'count' then
          changed = changed + 1
          by_z[tostring(z)] = (by_z[tostring(z)] or 0) + 1
        end
      end
    end
  end
end

local out = {action = action, items = changed, by_z = by_z, skipped=skipped, skipped_stored=(excluded_counts.stockpile or 0)+(excluded_counts.dump_zone or 0),skipped_reasons=excluded_counts, skipped_items=excluded, dump_zones = dumps,
  guidance='Reserved items are deliberately skipped. df_jobs action=suspended identifies owning jobs and separates construction materials from other ground items. Use types=["ROUGH"] for rough gems; the default is BOULDER only.'}
if action == 'mark' and #dumps == 0 then
  out.warning = 'No garbage dump zone: make one (df_zone type d) or the marked items stay put.'
elseif action == 'mark' then
  out.note = 'Dumped items arrive forbidden: run action=unforbid once hauling is done to make them usable.'
end
emit(out)
