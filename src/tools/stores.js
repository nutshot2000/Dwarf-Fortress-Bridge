// Tools: stores.
import { tool, luaTool, luaFile, text, fail, json, optCoord, z, command, inputWarnings } from "../core.js";

tool("df_crop", "Farming. list reports built state, light/dark tiles, incompatible crops and seeds. set requires a completed plot and compatible light/dark conditions; unbuilt plots reset on completion, and roofing surface soil does NOT make it dark. Set plot_id, plant name/id or fallow, seasons (default all).",
  { action: z.enum(["list", "set"]).default("list"), plot_id: z.number().int().optional(), plant: z.string().optional(),
    seasons: z.array(z.enum(["spring", "summer", "autumn", "winter"])).optional() },
  (a) => luaTool("crop", a));

tool("df_stocks", "Item inventory, with total and available counts kept separate. Available excludes installed building materials, job reservations, forbidden, rotten, dumped and owned items. No args: counts per item type. type=<ITEM_TYPE> and/or search=<text>: breakdown by item plus locations.",
  { type: z.string().optional(), search: z.string().optional() }, (a) => luaTool("stocks", a));

tool("df_workshop", "Workshops and furnaces. action=list shows each with queued jobs (pass building_id or show_tasks=true to see task names it accepts). action=add queues a task directly at building_id, like the in-game Add task button (no manager needed): task is a name or substring (e.g. 'bed', 'barrel', 'brew', 'prepare easy meal', 'rock table'); count up to 10; repeat=true keeps redoing it. action=cancel removes the job at index.",
  { action: z.enum(["list", "add", "cancel"]).default("list"), building_id: z.number().int().optional(),
    task: z.string().optional(), count: z.number().int().min(1).max(10).optional(), repeat: z.boolean().optional(),
    index: z.number().int().optional(), show_tasks: z.boolean().optional(), filter: z.string().optional(),
    job: z.string().optional().describe("alias for task; a job type like ConstructMechanisms is split into words"),
    quantity: z.number().int().min(1).max(10).optional().describe("alias for count") },
  async (a) => {
    // Unknown keys are dropped silently, and an empty task used to match the first task alphabetically.
    if (!a.task && a.job) a.task = a.job.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
    if (a.count === undefined && a.quantity !== undefined) a.count = a.quantity;
    if (a.action !== "add") return luaTool("workshop", a);
    const { value, log } = await luaFile("workshop", a);
    if (value?.error) return fail(value.error);
    const { preflight, ...rest } = value;
    const warn = preflight ? await inputWarnings(preflight) : [];
    return text(json(rest) + warn.map((w) => `\nWARNING: ${w}`).join("") + (log ? `\n--- log ---\n${log}` : ""));
  });

tool("df_animals", "Livestock and pets. list: own animals (race, sex, age, grazer/milkable/egg-layer, pasture, training) and pastures/ponds. pasture: put unit_id/unit_ids into pen zone_id (make one with df_zone type n). unpasture, slaughter / unslaughter (butcher marks), train (assign a trainer). Grazers starve without a grassy pasture.",
  { action: z.enum(["list", "pasture", "unpasture", "slaughter", "unslaughter", "train"]).default("list"),
    unit_id: z.number().int().optional(), unit_ids: z.array(z.number().int()).optional(), zone_id: z.number().int().optional() },
  (a) => luaTool("animals", a));

tool("df_standing", "Standing orders (Labor > Standing orders). No args lists all (gather_refuse, auto_butcher, auto_kitchen, dump_corpses, forbid_used_ammo, zoneonly_drink...). name + value (0/1, or true/false) changes one.",
  { name: z.string().optional(), value: z.union([z.number().int(), z.boolean()]).optional() },
  (a) => luaTool("standing", a));

tool("df_jobs", "Every job in the fort. list: summary and jobs (filter, limit). suspended: separate missing-material plans from interrupted construction, listing its own materials plus OTHER ground items and their reserving job/building IDs. Reserved blockers cannot be dumped until their owning job releases them; do not dump a construction's own materials or blindly resume. After resolving interruptions, resume the specific job_id. cancel/suspend/resume/do_now act on job_id.",
  { action: z.enum(["list", "suspended", "cancel", "suspend", "resume", "do_now"]).default("list"),
    job_id: z.number().int().optional(), filter: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
  (a) => luaTool("jobs", a));

tool("df_items", "Find items by description text and/or item type (BARREL, WEAPON, BAR, BOULDER...): where each is (stockpile, building, dump, loose, held by whom) and flags that block use (forbid, dump, in_job, trader, owned, artifact). Use when something 'exists' but nobody uses it.",
  { search: z.string().optional(), type: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
  (a) => luaTool("items", a));

tool("df_dump", "Clear loose clutter (boulders by default) out of rooms: mark items on levels z (or z1..z2), optionally inside x1,y1..x2,y2, for dumping; dwarves haul them to a garbage dump zone (df_zone type d; no per-tile limit). WARNING: the game FORBIDS items once they land in a dump, so dumped stone/ore is unusable until you run action=unforbid (clears forbid on everything in dump zones; they stay put but masons/smelters can use them). Items already in stockpiles or dumps are skipped. count first, unmark to undo. types: df.items.other names, e.g. BOULDER, WOOD, BAR.",
  { action: z.enum(["count", "mark", "unmark", "unforbid"]).default("count"), z: optCoord, z1: optCoord, z2: optCoord,
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
