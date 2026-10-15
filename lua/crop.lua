-- Farm plots: list plots and plantable seeds, or set what a plot grows each season.
if not need_map() then return end
local plants = df.global.world.raws.plants.all
local SEASONS = {'spring', 'summer', 'autumn', 'winter'}

local function plant_info(i)
  local p = plants[i]
  if not p then return nil end
  local seasons = {}
  for _, s in ipairs({'SPRING', 'SUMMER', 'AUTUMN', 'WINTER'}) do
    if p.flags[s] then table.insert(seasons, s:lower()) end
  end
  return {id = p.id, name = p.name, underground = p.flags.BIOME_SUBTERRANEAN_WATER or false, seasons = seasons}
end

local function plot_info(b)
  local crops = {}
  for s = 0, 3 do
    local pi = b.plant_id[s]
    crops[SEASONS[s + 1]] = pi >= 0 and plants[pi] and plants[pi].name or 'fallow'
  end
  local underground = try(function() return dfhack.maps.getTileFlags(b.x1, b.y1, b.z).subterranean end, false)
  return {id = b.id, x = b.x1, y = b.y1, z = b.z, w = b.x2 - b.x1 + 1, h = b.y2 - b.y1 + 1,
    underground = underground, built = b:getBuildStage() >= b:getMaxBuildStage(), crops = crops}
end

if (ARGS.action or 'list') == 'list' then
  local plots = {}
  for _, b in ipairs(df.global.world.buildings.other.FARM_PLOT) do table.insert(plots, plot_info(b)) end
  local seeds = {}
  for _, it in ipairs(df.global.world.items.other.SEEDS) do
    if not it.flags.forbid and not it.flags.rotten then
      local mi = dfhack.matinfo.decode(it)
      if mi and mi.plant then
        local k = mi.plant.id
        seeds[k] = seeds[k] or plant_info(mi.index)
        seeds[k].seeds = (seeds[k].seeds or 0) + it.stack_size
      end
    end
  end
  local list = {}
  for _, v in pairs(seeds) do table.insert(list, v) end
  table.sort(list, function(a, b) return a.seeds > b.seeds end)
  emit({plots = plots, seeds_in_stock = list}) return
end

-- set
local b = df.building.find(ARGS.plot_id or -1)
if not b or not df.building_farmplotst:is_instance(b) then emit({error = 'No farm plot ' .. tostring(ARGS.plot_id)}) return end
local want = (ARGS.plant or ''):upper()
local pid = -1
if want ~= '' and want ~= 'FALLOW' then
  for i, p in ipairs(plants) do
    if p.id == want or p.name:upper() == want then pid = i break end
  end
  if pid < 0 then
    for i, p in ipairs(plants) do
      if p.id:find(want, 1, true) or p.name:upper():find(want, 1, true) then pid = i break end
    end
  end
  if pid < 0 then emit({error = 'No plant matching ' .. want}) return end
end
local seasons = ARGS.seasons or SEASONS
for _, s in ipairs(seasons) do
  for i, name in ipairs(SEASONS) do
    if name == s:lower() then b.plant_id[i - 1] = pid end
  end
end
emit({ok = true, plot = plot_info(b), plant = pid >= 0 and plant_info(pid) or 'fallow'})
