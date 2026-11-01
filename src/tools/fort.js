// Tools: fort.
import { tool, luaTool, quickfort, text, fail, optCoord, DIG_KEYS, z, command, lua, luaFile } from "../core.js";

tool("df_unit", "Detailed view of one unit: unmet needs, recent emotions, wounds, inventory, all skills, enabled labors.",
  { unit_id: z.number().int() }, (a) => luaTool("unit", a));

tool("df_noble", "Fort positions. action=list shows every position and holder. action=appoint gives position (e.g. MANAGER, BOOKKEEPER, BROKER, CHIEF_MEDICAL_DWARF, MILITIA_COMMANDER, SHERIFF) to unit_id; action=remove vacates it. action=repair rebuilds the responsibility index DF uses to find its manager/broker (run it if the Work orders screen says a manager is required). A MANAGER is required before work orders run.",
  { action: z.enum(["list", "appoint", "remove", "repair"]).default("list"), position: z.string().optional(), unit_id: z.number().int().optional() },
  (a) => luaTool("noble", a));

tool("df_labor", "Labors and work details. action=list shows work details (members, labors) and every citizen's enabled labors. enable/disable toggle labors (e.g. MINE, CUTWOOD, HAUL_FOOD, BREWER, COOK, CARPENTER, MASON, PLANT) for unit_id. detail_add/detail_remove put unit_id in a named work detail (e.g. 'Miners') and apply its labors. Re-applying a work detail resets labors toggled one by one, so disable unwanted labors (e.g. BREWER on a miner) after any detail change.",
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

tool("df_rooms", "Zones. action=list shows all zones with owners. action=assign gives zone_id to unit_id; unassign clears the owner. action=audit checks EVERY zone against the wiki requirements (required furniture per zone type, owners, overlaps that zero room value, room quality rank, tavern/temple/hospital/library needs incl. dance floor and stocked goblets/instruments/supplies, staff) , every noble's room demands, and untidy stockpiles (fragmented, stray, on stairs). Run audit after building or changing rooms. action=display puts item_id (e.g. an artifact) on display case or pedestal building_id; artifacts on show in a temple or guildhall raise its value a lot. action=bedroom_wing builds a tidy wing of private 3x3 bedrooms either side of a corridor (z, x1=west end, y=corridor row, per_side, shaft_x to keep clear): phase dig, then furnish (door/bed/cabinet/chest), then zone (zones + assigns adults without a room).",
  { action: z.enum(["list", "assign", "unassign", "audit", "bedroom_wing", "display"]).default("list"), zone_id: z.number().int().optional(), unit_id: z.number().int().optional(),
    phase: z.enum(["dig", "furnish", "zone"]).optional(), z: optCoord, x1: optCoord, y: optCoord, per_side: z.number().int().min(1).max(15).optional(),
    shaft_x: optCoord, priority: z.number().int().min(1).max(7).optional(),
    building_id: z.number().int().optional().describe("display: the display case or pedestal"),
    item_id: z.number().int().optional().describe("display: the item (e.g. an artifact) to put on show"),
    item_ids: z.array(z.number().int()).min(1).max(100).optional().describe("display: several items for one case at once (a case of masterwork crafts raises a guildhall's value)"),
    full: z.boolean().optional().describe("audit: list every zone and room layout, not only those needing attention") },
  async (a) => {
    if (a.action === "display") {
      // Through the game's own "Assign new display items" panel: writing displayed_items directly made a
      // "Put item on display" job that nobody ever took.
      const ids = [...(a.item_ids ?? []), ...(a.item_id !== undefined ? [a.item_id] : [])];
      if (a.building_id === undefined || !ids.length) return fail("display needs building_id and item_id or item_ids");
      a = { ...a, ids };
      const { value: ok } = await lua(`local b = df.building.find(ARGS.building_id)
        if not b or not df.building_display_furniturest:is_instance(b) then emit('not a display case or pedestal') return end
        for _, id in ipairs(ARGS.ids) do if not df.item.find(id) then emit('no item ' .. id) return end end
        local v = df.global.game.main_interface.view_sheets
        v.open = true v.active_sheet = df.view_sheet_type.BUILDING v.active_id = b.id v.active_sub_tab = 0
        emit(true)`, a);
      if (ok !== true) return fail(String(ok));
      await luaFile("screen", { action: "click", text: "Assign new display items" });
      const { value: set } = await lua(`local p = df.global.game.main_interface.assign_display_item
        if not p.open then emit(false) return end
        for _, id in ipairs(ARGS.ids) do p.new_display_itid:insert('#', id) end emit(true)`, a);
      await luaFile("screen", { action: "key", keys: ["LEAVESCREEN"] });
      await luaFile("screen", { action: "close" });
      const { value: shown } = await lua(`local b = df.building.find(ARGS.building_id)
        local on, n = {}, 0
        for _, id in ipairs(b.displayed_items) do on[id] = true end
        for _, id in ipairs(ARGS.ids) do if on[id] then n = n + 1 end end emit(n)`, a);
      if (!set || !shown) return fail("The display panel did not take the item(s) (is the building finished?).");
      return text(`${shown} of ${ids.length} item(s) assigned to display ${a.building_id}; dwarves carry them there.`);
    }
    if (a.action === "audit") {
      const {value:report}=await luaFile("audit",a);
      const {value:layout}=await luaFile("room_plan",{action:"status"});
      const {value:access}=await luaFile("access",{});
      if (a.full) return text(JSON.stringify({...report,room_layouts:layout?.rooms,citizen_access:access},null,1));
      // A grown fort has 80+ zones: by default list only what needs attention (or the one zone_id asked about).
      const zones = (report?.zones ?? []).filter((zn) => a.zone_id !== undefined ? zn.id === a.zone_id
        : (zn.missing?.length || zn.warnings?.length));
      const rooms = (layout?.rooms ?? []).filter((r) => r.state !== "enclosed");
      const ok = (report?.zones?.length ?? 0) - zones.length;
      return text(JSON.stringify({...report, zones, zones_ok: a.zone_id === undefined ? ok : undefined,
        room_layouts: rooms, citizen_access: access?.isolated?.length ? access : { isolated: [], main_group_size: access?.main_group_size },
        hint: "Only zones with something missing or a warning are listed; zone_id=<id> shows one zone, full=true everything."}, null, 1));
    }
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
    const layout=rooms.flatMap(x=>[{x,y:Y-4,door_x:x+1,door_y:Y-1},{x,y:Y+2,door_x:x+1,door_y:Y+1}]);
    const {value:protectedPlan}=await luaFile("room_plan",{action:"protect",z:Z,rooms:layout});
    if (protectedPlan?.error) return fail(protectedPlan.error);
    if (a.phase === "dig" || !a.phase) {
      const ids=new Set(layout.map(r=>`${r.x},${r.y},${Z}`));
      const damaged=(protectedPlan?.rooms??[]).filter(r=>ids.has(r.id)&&r.missing_walls.length);
      // A refused wing must not leave phantom protected plans behind.
      if (damaged.length) await luaFile("room_plan", { action: "forget", ids: [...ids] });
      if (damaged.length) return fail(JSON.stringify({error:"Proposed room boundaries are already open. Choose intact rock or construct enclosing walls before mining/furnishing.",rooms:damaged}));
    }
    const log = [];
    // Zoning skips rooms that are not finished yet (a door still being made) instead of refusing the whole
    // wing; run the zone phase again later to pick them up.
    const notReady = new Set();
    if (a.phase === "furnish" || a.phase === "zone") {
        const {value:check}=await luaFile("room_check",{z:Z,rooms:layout,allow_open_doorway:a.phase==="furnish"});
      const bad = check?.invalid_rooms ?? [];
      if (!check?.ok && (a.phase !== "zone" || !bad.length || bad.length >= layout.length)) return fail(JSON.stringify(check,null,1));
      for (const r of bad) notReady.add(`${r.room.x},${r.room.y}`);
    }
    const dig = async (kind, x1, y1, x2, y2) => {
      const out = await quickfort("dig", [`${DIG_KEYS[kind]}(${x2 - x1 + 1}x${y2 - y1 + 1})`], x1, y1, Z, ["-p", String(P)]);
      return out;
    };
    if (a.phase === "dig" || !a.phase) {
      // The corridor must reach the shaft even when every room lies west of it.
      const corrEnd = SX > xEnd ? SX - 1 : xEnd;
      // shaft_x defaults to 104 (kept so existing wings keep their layout); only talk about it when asked for
      const shaftGiven = a.shaft_x !== undefined;
      if (shaftGiven && SX < X1) log.push(`note: the shaft at x${SX} is west of x1=${X1}; dig a link from the shaft to x${X1} yourself.`);
      await dig("dig", X1, Y, corrEnd, Y);
      for (const x of rooms) {
        await dig("dig", x, Y - 4, x + 2, Y - 2); await dig("dig", x + 1, Y - 1, x + 1, Y - 1);
        await dig("dig", x, Y + 2, x + 2, Y + 4); await dig("dig", x + 1, Y + 1, x + 1, Y + 1);
      }
      // Re-assert the shaft after the corridor dig, but only where a stair really is: the shaft need
      // not sit on the corridor row, and a blind "i" would carve a stray staircase.
      const { value: stairHere } = await lua(`local tt=dfhack.maps.getTileType(ARGS.x,ARGS.y,ARGS.z)
        emit(tt ~= nil and df.tiletype.attrs[tt].shape == df.tiletype_shape.STAIR_UPDOWN)`, { x: SX, y: Y, z: Z });
      if (stairHere) await quickfort("dig", ["i"], SX, Y, Z, ["-p", "1"]);
      log.push(`dig: corridor x${X1}-${corrEnd} y${Y} and ${rooms.length * 2} rooms on z${Z}` +
        (shaftGiven || stairHere ? `; shaft at ${SX},${Y}` : ""));
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
        if (existing.has(`${x},${yy}`) || notReady.has(`${x},${yy}`)) continue;
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
      log.push(`zone: ${made} new of ${names.length} bedroom zones (existing kept); assigned ${assigned} to adults without a room` +
        (notReady.size ? `; ${notReady.size} room(s) not finished yet (${[...notReady].join(" ")}): run phase zone again once their doors/walls are built` : ""));
    }
    return text(log.join("\n") + `\nAfter work finishes, inspect df_screenshot around the wing on z=${Z} (pan both ends), then df_rooms action=audit and df_problems. Check workers outside rooms have an escape route.`);
  });

tool("df_mood", "Strange moods: which dwarf is in a mood, which workshop they claimed, and exactly which items they still need (runs DFHack showmood). check=true instead counts suitable items in the fort for each requirement, says how to get missing ones and gives days left, so impossible moods show up early. Provide the materials quickly or the dwarf goes insane.",
  { check: z.boolean().optional() },
  async (a) => {
    if (a.check) return luaTool("moodcheck", {});
    // showmood prints DF's CP437 names: convert in-game so "Dodók" does not arrive as "Dod?k"
    const { value } = await lua(`emit(dfhack.df2utf(dfhack.run_command_silent('showmood') or ''))`);
    // df2utf also maps the newline byte to its CP437 glyph
    return text((value ?? "").replace(/◙/g, "\n").trim() || "No dwarf is in a strange mood.");
  });

tool("df_location", "Locations and their occupations. list: taverns, hospitals, temples, libraries, guildhalls with their zones and occupation slots (create a location with df_zone location=...). assign: give unit_id an occupation at location_id: DOCTOR, DIAGNOSTICIAN, SURGEON, BONE_DOCTOR (hospital), TAVERN_KEEPER, PERFORMER (tavern), SCHOLAR, SCRIBE (library). remove: clear unit_id (or occupation_id) from location_id. attach: put location_id on zone_id (a purpose-built room), detach_others=true to release its old zones; keeps name and staff. dedicate: set what temple location_id is for: religion=<name or id> (this answers an approved temple petition from that religion), deity=<name or id>, or all_faiths=true; with none of these it lists the religions and deities citizens follow, with follower counts.",
  { action: z.enum(["list", "assign", "remove", "attach", "dedicate"]).default("list"), location_id: z.number().int().optional(), zone_id: z.number().int().optional(), detach_others: z.boolean().optional(),
    unit_id: z.number().int().optional(), occupation: z.string().optional(), occupation_id: z.number().int().optional(),
    religion: z.union([z.string(), z.number().int()]).optional(), deity: z.union([z.string(), z.number().int()]).optional(),
    all_faiths: z.boolean().optional() },
  (a) => luaTool("location", a));
