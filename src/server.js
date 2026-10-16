#!/usr/bin/env node
// MCP server: play Dwarf Fortress through DFHack.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { command, lua, luaFile, writeBlueprint } from "./dfhack.js";

const INSTRUCTIONS = `You are the overseer of a live Dwarf Fortress fort, acting through DFHack.
Coordinates are map tiles: x east, y south, z UP (higher z = closer to the sky). Underground is lower z.
Loop: df_alerts -> df_status -> df_problems -> df_look (around the area you will change) -> ONE action -> df_wait -> verify.
Digging/building only designates work; dwarves do it while the game runs (df_wait).
df_look glyphs: ? unrevealed, # stone wall, % soil wall, * ore/gem vein, . floor, , grass, ' ' open air,
^ ramp, v ramp top, < > X stairs up/down/both, T tree, o boulder, ~ deep water, 1-3 shallow water, ! magma,
lowercase d h u j i r = pending dig designation, @ citizen, E hostile, a other creature,
W workshop, S stockpile, P farm plot, B bed, D door, K table, C chair/box/cabinet, c unfinished building.
Workshops are 3x3 and placed by their CENTRE tile; farm plots, stockpiles and zones take a top-left corner + size.
Farm plots need soil/mud floor underground or any soil surface. Check df_help for building keys.
Production: df_order (manager work orders; needs a MANAGER, run df_noble repair if orders never validate) or df_workshop action=add (direct workshop tasks, no manager needed). Reactions (soap, brewing, lye-based, many crafts) are most reliable as df_order reaction=...: hand-built workshop reaction jobs can miss reagents that come in containers (e.g. lye in a bucket). Prefer native tasks
("construct bed", "make barrel", "brew drink from plant") over "make wooden ..." reactions.
Farm plots reset to fallow when construction finishes: set crops with df_crop AFTER the plot is built.
People: df_unit (detail), df_labor (labors/work details), df_noble (appoint MANAGER, MILITIA_COMMANDER...),
df_rooms (assign bedrooms/offices), df_military (squads: create, add, station, kill, cancel).
Animals: df_animals (pastures, slaughter, training). df_standing (standing orders). df_jobs (all tasks).
Emergencies: df_burrow alert_on burrow=Safety keeps civilians inside; alert_off afterwards.
Trade: df_trade (caravans, send goods to depot, select on the open trade screen). df_justice (crimes).
Defence: df_levers (link/pull), df_military uniform/train/barracks, df_schedule (monthly orders, patrol routes, alert switch: alert ready when attacked). Staff: df_location (hospital doctors, tavern keeper/performers). df_mood for strange moods. df_pile (stockpile presets and links), df_kitchen, df_auto (automation plugins).
Screen: df_screen read/find/click/key handles pop-ups and any screen without a tool; the game pauses while menus are open.
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
// Orders without a material never get dispatched (the game's own UI always sets one), so pick a
// sensible default per job and let the caller override it.
const WOOD_JOBS = /^(ConstructBed|MakeBarrel|ConstructChest|ConstructBin|MakeBucket|ConstructCabinet|ConstructCoffin|ConstructWeaponRack|ConstructArmorStand|ConstructHatchCover|ConstructSplint|ConstructCrutch|MakeCage|MakeAnimalTrap|ConstructGrate|ConstructFloodgate)$/;
const STONE_JOBS = /^(ConstructTable|ConstructThrone|ConstructDoor|ConstructStatue|ConstructSlab|ConstructQuern|ConstructMillstone|MakeGoblet|MakeCrafts|ConstructBlocks|ConstructBox|ConstructMechanisms)$/;
const CATEGORY_MATS = ["wood", "plant", "cloth", "silk", "leather", "bone", "shell", "yarn", "tooth", "horn", "pearl", "soap"];

tool("df_order", "Queue a manager work order (needs a MANAGER; df_noble repair if the game says one is required). job is a df.job_type name, e.g. ConstructBed, MakeBarrel, ConstructTable, ConstructThrone, ConstructDoor, BrewDrink, PrepareMeal, ConstructBlocks. material: wood, stone, bone, leather, cloth, ... (defaults: wood for carpenter jobs, stone for mason jobs). repeat: daily/weekly/monthly/seasonally/yearly. Metal gear: job MakeArmor/MakeHelm/MakePants/MakeGloves/MakeShoes/MakeShield/MakeWeapon with item_subtype (ITEM_ARMOR_BREASTPLATE, ITEM_ARMOR_MAIL_SHIRT, ITEM_HELM_HELM, ITEM_PANTS_GREAVES, ITEM_GLOVES_GAUNTLETS, ITEM_SHOES_BOOTS, ITEM_SHIELD_SHIELD, ITEM_WEAPON_AXE_BATTLE, ITEM_WEAPON_SPEAR, ITEM_WEAPON_PICK...) and material INORGANIC:IRON. Brewing, cooking and many crafts are reactions: pass reaction instead of job (BREW_DRINK_FROM_PLANT, BREW_DRINK_FROM_PLANT_GROWTH, MAKE_SOAP...). Omit job to list orders; cancel_id removes an order (and its pending jobs). df_cmd 'workorder -l <filter>' lists job names.",
  { job: z.string().optional(), reaction: z.string().optional(), item_subtype: z.string().optional(), amount: z.number().int().min(1).max(1000).optional(), material: z.string().optional(),
    repeat: z.enum(["daily", "weekly", "monthly", "seasonally", "yearly"]).optional(),
    cancel_id: z.number().int().optional() },
  async (a) => {
    if (a.cancel_id !== undefined) {
      const { value } = await lua(
        `local id = ${a.cancel_id}
         local orders = df.global.world.manager_orders.all
         for i = #orders - 1, 0, -1 do
           if orders[i].id == id then
             local jobs = 0
             for _, j in require('utils').listpairs(df.global.world.jobs.list) do
               if j.order_id == id and not j.flags.working then dfhack.job.removeJob(j) jobs = jobs + 1 end
             end
             orders:erase(i)
             emit({cancelled = id, jobs_removed = jobs}) return
           end
         end
         emit({error = 'no order ' .. id})`);
      return text(JSON.stringify(value, null, 1));
    }
    if (a.reaction) { a.job = "CustomReaction"; }
    if (!a.job) return luaTool("orders");
    const order = { job: a.job, amount_total: a.amount ?? 1 };
    if (a.reaction) order.reaction = a.reaction.toUpperCase();
    if (a.item_subtype) order.item_subtype = a.item_subtype.toUpperCase();
    const mat = (a.material || (WOOD_JOBS.test(a.job) ? "wood" : STONE_JOBS.test(a.job) ? "stone" : "")).toLowerCase();
    if (CATEGORY_MATS.includes(mat)) order.material_category = [mat];
    else if (mat === "stone" || mat === "rock") order.material = "INORGANIC";
    else if (mat) order.material = mat.toUpperCase();
    if (a.repeat) order.frequency = a.repeat[0].toUpperCase() + a.repeat.slice(1);
    const out = await command("workorder", [JSON.stringify(order)]);
    return text((out.trim() || "Queued") + `\norder: ${JSON.stringify(order)}`);
  });

// ---------- people & management ----------
tool("df_unit", "Detailed view of one unit: unmet needs, recent emotions, wounds, inventory, all skills, enabled labors.",
  { unit_id: z.number().int() }, (a) => luaTool("unit", a));

tool("df_noble", "Fort positions. action=list shows every position and holder. action=appoint gives position (e.g. MANAGER, BOOKKEEPER, BROKER, CHIEF_MEDICAL_DWARF, MILITIA_COMMANDER, SHERIFF) to unit_id; action=remove vacates it. action=repair rebuilds the responsibility index DF uses to find its manager/broker (run it if the Work orders screen says a manager is required). A MANAGER is required before work orders run.",
  { action: z.enum(["list", "appoint", "remove", "repair"]).default("list"), position: z.string().optional(), unit_id: z.number().int().optional() },
  (a) => luaTool("noble", a));

tool("df_labor", "Labors and work details. action=list shows work details (members, labors) and every citizen's enabled labors. enable/disable toggle labors (e.g. MINE, CUTWOOD, HAUL_FOOD, BREWER, COOK, CARPENTER, MASON, PLANT) for unit_id. detail_add/detail_remove put unit_id in a named work detail (e.g. 'Miners') and apply its labors.",
  { action: z.enum(["list", "enable", "disable", "detail_add", "detail_remove", "apply"]).default("list"),
    unit_id: z.number().int().optional(), labors: z.array(z.string()).optional(), detail: z.string().optional() },
  async (a) => {
    if (a.action !== "apply") {
      const res = await luaTool("labor", a);
      if (res.isError || !a.action.startsWith("detail")) return res;
    }
    // The game only re-applies a work detail (labors AND tool assignment: picks/axes) when its mode is
    // changed in the Labor screen. Replay that: open Labor, select the detail, flip mode away and back.
    const scr = (args) => luaFile("screen", args);
    const detail = a.detail || "Miners";
    await scr({ action: "key", keys: ["D_LOCATIONS"] });
    await scr({ action: "click", text: "Labor", occurrence: 1 });
    const { value: hits } = await scr({ action: "find", text: detail });
    const row = (hits?.hits ?? []).sort((p, q) => p.x - q.x)[0];
    if (!row) { await scr({ action: "key", keys: ["LEAVESCREEN"] }); return fail(`work detail "${detail}" not found on the Labor screen`); }
    await scr({ action: "click", x: row.x + 1, y: row.y });
    await scr({ action: "click", text: "Nobody does this" });
    await scr({ action: "click", text: "Only selected do this" });
    await scr({ action: "key", keys: ["LEAVESCREEN"] });
    return text(`Re-applied work detail "${detail}" through the Labor screen (labors and tool assignment updated).`);
  });

tool("df_rooms", "Zones. action=list shows all zones with owners. action=assign gives zone_id to unit_id; unassign clears the owner. action=audit checks EVERY zone against the wiki requirements (required furniture per zone type, owners, overlaps that zero room value, room quality rank, tavern/temple/hospital/library needs incl. dance floor and stocked goblets/instruments/supplies, staff) , every noble's room demands, and untidy stockpiles (fragmented, stray, on stairs). Run audit after building or changing rooms. action=bedroom_wing builds a tidy wing of private 3x3 bedrooms either side of a corridor (z, x1=west end, y=corridor row, per_side, shaft_x to keep clear): phase dig, then furnish (door/bed/cabinet/chest), then zone (zones + assigns adults without a room).",
  { action: z.enum(["list", "assign", "unassign", "audit", "bedroom_wing"]).default("list"), zone_id: z.number().int().optional(), unit_id: z.number().int().optional(),
    phase: z.enum(["dig", "furnish", "zone"]).optional(), z: optCoord, x1: optCoord, y: optCoord, per_side: z.number().int().min(1).max(15).optional(),
    shaft_x: optCoord, priority: z.number().int().min(1).max(7).optional() },
  async (a) => {
    if (a.action === "audit") return luaTool("audit", a);
    if (a.action !== "bedroom_wing") return luaTool("rooms", a);
    // A tidy wing of private 3x3 bedrooms either side of a corridor (row y), each with a doorway.
    // Rooms skip the column of a stair shaft at shaft_x. Run phase dig, then furnish, then zone.
    const Z = a.z, Y = a.y ?? 97, X1 = a.x1 ?? 84, N = a.per_side ?? 10, SX = a.shaft_x ?? 104, P = a.priority ?? 3;
    if (Z === undefined) return fail("bedroom_wing needs z");
    const rooms = [];
    for (let x = X1; rooms.length < N; x += 4) {
      if (x <= SX + 1 && x + 2 >= SX - 1) x = SX + 2; // keep the shaft clear with a wall either side
      rooms.push(x);
    }
    const xEnd = rooms[rooms.length - 1] + 2;
    const log = [];
    const dig = async (kind, x1, y1, x2, y2) => {
      const out = await quickfort("dig", [`${DIG_KEYS[kind]}(${x2 - x1 + 1}x${y2 - y1 + 1})`], x1, y1, Z, ["-p", String(P)]);
      return out;
    };
    if (a.phase === "dig" || !a.phase) {
      await dig("dig", X1, Y, xEnd, Y);
      for (const x of rooms) {
        await dig("dig", x, Y - 4, x + 2, Y - 2); await dig("dig", x + 1, Y - 1, x + 1, Y - 1);
        await dig("dig", x, Y + 2, x + 2, Y + 4); await dig("dig", x + 1, Y + 1, x + 1, Y + 1);
      }
      await quickfort("dig", ["i"], SX, Y, Z, ["-p", "1"]); // re-assert the shaft after the corridor dig
      log.push(`dig: corridor x${X1}-${xEnd} y${Y} and ${rooms.length * 2} rooms on z${Z}; shaft at ${SX},${Y}`);
    }
    if (a.phase === "furnish") {
      for (const x of rooms) {
        await quickfort("build", ["b,,f", ",,", ",,h", ",d,"], x, Y - 4, Z);
        await quickfort("build", [",d,", ",,h", ",,", "b,,f"], x, Y + 1, Z);
      }
      log.push(`furnish: door, bed, cabinet, chest placed in ${rooms.length * 2} rooms (they build as items exist)`);
    }
    if (a.phase === "zone") {
      let n = 0, made = 0;
      const names = [];
      // re-running must not stack a second zone on a room that already has one (overlaps zero room value)
      const { value: before } = await lua(
        `local t = {} for _, z in ipairs(df.global.world.buildings.other.ACTIVITY_ZONE) do
           if z.type == df.civzone_type.Bedroom and z.z == ${Z} then t[#t + 1] = z.x1 .. ',' .. z.y1 end end emit(t)`);
      const existing = new Set(before ?? []);
      for (const x of rooms) for (const yy of [Y - 4, Y + 2]) {
        n++; const name = `Bedroom ${Z}-${n}`; names.push(name);
        if (existing.has(`${x},${yy}`)) continue;
        await quickfort("zone", [`b{name="${name}"}(3x3)`], x, yy, Z); made++;
      }
      // assign to adults without a bedroom
      const { value: zl } = await luaFile("rooms", { action: "list" });
      const owned = new Set((zl?.zones ?? []).filter((q) => q.type === "Bedroom" && q.owner).map((q) => q.owner));
      const free = (zl?.zones ?? []).filter((q) => names.includes(q.name) && !q.owner);
      const { value: ul } = await luaFile("units", {});
      const homeless = (ul?.citizens ?? []).filter((u) => !u.child && !owned.has(u.name));
      let assigned = 0;
      for (let i = 0; i < free.length && i < homeless.length; i++) {
        await luaFile("rooms", { action: "assign", zone_id: free[i].id, unit_id: homeless[i].id }); assigned++;
      }
      log.push(`zone: ${made} new of ${names.length} bedroom zones (existing kept); assigned ${assigned} to adults without a room`);
    }
    return text(log.join("\n") + "\nRun df_rooms action=audit afterwards.");
  });

tool("df_crop", "Farming. action=list shows farm plots with crops per season and seeds in stock (with underground/surface and growing seasons). action=set makes plot_id grow plant (id or name, e.g. 'plump helmet', or 'fallow') in the given seasons (default all four).",
  { action: z.enum(["list", "set"]).default("list"), plot_id: z.number().int().optional(), plant: z.string().optional(),
    seasons: z.array(z.enum(["spring", "summer", "autumn", "winter"])).optional() },
  (a) => luaTool("crop", a));

tool("df_stocks", "Item inventory. No args: totals per item type. type=<ITEM_TYPE> (e.g. BAR, BLOCKS, WEAPON, TOOL, BARREL, BED) and/or search=<text> (e.g. 'pick', 'iron', 'plump helmet'): breakdown by item plus some locations.",
  { type: z.string().optional(), search: z.string().optional() }, (a) => luaTool("stocks", a));

tool("df_military", "Squads. list: squads, members, orders and leader positions. create: make a squad led by the holder of position (default MILITIA_COMMANDER; appoint with df_noble first). add/remove: unit_id into squad_id / out of its squad. uniform: apply a uniform template (template = name or id, e.g. 'melee, leather armor', 'melee, metal armor', 'crossbows, leather armor') to every position of squad_id. train: routine off|staggered|constant|ready. barracks: assign zone_id (a type B zone) for training (sleep=true to also sleep there). station: send squad_id to x,y,z. kill: attack unit_ids. cancel: clear squad_id's orders.",
  { action: z.enum(["list", "create", "add", "remove", "uniform", "train", "barracks", "station", "kill", "cancel"]).default("list"),
    template: z.string().optional(), routine: z.enum(["off", "staggered", "constant", "ready"]).optional(),
    zone_id: z.number().int().optional(), sleep: z.boolean().optional(), train: z.boolean().optional(), replace_clothing: z.boolean().optional(),
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

tool("df_trade", "Trading. status: caravans on the map, depots, broker, whether the trade screen is open. send: mark goods to haul to the depot by search text (e.g. 'crafts', 'mug', 'leather') or item_ids, up to limit. With the in-game trade screen open: screen lists merchant and fort goods with values and indices; select / deselect toggle indices on side merchant|fort and report selected totals. request_broker: call the broker to the depot. open: open the trade screen once the broker is there. propose: press Trade (and confirm), returning the merchant reply and Value/Profit/Weight footer. close: leave the trade screen (Esc does not; time stays frozen while it is open). Merchants want a clear profit and refuse loads over their carrying weight.",
  { action: z.enum(["status", "send", "request_broker", "open", "screen", "select", "deselect", "propose", "close"]).default("status"),
    search: z.string().optional(), item_ids: z.array(z.number().int()).optional(), limit: z.number().int().optional(),
    depot_id: z.number().int().optional(), side: z.enum(["merchant", "fort"]).optional(),
    indices: z.array(z.number().int()).optional(), show_contained: z.boolean().optional() },
  async (a) => {
    // the screen's own verdict: merchant line plus the Value / Trader Profit / Weight footer
    const verdict = async () => {
      const top = (await luaFile("screen", { action: "read", y1: 4, y2: 12 })).value?.lines ?? [];
      const { value } = await luaFile("screen", { action: "read" });
      const lines = value?.lines ?? [];
      const foot = lines.filter((l) => /Mark all|Trader Profit|(Allowed|Excess) Weight/.test(l)).map((l) => l.replace(/^\s*\d+\|/, "").replace(/\s{3,}/g, "   ").trim());
      return `${top.map((l) => l.replace(/^\s*\d+\|\s*/, "")).join("\n")}\n${foot.join("\n")}`;
    };
    const openDepot = async () => {
      const { value: st } = await luaFile("trade", { action: "status" });
      const depot = (st?.depots ?? [])[0];
      if (!depot) return null;
      await lua(`local v=df.global.game.main_interface.view_sheets v.open=true v.active_sheet=df.view_sheet_type.BUILDING v.active_id=${depot.id} v.active_sub_tab=0 emit(true)`);
      return depot;
    };
    if (a.action === "request_broker") {
      // The game only creates the broker's depot job when the button is clicked, not when the flag is set.
      const depot = await openDepot();
      if (!depot) return fail("No trade depot");
      await lua(`df.building.find(${depot.id}).trade_flags.trader_requested=false emit(true)`);
      await luaFile("screen", { action: "click", text: "Broker requested at depot" });
      await luaFile("screen", { action: "key", keys: ["LEAVESCREEN"] });
      return text("Broker requested at the depot (via the depot button). Run df_wait until the broker arrives, then action=open.");
    }
    if (a.action === "open") {
      const depot = await openDepot();
      if (!depot) return fail("No trade depot");
      const { value: f } = await luaFile("screen", { action: "find", text: "Trade" });
      const btn = (f?.hits ?? []).filter((h) => h.y > 8 && h.y < 25)[0];
      if (!btn) return fail("No Trade button on the depot panel (is a caravan at the depot and the broker there?)");
      await luaFile("screen", { action: "click", x: btn.x + 2, y: btn.y });
      const { value: v } = await luaFile("trade", { action: "status" });
      return text(v?.trade_screen_open ? "Trade screen open. Use action=screen, select, propose." : "Trade screen did not open (broker not at the depot yet?)");
    }
    if (a.action === "propose") {
      // the bottom-row "Trade" button, not "[Ctrl+t: DFHack trade UI]"
      const { value: f } = await luaFile("screen", { action: "find", text: "Trade" });
      const btn = (f?.hits ?? []).filter((h) => h.y > 60).sort((p, q) => q.y - p.y)[0];
      if (!btn) return fail("Trade button not found: is the trade screen open?");
      await luaFile("screen", { action: "click", x: btn.x + 2, y: btn.y });
      const { value: s } = await luaFile("screen", { action: "read", y1: 0, y2: 1 });
      if (s?.focus?.some((x) => x.includes("MessageBox"))) await luaFile("screen", { action: "key", keys: ["SELECT"] });
      return text(`Proposed the trade. Merchant says:\n${await verdict()}\n(Excess Weight = offer lighter goods or buy heavier ones; "not enough" = offer more or take less.)`);
    }
    const res = await luaTool("trade", a);
    if (!res.isError && (a.action === "select" || a.action === "deselect")) res.content[0].text += `\n--- screen ---\n${await verdict()}`;
    return res;
  });

tool("df_justice", "Crimes involving the fort: type, criminal, accused, victim, witnesses, punishment. Use df_cmd 'justice' for convicts serving sentences and 'justice pardon --unit <id>' to pardon.",
  {}, () => luaTool("justice"));

tool("df_screen", "The game's UI as text, plus input. read: the screen as numbered text lines (graphics-only map cells are blank; region via x1,y1,x2,y2) and the focus string. find: grid coordinates of text. key: press interface keys (LEAVESCREEN = Esc, SELECT = Enter, STANDARDSCROLL_UP/DOWN, CUSTOM_* letters). click: left-click at x,y or on a text label (e.g. text='Okay', occurrence=n); right=true for right-click. Use it for pop-ups, the trade screen and anything without a dedicated tool; read again after acting.",
  { action: z.enum(["read", "find", "key", "click"]).default("read"), text: z.string().optional(),
    keys: z.array(z.string()).optional(), x: optCoord, y: optCoord, occurrence: z.number().int().min(1).optional(),
    right: z.boolean().optional(), x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord },
  async (a) => {
    const { value } = await luaFile("screen", a);
    if (value?.error) return fail(value.error);
    if (value.lines) return text(`focus: ${value.focus.join(" | ")}  paused: ${value.paused}  (${value.size.w}x${value.size.h})\n${value.lines.join("\n")}`);
    return text(json(value));
  });

tool("df_levers", "Levers and mechanisms. list: levers (state, what each is linked to, pending jobs), buildings that can be linked (bridges, doors, hatches, floodgates, grates, bars, cages) and free mechanisms. link: queue the job linking lever_id to target_id (uses 2 mechanisms). pull: queue a dwarf to pull lever_id (urgent=true for top priority). Build a lever with df_build key=Tl; a drawbridge with key g / gw / gd / gx / ga.",
  { action: z.enum(["list", "link", "pull"]).default("list"), lever_id: z.number().int().optional(),
    target_id: z.number().int().optional(), urgent: z.boolean().optional() },
  (a) => luaTool("levers", a));

tool("df_mood", "Strange moods: which dwarf is in a mood, which workshop they claimed, and exactly which items they still need (runs DFHack showmood). Provide the materials quickly or the dwarf goes insane.",
  {}, async () => text((await command("showmood")).trim() || "No dwarf is in a strange mood."));

tool("df_dump", "Clear loose clutter (boulders by default) out of rooms: mark items on levels z (or z1..z2), optionally inside x1,y1..x2,y2, for dumping; dwarves haul them to a garbage dump zone (df_zone type d; a dump has no per-tile limit, so a small dump next to a mason's workshop keeps stone tidy and handy). Items already in stockpiles or dumps are skipped. count first, unmark to undo. types: df.items.other names, e.g. BOULDER, WOOD, BAR.",
  { action: z.enum(["count", "mark", "unmark"]).default("count"), z: optCoord, z1: optCoord, z2: optCoord,
    x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord, types: z.array(z.string()).optional() },
  (a) => luaTool("dump", a));

tool("df_pile", "Stockpile settings and links. status: every stockpile with stats. presets: list settings presets (library/cat_food, library/booze, library/cat_stone, library/ironore, library/plants, ...; search filters the list). apply: import preset into pile_id (mode set = replace, enable = add, disable = remove; filter = comma-separated substrings to touch only matching items). links: show pile/workshop links. link / unlink: pile_id gives to workshop_id (direction give) or takes products from it (direction take).",
  { action: z.enum(["status", "presets", "apply", "links", "link", "unlink"]).default("status"),
    pile_id: z.number().int().optional(), preset: z.string().optional(), search: z.string().optional(),
    mode: z.enum(["set", "enable", "disable"]).optional(), filter: z.string().optional(),
    workshop_id: z.number().int().optional(), direction: z.enum(["give", "take"]).optional() },
  async (a) => {
    if (a.action === "status") return text((await command("stockpiles", ["status"])).trim());
    if (a.action === "presets") return text((await command("stockpiles", ["list", ...(a.search ? [a.search] : [])])).trim());
    if (a.action === "apply") {
      if (a.pile_id === undefined || !a.preset) return fail("apply needs pile_id and preset");
      const args = ["import", a.preset, "-s", String(a.pile_id)];
      if (a.mode) args.push("-m", a.mode);
      if (a.filter) args.push("-f", a.filter);
      return text((await command("stockpiles", args)).trim() || `Applied ${a.preset} to stockpile ${a.pile_id}`);
    }
    return luaTool("piles", a);
  });

tool("df_kitchen", "Kitchen settings. list: current cook/brew exclusions. set: plant (name or id, e.g. 'plump helmet') with cook=true/false and/or brew=true/false. Tip: forbid cooking seed-bearing crops you need to replant, or enable the seedwatch automation.",
  { action: z.enum(["list", "set"]).default("list"), plant: z.string().optional(),
    cook: z.boolean().optional(), brew: z.boolean().optional() },
  (a) => luaTool("kitchen", a));

const AUTOMATION = {
  autolabor: "assign labors automatically (overrides manual labor settings)",
  autofarm: "pick crops by demand",
  seedwatch: "stop cooking/brewing plants whose seeds run low",
  autobutcher: "keep herds at a target size, slaughter the surplus",
  tailor: "make replacement clothing when it wears out",
  autoclothing: "keep a target amount of clothing per dwarf",
  suspendmanager: "suspend construction jobs that would trap dwarves or fail",
  autochop: "chop trees when wood runs low",
  autonestbox: "put egg-layers on nest boxes",
  autoslab: "engrave memorial slabs for ghosts",
  "dwarfvet": "let animals be treated in hospitals",
};
tool("df_auto", `Fort automation plugins. No args: status of each. enable / disable a plugin by name. Available: ${Object.entries(AUTOMATION).map(([k, v]) => `${k} (${v})`).join("; ")}.`,
  { action: z.enum(["status", "enable", "disable"]).default("status"), plugin: z.string().optional() },
  async (a) => {
    if (a.action === "status") {
      const out = await command("enable");
      const lines = out.split("\n").filter((l) => Object.keys(AUTOMATION).some((k) => l.includes(k)));
      return text(lines.join("\n") || out.trim());
    }
    if (!a.plugin || !(a.plugin in AUTOMATION)) return fail(`plugin must be one of ${Object.keys(AUTOMATION).join(", ")}`);
    const out = await command(a.action, [a.plugin]);
    return text(out.trim() || `${a.action}d ${a.plugin}`);
  });

tool("df_schedule", "Military schedules and alerts. Each squad has one schedule per alert routine (Off duty, Staggered training, Constant training, Ready), with orders per month. list: schedules (squad_id/routine to filter). set: for squad_id + routine, set months (list of month names, or omit for all) to order train | patrol (route_id) | defend (burrow name or id) | station (x,y,z) | off, with min_count soldiers (default all). alert: switch EVERY squad to a routine (e.g. 'ready' when under attack, 'staggered' after). routes / add_point (name,x,y,z) / add_route (name, point_ids) manage patrol waypoints.",
  { action: z.enum(["list", "set", "alert", "routes", "add_point", "add_route"]).default("list"),
    squad_id: z.number().int().optional(), routine: z.union([z.string(), z.number().int()]).optional(),
    months: z.array(z.string()).optional(), order: z.enum(["train", "patrol", "defend", "station", "off"]).optional(),
    route_id: z.number().int().optional(), burrow: z.union([z.string(), z.number().int()]).optional(),
    min_count: z.number().int().min(1).optional(), name: z.string().optional(),
    point_ids: z.array(z.number().int()).optional(), point_id: z.number().int().optional(),
    x: optCoord, y: optCoord, z: optCoord },
  (a) => luaTool("schedule", a));

tool("df_location", "Locations and their occupations. list: taverns, hospitals, temples, libraries, guildhalls with their zones and occupation slots (create a location with df_zone location=...). assign: give unit_id an occupation at location_id: DOCTOR, DIAGNOSTICIAN, SURGEON, BONE_DOCTOR (hospital), TAVERN_KEEPER, PERFORMER (tavern), SCHOLAR, SCRIBE (library). remove: clear unit_id (or occupation_id) from location_id. attach: put location_id on zone_id (a purpose-built room), detach_others=true to release its old zones; keeps name and staff.",
  { action: z.enum(["list", "assign", "remove", "attach"]).default("list"), location_id: z.number().int().optional(), zone_id: z.number().int().optional(), detach_others: z.boolean().optional(),
    unit_id: z.number().int().optional(), occupation: z.string().optional(), occupation_id: z.number().int().optional() },
  (a) => luaTool("location", a));

// ---------- time ----------
async function tick() {
  const { value } = await lua(
    `local r = df.global.world.status.reports
     emit({abs = df.global.cur_year * 403200 + df.global.cur_year_tick, paused = df.global.pause_state, pop = #citizens(),
           last = #r > 0 and r[#r-1].id or -1})`);
  return value;
}
const setPause = (p) => lua(`df.global.pause_state = ${p ? "true" : "false"} emit(true)`);
// Announcement popups ("X has bestowed the name..." etc.) freeze the clock until clicked away.
// Esc/Enter don't close them; clicking the on-screen Okay button does.
async function dismissPopup() {
  const count = async () => (await lua(`emit(#df.global.world.status.popups)`)).value ?? 0;
  const n = await count();
  if (!n) return { n: 0 };
  const { value: txt } = await lua(`emit(dfhack.df2utf(try(function() return df.global.world.status.popups[0].text end, '?')))`);
  const { value: f } = await luaFile("screen", { action: "find", text: "Okay" });
  const hit = f?.hits?.[0];
  if (hit) await luaFile("screen", { action: "click", x: hit.x + 1, y: hit.y });
  await new Promise((r) => setTimeout(r, 300));
  return { n, text: txt, after: await count() };
}

tool("df_wait", "Unpause and let the game run for a number of in-game days (1 day = 1200 ticks), then pause again and report new announcements. Stops early if the game pauses itself (sieges, moods, etc.). Capped at ~50 s real time per call.",
  { days: z.number().min(0.1).max(28).default(1) },
  async (a) => {
    const start = await tick();
    if (start.abs === undefined) return fail("No game state");
    const target = start.abs + Math.round(a.days * 1200);
    await setPause(false);
    const t0 = Date.now();
    let now = start, reason = "done", lastAbs = start.abs, lastMove = Date.now();
    const popups = [];
    while (true) {
      await new Promise((r) => setTimeout(r, 700));
      now = await tick();
      if (now.abs >= target) break;
      if (now.abs !== lastAbs) { lastAbs = now.abs; lastMove = Date.now(); }
      if (now.paused || Date.now() - lastMove > 2500) {
        const p = popups.length < 8 ? await dismissPopup() : { n: 0 };
        if (p.n > 0 && p.after < p.n) {
          popups.push(p.text);
          await setPause(false);
          lastMove = Date.now();
          continue;
        }
      }
      if (now.paused) { reason = "game paused itself (check announcements)"; break; }
      if (Date.now() - lastMove > 6000) {
        reason = "time is not advancing - a game menu or dialog is probably open (ask the player to close it with Esc)";
        break;
      }
      if (Date.now() - t0 > 50000) { reason = "real-time cap reached; call df_wait again to continue"; break; }
    }
    await setPause(true);
    const ran = (now.abs - start.abs) / 1200;
    const { value: ann } = await luaFile("announcements", { since: start.last, limit: 200 });
    const all = ann?.messages ?? [];
    // Events the overseer must react to are always listed first and never truncated.
    const IMPORTANT = /CARAVAN|MERCHANT|MIGRANT|SIEGE|AMBUSH|THIEF|INVASION|ENEMY|MEGABEAST|FORGOTTEN|TITAN|WEREBEAST|NIGHT_CREATURE|UNDEAD|MOOD|BERSERK|MADNESS|INSANE|TANTRUM|DEATH|DIED|KILLED|BIRTH|ARTIFACT|DIPLOMAT|LIAISON|NOBLE|PETITION|FLOOD|CAVE_IN|COLLAPSE|STRUCK|DEMAND|MANDATE|CITIZEN|ELECTION|ANIMAL_?ATTACK|INJUR|SCREAM/i;
    const IMPORTANT_TEXT = /caravan|merchants|migrant|siege|ambush|stolen|thief|snatcher|invad|attack|dead|died|killed|been slaughtered by|mood|berserk|insane|tantrum|withdraw|born|given birth|artifact|diplomat|liaison|petition|arrived|has become|struck|forgotten beast|titan|vampire|were/i;
    // Blow-by-blow combat lines (mostly squad sparring) are noise unless someone actually got hurt.
    const COMBAT = /lightly tapping|misses the|charges at|collides with|strikes at|parried|deflected|rolls away|jumps away|attacks the .* but|no longer stunned|is knocked over|punches|kicks|scratches|bites|grabs|releases the grip/i;
    const HURT = /dead|killed|struck down|severed|mangled|torn|shattered|unconscious|bleeding/i;
    const imp = all.filter((m) => (IMPORTANT.test(m.type || "") || IMPORTANT_TEXT.test(m.text)) && !(COMBAT.test(m.text) && !HURT.test(m.text)));
    const rest = all.filter((m) => !imp.includes(m) && !COMBAT.test(m.text));
    const sparring = all.length - imp.length - rest.length;
    let out = `Ran ${ran.toFixed(2)} days in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${reason}. Paused.\n`;
    // Migrant waves arrive as a big popup, not a regular report, so also compare the population.
    if (now.pop !== undefined && start.pop !== undefined && now.pop !== start.pop) {
      const d = now.pop - start.pop;
      imp.unshift({ text: `Population ${start.pop} -> ${now.pop} (${d > 0 ? `+${d}: migrants or births` : `${d}: deaths or departures`}). Check df_units and bedrooms.` });
    }
    if (popups.length) out += `POPUPS (dismissed so time could run):\n${popups.map((t) => `! ${t}`).join("\n")}\n`;
    if (imp.length) out += `IMPORTANT:\n${imp.map((m) => `! ${m.text}`).join("\n")}\n`;
    if (rest.length) out += `Other:\n${rest.slice(-20).map((m) => `- ${m.text}`).join("\n")}\n`;
    if (sparring > 0) out += `(${sparring} combat/sparring lines omitted)\n`;
    if (!all.length) out += "No new announcements.";
    return text(out.trim());
  });

tool("df_alerts", "The game's alert panel (red ALE button): grouped alerts newest first (caravans, deaths, migrants, moods, sieges...) with their latest messages, plus any open popup messages that pause the game. Check it at the start of every session and whenever df_wait reports IMPORTANT events.",
  { limit: z.number().int().min(1).max(40).optional(), per_group: z.number().int().min(1).max(20).optional() },
  (a) => luaTool("alerts", a));

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

// ---------- run ----------
const transport = new StdioServerTransport();
await server.connect(transport);
