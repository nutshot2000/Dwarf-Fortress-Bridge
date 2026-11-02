-- Fort journal: who the dwarves are (a short book-style sketch, not a stat sheet), a compact snapshot of every
-- citizen for spotting story beats between waits (arrivals, deaths, lovers, kills, legends, dreams), and the
-- fort's identity for the journal folder.
-- action=fort | cast | sketch (unit_id) | fate (ids)
if not need_map() then return end
local action = ARGS.action or 'cast'

local function hfname(hf) return dfhack.df2utf(dfhack.translation.translateName(hf.name)) end
local function nick(u) local n = u.name.nickname return n ~= '' and dfhack.df2utf(n) or nil end
local function first(u) return dfhack.df2utf(dfhack.translation.translateName(u.name)):match('^(%S+)') end
local function lower(s) return (s:gsub('_', ' '):lower()) end
local function words(s) return (s:gsub('(%l)(%u)', '%1 %2'):lower()) end

if action == 'fort' then
  local site = dfhack.world.getCurrentSite()
  emit({save_dir = try(function() return df.global.world.cur_savegame.save_dir end, 'world'),
    site_id = df.global.plotinfo.site_id,
    fort = site and dfhack.df2utf(dfhack.translation.translateName(site.name, true)) or 'fort',
    world = dfhack.df2utf(dfhack.translation.translateName(df.global.world.world_data.name, true)),
    date = date_info()})
  return
end

-- Traits a narrator would mention: only the extremes (DF's own descriptions start at 76 and 24).
local FACETS = {
  ABSTRACT_INCLINED = {'loves abstract ideas', 'has no time for theory'},
  ACTIVITY_LEVEL = {'is always on the go', 'takes life slowly'},
  ALTRUISM = {'would give anyone the shirt off their back', 'looks out for number one'},
  AMBITION = {'is fiercely ambitious', 'has no ambition at all'},
  ANGER_PROPENSITY = {'has a short fuse', 'is almost impossible to anger'},
  ANXIETY_PROPENSITY = {'is a bundle of nerves', 'is calm whatever happens'},
  ART_INCLINED = {'is moved by beauty and art', 'is unmoved by art'},
  ASSERTIVENESS = {'is bossy and assertive', 'never speaks up'},
  BASHFUL = {'is painfully shy', 'is utterly shameless'},
  BRAVERY = {'is fearless', 'is a coward'},
  CHEER_PROPENSITY = {'is cheerful', 'is rarely happy'},
  CLOSEMINDED = {'is stubborn as a rock', 'is open to new ideas'},
  CONFIDENCE = {'is supremely self-assured', 'is full of self-doubt'},
  CRUELTY = {'has a cruel streak', 'is kind-hearted'},
  CURIOUS = {'is endlessly curious', 'is incurious'},
  DEPRESSION_PROPENSITY = {'is prone to dark moods', 'never gets gloomy'},
  DISCORD = {'likes a good quarrel', 'is a natural peacemaker'},
  DISDAIN_ADVICE = {'never takes advice', 'takes advice readily'},
  DUTIFULNESS = {'is dutiful to a fault', 'ignores rules and duties'},
  EMOTIONALLY_OBSESSIVE = {'dwells on feelings for a long time', 'gets over things quickly'},
  ENVY_PROPENSITY = {'is consumed by envy', 'is never envious'},
  EXCITEMENT_SEEKING = {'is a thrill-seeker', 'avoids any excitement'},
  FRIENDLINESS = {'is warm and friendly', 'is cold and unfriendly'},
  GRATITUDE = {'is deeply grateful', 'is ungrateful'},
  GREED = {'is greedy', 'cares nothing for wealth'},
  GREGARIOUSNESS = {'loves company', 'is a loner'},
  HATE_PROPENSITY = {'is quick to hate', 'never hates anyone'},
  HOPEFUL = {'is an optimist', 'expects the worst'},
  HUMOR = {'is a joker', 'has no sense of humour'},
  IMAGINATION = {'has a vivid imagination', 'has no imagination'},
  IMMODERATION = {'has no self-control', 'is restrained'},
  IMMODESTY = {'is a show-off', 'is modest'},
  LOVE_PROPENSITY = {'falls in love easily', 'rarely falls in love'},
  LUST_PROPENSITY = {'is lusty', 'has little interest in romance'},
  ORDERLINESS = {'is obsessively tidy', 'is hopelessly messy'},
  PERFECTIONIST = {'is a perfectionist', 'is sloppy'},
  PERSEVERANCE = {'never gives up', 'gives up easily'},
  POLITENESS = {'is very polite', 'is rude'},
  PRIDE = {'is proud', 'is humble'},
  PRIVACY = {'is intensely private', 'is an open book'},
  SINGLEMINDED = {'is single-minded', 'is easily distracted'},
  STRESS_VULNERABILITY = {'cracks under pressure', 'is unshakeable'},
  SWAYED_BY_EMOTIONS = {'is ruled by emotion', 'is level-headed'},
  THOUGHTLESSNESS = {'acts without thinking', 'thinks everything through'},
  TOLERANT = {'is tolerant', 'is intolerant'},
  TRUST = {'is trusting', 'is suspicious of everyone'},
  VANITY = {'is vain', 'does not care about looks'},
  VENGEFUL = {'holds a grudge forever', 'forgives easily'},
  VIOLENT = {'is violent', 'abhors violence'},
  WASTEFULNESS = {'is wasteful', 'is thrifty'},
}

-- Not the way to introduce a child.
local ADULT_ONLY = {LUST_PROPENSITY = true, LOVE_PROPENSITY = true}

local function standout(p, n, child)
  local list = {}
  for i = 0, #p.traits - 1 do
    local name = df.personality_facet_type[i]
    local v, ph = p.traits[i], FACETS[name]
    if ph and (v >= 76 or v <= 24) and not (child and ADULT_ONLY[name]) then
      list[#list + 1] = {text = (v >= 91 or v <= 9) and ('really ' .. ph[v >= 76 and 1 or 2]):gsub('really is ', 'is truly ')
        or ph[v >= 76 and 1 or 2], d = math.abs(v - 50)}
    end
  end
  table.sort(list, function(a, b) return a.d > b.d end)
  local out = {}
  for i = 1, math.min(n, #list) do out[i] = list[i].text end
  return out
end

local function strongest_values(p, n)
  local list = {}
  for _, v in ipairs(p.values) do
    if math.abs(v.strength) >= 21 then
      list[#list + 1] = {text = (v.strength > 0 and 'values ' or 'has no respect for ') .. lower(df.value_type[v.type]),
        d = math.abs(v.strength)}
    end
  end
  table.sort(list, function(a, b) return a.d > b.d end)
  local out = {}
  for i = 1, math.min(n, #list) do out[i] = list[i].text end
  return out
end

local function pref_text(pr)
  local t = df.unitpref_type[pr.type]
  local function mat() local mi = dfhack.matinfo.decode(pr.mattype, pr.matindex) return mi and mi:toString() end
  local function creature(plural) local c = df.creature_raw.find(pr.creature_id) return c and c.name[plural and 1 or 0] end
  local function form(vec, id) for _, f in ipairs(vec) do if f.id == id then return dfhack.df2utf(dfhack.translation.translateName(f.name, true)) end end end
  if t == 'LikeMaterial' then return 'like', mat()
  elseif t == 'LikeCreature' then return 'like', creature(true)
  elseif t == 'HateCreature' then return 'hate', creature(true)
  elseif t == 'LikeFood' then return 'food', mat()
  elseif t == 'LikeColor' then local c = df.global.world.raws.descriptors.colors[pr.color_id] return 'like', c and ('the colour ' .. c.name:lower())
  elseif t == 'LikePlant' or t == 'LikeTree' then local pl = df.plant_raw.find(pr.plant_id) return 'like', pl and pl.name_plural
  elseif t == 'LikeItem' then
    local def = pr.item_subtype >= 0 and try(function() return dfhack.items.getSubtypeDef(pr.item_type, pr.item_subtype) end)
    if def then return 'like', try(function() return def.name_plural end) or def.name end
    local ITEMS = {SIEGEAMMO = 'ballista arrows', TRAPCOMP = 'trap parts', AMMO = 'ammunition', GLOVES = 'gloves',
      PANTS = 'trousers', SHOES = 'shoes', ARMOR = 'armour', TOOL = 'tools', ANIMALTRAP = 'animal traps', SMALLGEM = 'cut gems'}
    local n = df.item_type[pr.item_type] or ''
    return 'like', ITEMS[n] or (lower(n) .. 's')
  elseif t == 'LikePoeticForm' then return 'art', form(df.global.world.poetic_forms.all, pr.poetic_form_id)
  elseif t == 'LikeMusicalForm' then return 'art', form(df.global.world.musical_forms.all, pr.musical_form_id)
  elseif t == 'LikeDanceForm' then return 'art', form(df.global.world.dance_forms.all, pr.dance_form_id)
  end
end

local function likes(soul)
  local out = {like = {}, hate = {}, food = {}, art = {}}
  for _, pr in ipairs(soul.preferences) do
    local kind, txt = pref_text(pr)
    if kind and txt and txt ~= '' then table.insert(out[kind], dfhack.df2utf(txt)) end
  end
  return out
end

-- Family and loved ones, with whether they live here.
local FAMILY = {SPOUSE = 'spouse', LOVER = 'lover', MOTHER = 'mother', FATHER = 'father', CHILD = 'child',
  DECEASED_SPOUSE = 'late spouse', FORMER_SPOUSE = 'former spouse', DEITY = 'god'}
local function family(hf)
  local out, seen = {}, {}
  for _, l in ipairs(hf.histfig_links) do
    local kind = FAMILY[df.histfig_hf_link_type[l:getType()]]
    local o = df.historical_figure.find(l.target_hf)
    if kind and o and not seen[kind .. o.id] then
      seen[kind .. o.id] = true
      local ou = o.unit_id >= 0 and df.unit.find(o.unit_id)
      out[#out + 1] = {relation = kind, name = hfname(o), hf = o.id,
        here = ou and dfhack.units.isCitizen(ou) or false, dead = o.died_year >= 0}
    end
  end
  return out
end

-- The dwarves they are closest to and those they cannot stand, among the people here.
local function bonds(hf)
  local close, cold = {}, {}
  local rel = hf.info and hf.info.relationships
  if not rel then return close, cold end
  for _, r in ipairs(rel.hf_visual) do
    local o = df.historical_figure.find(r.histfig_id)
    local ou = o and o.unit_id >= 0 and df.unit.find(o.unit_id)
    if ou and dfhack.units.isCitizen(ou) and dfhack.units.isAlive(ou) then
      local s = r.core.love + r.core.trust
      if s >= 60 then close[#close + 1] = {name = hfname(o), hf = o.id, score = s}
      elseif s <= -20 then cold[#cold + 1] = {name = hfname(o), hf = o.id, score = s} end
    end
  end
  table.sort(close, function(a, b) return a.score > b.score end)
  table.sort(cold, function(a, b) return a.score < b.score end)
  return close, cold
end

-- Being a legendary observer or a legendary student is not the stuff of introductions.
local DULL = {OBSERVATION = true, SITUATIONAL_AWARENESS = true, DISCIPLINE = true, KNOWLEDGE_ACQUISITION = true,
  CONCENTRATION = true, DODGING = true, ARMOR = true, SHIELD = true, MELEE_COMBAT = true, COORDINATION = true, BALANCE = true}
local function top_skills(u, n)
  local list = {}
  for _, s in ipairs(u.status.current_soul.skills) do
    if s.rating >= 5 and not DULL[df.job_skill[s.id]] then list[#list + 1] = {skill = s.id, rating = s.rating} end
  end
  table.sort(list, function(a, b) return a.rating > b.rating end)
  local out = {}
  for i = 1, math.min(n, #list) do
    local r = list[i]
    local name = lower(df.job_skill.attrs[r.skill].caption or df.job_skill[r.skill])
    local weapon = df.job_skill.attrs[r.skill].type == df.job_skill_class.MilitaryWeapon
    out[i] = {skill = weapon and ('the ' .. name) or name, with = weapon,
      level = df.skill_rating[math.min(r.rating, 15)] or tostring(r.rating), legendary = r.rating >= 15}
  end
  return out
end

-- Kills from the incident log, once for everyone.
local kills_by = {}
for _, i in ipairs(df.global.world.incidents.all) do
  if i.type == df.incident_type.Death and i.criminal >= 0 then
    local v = df.unit.find(i.victim)
    local k = kills_by[i.criminal] or {n = 0, victims = {}}
    k.n = k.n + 1
    if v then k.victims[#k.victims + 1] = unit_name(v) end
    kills_by[i.criminal] = k
  end
end

-- Parts lost for good: an eye, a hand. Only the part that came off, not every finger on it.
local function lost_parts(u)
  local out = {}
  local parts, st = u.body.body_plan.body_parts, u.body.components.body_part_status
  for i = 0, #parts - 1 do
    local bp = parts[i]
    local parent = bp.con_part_id
    if st[i].missing and not (parent >= 0 and st[parent].missing) then
      out[#out + 1] = dfhack.df2utf(bp.name_singular[0].value)
    end
  end
  return out
end

local function stress_word(s)
  if not s then return nil end
  if s >= 100000 then return 'falling apart' elseif s >= 50000 then return 'very stressed'
  elseif s >= 25000 then return 'stressed' elseif s <= -50000 then return 'happy' end
  return 'fine'
end

local function sketch(u)
  local soul = u.status.current_soul
  local p = soul.personality
  local hf = df.historical_figure.find(u.hist_figure_id)
  local close, cold = {}, {}
  if hf then close, cold = bonds(hf) end
  local dreams = {}
  for _, d in ipairs(p.dreams) do dreams[#dreams + 1] = {dream = lower(df.goal_type[d.type] or '?'), done = d.flags.accomplished} end
  local nobles = {}
  for _, np in ipairs(dfhack.units.getNoblePositions(u) or {}) do nobles[#nobles + 1] = dfhack.df2utf(np.position.name[0]) end
  local k = kills_by[u.id]
  return {id = u.id, hf = u.hist_figure_id, name = unit_name(u), first_name = first(u), nickname = nick(u),
    sex = u.sex == 0 and 'female' or (u.sex == 1 and 'male' or 'unknown'),
    age = math.floor(dfhack.units.getAge(u) or 0), profession = dfhack.units.getProfessionName(u),
    child = dfhack.units.isChild(u) or dfhack.units.isBaby(u),
    traits = standout(p, 3, dfhack.units.isChild(u) or dfhack.units.isBaby(u)), baby = dfhack.units.isBaby(u), values = strongest_values(p, 1), likes = likes(soul), dreams = dreams,
    family = hf and family(hf) or {}, close = close, cold = cold, skills = top_skills(u, 2), nobles = nobles,
    kills = k and k.n or 0, victims = k and k.victims or {}, lost = try(function() return lost_parts(u) end, {}),
    stress = stress_word(unit_stress(u)), mood = u.mood >= 0 and df.mood_type[u.mood] or nil,
    squad = u.military.squad_id >= 0 and (function() local s = df.squad.find(u.military.squad_id)
      return s and dfhack.df2utf(dfhack.translation.translateName(s.name, true)) end)() or nil}
end

if action == 'sketch' then
  local u = df.unit.find(ARGS.unit_id or -1)
  if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end
  emit(sketch(u))
  return
end

if action == 'cast' then
  local out = {}
  for _, u in ipairs(citizens()) do out[#out + 1] = sketch(u) end
  emit({date = date_info(), cast = out})
  return
end

-- What became of citizens who left the cast: dead (and how), or gone.
if action == 'fate' then
  local out = {}
  for _, id in ipairs(ARGS.ids or {}) do
    local u = df.unit.find(id)
    local f = {id = id, dead = u and dfhack.units.isDead(u) or false, name = u and unit_name(u) or nil}
    if f.dead then
      for _, i in ipairs(df.global.world.incidents.all) do
        if i.type == df.incident_type.Death and i.victim == id then
          local k = df.unit.find(i.criminal)
          f.killer = k and unit_name(k) or nil
          f.cause = try(function() return words(df.death_type[i.death_cause]) end)
        end
      end
      if not f.cause and u then f.cause = try(function() return words(df.death_type[u.counters.death_cause or -1]) end) end
    end
    out[#out + 1] = f
  end
  emit(out)
  return
end

emit({error = 'Unknown action ' .. tostring(action)})
