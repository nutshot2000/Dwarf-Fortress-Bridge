-- Shared helpers prepended to every bridge call. ARGS is defined above this.
local json = require('json')

local bridge_emitted = false
local function emit(v)
  bridge_emitted = true
  print('\1JSON\1' .. json.encode(v, {pretty = false}) .. '\1END\1')
end

local function try(f, default)
  local ok, v = pcall(f)
  if ok and v ~= nil then return v end
  return default
end

local function need_map()
  if not dfhack.isMapLoaded() then
    emit({error = 'No fort loaded. Embark or load a save first.'})
    return false
  end
  return true
end

local MONTHS = {'Granite','Slate','Felsite','Hematite','Malachite','Galena',
                'Limestone','Sandstone','Timber','Moonstone','Opal','Obsidian'}
local SEASONS = {'Spring','Summer','Autumn','Winter'}

local function date_info()
  local t = df.global.cur_year_tick
  local month = t // 33600
  local day = (t % 33600) // 1200 + 1
  return {
    year = df.global.cur_year, tick = t, month = MONTHS[month + 1], day = day,
    season = SEASONS[month // 3 + 1],
    text = ('%d %s, year %d (%s)'):format(day, MONTHS[month + 1], df.global.cur_year, SEASONS[month // 3 + 1]),
  }
end

local function unit_name(u)
  return dfhack.df2utf(try(function() return dfhack.units.getReadableName(u) end)
      or try(function() return dfhack.translation.translateName(dfhack.units.getVisibleName(u)) end)
      or try(function() return dfhack.TranslateName(dfhack.units.getVisibleName(u)) end)
      or ('unit ' .. u.id))
end

-- DF gives some jobs (cooking a meal) an empty name: fall back to the job type, split into words.
local function job_name(j)
  local n = try(function() return dfhack.job.getName(j) end, '')
  if n == nil or n == '' then n = (df.job_type[j.job_type] or '?'):gsub('(%l)(%u)', '%1 %2') end
  return n
end

local function unit_job(u)
  local j = u.job.current_job
  if not j then return nil end
  return job_name(j)
end

local function unit_stress(u)
  return try(function() return u.status.current_soul.personality.stress end)
      or try(function() return u.status.current_soul.personality.stress_level end)
end

local function pos_of(p) return {x = p.x, y = p.y, z = p.z} end

local function citizens()
  return try(function() return dfhack.units.getCitizens(true) end)
      or try(function() return dfhack.units.getCitizens() end, {})
end

-- Connectivity is a warning, not proof of ability to move (locks, injuries and
-- burrows still require inspection). Compare against the majority citizen group.
local function citizen_access_report(units, connected)
  units=units or citizens()
  connected=connected or dfhack.maps.canWalkBetween
  local groups,n={},0
  for _,u in ipairs(units) do
    if u.pos and u.pos.x>=0 and u.pos.y>=0 and u.pos.z>=0 then
      n=n+1
      local found
      for _,g in ipairs(groups) do
        local ok,yes=pcall(connected,u.pos,g[1].pos)
        if not ok then return {checked=false,isolated={},reason='walking connectivity unavailable'} end
        if yes then g[#g+1]=u found=true break end
      end
      if not found then groups[#groups+1]={u} end
    end
  end
  table.sort(groups,function(a,b) return #a>#b end)
  local main=groups[1] or {}
  local isolated={}
  if #main>n/2 then
    for i=2,#groups do for _,u in ipairs(groups[i]) do
      isolated[#isolated+1]={id=u.id,name=try(function() return unit_name(u) end,tostring(u.id)),x=u.pos.x,y=u.pos.y,z=u.pos.z}
    end end
  end
  return {checked=n>1,main_group_size=#main,citizens_checked=n,isolated=isolated,
    guidance='Disconnected citizens may be trapped. Inspect walls, doors, stairs and access to supplies. Connected does not prove doors are unlocked or the unit is mobile. No majority group means no isolation verdict.'}
end

-- Installed building materials and personal possessions are not communal stock.
local function stock_usable(it)
  local f = it.flags
  -- construction: the item is built into a wall/floor/stair (it stays an item, but is not free stock)
  return not (f.rotten or f.forbid or f.garbage_collect or f.trader or f.dump
    or f.hostile or f.removed or f.spider_web or f.in_building or f.owned or f.construction)
end
-- in_inventory also marks items inside bins, barrels and bags; only an item a unit is holding is unavailable.
local function stock_available(it)
  return stock_usable(it) and not it.flags.in_job
    and not (it.flags.in_inventory and dfhack.items.getHolderUnit(it))
end

local function container_warning(empty, pending, drink, pop, target)
  target = target or 5
  if empty == 0 then
    return {severity = drink < pop * 5 and 'high' or 'medium',
      issue = ('No available empty barrels/large pots: a new brewing batch cannot start until a container is free. %d container(s) queued.'):format(pending)}
  elseif empty < target and empty + pending < target then
    return {severity = drink < pop * 5 and 'medium' or 'low',
      issue = ('Empty food-container reserve low: %d available, %d queued, reserve target %d. Brewing can still use the available containers.'):format(empty, pending, target)}
  end
end

local function construction_review(j, b)
  if j.job_type ~= df.job_type.ConstructBuilding or not j.flags.suspend or not b
     or b:getBuildStage() >= b:getMaxBuildStage() then return nil end
  local allocated = #j.items
  local requires_items = #j.job_items.elements > 0
  local own,materials,ground={}, {}, {}
  for _,r in ipairs(j.items) do
    own[r.item.id]=true
    local x,y,z=dfhack.items.getPosition(r.item)
    materials[#materials+1]={id=r.item.id,item=dfhack.df2utf(dfhack.items.getReadableDescription(r.item)),x=x,y=y,z=z}
  end
  for _,it in ipairs(df.global.world.items.other.IN_PLAY) do
    if it.flags.on_ground and not it.flags.removed and not own[it.id] then
      local x,y,z=dfhack.items.getPosition(it)
      if z==b.z and x>=b.x1 and x<=b.x2 and y>=b.y1 and y<=b.y2 then
        local owners={}
        for _,r in ipairs(it.specific_refs) do
          if r.type==df.specific_ref_type.JOB and r.data.job then
            local holder=dfhack.job.getHolder(r.data.job)
            owners[#owners+1]={job_id=r.data.job.id,building_id=holder and holder.id or nil}
          end
        end
        ground[#ground+1]={id=it.id,item=dfhack.df2utf(dfhack.items.getReadableDescription(it)),x=x,y=y,z=z,
          reserved=it.flags.in_job,forbidden=it.flags.forbid,reserved_by=owners}
      end
    end
  end
  return {id = j.id, building = b.id, building_type = df.building_type[b:getType()],
    x = j.pos.x, y = j.pos.y, z = j.pos.z, allocated_items = allocated,
    materials=materials,other_ground_items=ground,
    next_step=#ground>0 and 'Other ground items may obstruct this site. Reserved items cannot be dumped until the owning job releases them. Inspect reserved_by; do not dump this job\'s own materials or repeatedly resume blindly.'
      or 'No other ground items found. Check access, recent cancellations and suspendmanager; this is not proof that the site is safe.',
    state = (allocated > 0 or not requires_items) and 'review_suspension' or 'waiting_for_materials'}
end
local function suspended_construction()
  local out = {review = {}, waiting_for_materials = {}}
  for _, j in require('utils').listpairs(df.global.world.jobs.list) do
    if j.flags.suspend and j.job_type == df.job_type.ConstructBuilding then
      local info = construction_review(j, dfhack.job.getHolder(j))
      if info then
        local bucket = info.state == 'review_suspension' and out.review or out.waiting_for_materials
        bucket[#bucket + 1] = info
      end
    end
  end
  return out
end

-- A job_item filter (catalogue table or df reagent) as plain JSON-able data: fields plus flag-name lists.
local function job_item_filter(f)
  local out = {}
  for _, k in ipairs({'item_type', 'item_subtype', 'mat_type', 'mat_index', 'reaction_class', 'has_material_reaction_product', 'metal_ore'}) do
    local ok, v = pcall(function() return f[k] end)
    if ok and v ~= nil then out[k] = v end
  end
  for k, enum in pairs({flags1 = df.job_item_flags1, flags2 = df.job_item_flags2, flags3 = df.job_item_flags3}) do
    local names = {}
    local ok, bits = pcall(function() return f[k] end)
    if ok and type(bits) ~= 'nil' then
      for i = 0, 31 do
        local n = enum[i]
        if n and try(function() return bits[n] end, false) then names[#names + 1] = n end
      end
    end
    out[k] = names
  end
  return out
end
