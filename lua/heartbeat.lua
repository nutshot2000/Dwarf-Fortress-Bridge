-- Atomic read-only watchdog snapshot. Combat logs distinguish real fighting from
-- hunting/sparring, even when the opponent is not classified as dangerous.
if not need_map() then return end
local r = df.global.world.status.reports
local hostiles, names, hostile_ids, combat = 0, {}, {}, {}
for _, u in ipairs(df.global.world.units.active) do
  local flags = try(function() return dfhack.maps.getTileFlags(u.pos) end)
  if flags and not flags.hidden then
    if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not u.flags1.caged
       and dfhack.units.isDanger(u) then
      hostiles = hostiles + 1
      hostile_ids[#hostile_ids + 1] = u.id
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
        if rep then
          combat[#combat + 1] = {unit_id = u.id, name = unit_name(u), report_id = id,
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
  hostiles = hostiles, hostile_names = names, hostile_ids = hostile_ids, combat = combat,
  moods = moods, caravans = #df.global.plotinfo.caravans})
