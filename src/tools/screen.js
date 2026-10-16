// Tools: screen.
import { server, tool, luaTool, quickfort, text, fail, json, coord, optCoord, DIG_KEYS, z, command, lua, luaFile, writeBlueprint } from "../core.js";

tool("df_screen", "The game's UI as text, plus input. close: shut any open v50 panel (trade, squads, petitions, building sheets...); they ignore Esc from scripts and some freeze time. read: the screen as numbered text lines (graphics-only map cells are blank; region via x1,y1,x2,y2) and the focus string. find: grid coordinates of text. key: press interface keys (LEAVESCREEN = Esc, SELECT = Enter, STANDARDSCROLL_UP/DOWN, CUSTOM_* letters). click: left-click at x,y or on a text label (e.g. text='Okay', occurrence=n); right=true for right-click. Use it for pop-ups, the trade screen and anything without a dedicated tool; read again after acting.",
  { action: z.enum(["read", "find", "key", "click", "close"]).default("read"), text: z.string().optional(),
    keys: z.array(z.string()).optional(), x: optCoord, y: optCoord, occurrence: z.number().int().min(1).optional(),
    right: z.boolean().optional(), x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord },
  async (a) => {
    const { value } = await luaFile("screen", a);
    if (value?.error) return fail(value.error);
    if (value.lines) return text(`focus: ${value.focus.join(" | ")}  paused: ${value.paused}  (${value.size.w}x${value.size.h})\n${value.lines.join("\n")}`);
    return text(json(value));
  });
