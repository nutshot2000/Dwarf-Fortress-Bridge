-- Locations (tavern, hospital, temple, library, guildhall) and their occupations
-- (tavern keeper, performer, scholar, scribe, doctor, diagnostician, surgeon, bone doctor).
if not need_map() then return end
local action = ARGS.action or 'list'
local site = dfhack.world.getCurrentSite()

local function lname(b)
  local n = try(function() return dfhack.translation.translateName(b.name, true) end)
  return n and dfhack.df2utf(n) or ('location ' .. b.id)
end
local function locations()
  local t = {}
  for _, b in ipairs(site.buildings) do
    local tp = df.abstract_building_type[b:getType()]
    if tp == 'INN_TAVERN' or tp == 'HOSPITAL' or tp == 'TEMPLE' or tp == 'LIBRARY' or tp == 'GUILDHALL' then
      table.insert(t, b)
    end
  end
  return t
end
local function occ_info(o)
  local u = o.unit_id >= 0 and df.unit.find(o.unit_id)
  return {id = o.id, type = df.occupation_type[o.type], holder = u and unit_name(u) or 'vacant'}
end
local function ename(n)
  local s = try(function() return dfhack.translation.translateName(n, true) end)
  return s and dfhack.df2utf(s) or '?'
end
-- what a temple is dedicated to: a religion, one deity, or every faith (the game's default)
local P = df.religious_practice_type
local function dedication(b)
  if not df.abstract_building_templest:is_instance(b) then return nil end
  if b.deity_type == P.RELIGION_ENID then
    local e = df.historical_entity.find(b.deity_data.Religion)
    return e and ename(e.name) .. ' (religion)' or 'religion ' .. b.deity_data.Religion
  elseif b.deity_type == P.WORSHIP_HFID then
    local hf = df.historical_figure.find(b.deity_data.Deity)
    return hf and ename(hf.name) .. ' (deity)' or 'deity ' .. b.deity_data.Deity
  end
  return 'all faiths'
end
-- religions and deities citizens follow, with follower counts (what a temple can be dedicated to)
local function faiths()
  local rel, gods = {}, {}
  for _, u in ipairs(citizens()) do
    local hf = df.historical_figure.find(u.hist_figure_id)
    for _, l in ipairs(hf and hf.entity_links or {}) do
      local e = df.historical_entity.find(l.entity_id)
      if e and e.type == df.historical_entity_type.Religion then
        rel[e.id] = rel[e.id] or {id = e.id, name = ename(e.name), followers = 0, gods = {}}
        rel[e.id].followers = rel[e.id].followers + 1
      end
    end
    for _, l in ipairs(hf and hf.histfig_links or {}) do
      if df.histfig_hf_link_deityst:is_instance(l) then
        local g = df.historical_figure.find(l.target_hf)
        if g then
          gods[g.id] = gods[g.id] or {id = g.id, name = ename(g.name), worshippers = 0}
          gods[g.id].worshippers = gods[g.id].worshippers + 1
        end
      end
    end
  end
  local r, d = {}, {}
  for _, v in pairs(rel) do
    local e = df.historical_entity.find(v.id)
    for _, gid in ipairs(e.relations.deities) do
      local g = df.historical_figure.find(gid)
      if g then v.gods[#v.gods + 1] = ename(g.name) end
    end
    r[#r + 1] = v
  end
  for _, v in pairs(gods) do d[#d + 1] = v end
  table.sort(r, function(a, b) return a.followers > b.followers end)
  table.sort(d, function(a, b) return a.worshippers > b.worshippers end)
  return r, d
end
local function pick(list, want)
  if want == nil then return nil end
  for _, v in ipairs(list) do if v.id == want then return v end end
  local w = tostring(want):lower()
  for _, v in ipairs(list) do if v.name:lower():find(w, 1, true) then return v end end
end

local function zones_of(b)
  local z = {}
  for _, zone in ipairs(df.global.world.buildings.other.ANY_ZONE) do
    if zone.location_id == b.id then table.insert(z, zone.id) end
  end
  return z
end

if action == 'list' then
  local out = {}
  for _, b in ipairs(locations()) do
    local occ = {}
    for _, o in ipairs(b.occupations) do table.insert(occ, occ_info(o)) end
    table.insert(out, {id = b.id, type = df.abstract_building_type[b:getType()], name = lname(b),
      zones = zones_of(b), occupations = occ, dedicated_to = dedication(b)})
  end
  emit({locations = out, hint = 'Create one with df_zone location=tavern|hospital|temple|library|guildhall.'}) return
end

local loc
for _, b in ipairs(locations()) do if b.id == ARGS.location_id then loc = b end end
if not loc then emit({error = 'No location ' .. tostring(ARGS.location_id) .. ' (see action=list)'}) return end

local function detach(o)
  if o.unit_id >= 0 then
    local u = df.unit.find(o.unit_id)
    if u then
      for i = #u.occupations - 1, 0, -1 do if u.occupations[i] == o then u.occupations:erase(i) end end
    end
  end
  o.unit_id = -1
  o.histfig_id = -1
end

if action == 'attach' then
  -- move/extend a location onto zone_id (e.g. a new purpose-built room). detach_others=true
  -- releases every other zone from it, keeping the location, its name and staff.
  local z = df.building.find(ARGS.zone_id or -1)
  if not z or not df.building_civzonest:is_instance(z) then emit({error = 'No zone ' .. tostring(ARGS.zone_id)}) return end
  if ARGS.detach_others then
    for _, other in ipairs(df.global.world.buildings.other.ANY_ZONE) do
      if other.location_id == loc.id and other.id ~= z.id then other.location_id = -1 end
    end
    loc.contents.building_ids:resize(0)
  end
  z.location_id = loc.id
  local has = false
  for _, id in ipairs(loc.contents.building_ids) do if id == z.id then has = true end end
  if not has then loc.contents.building_ids:insert('#', z.id) end
  emit({ok = true, location = lname(loc), zones = zones_of(loc)}) return
end

if action == 'assign' then
  local otype = df.occupation_type[(ARGS.occupation or ''):upper()]
  if not otype then emit({error = 'occupation must be one of TAVERN_KEEPER, PERFORMER, SCHOLAR, SCRIBE, DOCTOR, DIAGNOSTICIAN, SURGEON, BONE_DOCTOR'}) return end
  local u = df.unit.find(ARGS.unit_id or -1)
  if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end
  local slot
  for _, o in ipairs(loc.occupations) do
    if o.type == otype and o.unit_id < 0 then slot = o break end
  end
  if not slot then
    slot = df.occupation:new()
    slot.id = df.global.occupation_next_id
    df.global.occupation_next_id = df.global.occupation_next_id + 1
    slot.type = otype
    slot.location_id = loc.id
    slot.site_id = site.id
    slot.group_id = df.global.plotinfo.group_id
    slot.unit_id = -1
    slot.histfig_id = -1
    df.global.world.occupations.all:insert('#', slot)
    loc.occupations:insert('#', slot)
  end
  slot.unit_id = u.id
  slot.histfig_id = u.hist_figure_id
  u.occupations:insert('#', slot)
  emit({ok = true, location = lname(loc), occupation = occ_info(slot)}) return
end

if action == 'dedicate' then
  -- the Locations screen's "dedicated to" choice: a religion (answers a temple petition from it), one deity,
  -- or all_faiths. Without a target, list what citizens follow.
  if not df.abstract_building_templest:is_instance(loc) then emit({error = lname(loc) .. ' is not a temple'}) return end
  local rel, gods = faiths()
  if ARGS.all_faiths then
    loc.deity_type = -1
    loc.deity_data.Religion = -1
  elseif ARGS.religion ~= nil then
    local r = pick(rel, ARGS.religion)
    if not r then emit({error = 'No religion matching ' .. tostring(ARGS.religion) .. ' among citizens', religions = rel}) return end
    loc.deity_type = P.RELIGION_ENID
    loc.deity_data.Religion = r.id
  elseif ARGS.deity ~= nil then
    local g = pick(gods, ARGS.deity)
    if not g then emit({error = 'No deity matching ' .. tostring(ARGS.deity) .. ' among citizens', deities = gods}) return end
    loc.deity_type = P.WORSHIP_HFID
    loc.deity_data.Deity = g.id
  else
    emit({location = lname(loc), dedicated_to = dedication(loc), religions = rel, deities = gods,
      hint = 'Pass religion=<name or id>, deity=<name or id> or all_faiths=true.'}) return
  end
  emit({ok = true, location = lname(loc), dedicated_to = dedication(loc)}) return
end

-- Priests of a temple's religion at this site. Recognizing the priesthood (a UI button, pressed from JS) adds a
-- vacant PRIEST assignment to the religion entity with st_id = this site; appointing fills it the way the game
-- does: histfig and histfig2, plus a position link on the figure with -1 vector indices.
local function temple_religion(b)
  if not df.abstract_building_templest:is_instance(b) then return nil, lname(b) .. ' is not a temple' end
  if b.deity_type ~= P.RELIGION_ENID then return nil, lname(b) .. ' is not dedicated to a religion (df_location dedicate)' end
  local e = df.historical_entity.find(b.deity_data.Religion)
  if not e then return nil, 'religion entity missing' end
  return e
end
local function priest_posts(e)
  local codes, out = {}, {}
  for _, p in ipairs(e.positions.own) do codes[p.id] = p.code end
  for _, a in ipairs(e.positions.assignments) do
    if a.st_id == site.id then
      local hf = a.histfig >= 0 and df.historical_figure.find(a.histfig)
      out[#out + 1] = {assignment = a, code = codes[a.position_id] or ('position ' .. a.position_id),
        holder = hf and ename(hf.name) or nil}
    end
  end
  return out
end
local function posts_info(posts)
  local t = {}
  for _, p in ipairs(posts) do t[#t + 1] = {position = p.code, holder = p.holder or 'vacant'} end
  return t
end

if action == 'priests' or action == 'priest' then
  local e, err = temple_religion(loc)
  if not e then emit({error = err}) return end
  local posts = priest_posts(e)
  if action == 'priests' then
    emit({location = lname(loc), religion = ename(e.name), recognized = #posts > 0, posts = posts_info(posts)}) return
  end
  local u = df.unit.find(ARGS.unit_id or -1)
  local hf = u and df.historical_figure.find(u.hist_figure_id)
  if not hf then emit({error = 'No unit ' .. tostring(ARGS.unit_id) .. ' with a historical figure'}) return end
  local slot
  for _, p in ipairs(posts) do if not p.holder and p.code == 'PRIEST' then slot = p.assignment break end end
  for _, p in ipairs(posts) do if not slot and not p.holder then slot = p.assignment end end
  if not slot then
    emit({error = #posts == 0 and 'The priesthood is not recognized here yet' or 'No vacant priest post', posts = posts_info(posts)}) return
  end
  slot.histfig = hf.id
  slot.histfig2 = hf.id
  hf.entity_links:insert('#', {new = df.histfig_entity_link_positionst, entity_id = e.id, link_strength = 100,
    assignment_id = slot.id, assignment_vector_idx = -1, entity_vector_idx = -1, start_year = df.global.cur_year})
  emit({ok = true, location = lname(loc), religion = ename(e.name), appointed = unit_name(u), posts = posts_info(priest_posts(e))}) return
end

if action == 'remove' then
  local n = 0
  for _, o in ipairs(loc.occupations) do
    if o.unit_id == ARGS.unit_id or o.id == ARGS.occupation_id then detach(o) n = n + 1 end
  end
  emit({ok = true, cleared = n}) return
end
emit({error = 'Unknown action ' .. action})
