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
  return {id = p.id, index = i, name = p.name, underground = p.flags.BIOME_SUBTERRANEAN_WATER or false, seasons = seasons}
end

-- every crop (seed-bearing plant, trees excluded: plots never grow them) that can grow on a plot, by plant index
local function growable(c)
  local ok = {}
  for i, p in ipairs(plants) do
    if p.flags.SEED and not p.flags.TREE and not crop_mismatch(p, c) then ok[i] = true end
  end
  return ok
end

local function plot_info(b)
  local c = plot_conditions(b)
  local crops, incompatible = {}, {}
  for s = 0, 3 do
    local pi = b.plant_id[s]
    crops[SEASONS[s + 1]] = pi >= 0 and plants[pi] and plants[pi].name or 'fallow'
    local why = pi >= 0 and plants[pi] and (crop_mismatch(plants[pi], c) or off_season(plants[pi], s))
    if why then incompatible[#incompatible + 1] = {season = SEASONS[s + 1], crop = plants[pi].name, reason = why} end
  end
  local biomes = {}
  for bn in pairs(c.biomes) do biomes[#biomes + 1] = bn end
  table.sort(biomes)
  local info = {id = b.id, x = b.x1, y = b.y1, z = b.z, w = b.x2 - b.x1 + 1, h = b.y2 - b.y1 + 1,
    underground = c.light == 0, built = b:getBuildStage() >= b:getMaxBuildStage(), crops = crops,
    light_tiles = c.light, dark_tiles = c.dark, biomes = #biomes > 0 and biomes or nil,
    incompatible_crops = #incompatible > 0 and incompatible or nil}
  if not next(growable(c)) then
    info.warning = c.light > 0 and c.dark > 0
      and ('The plot mixes %d light and %d dark tiles: df_crop set accepts no crop here, and whatever is set grows only on the tiles that suit it. Rebuild it on one kind only.'):format(c.light, c.dark)
      or ('No crop can grow here (biome %s): leave it fallow, or build the plot elsewhere.'):format(table.concat(biomes, ', '))
  end
  return info, c
end

if (ARGS.action or 'list') == 'list' then
  local plots, conds = {}, {}
  for _, b in ipairs(df.global.world.buildings.other.FARM_PLOT) do
    local info, c = plot_info(b)
    table.insert(plots, info) conds[#plots] = c
  end
  local seeds = {}
  for _, it in ipairs(df.global.world.items.other.SEEDS) do
    -- in_building = already planted in a plot: not stock
    if not it.flags.forbid and not it.flags.rotten and not it.flags.in_building then
      local mi = dfhack.matinfo.decode(it)
      if mi and mi.plant then
        local k = mi.plant.id
        seeds[k] = seeds[k] or plant_info(mi.index)
        seeds[k].seeds = (seeds[k].seeds or 0) + it.stack_size
      end
    end
  end
  -- each plot names the crops it can grow with seeds in stock now, and counts all it could grow;
  -- seeds no plot can grow are only counted
  local fits = {}
  for i, p in ipairs(plots) do
    local ok = growable(conds[i])
    local names, n = {}, 0
    for _ in pairs(ok) do n = n + 1 end
    for _, v in pairs(seeds) do
      if ok[v.index] then names[#names + 1] = v.name fits[v.id] = true end
    end
    table.sort(names)
    p.plantable_now, p.growable_crops = names, n
  end
  local list, other = {}, 0
  for k, v in pairs(seeds) do
    if #plots == 0 or fits[k] then table.insert(list, v) else other = other + v.seeds end
  end
  table.sort(list, function(a, b) return a.seeds > b.seeds end)
  -- a season set to a crop with no seeds grows nothing (farmers cancel planting)
  local by_name = {}
  for _, v in pairs(seeds) do by_name[v.name] = v.seeds end
  for _, p in ipairs(plots) do
    for season, crop in pairs(p.crops or {}) do
      if crop ~= 'fallow' and not by_name[crop] then
        p.no_seeds = p.no_seeds or {}
        table.insert(p.no_seeds, season .. ': ' .. crop)
      end
    end
  end
  emit({plots = plots, seeds_in_stock = list,
    seeds_for_other_plots = other > 0 and (other .. ' seeds of crops no current plot can grow (trees, or wrong light or biome)') or nil}) return
end

-- set
local b = df.building.find(ARGS.plot_id or -1)
if not b or not df.building_farmplotst:is_instance(b) then emit({error = 'No farm plot ' .. tostring(ARGS.plot_id)}) return end
if b:getBuildStage()<b:getMaxBuildStage() then
  emit({error='Farm plot is not built. Wait for construction, then set crops: the game resets planned plots to fallow on completion.',plot=plot_info(b)}) return
end
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
if pid >= 0 then
  local why = crop_mismatch(plants[pid], plot_conditions(b))
  if why then emit({error = 'Crop cannot grow on this plot. ' .. why, plot = plot_info(b)}) return end
end
-- seasons outside the crop's own are left as they were: nothing would be planted there
local set, skipped = {}, {}
for _, s in ipairs(seasons) do
  for i, name in ipairs(SEASONS) do
    if name == s:lower() then
      if pid >= 0 and off_season(plants[pid], i - 1) then skipped[#skipped + 1] = name else set[#set + 1] = i - 1 end
    end
  end
end
if #set == 0 and #skipped > 0 then
  emit({error = ('%s is planted only in %s, not in %s: nothing changed.'):format(plants[pid].name,
    table.concat(crop_seasons(plants[pid]), ', '), table.concat(skipped, ', ')), plot = plot_info(b)}) return
end
for _, s in ipairs(set) do b.plant_id[s] = pid end
local warnings = {}
if #skipped > 0 then
  warnings[#warnings + 1] = ('%s is planted only in %s: left %s unchanged.'):format(plants[pid].name,
    table.concat(crop_seasons(plants[pid]), ', '), table.concat(skipped, ', '))
end
-- A crop with no seeds in stock is set without complaint, and farmers then cancel "Plant seeds" over and over.
if pid >= 0 then
  local n = 0
  for _, it in ipairs(df.global.world.items.other.SEEDS) do
    local mi = dfhack.matinfo.decode(it)
    if mi and mi.plant and mi.index == pid and not it.flags.forbid and not it.flags.rotten and not it.flags.in_building then n = n + it.stack_size end
  end
  if n == 0 then warnings[#warnings + 1] = ('No %s seeds in stock: farmers will cancel planting. Pick a crop from seeds_in_stock (df_crop list) or buy seeds.'):format(plants[pid].name) end
end
emit({ok = true, plot = plot_info(b), plant = pid >= 0 and plant_info(pid) or 'fallow', warning = #warnings > 0 and table.concat(warnings, ' ') or nil})
