// Tools: screen.
import { tool, text, fail, json, optCoord, z, luaFile } from "../core.js";

tool("df_tutorial", "Read the active tutorial lesson and its actual completion flags. minimize/restore only change visibility; they never complete or skip objectives. Use normal screen inputs for tutorial actions: direct blueprint/job helpers may not trigger UI-specific checks.",
  { action: z.enum(["status", "minimize", "restore"]).default("status") },
  async (a) => {
    const { value } = await luaFile("tutorial", a);
    return value?.error ? fail(value.error) : text(json(value));
  });

tool("df_screen", "The game's UI as text, plus input. close: shut any open v50 panel (trade, squads, petitions, building sheets...); they ignore Esc from scripts and some freeze time. read: the screen as numbered text lines (graphics-only map cells are blank; region via x1,y1,x2,y2) and the focus string. find: grid coordinates of text. key: press interface keys (LEAVESCREEN = Esc, SELECT = Enter, STANDARDSCROLL_UP/DOWN, CUSTOM_* letters). click: left-click at x,y or on a text label (e.g. text='Okay', occurrence=n); right=true for right-click. Use it for pop-ups, the trade screen and anything without a dedicated tool; read again after acting.",
  { action: z.enum(["read", "find", "key", "click", "map_click", "close"]).default("read"), text: z.string().optional(),
    keys: z.array(z.string()).optional(), x: optCoord, y: optCoord, occurrence: z.number().int().min(1).optional(),
    right: z.boolean().optional(), z: optCoord,
    layer: z.enum(["visible", "base"]).default("visible"),
    x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord },
  async (a) => {
    // Give the game a frame between inputs. Tutorial checks and zoom changes
    // are processed after input dispatch, so a Lua loop can lose later keys.
    if (a.action === "key" && a.keys?.length > 1) {
      const results = [];
      for (const key of a.keys) {
        const { value } = await luaFile("screen", { ...a, keys: [key] });
        if (value?.error) return fail(value.error);
        results.push(value);
      }
      return text(json({ pressed: a.keys, results }));
    }
    const { value } = await luaFile("screen", a);
    if (value?.error) return fail(value.error);
    if (value.lines) return text(`focus: ${value.focus.join(" | ")}  paused: ${value.paused}  (${value.size.w}x${value.size.h})\n${value.lines.join("\n")}`);
    return text(json(value));
  });
