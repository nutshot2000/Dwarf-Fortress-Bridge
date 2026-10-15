local out = {
  map_loaded = dfhack.isMapLoaded(),
  paused = df.global.pause_state,
  dfhack = dfhack.getDFHackVersion(),
  df = dfhack.getDFVersion(),
}
if not out.map_loaded then
  out.hint = 'No fort loaded. Generate a world and embark (or load a save), then call df_status again.'
  emit(out) return
end

out.date = date_info()
out.fort = try(function()
  local site = dfhack.world.getCurrentSite()
  return dfhack.translation.translateName(site.name, true)
end) or try(function()
  return dfhack.TranslateName(dfhack.world.getCurrentSite().name, true)
end)
local sx, sy, sz = dfhack.maps.getTileSize()
out.map_size = {x = sx, y = sy, z = sz}
out.view = {x = df.global.window_x, y = df.global.window_y, z = df.global.window_z}

local cits = citizens()
local idle, stressed = {}, 0
for _, u in ipairs(cits) do
  if not u.job.current_job then table.insert(idle, unit_name(u)) end
  local s = unit_stress(u)
  if s and s > 25000 then stressed = stressed + 1 end
end
out.population = #cits
out.idle = #idle
out.idle_names = #idle <= 8 and idle or nil
out.stressed = stressed

-- stock counts (usable items only)
local function usable(it)
  local f = it.flags
  return not (f.rotten or f.forbid or f.garbage_collect or f.trader or f.dump or f.hostile or f.removed)
end
local function count(type_name)
  local n = 0
  local list = try(function() return df.global.world.items.other[type_name] end, {})
  for _, it in ipairs(list) do
    if usable(it) then n = n + it.stack_size end
  end
  return n
end
out.stocks = {
  drink = count('DRINK'),
  food = count('FOOD') + count('MEAT') + count('FISH') + count('CHEESE') + count('EGG') + count('PLANT'),
  seeds = count('SEEDS'),
  wood = count('WOOD'),
  stone_boulders = count('BOULDER'),
  bars = count('BAR'),
}

local hostile = 0
for _, u in ipairs(df.global.world.units.active) do
  if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and try(function() return dfhack.units.isDanger(u) end, false)
     and not u.flags1.caged and not try(function() return dfhack.maps.getTileFlags(u.pos).hidden end, true) then
    hostile = hostile + 1
  end
end
out.hostiles_on_map = hostile

local reports = df.global.world.status.reports
out.last_report_id = #reports > 0 and reports[#reports - 1].id or -1
emit(out)
