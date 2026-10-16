// Tools: people.
import { server, tool, luaTool, quickfort, text, fail, json, coord, optCoord, DIG_KEYS, z, command, lua, luaFile, writeBlueprint } from "../core.js";

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

tool("df_trade", "Trading. status: caravans on the map, depots, broker, whether the trade screen is open. send: mark goods to haul to the depot by search text (e.g. 'crafts', 'mug', 'leather') or item_ids, up to limit. With the in-game trade screen open: screen lists merchant and fort goods with values and indices; select / deselect toggle indices on side merchant|fort and report selected totals. request_broker: call the broker to the depot. request_anyone: let any dwarf trade (use when the broker is busy, e.g. stuck in a diplomat meeting). open: open the trade screen once the broker is there. propose: press Trade (and confirm), returning the merchant reply and Value/Profit/Weight footer. close: leave the trade screen (Esc does not; time stays frozen while it is open). Merchants want a clear profit and refuse loads over their carrying weight.",
  { action: z.enum(["status", "send", "request_broker", "request_anyone", "open", "screen", "select", "deselect", "propose", "close"]).default("status"),
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
    if (a.action === "request_broker" || a.action === "request_anyone") {
      // The game only creates the broker's depot job when the button is clicked, not when the flag is set.
      const anyone = a.action === "request_anyone";
      const depot = await openDepot();
      if (!depot) return fail("No trade depot");
      await lua(`local f=df.building.find(${depot.id}).trade_flags f.trader_requested=false f.anyone_can_trade=false emit(true)`);
      await luaFile("screen", { action: "click", text: anyone ? "Anyone requested at depot" : "Broker requested at depot" });
      await luaFile("screen", { action: "key", keys: ["LEAVESCREEN"] });
      return text(`${anyone ? "Any dwarf" : "Broker"} requested at the depot (via the depot button). Run df_wait until they arrive, then action=open.`);
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

tool("df_petition", "Petitions (residency, citizenship, temples/guildhalls). list: pending petitions with who asks, race, profession, age, syndromes and a CURSED warning for disguised werebeasts/vampires. approve / deny: answer the oldest pending one through the game's Petitions screen (the same buttons a player clicks).",
  { action: z.enum(["list", "approve", "deny"]).default("list") },
  async (a) => {
    const { value: list } = await lua(
      `local r = {}
       for _, id in ipairs(df.global.plotinfo.petitions) do
         local ag = df.agreement.find(id)
         local hid = ag and ag.parties[0].histfig_ids[0]
         local hf = hid and df.historical_figure.find(hid)
         local u = hf and df.unit.find(hf.unit_id)
         local det = {}
         for _, d in ipairs(ag and ag.details or {}) do det[#det + 1] = df.agreement_details_type[d.type] end
         -- vet for disguised night creatures: werebeasts and vampires carry a syndrome / curse record
         local syn = {}
         if u then for _, sa in ipairs(u.syndromes.active) do local sy = df.syndrome.find(sa.type) syn[#syn + 1] = sy and sy.syn_name or '?' end end
         local cursed = hf and try(function() return hf.info.curse ~= nil end, false) or false
         local race = hf and df.creature_raw.find(hf.race).creature_id
         r[#r + 1] = {id = id, who = u and unit_name(u) or (hf and dfhack.df2utf(dfhack.translation.translateName(hf.name, true))) or '?',
           race = race, age = u and math.floor(dfhack.units.getAge(u)), wants = det, syndromes = syn,
           warning = (cursed or (race or ''):find('NIGHT_CREATURE')) and 'CURSED: likely a werebeast or vampire, deny' or nil}
       end
       emit(r)`);
    if (a.action === "list") return text(JSON.stringify({ petitions: list ?? [] }, null, 1));
    if (!list?.length) return fail("No pending petitions");
    await luaFile("screen", { action: "close" });
    await luaFile("screen", { action: "click", text: "PETITIONS" });
    const { value: f } = await luaFile("screen", { action: "find", text: "Deny" });
    const deny = (f?.hits ?? [])[0];
    if (!deny) { await luaFile("screen", { action: "close" }); return fail("Petition buttons not found on screen"); }
    // the buttons sit side by side: [ Approve ][ Deny ]
    const x = a.action === "deny" ? deny.x + 1 : deny.x - 9;
    await luaFile("screen", { action: "click", x, y: deny.y });
    const { value: left } = await lua(`emit(#df.global.plotinfo.petitions)`);
    await luaFile("screen", { action: "close" });
    const ok = left < list.length;
    return text(`${ok ? (a.action === "deny" ? "Denied" : "Approved") : "No change for"}: ${list[0].who} (${(list[0].wants ?? []).join(", ")}). Pending now: ${left}.`);
  });

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

tool("df_levers", "Levers and mechanisms. list: levers (state, what each is linked to, pending jobs), buildings that can be linked (bridges, doors, hatches, floodgates, grates, bars, cages) and free mechanisms. link: queue the job linking lever_id to target_id (uses 2 mechanisms). pull: queue a dwarf to pull lever_id (urgent=true for top priority). Build a lever with df_build key=Tl; a drawbridge with key g / gw / gd / gx / ga.",
  { action: z.enum(["list", "link", "pull"]).default("list"), lever_id: z.number().int().optional(),
    target_id: z.number().int().optional(), urgent: z.boolean().optional() },
  (a) => luaTool("levers", a));

tool("df_mood", "Strange moods: which dwarf is in a mood, which workshop they claimed, and exactly which items they still need (runs DFHack showmood). Provide the materials quickly or the dwarf goes insane.",
  {}, async () => text((await command("showmood")).trim() || "No dwarf is in a strange mood."));

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
