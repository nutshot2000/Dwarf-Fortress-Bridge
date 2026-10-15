#!/usr/bin/env node
// MCP server: play Dwarf Fortress through DFHack.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { command, lua, luaFile, writeBlueprint } from "./dfhack.js";

const INSTRUCTIONS = `You are the overseer of a live Dwarf Fortress fort, acting through DFHack.
Coordinates are map tiles: x east, y south, z UP (higher z = closer to the sky). Underground is lower z.
Loop: df_status -> df_problems -> df_look (around the area you will change) -> ONE action -> df_wait -> verify.
Digging/building only designates work; dwarves do it while the game runs (df_wait).
df_look glyphs: ? unrevealed, # stone wall, % soil wall, * ore/gem vein, . floor, , grass, ' ' open air,
^ ramp, v ramp top, < > X stairs up/down/both, T tree, o boulder, ~ deep water, 1-3 shallow water, ! magma,
lowercase d h u j i r = pending dig designation, @ citizen, E hostile, a other creature,
W workshop, S stockpile, P farm plot, B bed, D door, K table, C chair/box/cabinet, c unfinished building.
Workshops are 3x3 and placed by their CENTRE tile; farm plots, stockpiles and zones take a top-left corner + size.
Farm plots need soil/mud floor underground or any soil surface. Check df_help for building keys.
Production: use df_workshop action=add (direct workshop tasks, works without a manager). Prefer native tasks
("construct bed", "make barrel", "brew drink from plant") over "make wooden ..." reactions.
Farm plots reset to fallow when construction finishes: set crops with df_crop AFTER the plot is built.
People: df_unit (detail), df_labor (labors/work details), df_noble (appoint MANAGER, MILITIA_COMMANDER...),
df_rooms (assign bedrooms/offices), df_military (squads: create, add, station, kill, cancel).
Animals: df_animals (pastures, slaughter, training). df_standing (standing orders). df_jobs (all tasks).
Emergencies: df_burrow alert_on burrow=Safety keeps civilians inside; alert_off afterwards.
Trade: df_trade (caravans, send goods to depot, select on the open trade screen). df_justice (crimes).
Inventory: df_stocks. df_lua runs raw DFHack Lua (call emit(v) to return data). Save with df_save before risky moves.`;

const server = new McpServer({ name: "dwarf-fortress", version: "0.1.0" }, { instructions: INSTRUCTIONS });

const text = (s) => ({ content: [{ type: "text", text: s }] });
const fail = (s) => ({ content: [{ type: "text", text: s }], isError: true });
const json = (v) => JSON.stringify(v, null, 1);

function tool(name, description, shape, fn) {
  server.registerTool(name, { description, inputSchema: shape }, async (args) => {
    try {
      return await fn(args ?? {});
    } catch (e) {
      return fail(String(e.message || e));
    }
  });
}

async function luaTool(name, args) {
  const { value, log } = await luaFile(name, args);
  if (value?.error) return fail(value.error);
  return text(json(value) + (log ? `\n--- log ---\n${log}` : ""));
}

const coord = z.number().int();
const optCoord = coord.optional();

// ---------- observe ----------
tool("df_status", "Fort overview: date, pause state, population, idle/stressed counts, food/drink/wood/stone stocks, hostiles, map size and the player's current view.",
  {}, () => luaTool("status"));

tool("df_problems", "Early-warning scan sorted by severity: food/drink shortages, strange moods, stress, starvation, hostiles, missing beds/still/farms/tables, idle labour.",
  {}, () => luaTool("problems"));

tool("df_units", "List citizens: id, name, profession, current job, position, stress, mood, hunger/thirst flags and top skills.",
  {}, () => luaTool("units"));

tool("df_announcements", "Recent game announcements (newest last). Pass since=<last_id> to get only new ones.",
  { since: z.number().int().optional(), limit: z.number().int().min(1).max(100).optional() },
  (a) => luaTool("announcements", a));

tool("df_look", "ASCII map slice of one z-level plus lists of units and buildings in it. Defaults to the player's current view. radius 3-40.",
  { x: optCoord, y: optCoord, z: optCoord, radius: z.number().int().min(3).max(40).optional() },
  async (a) => {
    const { value } = await luaFile("look", a);
    if (value?.error) return fail(value.error);
    const { rows, x1, y1, x2, y2, z: zz, units, buildings, map_size } = value;
    // column ruler every 10 tiles so coordinates can be read off the picture
    let ruler = "      ";
    for (let x = x1; x <= x2; x++) ruler += x % 10 === 0 ? "|" : " ";
    const body = rows.map((r, i) => String(y1 + i).padStart(5) + " " + r).join("\n");
    const tens = [];
    for (let x = x1; x <= x2; x++) if (x % 10 === 0) tens.push(x);
    const people = units.filter((u) => u.kind !== "other")
      .map((u) => `  ${u.kind === "hostile" ? "E" : "@"} ${u.x},${u.y} #${u.id} ${u.name}${u.job ? ` - ${u.job}` : ""}`);
    const critters = {};
    for (const u of units.filter((u) => u.kind === "other")) {
      const k = u.name.replace(/\s*\(.*\)$/, "");
      critters[k] = (critters[k] || 0) + 1;
    }
    const animals = Object.entries(critters).map(([k, n]) => (n > 1 ? `${n} ${k}` : k)).join(", ");
    const blds = buildings.map((b) => `  ${b.type}${b.name ? ` "${b.name}"` : ""} #${b.id} ${b.x},${b.y}` +
      (b.x2 !== b.x || b.y2 !== b.y ? `..${b.x2},${b.y2}` : "") + (b.built ? "" : " (unbuilt)"));
    return text(
      `z=${zz}  x ${x1}..${x2}  y ${y1}..${y2}  (map ${map_size.x}x${map_size.y}x${map_size.z}; | marks x=${tens.join(",")})\n` +
      `${ruler}\n${body}\n\nunits:\n${people.join("\n") || "  none"}\nanimals: ${animals || "none"}\n` +
      `buildings:\n${blds.join("\n") || "  none"}`);
  });

// ---------- designate (quickfort) ----------
async function quickfort(mode, rows, x, y, zz, extra = []) {
  const name = `last-${mode}`;
  const file = writeBlueprint(name, `#${mode}\n${rows.join("\n")}\n`);
  const out = await command("quickfort", ["run", file, "-c", `${x},${y},${zz}`, ...extra]);
  return out.trim() || "(no output)";
}

const DIG_KEYS = { dig: "d", channel: "h", up_stair: "u", down_stair: "j", updown_stair: "i", ramp: "r",
  remove_stairs: "z", chop: "t", gather: "p", smooth: "s", engrave: "e", fortify: "F", undesignate: "x" };

tool("df_dig", "Designate a rectangle for digging (or channel/stairs/ramp/chop/gather/smooth/undesignate). x1,y1 to x2,y2 inclusive on level z. levels>1 repeats the same rectangle DOWNWARD (useful for updown_stair shafts). Unrevealed tiles can be designated.",
  {
    kind: z.enum(Object.keys(DIG_KEYS)).default("dig"),
    x1: coord, y1: coord, x2: coord, y2: coord, z: coord,
    levels: z.number().int().min(1).max(100).optional(),
    priority: z.number().int().min(1).max(7).optional(),
  },
  async (a) => {
    const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1) + 1, h = Math.abs(a.y2 - a.y1) + 1;
    const extra = [];
    if (a.levels > 1) extra.push("-r", `down,${a.levels}`);
    if (a.priority) extra.push("-p", String(a.priority));
    return text(await quickfort("dig", [`${DIG_KEYS[a.kind]}(${w}x${h})`], x, y, a.z, extra));
  });

tool("df_build", "Place a building with a quickfort #build key (see df_help). Multi-tile buildings like workshops ('wc' carpenter, 'wm' mason, 'wl' still, 'wz' kitchen, 'ww' farmer, 'wr' craftsdwarf, 'D' trade depot) are placed by their CENTRE tile. Give w,h for area buildings (farm plot 'p', roads, constructions 'Cw' wall / 'Cf' floor), then x,y is the top-left.",
  { key: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1).optional(), h: z.number().int().min(1).optional(),
    name: z.string().optional() },
  async (a) => {
    let cell = a.key;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    if (a.w || a.h) cell += `(${a.w ?? 1}x${a.h ?? 1})`;
    return text(await quickfort("build", [cell], a.x, a.y, a.z));
  });

tool("df_stockpile", "Create a stockpile rectangle. type is one or more #place letters: a animal, f food, u furniture, n coins, y corpses, r refuse, s stone, w wood, e gems, b bars/blocks, h cloth, l leather, z ammo, S sheets, g finished goods, p weapons, d armor, c custom. e.g. 'fw' = food+wood.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1), name: z.string().optional() },
  async (a) => {
    let cell = a.type;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    return text(await quickfort("place", [`${cell}(${a.w}x${a.h})`], a.x, a.y, a.z));
  });

tool("df_zone", "Create a zone rectangle. type: m meeting area, b bedroom, h dining hall, n pasture, p pit/pond, w water source, f fishing, o office, D dormitory, B barracks, d garbage dump, T tomb, g gather fruit, s sand, c clay. Optional location: tavern, hospital, temple, library, guildhall.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1),
    name: z.string().optional(), location: z.enum(["tavern", "hospital", "temple", "library", "guildhall"]).optional() },
  async (a) => {
    const props = [];
    if (a.name) props.push(`name="${a.name.replace(/"/g, "")}"`);
    if (a.location) props.push(`location=${a.location}`);
    const cell = a.type + (props.length ? `{${props.join(" ")}}` : "") + `(${a.w}x${a.h})`;
    return text(await quickfort("zone", [cell], a.x, a.y, a.z));
  });

tool("df_blueprint", "Apply a free-form quickfort blueprint. rows are CSV lines (cells separated by commas) starting at x,y,z as the top-left. Use for irregular shapes. dry_run reports what would happen without changing the game.",
  { mode: z.enum(["dig", "build", "place", "zone"]), rows: z.array(z.string()).min(1),
    x: coord, y: coord, z: coord, dry_run: z.boolean().optional() },
  async (a) => text(await quickfort(a.mode, a.rows, a.x, a.y, a.z, a.dry_run ? ["--dry-run"] : [])));

// ---------- production ----------
tool("df_order", "Queue a manager work order, e.g. job=BrewDrink amount=20, MakeBed 5, ConstructTable 4, MakeBarrel, ConstructBlocks. Omit job to list current orders. Use df_cmd 'workorder -l <filter>' to find job names.",
  { job: z.string().optional(), amount: z.number().int().min(1).max(1000).optional() },
  async (a) => {
    if (!a.job) return luaTool("orders");
    const out = await command("workorder", [a.job, String(a.amount ?? 1)]);
    return text(out.trim() || `Queued ${a.amount ?? 1} x ${a.job}`);
  });

// ---------- people & management ----------
tool("df_unit", "Detailed view of one unit: unmet needs, recent emotions, wounds, inventory, all skills, enabled labors.",
  { unit_id: z.number().int() }, (a) => luaTool("unit", a));

tool("df_noble", "Fort positions. action=list shows every position and holder. action=appoint gives position (e.g. MANAGER, BOOKKEEPER, BROKER, CHIEF_MEDICAL_DWARF, MILITIA_COMMANDER, SHERIFF) to unit_id; action=remove vacates it. A MANAGER is required before work orders run.",
  { action: z.enum(["list", "appoint", "remove"]).default("list"), position: z.string().optional(), unit_id: z.number().int().optional() },
  (a) => luaTool("noble", a));

tool("df_labor", "Labors and work details. action=list shows work details (members, labors) and every citizen's enabled labors. enable/disable toggle labors (e.g. MINE, CUTWOOD, HAUL_FOOD, BREWER, COOK, CARPENTER, MASON, PLANT) for unit_id. detail_add/detail_remove put unit_id in a named work detail (e.g. 'Miners') and apply its labors.",
  { action: z.enum(["list", "enable", "disable", "detail_add", "detail_remove"]).default("list"),
    unit_id: z.number().int().optional(), labors: z.array(z.string()).optional(), detail: z.string().optional() },
  (a) => luaTool("labor", a));

tool("df_rooms", "Zones. action=list shows all zones (bedrooms, dining halls, offices, pastures...) with owners. action=assign gives zone_id to unit_id; unassign clears the owner.",
  { action: z.enum(["list", "assign", "unassign"]).default("list"), zone_id: z.number().int().optional(), unit_id: z.number().int().optional() },
  (a) => luaTool("rooms", a));

tool("df_crop", "Farming. action=list shows farm plots with crops per season and seeds in stock (with underground/surface and growing seasons). action=set makes plot_id grow plant (id or name, e.g. 'plump helmet', or 'fallow') in the given seasons (default all four).",
  { action: z.enum(["list", "set"]).default("list"), plot_id: z.number().int().optional(), plant: z.string().optional(),
    seasons: z.array(z.enum(["spring", "summer", "autumn", "winter"])).optional() },
  (a) => luaTool("crop", a));

tool("df_stocks", "Item inventory. No args: totals per item type. type=<ITEM_TYPE> (e.g. BAR, BLOCKS, WEAPON, TOOL, BARREL, BED) and/or search=<text> (e.g. 'pick', 'iron', 'plump helmet'): breakdown by item plus some locations.",
  { type: z.string().optional(), search: z.string().optional() }, (a) => luaTool("stocks", a));

tool("df_military", "Squads. list: squads, members, orders and leader positions. create: make a squad led by the holder of position (default MILITIA_COMMANDER; appoint with df_noble first). add/remove: unit_id into squad_id / out of its squad. station: send squad_id to x,y,z. kill: attack unit_ids. cancel: clear squad_id's orders.",
  { action: z.enum(["list", "create", "add", "remove", "station", "kill", "cancel"]).default("list"),
    squad_id: z.number().int().optional(), unit_id: z.number().int().optional(), position: z.string().optional(),
    name: z.string().optional(), unit_ids: z.array(z.number().int()).optional(),
    x: optCoord, y: optCoord, z: optCoord },
  (a) => luaTool("military", a));

tool("df_workshop", "Workshops and furnaces. action=list shows each with queued jobs (pass building_id or show_tasks=true to see task names it accepts). action=add queues a task directly at building_id, like the in-game Add task button (no manager needed): task is a name or substring (e.g. 'bed', 'barrel', 'brew', 'prepare easy meal', 'rock table'); count up to 10; repeat=true keeps redoing it. action=cancel removes the job at index.",
  { action: z.enum(["list", "add", "cancel"]).default("list"), building_id: z.number().int().optional(),
    task: z.string().optional(), count: z.number().int().min(1).max(10).optional(), repeat: z.boolean().optional(),
    index: z.number().int().optional(), show_tasks: z.boolean().optional(), filter: z.string().optional() },
  (a) => luaTool("workshop", a));

tool("df_animals", "Livestock and pets. list: own animals (race, sex, age, grazer/milkable/egg-layer, pasture, training) and pastures/ponds. pasture: put unit_id/unit_ids into pen zone_id (make one with df_zone type n). unpasture, slaughter / unslaughter (butcher marks), train (assign a trainer). Grazers starve without a grassy pasture.",
  { action: z.enum(["list", "pasture", "unpasture", "slaughter", "unslaughter", "train"]).default("list"),
    unit_id: z.number().int().optional(), unit_ids: z.array(z.number().int()).optional(), zone_id: z.number().int().optional() },
  (a) => luaTool("animals", a));

tool("df_standing", "Standing orders (Labor > Standing orders). No args lists all (gather_refuse, auto_butcher, auto_kitchen, dump_corpses, forbid_used_ammo, zoneonly_drink...). name + value (0/1, or true/false) changes one.",
  { name: z.string().optional(), value: z.union([z.number().int(), z.boolean()]).optional() },
  (a) => luaTool("standing", a));

tool("df_jobs", "Every job in the fort (the Tasks screen). list: summary counts plus jobs (filter by name substring, limit). cancel / suspend / resume / do_now act on job_id.",
  { action: z.enum(["list", "cancel", "suspend", "resume", "do_now"]).default("list"),
    job_id: z.number().int().optional(), filter: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
  (a) => luaTool("jobs", a));

tool("df_burrow", "Burrows and the civilian alert. list: burrows and alerts. create (name). add_rect / remove_rect: tiles x1,y1..x2,y2 on z (or z1..z2) for burrow (name or id). add_units / remove_units (unit_ids or all_citizens=true), clear_tiles, clear_units. alert_on burrow=<name>: civilians stay inside it (use in sieges); alert_off ends it.",
  { action: z.enum(["list", "create", "add_rect", "remove_rect", "clear_tiles", "add_units", "remove_units", "clear_units", "alert_on", "alert_off"]).default("list"),
    burrow: z.union([z.string(), z.number().int()]).optional(), name: z.string().optional(),
    x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord, z: optCoord, z1: optCoord, z2: optCoord,
    unit_ids: z.array(z.number().int()).optional(), all_citizens: z.boolean().optional() },
  (a) => luaTool("burrow", a));

tool("df_trade", "Trading. status: caravans on the map, depots, broker, whether the trade screen is open. send: mark goods to haul to the depot by search text (e.g. 'crafts', 'mug', 'leather') or item_ids, up to limit. With the in-game trade screen open: screen lists merchant and fort goods with values and indices; select / deselect toggle indices on side merchant|fort and report selected totals. Proposing the deal (Trade button) is done on the screen.",
  { action: z.enum(["status", "send", "screen", "select", "deselect"]).default("status"),
    search: z.string().optional(), item_ids: z.array(z.number().int()).optional(), limit: z.number().int().optional(),
    depot_id: z.number().int().optional(), side: z.enum(["merchant", "fort"]).optional(),
    indices: z.array(z.number().int()).optional(), show_contained: z.boolean().optional() },
  (a) => luaTool("trade", a));

tool("df_justice", "Crimes involving the fort: type, criminal, accused, victim, witnesses, punishment. Use df_cmd 'justice' for convicts serving sentences and 'justice pardon --unit <id>' to pardon.",
  {}, () => luaTool("justice"));

// ---------- time ----------
async function tick() {
  const { value } = await lua(
    `local r = df.global.world.status.reports
     emit({abs = df.global.cur_year * 403200 + df.global.cur_year_tick, paused = df.global.pause_state,
           last = #r > 0 and r[#r-1].id or -1})`);
  return value;
}
const setPause = (p) => lua(`df.global.pause_state = ${p ? "true" : "false"} emit(true)`);

tool("df_wait", "Unpause and let the game run for a number of in-game days (1 day = 1200 ticks), then pause again and report new announcements. Stops early if the game pauses itself (sieges, moods, etc.). Capped at ~50 s real time per call.",
  { days: z.number().min(0.1).max(28).default(1) },
  async (a) => {
    const start = await tick();
    if (start.abs === undefined) return fail("No game state");
    const target = start.abs + Math.round(a.days * 1200);
    await setPause(false);
    const t0 = Date.now();
    let now = start, reason = "done";
    while (true) {
      await new Promise((r) => setTimeout(r, 700));
      now = await tick();
      if (now.abs >= target) break;
      if (now.paused) { reason = "game paused itself (check announcements)"; break; }
      if (Date.now() - t0 > 50000) { reason = "real-time cap reached; call df_wait again to continue"; break; }
    }
    await setPause(true);
    const ran = (now.abs - start.abs) / 1200;
    const { value: ann } = await luaFile("announcements", { since: start.last, limit: 25 });
    const msgs = (ann?.messages ?? []).map((m) => `- ${m.text}`).join("\n");
    return text(`Ran ${ran.toFixed(2)} days in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${reason}. Paused.\n` +
      (msgs ? `New announcements:\n${msgs}` : "No new announcements."));
  });

tool("df_pause", "Pause the game.", {}, async () => { await setPause(true); return text("Paused."); });
tool("df_resume", "Unpause the game and leave it running (prefer df_wait for controlled steps).", {},
  async () => { await setPause(false); return text("Running."); });

// ---------- misc ----------
tool("df_view", "Move the player's camera to x,y,z so they can see what you are looking at.",
  { x: coord, y: coord, z: coord },
  async (a) => {
    await lua(`dfhack.gui.revealInDwarfmodeMap(xyz2pos(ARGS.x, ARGS.y, ARGS.z), true, true) emit(true)`, a);
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
wn tanner, we leatherworks, wr craftsdwarf, wf metalsmith (forge), wj jeweler, wt mechanic, wo loom, wk clothier,
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

// ---------- run ----------
const transport = new StdioServerTransport();
await server.connect(transport);
