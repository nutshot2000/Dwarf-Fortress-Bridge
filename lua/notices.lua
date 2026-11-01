-- The notices DFHack's overlay box shows in the corner of the fort screen ("1 trader is ready to trade",
-- "1 petition outstanding" = an accepted temple/guildhall agreement not yet met, mandates near deadline, moody
-- dwarf status, stranded citizens, ...). The overseer never saw that box, so these went unanswered.
local ok, N = pcall(reqscript, 'internal/notify/notifications')
if not ok or not N.NOTIFICATIONS_BY_IDX then emit({}) return end
local out = {}
for _, n in ipairs(N.NOTIFICATIONS_BY_IDX) do
  local cfg = N.config and N.config.data and N.config.data[n.name]
  if n.dwarf_fn and (not cfg or cfg.enabled) then
    local good, msg = pcall(n.dwarf_fn)
    if good and type(msg) == 'string' and msg ~= '' then out[#out + 1] = dfhack.df2utf(msg) end
  end
end
emit(out)
