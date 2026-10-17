-- Shared helpers prepended to every bridge call. ARGS is defined above this.
local json = require('json')

local function emit(v)
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

local function unit_job(u)
  local j = u.job.current_job
  if not j then return nil end
  return try(function() return dfhack.job.getName(j) end, df.job_type[j.job_type])
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

-- Installed building materials and personal possessions are not communal stock.
local function stock_usable(it)
  local f = it.flags
  return not (f.rotten or f.forbid or f.garbage_collect or f.trader or f.dump
    or f.hostile or f.removed or f.spider_web or f.in_building or f.owned)
end
local function stock_available(it) return stock_usable(it) and not it.flags.in_job and not it.flags.in_inventory end

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
  return {id = j.id, building = b.id, building_type = df.building_type[b:getType()],
    x = j.pos.x, y = j.pos.y, z = j.pos.z, allocated_items = allocated,
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
