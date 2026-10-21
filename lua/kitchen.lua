-- Kitchen settings: which plants/foods may be cooked or brewed (the Kitchen screen's exclusions).
if not need_map() then return end
local action = ARGS.action or 'list'
local K = df.global.plotinfo.kitchen

local function excl_list()
  local out = {}
  for i = 0, #K.item_types - 1 do
    local it, sub, mt, mi = K.item_types[i], K.item_subtypes[i], K.mat_types[i], K.mat_indices[i]
    local mat = dfhack.matinfo.decode(mt, mi)
    local types = {}
    for k, v in pairs(K.exc_types[i]) do if v == true then table.insert(types, k) end end
    table.insert(out, {item = df.item_type[it], material = mat and mat:toString() or (mt .. ':' .. mi),
      forbidden = table.concat(types, ',')})
  end
  return out
end

-- DF forbids cooking every seed type by default, and DFHack's seedwatch forbids cooking each crop whose seeds run
-- low (often 100+ plants): both are summarised so the answer stays readable.
local function excl_summary()
  local other, seeds, plants = {}, 0, {}
  for _, e in ipairs(excl_list()) do
    if e.item == 'SEEDS' and e.forbidden == 'Cook' then seeds = seeds + 1
    elseif e.item == 'PLANT' and e.forbidden == 'Cook' then plants[#plants + 1] = (e.material:gsub(' plant$', ''))
    else table.insert(other, e) end
  end
  local pc = #plants == 0 and 'none' or ('%d crops: %s'):format(#plants, table.concat(plants, ', '):sub(1, 300) .. (#plants > 12 and ' ...' or ''))
  return other, seeds .. ' seed types (DF default)', pc
end
local function seedwatch_on()
  local out = try(function() return dfhack.run_command_silent('seedwatch') end, '') or ''
  return out:find('seedwatch is enabled', 1, true) and 'enabled (forbids cooking crops below 30 seeds)' or 'disabled'
end

if action == 'list' then
  local other, seeds, plants = excl_summary()
  emit({exclusions = other, seed_cooking_forbidden = seeds, plant_cooking_forbidden = plants, seedwatch = seedwatch_on(),
  hint = 'set plant=<name> cook=false|true brew=false|true. With seedwatch enabled it re-forbids cooking crops whose seeds are below target; cooks then rely on meat, fish and cheese.'}) return end

if action == 'set' then
  local want = (ARGS.plant or ''):upper()
  local pid
  for i, p in ipairs(df.global.world.raws.plants.all) do
    if p.id == want or p.name:upper() == want then pid = i break end
  end
  if not pid then
    for i, p in ipairs(df.global.world.raws.plants.all) do
      if p.name:upper():find(want, 1, true) then pid = i break end
    end
  end
  if not pid then emit({error = 'No plant ' .. want}) return end
  local p = df.global.world.raws.plants.all[pid]
  -- the edible/brewable part is the plant's basic material (STRUCTURAL); try it, then any
  local mi = dfhack.matinfo.find('PLANT:' .. p.id .. ':STRUCTURAL')
  if not mi then emit({error = 'No structural material for ' .. p.id}) return end
  local changes = {}
  for _, kind in ipairs({'cook', 'brew'}) do
    if ARGS[kind] ~= nil then
      local t = {[kind == 'cook' and 'Cook' or 'Brew'] = true}
      local f = ARGS[kind] and dfhack.kitchen.removeExclusion or dfhack.kitchen.addExclusion
      f(t, df.item_type.PLANT, -1, mi.type, mi.index)
      local excluded = dfhack.kitchen.findExclusion(t, df.item_type.PLANT, -1, mi.type, mi.index) >= 0
      table.insert(changes, ('%s: %s'):format(kind, excluded and 'forbidden' or 'allowed'))
    end
  end
  local other, seeds, plants = excl_summary()
  emit({ok = true, plant = p.name, changes = changes, exclusions = other, seed_cooking_forbidden = seeds,
    plant_cooking_forbidden = plants, seedwatch = seedwatch_on()}) return
end
emit({error = 'Unknown action ' .. action})
