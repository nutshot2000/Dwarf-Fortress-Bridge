-- Pending petitions: who asks, what for, and for a temple or guildhall request what exactly is asked, what this
-- group asked before and which location of the fort already answers it.
local site = dfhack.world.getCurrentSite()
local P = df.religious_practice_type

local function tr(n) return dfhack.df2utf(dfhack.translation.translateName(n, true)) end
local function party_entity(ag)
  local p = ag and #ag.parties > 0 and ag.parties[0]
  return p and #p.entity_ids > 0 and p.entity_ids[0] or nil
end

-- what a location request or a temple is dedicated to
local function dedication(deity_type, data)
  if deity_type == P.RELIGION_ENID then
    local e = df.historical_entity.find(data.Religion)
    return e and tr(e.name) .. ' (religion)' or 'religion ' .. data.Religion
  elseif deity_type == P.WORSHIP_HFID then
    local hf = df.historical_figure.find(data.Deity)
    return hf and tr(hf.name) .. ' (deity)' or 'deity ' .. data.Deity
  end
  return nil
end

local function describe(L)
  local t = {location = df.abstract_building_type[L.type] or L.type, tier = L.tier}
  if L.profession >= 0 then t.profession = df.profession[L.profession] end
  t.dedicated_to = dedication(L.deity_type, L.deity_data)
  return t
end

-- locations of this fort of the same kind (a guildhall of the same profession, a temple to the same god)
local function answering(L)
  local out = {}
  for _, b in ipairs(site and site.buildings or {}) do
    if b:getType() == L.type then
      local c = b.contents
      local same = true
      if L.profession >= 0 then same = c.profession == L.profession end
      if L.deity_type >= 0 then
        same = b.deity_type == L.deity_type
          and (L.deity_type == P.RELIGION_ENID and b.deity_data.Religion == L.deity_data.Religion
            or L.deity_type == P.WORSHIP_HFID and b.deity_data.Deity == L.deity_data.Deity)
      end
      if same then
        out[#out + 1] = {id = b.id, name = try(function() return tr(b.name) end, '?'), tier = c.location_tier,
          value = c.location_value, meets_tier = c.location_tier >= L.tier}
      end
    end
  end
  return out
end

-- earlier location agreements with the same group, newest first
local function history(eid, skip)
  local out = {}
  if not eid then return out end
  local all = df.global.world.agreements.all
  for i = #all - 1, 0, -1 do
    local ag = all[i]
    if ag.id ~= skip and party_entity(ag) == eid then
      for _, d in ipairs(ag.details) do
        if d.type == df.agreement_details_type.Location then
          local h = describe(d.data.Location)
          h.agreement = ag.id h.year = d.year
          h.status = ag.flags.convicted_accepted and 'accepted' or ag.flags.petition_not_accepted and 'denied' or 'pending'
          out[#out + 1] = h
        end
      end
    end
  end
  return out
end

local r = {}
for _, id in ipairs(df.global.plotinfo.petitions) do
  local ag = df.agreement.find(id)
  -- a temple or guildhall request comes from a group (religion, guild): its party lists an entity, no figure
  local p = ag and #ag.parties > 0 and ag.parties[0]
  local hid = p and #p.histfig_ids > 0 and p.histfig_ids[0]
  local eid = party_entity(ag)
  local hf = hid and df.historical_figure.find(hid)
  local ent = eid and df.historical_entity.find(eid)
  local u = hf and df.unit.find(hf.unit_id)
  local det, loc = {}, nil
  for _, d in ipairs(ag and ag.details or {}) do
    det[#det + 1] = df.agreement_details_type[d.type]
    if d.type == df.agreement_details_type.Location then
      local L = d.data.Location
      loc = describe(L)
      loc.answered_by = answering(L)
      local h = history(eid, id)
      loc.earlier_requests = #h
      while #h > 6 do table.remove(h) end
      loc.earlier = h
    end
  end
  -- vet for disguised night creatures: werebeasts and vampires carry a syndrome / curse record
  local syn = {}
  if u then for _, sa in ipairs(u.syndromes.active) do local sy = df.syndrome.find(sa.type) syn[#syn + 1] = sy and sy.syn_name or '?' end end
  local cursed = hf and try(function() return hf.info.curse ~= nil end, false) or false
  local race = hf and df.creature_raw.find(hf.race).creature_id
  r[#r + 1] = {id = id, who = u and unit_name(u) or (hf and tr(hf.name))
      or (ent and tr(ent.name) .. ' (' .. df.historical_entity_type[ent.type] .. ')') or '?',
    race = race, age = u and math.floor(dfhack.units.getAge(u)), wants = det, location = loc, syndromes = syn,
    warning = (cursed or (race or ''):find('NIGHT_CREATURE')) and 'CURSED: likely a werebeast or vampire, deny' or nil}
end
emit(r)
