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
  return try(function() return dfhack.units.getReadableName(u) end)
      or try(function() return dfhack.translation.translateName(dfhack.units.getVisibleName(u)) end)
      or try(function() return dfhack.TranslateName(dfhack.units.getVisibleName(u)) end)
      or ('unit ' .. u.id)
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
