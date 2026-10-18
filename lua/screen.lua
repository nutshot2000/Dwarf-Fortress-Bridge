-- Read the game's UI as a text grid, find text on it, press interface keys, or click.
local gui = require('gui')
local action = ARGS.action or 'read'
if action == 'close' then
  -- v50 panels (trade, squads, petitions, view sheets...) live inside the main dwarfmode screen and
  -- ignore Esc sent from scripts; clear their open flags instead. Time stays frozen while some are open.
  local closed = {}
  for k, v in pairs(df.global.game.main_interface) do
    local ok, open = pcall(function() return v.open end)
    if ok and open == true then v.open = false table.insert(closed, k) end
  end
  emit({closed = closed, focus = dfhack.gui.getCurFocus(true)}) return
end
local W, H = dfhack.screen.getWindowSize()

local function row_text(y, x1, x2)
  local line = {}
  for x = x1, x2 do
    local t = dfhack.screen.readTile(x, y)
    local c = t and t.ch or 32
    if ARGS.layer == 'base' then
      -- DF's tutorial is a separate top layer. readTile reads only that
      -- layer while it is active, omitting exposed controls underneath.
      -- Layout matches DFHack's bundled devel/inspect-screen (8 bytes/cell).
      c = df.global.gps.screen[(x * df.global.gps.dimy + y) * 8]
    end
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
-- exact = case-sensitive (buttons are capitalised: "Approve" vs "Do you approve this request?")
local function find(text, exact)
  local hits = {}
  local needle = exact and text or text:lower()
  for y = 0, H - 1 do
    local line = row_text(y, 0, W - 1)
    if not exact then line = line:lower() end
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
-- topmost screen, including DFHack dialogs and overlays (input must go to whatever is on top)
local function screen() return dfhack.gui.getCurViewscreen(true) end

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

if action == 'map_click' then
  if not need_map() then return end
  if ARGS.x == nil or ARGS.y == nil or ARGS.z == nil then
    emit({error = 'map_click requires world x,y,z coordinates'}) return
  end
  if ARGS.z ~= df.global.window_z then
    emit({error = 'Target is not on the viewed elevation; move the camera first'}) return
  end
  -- Use the game's pixel-to-map mapping, which accounts for graphics zoom.
  -- Text-grid cells are smaller than map tiles. Find an interior sample without
  -- moving the camera or altering designation/tutorial state.
  local g = df.global.gps
  local old = {g.mouse_x, g.mouse_y, g.precise_mouse_x, g.precise_mouse_y}
  local hits = {}
  for sy = 0, H - 1 do for sx = 0, W - 1 do
    g.mouse_x, g.mouse_y = sx, sy
    g.precise_mouse_x = sx*g.tile_pixel_x + g.tile_pixel_x//2
    g.precise_mouse_y = sy*g.tile_pixel_y + g.tile_pixel_y//2
    local p = dfhack.gui.getMousePos()
    if p and p.x == ARGS.x and p.y == ARGS.y and p.z == ARGS.z then
      hits[#hits+1] = {x=sx,y=sy}
    end
  end end
  g.mouse_x, g.mouse_y = old[1], old[2]
  g.precise_mouse_x, g.precise_mouse_y = old[3], old[4]
  if #hits == 0 then emit({error='Target is offscreen or covered by UI; reposition the camera first'}) return end
  local hit = hits[math.ceil(#hits/2)]
  click_at(hit.x, hit.y, ARGS.right)
  emit({ok=true, target={x=ARGS.x,y=ARGS.y,z=ARGS.z}, screen=hit, focus=focus()}) return
end

if action == 'read' then
  local x1, y1 = math.max(0, ARGS.x1 or 0), math.max(0, ARGS.y1 or 0)
  local x2, y2 = math.min(ARGS.x2 or W - 1, W - 1), math.min(ARGS.y2 or H - 1, H - 1)
  if x1 > x2 or y1 > y2 then emit({error='Read rectangle is outside the screen'}) return end
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
    -- prefer case-exact matches (the button), fall back to any case
    local hits = find(ARGS.text, true)
    if #hits == 0 then hits = find(ARGS.text) end
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
