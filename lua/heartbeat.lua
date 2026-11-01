-- Atomic read-only watchdog snapshot. Combat logs distinguish real fighting from
-- hunting/sparring, even when the opponent is not classified as dangerous.
if not need_map() then return end
local r = df.global.world.status.reports
local hostiles, names, hostile_ids, combat = 0, {}, {}, {}
local animal_combat={}
-- Hostiles within 40 tiles (and 6 levels) of a citizen: during a siege only these are worth a stop.
local near_ids, close_ids = {}, {}
local cits_pos = {}
for _, c in ipairs(citizens()) do cits_pos[#cits_pos + 1] = c.pos end
-- reachable=true also requires a walking path: behind a raised drawbridge the undead stay "close" in straight-line
-- distance to dwarves under their feet, but they cannot get at them.
local function near_fort(p, r, reachable)
  for _, c in ipairs(cits_pos) do
    if math.abs(c.x - p.x) <= r and math.abs(c.y - p.y) <= r and math.abs(c.z - p.z) <= 6
       and (not reachable or dfhack.maps.canWalkBetween(p, c)) then return true end
  end
  return false
end
for _, u in ipairs(df.global.world.units.active) do
  local flags = try(function() return dfhack.maps.getTileFlags(u.pos) end)
  if flags and not flags.hidden then
    if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not u.flags1.caged
       and dfhack.units.isDanger(u) then
      hostiles = hostiles + 1
      hostile_ids[#hostile_ids + 1] = u.id
      if near_fort(u.pos, 40) then near_ids[#near_ids + 1] = u.id end
      if near_fort(u.pos, 12, true) then close_ids[#close_ids + 1] = u.id end
      if #names < 4 then names[#names + 1] = unit_name(u) .. ' at ' .. u.pos.x .. ',' .. u.pos.y .. ',' .. u.pos.z end
    end
    local ours = dfhack.units.isCitizen(u)
      or (dfhack.units.isTame(u) and dfhack.units.isOwnCiv(u))
    if ours and ARGS.since ~= nil and #combat < 4 then
      local logs = u.reports.log
      local ignored = {}
      for _, kind in ipairs({'Hunting', 'Sparring'}) do
        local log = logs[kind]
        for i = #log - 1, 0, -1 do
          local id = log[i]
          if id <= ARGS.since then break end
          ignored[id] = true
        end
      end
      for i = #logs.Combat - 1, 0, -1 do
        local id = logs.Combat[i]
        if id <= ARGS.since then break end
        local rep = not ignored[id] and df.report.find(id)
        -- The combat log also holds the dwarves' talk about a conflict (CONFLICT_CONVERSATION: "This is my fight
        -- too", even "I had a bath" while a far-off buzzard counts as a fight) and its after-effects (standing up,
        -- freeing oneself from a web). Only blows mean a fight.
        local ty = rep and df.announcement_type[rep.type] or ''
        if rep and not (ty:find('^COMBAT_') or ty:find('GRIP$')) then rep = nil end
        if rep then
          local list=ARGS.report_animal_combat and not dfhack.units.isCitizen(u) and animal_combat or combat
          list[#list + 1] = {unit_id = u.id, name = unit_name(u), report_id = id,
            text = dfhack.df2utf(rep.text)}
          break
        end
      end
    end
  end
end
local moods = 0
for _, u in ipairs(citizens()) do
  if u.mood >= 0 and df.mood_type[u.mood] ~= 'Baby' then moods = moods + 1 end
end
emit({abs = df.global.cur_year * 403200 + df.global.cur_year_tick, paused = df.global.pause_state,
  pop = #citizens(), last = #r > 0 and r[#r - 1].id or -1,
  hostiles = hostiles, hostile_names = names, hostile_ids = hostile_ids, hostile_near_ids = near_ids, hostile_close_ids = close_ids,
  combat = combat,animal_combat=animal_combat,
  moods = moods, caravans = #df.global.plotinfo.caravans,isolated=citizen_access_report().isolated})
