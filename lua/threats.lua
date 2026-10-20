-- Everything that can kill dwarves: hostiles (seen and unseen), night creatures and cursed units
-- (including werebeasts and vampires disguised as visitors or residents), and recent killers.
if not need_map() then return end
local days = ARGS.days or 60
local now = df.global.cur_year * 403200 + df.global.cur_year_tick

local function where(u) return ('%d,%d,%d'):format(u.pos.x, u.pos.y, u.pos.z) end
local function race(u) return df.creature_raw.find(u.race).creature_id end
local function cursed(u)
  local hf = df.historical_figure.find(u.hist_figure_id)
  if hf and try(function() return hf.info.curse ~= nil end, false) then return 'curse record' end
  if race(u):find('NIGHT_CREATURE') then return 'night creature' end
  for _, s in ipairs(u.syndromes.active) do
    local sy = df.syndrome.find(s.type)
    if sy then
      for _, ce in ipairs(sy.ce) do
        local t = df.creature_interaction_effect_type[ce:getType()]
        if t == 'BODY_TRANSFORMATION' or t == 'CAN_DO_INTERACTION' then return 'syndrome: ' .. sy.syn_name end
      end
    end
  end
end

local hostiles, unseen, curses = {}, 0, {}
for _, u in ipairs(df.global.world.units.active) do
  if dfhack.units.isActive(u) and not dfhack.units.isDead(u) then
    if dfhack.units.isDanger(u) and not u.flags1.caged then
      if dfhack.maps.getTileFlags(u.pos).hidden then unseen = unseen + 1
      else table.insert(hostiles, unit_name(u) .. ' [' .. race(u) .. '] at ' .. where(u)) end
    end
    local c = cursed(u)
    if c then
      table.insert(curses, {unit = unit_name(u), id = u.id, at = where(u), why = c,
        role = dfhack.units.isCitizen(u) and 'CITIZEN' or (u.flags2.visitor and 'visitor' or (dfhack.units.isDanger(u) and 'hostile' or 'other'))})
    end
  end
end

-- killers in the last `days`, from the incident log
local killers = {}
for _, i in ipairs(df.global.world.incidents.all) do
  local age = now - ((i.event_year or 0) * 403200 + (i.event_time or 0))
  if i.type == df.incident_type.Death and age >= 0 and age <= days * 1200 then
    local k = df.unit.find(i.criminal)
    local key = k and unit_name(k) or ('unit ' .. i.criminal)
    local e = killers[key] or {killer = key, victims = 0, alive = k and not dfhack.units.isDead(k) or false,
      on_map = k and dfhack.units.isActive(k) or false, at = k and where(k) or '?', killed = {}}
    e.victims = e.victims + 1
    local v = df.unit.find(i.victim)
    if v and #e.killed < 6 then e.killed[#e.killed + 1] = unit_name(v) end
    killers[key] = e
  end
end
local klist = {}
for _, e in pairs(killers) do if e.killer ~= 'unit -1' then table.insert(klist, e) end end
-- Living killers that are still on the map come first (they are the ongoing danger), then by victims.
table.sort(klist, function(a, b)
  local la, lb = a.alive and a.on_map, b.alive and b.on_map
  if la ~= lb then return la end
  return a.victims > b.victims
end)
local total = #klist
local limit = ARGS.limit or 8
while #klist > limit do table.remove(klist) end

emit({visible_hostiles = hostiles, unseen_hostiles = unseen, cursed_or_night_creatures = curses,
  killers_last_days = days, killers = klist, killers_not_shown = total > #klist and (total - #klist) or nil,
  hint = 'Cursed units in human form are not hostile: kill orders are ignored until they transform. Keep a squad stationed nearby and civilians in a burrow (df_burrow alert_on).'})
