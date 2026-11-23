-- Doors and hatches df_levers locked that are no longer locked (or gone). Reported once by df_wait, then
-- forgotten: lock them again with df_levers if they should stay shut.
if not need_map() then return end
local KEY = 'df-bridge/locked-doors'
local mine = dfhack.persistent.getSiteData(KEY, {}) or {}
local lost = {}
for id, at in pairs(mine) do
  local b = df.building.find(tonumber(id))
  if not b then
    lost[#lost + 1] = ('#%s at %s is gone (destroyed or removed)'):format(id, at)
    mine[id] = nil
  elseif not b.door_flags.forbidden then
    lost[#lost + 1] = ('#%s at %s is unlocked'):format(id, at)
    mine[id] = nil
  end
end
dfhack.persistent.saveSiteData(KEY, mine)
emit({lost = lost})
