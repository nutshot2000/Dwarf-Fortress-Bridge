// Tools: misc.
import { camera, cameraTo } from "../camera.js";
import { server, tool, luaTool, quickfort, text, fail, json, coord, optCoord, DIG_KEYS, z, command, lua, luaFile, writeBlueprint } from "../core.js";

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

tool("df_help", "Quickfort key reference and early-fort checklist.", {}, async () => text(HELP));

const HELP = `BUILD KEYS (df_build): b bed, c chair, t table, d door, h container/box, f cabinet, r weapon rack, a armor stand,
n coffin, s statue, l well, H hatch, j cage, v restraint, A archery target, k vermin catcher, D trade depot (5x5)
Workshops (3x3, centre tile): wc carpenter, wm stoneworker(mason), wl still, wz kitchen, ww farmer, wu butcher,
wn tanner, we leatherworks, ~c bookcase, wr craftsdwarf, wf metalsmith (forge), wj jeweler, wt mechanic, wo loom, wk clothier,
wq quern, wM millstone, wb bowyer, wh fishery, wy ashery, wd dyer, wS soap maker, wp screw press, ws siege
Furnaces: ew wood furnace, es smelter, eg glass furnace, ek kiln (el/ea/en magma versions)
Area (top-left + w,h): p farm plot, o paved road, O dirt road, Cw wall, CW reinforced wall, Cf floor, Cr ramp,
Cu/Cd/Cx stairs, CF fortification
DIG KINDS (df_dig): dig, channel, up_stair, down_stair, updown_stair, ramp, remove_stairs, chop, gather, smooth,
engrave, fortify, undesignate
FIRST-YEAR CHECKLIST: 1) dig an updown stair shaft down 2-5 levels into stone near the wagon
2) dig a work area + storage room 3) stockpiles: food(f), wood(w), stone(s) near the entrance; 4) carpenter wc,
mason wm, still wl, kitchen wz, farmer ww 5) underground farm plots on soil (plant plump helmets: df_lua or in-game)
6) beds: MakeBed orders + bedroom/dormitory zone 7) dining hall: tables+chairs + zone h 8) meeting area zone
9) BrewDrink orders keep drink > 5 per dwarf 10) trade depot D, basic defence (door + hatch, or a drawbridge g).`;

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

tool("df_camera", "Camera director for a player who is watching. mode=auto (default): during df_wait the view jumps to fights with real injuries, tracks visible hostiles, shows arrivals, deaths, births, artifacts and moods, and also goes to where you dig or build. mode=follow with unit_id or name: keep the view on one dwarf or creature (e.g. the soldier about to fight). mode=off: never move the player's view. goto x,y,z: look somewhere once. status: current mode and subject.",
  { action: z.enum(["status", "auto", "follow", "off", "goto"]).default("status"),
    unit_id: z.number().int().optional(), name: z.string().optional(), x: optCoord, y: optCoord, z: optCoord },
  async (a) => {
    if (a.action === "status") return text(json({ mode: camera.mode, following: camera.followId, subject: camera.subject, last: camera.last }));
    if (a.action === "off" || a.action === "auto") {
      camera.mode = a.action; camera.followId = null; camera.subject = null;
      return text(`Camera ${a.action === "off" ? "off: the view stays where the player puts it" : "on auto: it will show the action during waits"}.`);
    }
    if (a.action === "goto") {
      if (a.x === undefined) return fail("goto needs x,y,z");
      const prev = camera.mode; if (prev === "off") camera.mode = "auto";
      await cameraTo(a.x, a.y, a.z); camera.mode = prev;
      return text(`Looking at ${a.x},${a.y},${a.z}.`);
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
    await cameraTo(u.x, u.y, u.z, `following ${u.label}`);
    return text(`Following ${u.label}; the view tracks them during df_wait. df_camera auto to go back to the director.`);
  });
