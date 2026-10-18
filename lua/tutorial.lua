if not need_map() then return end
local h = df.global.game.main_interface.help
if ARGS.action == 'minimize' then h.flag.minimized = true
elseif ARGS.action == 'restore' then h.flag.minimized = false end
local groups = {
  ['Camera controls'] = 'START_TUTORIAL_CAMERA_CONTROLS',
  ['Mining'] = 'START_TUTORIAL_MINING',
  ['Stockpiles'] = 'START_TUTORIAL_STOCKPILES',
  ['Woodcutting'] = 'START_TUTORIAL_CHOPPING',
  ['Building'] = 'START_TUTORIAL_WORKSHOPS_AND_TASKS',
  ['Information'] = 'START_TUTORIAL_SHEETS',
  ['Alerts'] = 'START_TUTORIAL_ALERTS',
}
local checks = {}
local group
for title, name in pairs(groups) do
  if h.header:find(title, 1, true) == 1 then group = name break end
end
if group then
  for k,v in pairs(h.context_flag[group]) do
    if type(k) == 'string' and type(v) == 'boolean' then checks[k] = v end
  end
end
emit({open=h.open, minimized=h.flag.minimized, header=h.header,
  context=h.context, checks=checks, floor_dug=h.floor_dug,
  note='Read df_screen for lesson text. Completion flags are read-only.'})
