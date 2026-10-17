// Tools: misc.
import { camera, cameraTo, savePrefs, CATEGORIES } from "../camera.js";
import { tool, luaTool, text, fail, json, coord, optCoord, z, command, lua, luaFile, INSTRUCTIONS, SETTINGS, toolProfile } from "../core.js";

tool("df_view", "Move the player's camera to x,y,z so they can see what you are looking at.",
  { x: coord, y: coord, z: coord },
  async (a) => {
    const prev = camera.mode;
    if (prev === "off") camera.mode = "auto";
    await cameraTo(a.x, a.y, a.z);
    camera.mode = prev;
    return text(`Camera centred on ${a.x},${a.y},${a.z}.`);
  });

tool("df_save", "Save the fort (DFHack quicksave).", {},
  async () => text((await command("quicksave")).trim() || "Saved."));

tool("df_cmd", "Run any DFHack console command and return its output (e.g. 'prospect', 'workorder -l Brew', 'autolabor', 'dig-now'). Some commands cheat; prefer normal play.",
  { command: z.string().min(1), args: z.array(z.string()).optional() },
  async (a) => text((await command(a.command, a.args ?? [])).trim() || "(no output)"));

tool("df_lua", "Run raw DFHack Lua inside the game. Helpers available: emit(value) returns JSON, try(fn, default), unit_name(u), unit_job(u), citizens(), date_info(), pos_of(p). ARGS holds the args object.",
  { code: z.string().min(1), args: z.record(z.string(), z.any()).optional() },
  async (a) => {
    const { value, log } = await lua(a.code, a.args ?? {});
    return text((value !== null ? json(value) : "") + (log ? `\n${log}` : "") || "(no output)");
  });

tool("df_help", "Help. topic=keys (default): quickfort build keys, dig kinds and an early-fort checklist. topic=playbook: the full overseer playbook (how to run the fort with these tools; read it first if your client did not show the server instructions). topic=settings: tool profile and environment options.",
  { topic: z.enum(["keys", "playbook", "settings"]).default("keys") },
  async (a) => {
    if (a.topic === "playbook") return text(INSTRUCTIONS);
    if (a.topic === "settings") return text([
      `Bridge version: ${SETTINGS.version}`,
      `Tool profile (DF_TOOLS): ${toolProfile}  -- full | core | comma-separated tool names`,
      `Caption name (DF_AGENT_NAME): ${SETTINGS.agentName}`,
      `Wait cap (DF_WAIT_SECONDS): ${SETTINGS.waitSeconds}s per df_wait call -- keep it under your MCP client's tool timeout`,
      `Game folders (DF_DIR / DFHACK_DIR): set them if the game is not in D:\\SteamLibrary`,
    ].join("\n"));
    return text(HELP);
  });

const HELP = `BUILD KEYS (df_build): b bed, c chair, t table, d door, h container/box, f cabinet, r weapon rack, a armor stand,
n coffin, s statue, l well, H hatch, j cage, v restraint, A archery target, k vermin catcher, D trade depot (5x5)
Workshops (3x3, centre tile): wc carpenter, wm stoneworker(mason), wl still, wz kitchen, ww farmer, wu butcher,
wn tanner, we leatherworks, ~c bookcase, wr craftsdwarf, wf metalsmith (forge), wj jeweler, wt mechanic, wo loom, wk clothier,
wq quern, wM millstone, wb bowyer, wh fishery, wy ashery, wd dyer, wS soap maker, wp screw press, ws siege
Furnaces: ew wood furnace, es smelter, eg glass furnace, ek kiln (el/ea/en magma versions)
Area (top-left + w,h): p farm plot, o paved road, O dirt road, Cw wall, CW reinforced wall, Cf floor, Cr ramp,
Cu/Cd/Cx stairs, CF fortification
DIG KINDS (df_dig): dig, channel, up_stair, down_stair, updown_stair, ramp, remove_stairs, chop, gather, smooth,
engrave (smooth first; df_dig verifies), fortify, undesignate
FIRST-YEAR CHECKLIST: 1) dig an updown stair shaft down 2-5 levels into stone near the wagon
2) dig a work area + storage room 3) stockpiles: food(f), wood(w), stone(s) near the entrance; 4) carpenter wc,
mason wm, still wl, kitchen wz, farmer ww 5) underground farm plots on soil, then set crops with df_crop
6) beds: ConstructBed orders, then bedrooms (df_rooms bedroom_wing) 7) dining hall: tables+chairs + zone h 8) meeting area zone
9) drink > 5 per dwarf: df_order reaction=BREW_DRINK_FROM_PLANT, or let df_upkeep keep it topped up
10) trade depot D, basic defence (door + hatch, or a drawbridge g), a squad (df_military), then df_wait upkeep=true.`;

// ---------- df_ui: one place that knows the v50 panels ----------
// Hotkeys that open each info panel (these screens only populate their lists when opened this way).
const PANELS = { squads: "D_SQUADS", units: "D_UNITLIST", tasks: "D_JOBLIST", locations: "D_LOCATIONS", labor: "D_LABOR",
  orders: "D_ORDERS", nobles: "D_NOBLES", artifacts: "D_ARTLIST", world: "D_WORLD", justice: "D_JUSTICE", stocks: "D_STOCKS",
  announcements: "D_ANNOUNCE", burrows: "D_BURROWS", hauling: "D_HAULING", zones: "D_CIVZONE", stockpiles: "D_STOCKPILES" };

tool("df_ui", "Drive the game's own panels reliably. panels: which v50 panels are open (an open panel can freeze time). open panel=" + Object.keys(PANELS).join("|") + " (dismisses first-time help popups). press text=<button label>: click a visible button, case-exact match preferred (\"Approve\" not \"approve\"), occurrence=n for repeats. select_squad squad_id: tick the squad's checkbox in the Squads panel (shows its order buttons). close: shut every open panel (they ignore Esc sent from scripts). Prefer the dedicated tools; use this for screens they do not cover.",
  { action: z.enum(["panels", "open", "press", "select_squad", "close"]).default("panels"),
    panel: z.string().optional(), text: z.string().optional(), occurrence: z.number().int().min(1).optional(),
    squad_id: z.number().int().optional() },
  async (a) => {
    const openPanels = async () => (await lua(
      `local r = {} for k, v in pairs(df.global.game.main_interface) do
         local ok, o = pcall(function() return v.open end) if ok and o == true then r[#r + 1] = k end end
       emit({open = r, focus = dfhack.gui.getCurFocus(true)})`)).value;
    if (a.action === "panels") return text(json(await openPanels()));
    if (a.action === "close") return luaTool("screen", { action: "close" });
    if (a.action === "press") {
      if (!a.text) return fail("press needs text");
      return luaTool("screen", { action: "click", text: a.text, occurrence: a.occurrence });
    }
    if (a.action === "open") {
      const key = PANELS[(a.panel ?? "").toLowerCase()];
      if (!key) return fail(`Unknown panel ${a.panel}; one of ${Object.keys(PANELS).join(", ")}`);
      await luaFile("screen", { action: "close" });
      await luaFile("screen", { action: "key", keys: [key] });
      // first-time help boxes sit on top with an Okay button
      const { value: f } = await luaFile("screen", { action: "find", text: "Okay" });
      if (f?.hits?.length) await luaFile("screen", { action: "click", text: "Okay" });
      return text(json(await openPanels()));
    }
    if (a.action === "select_squad") {
      if (a.squad_id === undefined) return fail("select_squad needs squad_id");
      await luaFile("screen", { action: "close" });
      await luaFile("screen", { action: "key", keys: ["D_SQUADS"] });
      const { value: f } = await luaFile("screen", { action: "find", text: "Okay" });
      if (f?.hits?.length) await luaFile("screen", { action: "click", text: "Okay" });
      const { value } = await lua(
        `local s = df.global.game.main_interface.squads
         local hit = false
         for i, id in ipairs(s.squad_id) do
           if id == ${a.squad_id} then s.squad_selected[i] = true hit = true else s.squad_selected[i] = false end
         end
         emit({selected = hit, open = s.open})`);
      return value?.selected ? text(`Squad ${a.squad_id} ticked; its order buttons (kill, move, patrol, equip, schedule) are showing.`)
        : fail(`Squad ${a.squad_id} is not in the Squads panel`);
    }
  });

tool("df_camera", "Camera director for a player who is watching. auto (default): during df_wait the view goes to real fights, tracks visible hostiles, shows news (arrivals, births, artifacts, masterworks, moods) and, when nothing is happening, tours the most interesting activity (skilled crafters, moods, digging, performances, training), weighted by the player's taste. like/dislike/never categories (" + CATEGORIES.join(", ") + ") to tune it (saved per fort); prefs shows them, reset_prefs clears. tour=false keeps the view still in quiet moments. follow unit_id|name: stay on one dwarf or creature. goto x,y,z: look somewhere once. caption: a line shown in the game's announcements with goto/follow, so the player knows what they are about to see. off: never move the view.",
  { action: z.enum(["status", "auto", "follow", "off", "goto", "like", "dislike", "never", "prefs", "reset_prefs"]).default("status"),
    unit_id: z.number().int().optional(), name: z.string().optional(), x: optCoord, y: optCoord, z: optCoord,
    categories: z.array(z.string()).optional(), tour: z.boolean().optional(), caption: z.string().optional() },
  async (a) => {
    if (a.tour !== undefined) camera.tour = a.tour;
    const prefsText = () => CATEGORIES.map((c) => `${c}=${camera.prefs[c] ?? 1}`).join(", ");
    if (a.action === "status") return text(json({ mode: camera.mode, tour: camera.tour, following: camera.followId,
      subject: camera.subject, prefs: prefsText() }));
    if (a.action === "prefs") return text(`Camera preferences (1 neutral, 2.5 like, 0.2 dislike, 0 never): ${prefsText()}; tour ${camera.tour ? "on" : "off"}.`);
    if (a.action === "reset_prefs") { camera.prefs = {}; savePrefs(); return text("Camera preferences reset to neutral."); }
    if (["like", "dislike", "never"].includes(a.action)) {
      const bad = (a.categories ?? []).filter((c) => !CATEGORIES.includes(c));
      if (!a.categories?.length || bad.length) return fail(`categories must be from: ${CATEGORIES.join(", ")}`);
      for (const c of a.categories) camera.prefs[c] = { like: 2.5, dislike: 0.2, never: 0 }[a.action];
      savePrefs();
      return text(`Camera will ${a.action === "like" ? "favour" : a.action === "dislike" ? "rarely show" : "never show"}: ${a.categories.join(", ")}. Now: ${prefsText()}`);
    }
    if (a.action === "off" || a.action === "auto") {
      camera.mode = a.action; camera.followId = null; camera.subject = null;
      return text(`Camera ${a.action === "off" ? "off: the view stays where the player puts it" : `on auto${camera.tour ? " with tours in quiet moments" : ""}`}.`);
    }
    if (a.action === "goto") {
      if (a.x === undefined) return fail("goto needs x,y,z");
      const prev = camera.mode; if (prev === "off") camera.mode = "auto";
      await cameraTo(a.x, a.y, a.z, a.caption, a.caption); camera.mode = prev;
      // hold the shot so the director does not cut away at once
      camera.subject = { kind: "news", cat: "news", label: a.caption ?? "goto" }; camera.lastSwitch = Date.now();
      return text(`Looking at ${a.x},${a.y},${a.z}${a.caption ? ` (caption shown: ${a.caption})` : ""}.`);
    }
    // follow: by id or by (part of) a name
    const { value: u } = await lua(
      `local want, name = ${a.unit_id ?? -1}, ${JSON.stringify((a.name ?? "").toLowerCase())}
       for _, u in ipairs(df.global.world.units.active) do
         if not dfhack.units.isDead(u) and (u.id == want or (name ~= '' and unit_name(u):lower():find(name, 1, true))) then
           emit({id = u.id, label = unit_name(u), x = u.pos.x, y = u.pos.y, z = u.pos.z}) return
         end
       end
       emit({})`);
    if (!u?.id) return fail("No such living unit");
    camera.mode = "follow"; camera.followId = u.id;
    await cameraTo(u.x, u.y, u.z, `following ${u.label}`, a.caption);
    return text(`Following ${u.label}; the view tracks them during df_wait. df_camera auto to go back to the director.`);
  });
