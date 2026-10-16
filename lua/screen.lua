-- Read the game's UI as a text grid, find text on it, press interface keys, or click.
local gui = require('gui')
local action = ARGS.action or 'read'
local W, H = dfhack.screen.getWindowSize()

local function row_text(y, x1, x2)
  local line = {}
  for x = x1, x2 do
    local t = dfhack.screen.readTile(x, y)
    local c = t and t.ch or 32
    line[#line + 1] = (c >= 32 and c < 127) and string.char(c) or ' '
  end
  return table.concat(line)
end

local function grid(x1, y1, x2, y2)
  local rows = {}
  for y = y1, y2 do rows[#rows + 1] = row_text(y, x1, x2) end
  return rows
end

-- all occurrences of text (case-insensitive) as {x, y} of the first character
local function find(text)
  local hits = {}
  local needle = text:lower()
  for y = 0, H - 1 do
    local line = row_text(y, 0, W - 1):lower()
    local s = 1
    while true do
      local i = line:find(needle, s, true)
      if not i then break end
      table.insert(hits, {x = i - 1, y = y})
      s = i + 1
    end
  end
  return hits
end

local function focus() return dfhack.gui.getCurFocus(true) end
local function screen() return dfhack.gui.getDFViewscreen(true) end

local function click_at(x, y, right)
  df.global.gps.mouse_x = x
  df.global.gps.mouse_y = y
  pcall(function()
    df.global.gps.precise_mouse_x = x * df.global.gps.tile_pixel_x + df.global.gps.tile_pixel_x // 2
    df.global.gps.precise_mouse_y = y * df.global.gps.tile_pixel_y + df.global.gps.tile_pixel_y // 2
  end)
  if right then gui.simulateInput(screen(), '_MOUSE_R_DOWN', '_MOUSE_R')
  else gui.simulateInput(screen(), '_MOUSE_L_DOWN', '_MOUSE_L') end
end

if action == 'read' then
  local x1, y1 = ARGS.x1 or 0, ARGS.y1 or 0
  local x2, y2 = math.min(ARGS.x2 or W - 1, W - 1), math.min(ARGS.y2 or H - 1, H - 1)
  local rows = grid(x1, y1, x2, y2)
  local out = {}
  for i, r in ipairs(rows) do
    local trimmed = r:gsub('%s+$', '')
    if trimmed:find('%S') then out[#out + 1] = ('%3d|%s'):format(y1 + i - 1, trimmed) end
  end
  emit({focus = focus(), size = {w = W, h = H}, origin = {x = x1, y = y1}, lines = out,
    paused = df.global.pause_state}) return
end

if action == 'find' then
  emit({focus = focus(), text = ARGS.text, hits = find(ARGS.text or '')}) return
end

if action == 'key' then
  local keys = ARGS.keys or {}
  for _, k in ipairs(keys) do
    if not df.interface_key[k] then emit({error = 'Unknown interface key ' .. k .. ' (e.g. LEAVESCREEN, SELECT, STANDARDSCROLL_DOWN)'}) return end
  end
  local before = focus()
  for _, k in ipairs(keys) do gui.simulateInput(screen(), k) end
  emit({ok = true, pressed = keys, focus_before = before, focus_after = focus()}) return
end

if action == 'click' then
  local x, y = ARGS.x, ARGS.y
  if ARGS.text then
    local hits = find(ARGS.text)
    local n = ARGS.occurrence or 1
    if not hits[n] then emit({error = 'Text "' .. ARGS.text .. '" not on screen (' .. #hits .. ' matches)', focus = focus()}) return end
    x, y = hits[n].x + math.floor(#ARGS.text / 2), hits[n].y
  end
  if not x or not y then emit({error = 'Give x,y or text'}) return end
  local before = focus()
  click_at(x, y, ARGS.right)
  emit({ok = true, clicked = {x = x, y = y}, focus_before = before, focus_after = focus()}) return
end

emit({error = 'Unknown action ' .. action})
