if not need_map() then return end
local MOOD = df.mood_type
local list = {}
for _, u in ipairs(citizens()) do
  local skills = {}
  local soul = u.status.current_soul
  if soul then
    for _, s in ipairs(soul.skills) do
      if s.rating >= 2 then
        table.insert(skills, {skill = df.job_skill[s.id], level = s.rating})
      end
    end
    table.sort(skills, function(a, b) return a.level > b.level end)
    while #skills > 4 do table.remove(skills) end
  end
  table.insert(list, {
    id = u.id,
    name = unit_name(u),
    profession = try(function() return dfhack.units.getProfessionName(u) end),
    job = unit_job(u),
    pos = pos_of(u.pos),
    stress = unit_stress(u),
    mood = u.mood >= 0 and MOOD[u.mood] or nil,
    hungry = u.counters2.hunger_timer > 50000 or nil,
    thirsty = u.counters2.thirst_timer > 25000 or nil,
    drowsy = u.counters2.sleepiness_timer > 57600 or nil,
    military = u.military.squad_id >= 0 or nil,
    child = (dfhack.units.isChild(u) or dfhack.units.isBaby(u)) or nil,
    top_skills = skills,
  })
end
emit({count = #list, citizens = list})
