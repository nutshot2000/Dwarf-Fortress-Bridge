-- Detailed look at one unit: needs, recent thoughts, wounds, inventory, skills, labors.
if not need_map() then return end
local u = df.unit.find(ARGS.unit_id or -1)
if not u then emit({error = 'No unit ' .. tostring(ARGS.unit_id)}) return end

local soul = u.status.current_soul
local out = {
  id = u.id, name = unit_name(u),
  profession = try(function() return dfhack.units.getProfessionName(u) end),
  pos = pos_of(u.pos), job = unit_job(u), stress = unit_stress(u),
  age = try(function() return math.floor(dfhack.units.getAge(u)) end),
  mood = u.mood >= 0 and df.mood_type[u.mood] or nil,
  squad = u.military.squad_id >= 0 and try(function() return dfhack.military.getSquadName(u.military.squad_id) end) or nil,
  timers = {hunger = u.counters2.hunger_timer, thirst = u.counters2.thirst_timer, sleep = u.counters2.sleepiness_timer},
}

-- unmet needs (focus level below 0 means unmet)
local needs = {}
try(function()
  for _, n in ipairs(soul.personality.needs) do
    if n.focus_level < -1000 then
      table.insert(needs, {need = df.need_type[n.id], focus = n.focus_level})
    end
  end
end)
table.sort(needs, function(a, b) return a.focus < b.focus end)
out.unmet_needs = needs

-- recent emotions/thoughts
local thoughts = {}
try(function()
  local em = soul.personality.emotions
  for i = math.max(0, #em - 8), #em - 1 do
    local e = em[i]
    table.insert(thoughts, ('%s (%s, strength %d)'):format(df.emotion_type[e.type] or '?',
      df.unit_thought_type[e.thought] or '?', e.strength))
  end
end)
out.recent_emotions = thoughts

-- wounds
local wounds = {}
for _, w in ipairs(u.body.wounds) do
  for _, p in ipairs(w.parts) do
    local part = try(function() return u.body.body_plan.body_parts[p.body_part_id].name_singular[0].value end, 'part')
    table.insert(wounds, part)
  end
end
out.wounds = #wounds > 0 and wounds or nil

local inv = {}
for _, it in ipairs(u.inventory) do
  table.insert(inv, ('%s (%s)'):format(dfhack.df2utf(dfhack.items.getReadableDescription(it.item)), df.inv_item_role_type[it.mode]))
end
out.inventory = inv

local skills = {}
if soul then
  for _, s in ipairs(soul.skills) do
    if s.rating >= 1 then table.insert(skills, {skill = df.job_skill[s.id], level = s.rating}) end
  end
  table.sort(skills, function(a, b) return a.level > b.level end)
end
out.skills = skills

local labors = {}
for i, name in ipairs(df.unit_labor) do
  if name ~= 'NONE' and u.status.labors[i] then table.insert(labors, name) end
end
out.labors = labors
emit(out)
