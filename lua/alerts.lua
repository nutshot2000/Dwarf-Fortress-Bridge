-- The game's alert panel (the red ALE button) and any open popup messages.
local st = df.global.world.status
local groups = {}
for i = #st.announcement_alert - 1, 0, -1 do
  local a = st.announcement_alert[i]
  local texts = {}
  for _, id in ipairs(a.announcement_id) do
    local r = df.report.find(id)
    if r then table.insert(texts, dfhack.df2utf(r.text)) end
  end
  if #texts > 0 then
    while #texts > (ARGS.per_group or 4) do table.remove(texts, 1) end
    table.insert(groups, {type = df.announcement_alert_type[a.type] or tostring(a.type), latest = texts})
  end
  if #groups >= (ARGS.limit or 12) then break end
end
local popups = {}
for _, p in ipairs(st.popups) do
  table.insert(popups, dfhack.df2utf(try(function() return p.text end, '?')))
end
emit({alerts = groups, popups = popups,
  hint = 'Newest first. Popups pause the game until dismissed (df_screen key LEAVESCREEN).'})
