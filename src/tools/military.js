// Tools: military.
import { tool, luaTool, text, fail, json, optCoord, z, luaFile } from "../core.js";

tool("df_military", "Squads. list: squads, members, orders and leader positions. create: make a squad led by the holder of position (default MILITIA_COMMANDER; appoint with df_noble first). add/remove: unit_id into squad_id / out of its squad. uniform: apply a uniform template (template = name or id, e.g. 'melee, leather armor', 'melee, metal armor', 'crossbows, leather armor') to every position of squad_id (re-applying wipes existing assignments; run equip after). equip: assign free matching gear to every empty uniform slot (use when soldiers stay unequipped although gear exists). train: routine off|staggered|constant|ready. barracks: assign zone_id (a type B zone) for training (sleep=true to also sleep there). station: send squad_id to x,y,z. kill: attack unit_ids (soldiers only act on targets the game counts as hostile: a werebeast in human form or a peaceful visitor is ignored; station the squad nearby instead). cancel: clear squad_id's orders.",
  { action: z.enum(["list", "create", "add", "remove", "uniform", "equip", "train", "barracks", "station", "kill", "cancel"]).default("list"),
    template: z.string().optional(), routine: z.enum(["off", "staggered", "constant", "ready"]).optional(),
    zone_id: z.number().int().optional(), sleep: z.boolean().optional(), train: z.boolean().optional(), replace_clothing: z.boolean().optional(),
    squad_id: z.number().int().optional(), unit_id: z.number().int().optional(), position: z.string().optional(),
    name: z.string().optional(), unit_ids: z.array(z.number().int()).optional(),
    x: optCoord, y: optCoord, z: optCoord },
  async (a) => {
    if (a.action !== "uniform") return luaTool("military", a);
    // re-applying a uniform wipes every slot's assignments: hand the gear straight back out
    const { value: u } = await luaFile("military", a);
    if (u?.error) return fail(u.error);
    const { value: e } = await luaFile("military", { action: "equip", squad_id: a.squad_id });
    return text(json({ uniform: u.uniform, positions: u.positions, equip: e }));
  });

tool("df_burrow", "Burrows and the civilian alert. list: burrows and alerts. create (name). add_rect / remove_rect: tiles x1,y1..x2,y2 on z (or z1..z2) for burrow (name or id). add_units / remove_units (unit_ids or all_citizens=true), clear_tiles, clear_units. alert_on burrow=<name>: civilians stay inside it (use in sieges); alert_off ends it.",
  { action: z.enum(["list", "create", "add_rect", "remove_rect", "clear_tiles", "add_units", "remove_units", "clear_units", "alert_on", "alert_off"]).default("list"),
    burrow: z.union([z.string(), z.number().int()]).optional(), name: z.string().optional(),
    x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord, z: optCoord, z1: optCoord, z2: optCoord,
    unit_ids: z.array(z.number().int()).optional(), all_citizens: z.boolean().optional() },
  (a) => luaTool("burrow", a));

tool("df_levers", "Levers and mechanisms. list: levers (state, what each is linked to, pending jobs), buildings that can be linked (bridges, doors, hatches, floodgates, grates, bars, cages) and free mechanisms. link: queue the job linking lever_id to target_id (uses 2 mechanisms). pull: queue a dwarf to pull lever_id (urgent=true for top priority). Build a lever with df_build key=Tl; a drawbridge with key g / gw / gd / gx / ga.",
  { action: z.enum(["list", "link", "pull"]).default("list"), lever_id: z.number().int().optional(),
    target_id: z.number().int().optional(), urgent: z.boolean().optional() },
  (a) => luaTool("levers", a));

tool("df_threats", "Threat report: visible hostiles (and how many unseen), night creatures and cursed units on the map including werebeasts/vampires disguised as visitors, residents or even citizens, and every killer of the last N days (default 60) with victim counts and whether they are still alive and on the map.",
  { days: z.number().int().min(1).max(400).optional() }, (a) => luaTool("threats", a));

tool("df_squad_status", "Every squad (or squad_id): routine, active orders, and per soldier the gear worn vs assigned, empty uniform slots, position and current activity.",
  { squad_id: z.number().int().optional() }, (a) => luaTool("military", { ...a, action: "status" }));

tool("df_schedule", "Military schedules and alerts. Each squad has one schedule per alert routine (Off duty, Staggered training, Constant training, Ready), with orders per month. list: schedules (squad_id/routine to filter). set: for squad_id + routine, set months (list of month names, or omit for all) to order train | patrol (route_id) | defend (burrow name or id) | station (x,y,z) | off, with min_count soldiers (default all). alert: switch EVERY squad to a routine (e.g. 'ready' when under attack, 'staggered' after). routes / add_point (name,x,y,z) / add_route (name, point_ids) manage patrol waypoints.",
  { action: z.enum(["list", "set", "alert", "routes", "add_point", "add_route"]).default("list"),
    squad_id: z.number().int().optional(), routine: z.union([z.string(), z.number().int()]).optional(),
    months: z.array(z.string()).optional(), order: z.enum(["train", "patrol", "defend", "station", "off"]).optional(),
    route_id: z.number().int().optional(), burrow: z.union([z.string(), z.number().int()]).optional(),
    min_count: z.number().int().min(1).optional(), name: z.string().optional(),
    point_ids: z.array(z.number().int()).optional(), point_id: z.number().int().optional(),
    x: optCoord, y: optCoord, z: optCoord },
  (a) => luaTool("schedule", a));
