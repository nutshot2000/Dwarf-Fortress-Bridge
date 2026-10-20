-- Material preflight for df_workshop add and df_order: does at least one usable input exist for each
-- item a job needs? Usable = not forbidden, in a job, dumped, built in, owned or carried, and reachable.
-- ARGS.items: job_item filters (from workshop.lua), or ARGS.order: {job, reaction, material, material_category}.
-- ARGS.building_id: reachability origin (else a citizen). Returns {warnings = {...}} (empty when all present).
if not need_map() then return end
local workshops = require('dfhack.workshops')
local IT = df.item_type
local COAL = df.builtin_mats.COAL
local FLAG_SETS = {flags1 = df.job_item_flags1, flags2 = df.job_item_flags2, flags3 = df.job_item_flags3}

-- Plain-table filter -> df.job_item (caller deletes it).
local function to_job_item(f)
  local ji = df.job_item:new()
  for _, k in ipairs({'item_type', 'item_subtype', 'mat_type', 'mat_index', 'metal_ore'}) do
    if f[k] then ji[k] = f[k] end
  end
  for k, enum in pairs(FLAG_SETS) do
    for _, name in ipairs(f[k] or {}) do pcall(function() ji[k][name] = true end) end
  end
  return ji
end

local function has_str(vec, s)
  for _, v in ipairs(vec or {}) do if v.value == s or v == s then return true end end
  return false
end
local function mat_ok(f, mt, mi)
  if f.mat_type and f.mat_type >= 0 and mt ~= f.mat_type then return false end
  if f.mat_index and f.mat_index >= 0 and mi ~= f.mat_index then return false end
  if (f.reaction_class or '') ~= '' or (f.has_material_reaction_product or '') ~= '' or (f.metal_ore or -1) >= 0 then
    local info = dfhack.matinfo.decode(mt, mi)
    if not info then return false end
    if (f.reaction_class or '') ~= '' and not has_str(info.material.reaction_class, f.reaction_class) then return false end
    if (f.has_material_reaction_product or '') ~= ''
       and not has_str(info.material.reaction_product.id, f.has_material_reaction_product) then return false end
    if (f.metal_ore or -1) >= 0 then
      local ok = false
      for _, m in ipairs(info.inorganic and info.inorganic.metal_ore.mat_index or {}) do if m == f.metal_ore then ok = true end end
      if not ok then return false end
    end
  end
  return true
end

local function origin()
  local b = ARGS.building_id and df.building.find(ARGS.building_id)
  if b then
    for dx = -1, 1 do for dy = -1, 1 do
      local p = xyz2pos(b.centerx + dx, b.centery + dy, b.z)
      if dfhack.maps.getWalkableGroup(p) ~= 0 then return p end
    end end
    for dx = -2, 2 do for dy = -2, 2 do
      local p = xyz2pos(b.centerx + dx, b.centery + dy, b.z)
      if dfhack.maps.getWalkableGroup(p) ~= 0 then return p end
    end end
  end
  for _, u in ipairs(citizens()) do
    if dfhack.maps.getWalkableGroup(u.pos) ~= 0 then return u.pos end
  end
end
local ORIGIN = origin()

-- 'usable', 'held' (forbidden, in a job, dumped...) or nil (not a candidate at all).
local function state(it)
  local fl = it.flags
  if fl.construction or fl.in_building or fl.removed or fl.garbage_collect or fl.trader or fl.hostile then return nil end
  if fl.forbid or fl.in_job or fl.dump or fl.owned or fl.on_fire or fl.melt then return 'held' end
  if fl.in_inventory and dfhack.items.getHolderUnit(it) then return 'held' end
  local x, y, zz = dfhack.items.getPosition(it)
  if not x then return 'held' end
  local p = type(x) == 'number' and xyz2pos(x, y, zz) or x
  if ORIGIN and not dfhack.maps.canWalkBetween(ORIGIN, p) then return 'held' end
  return 'usable'
end

local function count(f)
  local vec = df.global.world.items.other.IN_PLAY
  if f.item_type and f.item_type >= 0 then
    vec = try(function() return df.global.world.items.other[IT[f.item_type]] end, vec)
  end
  local ji = to_job_item(f)
  local usable, held, economic = 0, 0, {}
  for _, it in ipairs(vec) do
    local itype = it:getType()
    if (not f.item_type or f.item_type < 0 or itype == f.item_type) then
      local mt, mi = it:getMaterial(), it:getMaterialIndex()
      local f2 = f.flags2 or {}
      local want_noneco = false
      for _, n in ipairs(f2) do if n == 'non_economic' then want_noneco = true end end
      if mat_ok(f, mt, mi)
         and try(function() return dfhack.job.isSuitableItem(ji, itype, it:getSubtype()) end, true) then
        local ok_mat = try(function() return dfhack.job.isSuitableMaterial(ji, mt, mi, itype) end, true)
        local st = state(it)
        if st and ok_mat then
          if st == 'usable' then usable = usable + 1 else held = held + 1 end
          if usable > 0 then break end
        elseif st == 'usable' and want_noneco and mt == 0 and df.global.plotinfo.economic_stone[mi] then
          local name = dfhack.matinfo.decode(mt, mi):toString()
          economic[name] = (economic[name] or 0) + 1
        end
      end
    end
  end
  ji:delete()
  return usable, held, economic
end

local function plural(s) return s:find('s$') and s or s .. 's' end
local function describe(f)
  if f.item_type == IT.BAR and f.mat_type == COAL then return 'fuel (coke/charcoal bars)' end
  local mat
  if f.mat_type and f.mat_type >= 0 and f.mat_index and f.mat_index >= 0 then
    mat = try(function() return dfhack.matinfo.decode(f.mat_type, f.mat_index):toString() end)
  end
  local kind = ({[IT.ROUGH] = 'rough gems', [IT.BOULDER] = 'boulders', [IT.BAR] = 'bars', [IT.WOOD] = 'logs',
    [IT.SMALLGEM] = 'cut gems', [IT.SKIN_TANNED] = 'tanned hides', [IT.CLOTH] = 'cloth', [IT.THREAD] = 'thread',
    [IT.PLANT] = 'plants', [IT.FISH_RAW] = 'raw fish'})[f.item_type or -1]
  if not kind then
    local flags = table.concat(f.flags1 or {}, ' ') .. ' ' .. table.concat(f.flags2 or {}, ' ')
    kind = flags:find('bone') and 'bones' or (f.item_type and f.item_type >= 0) and plural(IT[f.item_type]:lower()) or 'items'
  end
  if mat then return mat .. ' ' .. kind end
  local adj = {}
  for _, n in ipairs(f.flags2 or {}) do if n == 'non_economic' then adj[#adj + 1] = 'non-economic' end end
  for _, n in ipairs(f.flags3 or {}) do if n == 'hard' then adj[#adj + 1] = 'hard' end end
  if f.mat_type == 0 and (f.item_type == IT.BOULDER) then adj[#adj + 1] = 'stone' end
  if (f.reaction_class or '') ~= '' then adj[#adj + 1] = f.reaction_class:lower() end
  return (#adj > 0 and table.concat(adj, ' ') .. ' ' or '') .. kind
end

-- Revealed, unmined vein tiles whose inorganic satisfies want(idx): {name -> {n, x, y, z}}.
local function visible_veins(want)
  local found = {}
  for _, blk in ipairs(df.global.world.map.map_blocks) do
    for _, ev in ipairs(blk.block_events) do
      if df.block_square_event_mineralst:is_instance(ev) and want(ev.inorganic_mat) then
        for x = 0, 15 do for y = 0, 15 do
          if (ev.tile_bitmask.bits[y] >> x) & 1 == 1 and not blk.designation[x][y].hidden then
            local attrs = df.tiletype.attrs[blk.tiletype[x][y]]
            if attrs.material == df.tiletype_material.MINERAL and attrs.shape == df.tiletype_shape.WALL then
              local name = dfhack.matinfo.decode(0, ev.inorganic_mat):toString()
              local e = found[name]
              if not e then e = {n = 0, x = blk.map_pos.x + x, y = blk.map_pos.y + y, z = blk.map_pos.z} found[name] = e end
              e.n = e.n + 1
            end
          end
        end end
      end
    end
  end
  return found
end
local function vein_hint(want, what)
  local best, bn
  for name, e in pairs(visible_veins(want)) do if not best or e.n > best.n then best, bn = e, name end end
  if best then return ('%s vein visible but unmined (%d tiles, e.g. %d,%d,%d): mine it first'):format(bn, best.n, best.x, best.y, best.z) end
  return 'no ' .. what .. ' vein visible'
end

-- Job items for a manager order spec.
local function fuel() return {item_type = IT.BAR, mat_type = COAL, mat_index = -1} end
local function has_furnace(t)
  return try(function()
    for _, b in ipairs(df.global.world.buildings.other.FURNACE_ANY) do
      if b.type == t and b:getBuildStage() >= b:getMaxBuildStage() then return true end
    end
    return false
  end, false)
end
local function catalogue(job_type)
  local G = dfhack.BASE_G or _G
  local p, pa = G.print, G.printall
  G.print, G.printall = function() end, function() end
  local found = {}
  pcall(function()
    for bt, enum in pairs({[df.building_type.Workshop] = df.workshop_type, [df.building_type.Furnace] = df.furnace_type}) do
      for sub = enum._first_item, enum._last_item do
        for _, j in pairs(workshops.getJobs(bt, sub, -1) or {}) do
          if j.job_fields and j.job_fields.job_type == job_type then found[#found + 1] = j end
        end
      end
    end
  end)
  G.print, G.printall = p, pa
  return found
end
local function order_items(o)
  local job = df.job_type[o.job]
  if o.reaction then
    for _, r in ipairs(df.global.world.raws.reactions.reactions) do
      if r.code == o.reaction then
        local items = {}
        for _, g in ipairs(r.reagents) do
          if df.reaction_reagent_itemst:is_instance(g) then items[#items + 1] = job_item_filter(g) end
        end
        if r.flags.FUEL and not has_furnace(df.furnace_type.MagmaSmelter) then items[#items + 1] = fuel() end
        return items
      end
    end
    return nil
  end
  if not job then return nil end
  local stone = o.material == 'INORGANIC'
  local mat = o.material and not stone and dfhack.matinfo.find(o.material)
  local cat = o.material_category and o.material_category[1]
  if mat and mat.type == 0 and mat.index >= 0 then
    local inorg = mat.inorganic
    if job == df.job_type.SmeltOre then
      local items = {{item_type = IT.BOULDER, mat_type = 0, mat_index = mat.index}}
      if not has_furnace(df.furnace_type.MagmaSmelter) then items[2] = fuel() end
      return items
    elseif job == df.job_type.CutGems then
      return {{item_type = IT.ROUGH, mat_type = 0, mat_index = mat.index}}
    elseif mat.material.flags.IS_METAL then
      local items = {{item_type = IT.BAR, mat_type = 0, mat_index = mat.index}}
      if not has_furnace(df.furnace_type.MagmaForge) then items[2] = fuel() end
      return items
    elseif inorg then
      return {{item_type = IT.BOULDER, mat_type = 0, mat_index = mat.index}}
    end
  end
  local entries = catalogue(job)
  local pick
  for _, e in ipairs(entries) do
    local first = e.items and e.items[1] or {}
    local wood = first.item_type == IT.WOOD or (e.job_fields.material_category and e.job_fields.material_category.wood)
    local boulder = first.item_type == IT.BOULDER
    if (cat == 'wood' and wood) or (stone and boulder) or (not cat and not mat and not stone) then pick = e break end
  end
  if not pick and cat == 'wood' then return {{item_type = IT.WOOD}} end
  if not pick then return nil end
  local items = {}
  for _, f in ipairs(pick.items or {}) do items[#items + 1] = job_item_filter(f) end
  return items
end

local items, job_type
if ARGS.order then
  items, job_type = order_items(ARGS.order), df.job_type[ARGS.order.job]
else
  items, job_type = ARGS.items, ARGS.job_type
end
if not items then return {warnings = {}} end

local warnings = {}
for _, f in ipairs(items) do
  f.flags1, f.flags2, f.flags3 = f.flags1 or {}, f.flags2 or {}, f.flags3 or {}
  if not (f.item_type == IT.BAR and f.mat_type == COAL and ARGS.magma) then
  -- Masons and stone crafts take only non-economic stone (ores, flux and other economic stone are kept back).
  if f.item_type == IT.BOULDER and f.mat_type == 0 and (f.mat_index or -1) < 0 and job_type ~= df.job_type.CustomReaction
     and (f.reaction_class or '') == '' and (f.metal_ore or -1) < 0 then
    local has = false
    for _, n in ipairs(f.flags2) do if n == 'non_economic' then has = true end end
    if not has then table.insert(f.flags2, 'non_economic') end
  end
  local usable, held, economic = count(f)
  if usable == 0 then
    local msg = '0 usable ' .. describe(f)
    if held > 0 then msg = msg .. (' (%d forbidden, reserved, dumped or unreachable)'):format(held) end
    local eco = {}
    for name, n in pairs(economic) do eco[#eco + 1] = ('%s x%d'):format(name, n) end
    if #eco > 0 then table.sort(eco) msg = msg .. '; only economic stone on hand: ' .. table.concat(eco, ', ', 1, math.min(#eco, 4)) end
    if f.item_type == IT.ROUGH then
      msg = msg .. '; ' .. vein_hint(function(i)
        local inorg = df.global.world.raws.inorganics.all[i]
        return (f.mat_index or -1) < 0 and inorg.material.flags.IS_GEM or i == f.mat_index
      end, 'gem')
    elseif f.item_type == IT.BOULDER and f.mat_type == 0 and (f.mat_index or -1) >= 0 then
      msg = msg .. '; ' .. vein_hint(function(i) return i == f.mat_index end, dfhack.matinfo.decode(0, f.mat_index):toString())
    elseif f.item_type == IT.BAR and f.mat_type == COAL then
      msg = msg .. '; make charcoal at a wood furnace'
    end
    warnings[#warnings + 1] = msg
  end
  end
end
return {warnings = warnings}
