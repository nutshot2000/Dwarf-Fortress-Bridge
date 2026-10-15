-- Justice: crimes known to the fort, suspects and witnesses, convicts serving time.
if not need_map() then return end
local function uname(id)
  local u = id and id >= 0 and df.unit.find(id)
  return u and unit_name(u) or nil
end
local crimes = {}
for _, c in ipairs(df.global.world.crimes.all) do
  if c.site == df.global.plotinfo.site_id or c.entity == df.global.plotinfo.group_id then
    local witnesses = {}
    for _, w in ipairs(c.witnesses) do
      table.insert(witnesses, uname(try(function() return w.witness_id end, w.unit_id)) or '?')
    end
    local fl = {}
    for k, v in pairs(c.flags) do if v == true then table.insert(fl, k) end end
    table.insert(crimes, {id = c.id, mode = df.crime_type[c.mode] or c.mode,
      criminal = uname(c.criminal), accused = uname(c.accused), victim = uname(c.victim),
      year = c.event_year, witnesses = witnesses, flags = fl,
      punishment = try(function() return {hammerstrikes = c.punishment.hammerstrikes, prison_time = c.punishment.prison_time} end)})
  end
end
emit({crimes = crimes, hint = 'Convicts serving sentences: df_cmd justice. Pardon: df_cmd justice pardon --unit <id>. Convicting is done in the Justice screen by the sheriff/captain.'})
