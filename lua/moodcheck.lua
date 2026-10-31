-- Strange moods: for every moody dwarf, each required item with how many suitable ones the fort has
-- (matched with the game's own job-item rules) and how to get the missing ones, so impossible moods
-- are spotted on day one instead of when the dwarf goes insane.
if not need_map() then return end
local HOW = {
  {'glass', 'glass is made at a glass furnace from sand (needs a sand-collection zone on sand tiles) or bought from caravans'},
  {'yarn', 'yarn/wool: shear sheep, alpacas, llamas or yaks (farmer\'s workshop) and spin and weave at a loom, or buy wool cloth'},
  {'silk', 'silk: weave spider silk thread at a loom (cave spider webs) or buy silk cloth'},
  {'plant fiber', 'plant cloth: process pig tails (farmer\'s workshop) and weave, or buy cloth'},
  {'leather', 'leather: butcher an animal and tan the hide at a tanner\'s'},
  {'gem', 'cut gems: jeweler\'s workshop from rough gems (mining)'},
  {'bone', 'bones: butcher animals or fish'},
  {'shell', 'shells: fish shellfish or butcher turtles'},
  {'metal', 'metal bars: smelt ore at a smelter (needs fuel)'},
  {'block', 'blocks: mason\'s workshop from boulders'},
  {'wood', 'wood: cut trees (woodcutters) or buy logs'},
}
local function hint(desc)
  desc = desc:lower()
  for _, h in ipairs(HOW) do if desc:find(h[1], 1, true) then return h[2] end end
end

-- explicit matching: DFHack's isSuitableMaterial ignores a required specific material (a gem passed as green glass)
local function fl(ji, set, name) return try(function() return ji[set][name] end, false) end
local function material_ok(ji, it)
  if ji.mat_type >= 0 then
    if it:getMaterial() ~= ji.mat_type then return false end
    if ji.mat_index >= 0 and it:getMaterialIndex() ~= ji.mat_index then return false end
  end
  local m = dfhack.matinfo.decode(it)
  local name = m and m:toString():lower() or ''
  if fl(ji, "flags2", "plant") and not (m and m.plant) then return false end
  if fl(ji, "flags2", "silk") and not name:find('silk') then return false end
  if fl(ji, "flags2", "yarn") and not (name:find('wool') or name:find('hair') or name:find('yarn')) then return false end
  if fl(ji, "flags2", "bone") and not name:find('bone') then return false end
  if fl(ji, "flags2", "shell") and not name:find('shell') then return false end
  if fl(ji, "flags1", "leather") and not name:find('leather') then return false end
  if fl(ji, "flags2", "metal_ore") and not (m and m.inorganic and m.inorganic.flags.METAL_ORE) then return false end
  return true
end

-- Cloth, thread and bars are asked for by size (one whole cloth is 10000), not by count: sum their dimensions.
local function count_suitable(ji)
  local n, size = 0, 0
  if ji.item_type < 0 then
    -- "any bones" / "any shells": no item type, just a body-part flag; bones and shells are butchering corpse pieces
    local want = fl(ji, "flags2", "bone") and 'bone' or fl(ji, "flags2", "shell") and 'shell' or nil
    if not want then return 0, 0 end
    for _, it in ipairs(df.global.world.items.other.CORPSEPIECE) do
      local f = it.flags
      if it.corpse_flags[want] and not (f.forbid or f.rotten or f.trader or f.removed or f.garbage_collect or f.dump) then
        n = n + 1
      end
    end
    return n, 0
  end
  for _, it in ipairs(df.global.world.items.other[df.item_type[ji.item_type]]) do
    local f = it.flags
    if it:getType() == ji.item_type and not (f.forbid or f.rotten or f.trader or f.removed or f.garbage_collect or f.artifact)
       and (ji.item_subtype < 0 or it:getSubtype() == ji.item_subtype) and material_ok(ji, it) then
      n = n + (it.stack_size or 1)
      size = size + (try(function() return it.dimension end, 0) or 0)
    end
  end
  return n, size
end

-- Which workshop each mood wants (showmood text), and whether the fort has one: a mood for a workshop the fort
-- lacks (a Clothier's Shop, say) never starts until one is built.
local wanted = {}
do
  local sm = try(function() return dfhack.run_command_silent('showmood') end, '') or ''
  for line in sm:gmatch('[^\n]+') do
    local who, shop = line:match('^(.-) is currently .- to claim an? (.-) and become')
    if who and shop then wanted[#wanted + 1] = {who = who, shop = shop} end
  end
end
local function have_shop(name)
  for _, list in ipairs({'WORKSHOP_ANY', 'FURNACE_ANY'}) do
    for _, b in ipairs(df.global.world.buildings.other[list]) do
      if dfhack.buildings.getName(b) == name and b:getBuildStage() >= b:getMaxBuildStage() then return true end
    end
  end
  return false
end

local moods = {}
for _, u in ipairs(citizens()) do
  if u.mood >= 0 and df.mood_type[u.mood] ~= 'Baby' then
    local j = u.job.current_job
    local entry = {dwarf = unit_name(u), mood = df.mood_type[u.mood],
      days_left = u.job.mood_timeout > 0 and u.job.mood_timeout // 1230 or nil, items = {}}
    if j and df.job_type[j.job_type]:find('^StrangeMood') then
      local jitems = try(function() return j.job_items.elements end, j.job_items)
      local brought = #j.items
      for i, ji in ipairs(jitems) do
        local m = ji.mat_index >= 0 and dfhack.matinfo.decode(ji.mat_type, ji.mat_index) or nil
        local tname = df.item_type[ji.item_type]
        local kind = fl(ji, "flags2", "plant") and 'plant fiber ' or fl(ji, "flags2", "silk") and 'silk ' or fl(ji, "flags2", "yarn") and 'yarn ' or ''
        local desc
        if ji.item_type < 0 then
          -- no item type: the flag is the whole request (any bones, any shells)
          desc = fl(ji, "flags2", "bone") and 'any bones' or fl(ji, "flags2", "shell") and 'any shells' or 'any item'
        elseif m then
          desc = m:toString() .. ' ' .. kind .. tname:lower()
        elseif ji.mat_type == 0 then
          -- any inorganic material: stone for boulders and blocks, metal for bars, gem for rough/cut gems
          local adj = ({BAR = 'metal ', ROUGH = 'rough gem', SMALLGEM = 'cut gem', BOULDER = 'rock ', BLOCKS = 'rock '})[tname]
          desc = adj == 'rough gem' and 'any rough gems' or adj == 'cut gem' and 'any cut gems'
            or ((adj or 'stone ') .. kind .. tname:lower())
        else
          desc = (kind == '' and 'any ' or '') .. kind .. tname:lower()
        end
        local count, size = count_suitable(ji)
        local need = math.max(ji.quantity, 1)
        -- a size-based need (e.g. 10000 for one cloth) is met by the items' summed dimensions
        local have = (need >= 1000 and size > 0) and size or count
        entry.items[#entry.items + 1] = {need = need, item = dfhack.df2utf(desc), in_fort = have,
          ok = have >= need or nil, how = have < need and hint(desc) or nil}
      end
      entry.brought = brought .. ' item(s) already in the workshop'
      local missing = 0
      for _, it in ipairs(entry.items) do if not it.ok then missing = missing + 1 end end
      entry.verdict = missing == 0 and 'everything needed exists: the dwarf should fetch it' or
        (missing .. ' item type(s) missing: get them before days_left runs out')
    else
      entry.verdict = 'no workshop claimed yet (needs a free workshop of the right type: see df_mood)'
    end
    local first = unit_name(u):match('^(%S+)')
    for _, w in ipairs(wanted) do
      if first and dfhack.df2utf(w.who):find(first, 1, true) then
        entry.workshop = w.shop
        if not have_shop(w.shop) then
          entry.workshop_missing = 'No finished ' .. w.shop .. ' in the fort: build one now (df_help topic=keys) or the mood cannot start.'
        end
      end
    end
    moods[#moods + 1] = entry
  end
end
emit({moods = moods})
