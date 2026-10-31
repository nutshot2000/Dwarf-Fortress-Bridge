// Tools: designate.
import { cameraTo } from "../camera.js";
import { tool, quickfort, text, fail, coord, optCoord, DIG_KEYS, z, lua, luaFile, luaTool } from "../core.js";

tool("df_designations", "List actual pending dig/smooth and tree-felling/plant-gathering designations on level z (default current level). Use to verify work survives another order; tree marks are separate from tile dig flags.",
  {z:optCoord,kind:z.string().optional(),limit:z.number().int().min(1).max(200).optional()},a=>luaTool("designations",a));

tool("df_remove", "Preview or deconstruct one building/plan by ID using ordinary game removal. dry_run defaults true. To release a reserved blocker, inspect df_jobs suspended, preview the owning unbuilt building, then dry_run=false. Built structures require allow_built=true. This removes the selected plan; it does not merely release its materials.",
  {building_id:z.number().int(),dry_run:z.boolean().default(true),allow_built:z.boolean().default(false)},a=>luaTool("remove",a));

tool("df_room_plan", "Protect, audit or repair private rooms. status reports missing walls, pending construction and enclosed. repair id=... previews missing wall/door jobs (dry_run defaults true); dry_run=false queues ordinary construction. Supply door_x,door_y when the damaged room has no surviving entrance. Repair preserves furniture and the doorway; wait and recheck enclosed=true before calling it finished. tidy id=... previews loose stone/gem cleanup in that room; dry_run=false marks eligible clutter for hauling to a dump, skipping reserved items and furniture. protect saves custom interiors and doorway coordinates. Existing bedroom zones are protected automatically. forget removes a saved plan (id) or every saved plan on level z, for intentional remodelling or abandoned layouts. status z=... reports one level.",
  {action:z.enum(["status","protect","forget","repair","tidy"]).default("status"),z:optCoord,id:z.string().optional(),detail:z.boolean().default(false),
    dry_run:z.boolean().default(true),door_x:optCoord,door_y:optCoord,
    rooms:z.array(z.object({x:coord,y:coord,w:z.number().int().min(1).max(30).optional(),h:z.number().int().min(1).max(30).optional(),door_x:optCoord,door_y:coord})).optional()},async a=>{
      if(!["repair","tidy"].includes(a.action)) return luaTool("room_plan",a);
      const {value:report}=await luaFile("room_plan",{action:"status",detail:true});
      const r=report?.rooms?.find(r=>r.id===a.id);
      if(!r) return fail("repair/tidy requires an existing room id from df_room_plan status");
      if(a.action==="tidy"){
        const args={z:r.z,x1:r.x,y1:r.y,x2:r.x+r.w-1,y2:r.y+r.h-1,types:["BOULDER","ROUGH"]};
        const {value:count}=await luaFile("dump",{...args,action:"count"});
        if(!a.dry_run&&!count?.dump_zones?.length) return fail("Create a reachable garbage dump zone before marking bedroom clutter. Nothing marked.");
        const result=a.dry_run?count:(await luaFile("dump",{...args,action:"mark"})).value;
        return text(JSON.stringify({room:r.id,dry_run:a.dry_run,...result,next_step:result.items===0?(result.skipped>0?"No eligible clutter. Inspect skipped items and their reservations; do not keep marking or cancel useful jobs blindly.":"No loose stone/gem clutter remains in this room. Nothing to mark."):a.dry_run?"Repeat tidy with dry_run=false to mark eligible loose stone/gems in this room only.":"Wait for hauling, then preview tidy again until items=0. Reserved construction items, furniture and personal belongings are excluded. Dumped stone can be reclaimed using df_dump action=unforbid."},null,1));
      }
      if(r.invalid_interior?.length) return fail(JSON.stringify({error:"Room interior is unsuitable. Preserve stairs/access routes: relocate this bedroom to a safe dry-floor footprint instead of walling over a shaft. No construction queued.",tiles:r.invalid_interior}));
      const dx=a.door_x??r.door_x??(r.doors?.length===1?r.doors[0].x:undefined);
      const dy=a.door_y??r.door_y??(r.doors?.length===1?r.doors[0].y:undefined);
      const edge=((dy===r.y-1||dy===r.y+r.h)&&dx>=r.x&&dx<r.x+r.w)||((dx===r.x-1||dx===r.x+r.w)&&dy>=r.y&&dy<r.y+r.h);
      if(!edge) return fail("Entrance is unknown or invalid. Inspect the corridor, then supply door_x,door_y on a non-corner perimeter tile. No construction queued.");
      if(r.unsafe_designation_count||r.unrevealed_boundary_tiles) return fail("Clear unsafe boundary dig designations and inspect unrevealed boundaries before repair. No construction queued.");
      const targets=r.missing_walls.filter(p=>p.x!==dx||p.y!==dy).map(p=>({...p,key:"Cw"}));
      const {value:door}=await lua(`local b=dfhack.buildings.findAtTile(ARGS.x,ARGS.y,ARGS.z); emit({exists=b and b:getType()==df.building_type.Door or false})`,{x:dx,y:dy,z:r.z});
      const doorDeferred=!door.exists&&(targets.length>0||r.pending_wall_count>0);
      if(!door.exists&&!doorDeferred) targets.push({x:dx,y:dy,z:r.z,key:"d"});
      const blocked=[];
      for(const t of targets){
        const {value:check}=await luaFile("build_check",t);
        if(!check?.can_place) blocked.push({tile:t,check});
      }
      if(blocked.length) return fail(JSON.stringify({error:"Repair footprint blocked; no construction queued. Inspect these tiles. Do not remove furniture or stairs blindly.",blocked}));
      if(!a.dry_run&&!r.enclosed){
        await luaFile("room_plan",{action:"protect",z:r.z,rooms:[{x:r.x,y:r.y,w:r.w,h:r.h,door_x:dx,door_y:dy}]});
        for(const t of targets) await quickfort("build",[t.key],t.x,t.y,t.z);
      }
      return text(JSON.stringify({dry_run:a.dry_run,room:r.id,doorway:{x:dx,y:dy,z:r.z},wall_jobs:targets.filter(t=>t.key==="Cw").length,door_jobs:targets.filter(t=>t.key==="d").length,door_deferred_until_walls_complete:doorDeferred,targets,pending_walls:r.pending_wall_count,enclosed:r.enclosed,
        next_step:r.enclosed?"Nothing to repair: room is enclosed. Audit furniture/ownership, then preview tidy.":targets.length===0?"Construction is already pending. Wait and inspect suspended jobs; do not repeatedly submit the same repair. Repeat repair after walls finish if a door was deferred.":a.dry_run?"Review entrance/access and targets, then repeat with dry_run=false.":"Construction queued, not finished. df_wait, inspect df_jobs suspended, then repeat repair after walls finish to place a deferred door. Recheck status until enclosed=true. Clear loose boulders with df_dump restricted to the room footprint; never dump construction materials."},null,1));
    });

tool("df_dig", "Designate a rectangle for digging (or channel/stairs/ramp/chop/gather/smooth/undesignate). x1,y1 to x2,y2 inclusive on level z. levels>1 repeats the same rectangle DOWNWARD (useful for updown_stair shafts). Unrevealed tiles can be designated. dry_run=true previews (room-protection check included) without designating.",
  {
    kind: z.enum(Object.keys(DIG_KEYS)).default("dig"),
    x1: coord, y1: coord, x2: coord, y2: coord, z: coord,
    levels: z.number().int().min(1).max(100).optional(),
    priority: z.number().int().min(1).max(7).optional(),
    allow_room_changes:z.boolean().default(false),
    dry_run: z.boolean().optional(),
  },
  async (a) => {
    const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1) + 1, h = Math.abs(a.y2 - a.y1) + 1;
    const extra = [];
    if (a.levels > 1) extra.push("-r", `down,${a.levels}`);
    if (a.priority) extra.push("-p", String(a.priority));
    // preview: the room-protection guard and quickfort report what would happen; nothing is designated
    if (a.dry_run) {
      if (["engrave", "chop", "gather"].includes(a.kind)) return fail(`dry_run is not supported for kind=${a.kind}.`);
      const out = await quickfort("dig", [`${DIG_KEYS[a.kind]}(${w}x${h})`], x, y, a.z, [...extra, "--dry-run"],
        { allow_room_changes: a.allow_room_changes });
      return text(out + "\n(dry run: nothing was designated)");
    }
    if (a.kind === "engrave") {
      // quickfort's engrave key reports success but leaves no designation in v50; set it the way the game does
      // (only smoothed tiles can be engraved: smooth first, engrave once smoothing is done)
      const { value } = await lua(
        `local n, rough = 0, 0
         for z = ${a.z}, ${a.z} - ${(a.levels ?? 1) - 1}, -1 do
           for x = ${x}, ${x + w - 1} do for y = ${y}, ${y + h - 1} do
             local tt = dfhack.maps.getTileType(x, y, z)
             if tt then
               local at = df.tiletype.attrs[tt]
               if at.special == df.tiletype_special.SMOOTH then
                 dfhack.maps.getTileFlags(x, y, z).smooth = 2
                 dfhack.maps.getTileBlock(x, y, z).flags.designated = true
                 n = n + 1
               elseif at.shape == df.tiletype_shape.WALL or at.shape == df.tiletype_shape.FLOOR then rough = rough + 1 end
             end
           end end
         end
         emit({engrave_designated = n, not_smoothed_yet = rough})`);
      return text(JSON.stringify(value));
    }
    const out = await quickfort("dig", [`${DIG_KEYS[a.kind]}(${w}x${h})`], x, y, a.z, extra,{allow_room_changes:a.allow_room_changes});
    if (["chop", "gather", "undesignate"].includes(a.kind)) {
      const { value } = await lua(`local n=0
        for _,p in ipairs(df.global.world.plants.all) do
          if p.pos.z<=ARGS.z and p.pos.z>=ARGS.z-(ARGS.levels or 1)+1
             and p.pos.x>=ARGS.x and p.pos.x<ARGS.x+ARGS.w and p.pos.y>=ARGS.y and p.pos.y<ARGS.y+ARGS.h then
            if ARGS.kind=='undesignate' then dfhack.designations.unmarkPlant(p) end
            if dfhack.designations.isPlantMarked(p) then n=n+1 end
          end
        end
        local tiles,cancelled=0,0
        if ARGS.kind=='undesignate' then
          for zz=ARGS.z,ARGS.z-(ARGS.levels or 1)+1,-1 do for xx=ARGS.x,ARGS.x+ARGS.w-1 do for yy=ARGS.y,ARGS.y+ARGS.h-1 do
            local f=dfhack.maps.getTileFlags(xx,yy,zz)
            if f and (f.dig~=0 or f.smooth~=0) then tiles=tiles+1 end
          end end end
          -- A designation a dwarf has turned into a job no longer shows on the tile, so clearing flags leaves
          -- the job queued: cancel unclaimed dig/smooth/engrave/stair jobs in the footprint too.
          local KINDS={Dig=1,DigChannel=1,CarveUpwardStaircase=1,CarveDownwardStaircase=1,CarveUpDownStaircase=1,
            CarveRamp=1,SmoothWall=1,SmoothFloor=1,DetailWall=1,DetailFloor=1,CarveFortification=1,RemoveStairs=1,
            CarveTrack=1}
          local doomed={}
          for _,j in require('utils').listpairs(df.global.world.jobs.list) do
            local p=j.pos
            if KINDS[df.job_type[j.job_type]] and not dfhack.job.getWorker(j)
               and p.z<=ARGS.z and p.z>=ARGS.z-(ARGS.levels or 1)+1
               and p.x>=ARGS.x and p.x<ARGS.x+ARGS.w and p.y>=ARGS.y and p.y<ARGS.y+ARGS.h then doomed[#doomed+1]=j end
          end
          for _,j in ipairs(doomed) do dfhack.job.removeJob(j) cancelled=cancelled+1 end
        end
        emit({marked_plants=n,tile_designations=tiles,cancelled_jobs=cancelled})`,{...a,x,y,w,h});
      return text(out + `\nVerified: ${value.marked_plants} marked plant(s) in the requested footprint.` +
        (a.kind === "undesignate" ? ` ${value.tile_designations} tile designation(s) remain; ${value.cancelled_jobs} queued job(s) cancelled.` : "") +
        (a.kind !== "undesignate" && value.marked_plants === 0 ? " No tree/plant work is marked. Select tree bases, not canopy or another elevation; use df_designations to inspect." : ""));
    }
    await cameraTo(x + (w >> 1), y + (h >> 1), a.z, `dig ${a.kind} at ${x},${y},${a.z}`);
    // verify: count tiles in the area that now actually carry a designation of this kind. While the game runs a
    // dwarf can claim a designation at once, which turns it into a job and clears the tile flag: count those too.
    const field = a.kind === "smooth" ? "smooth" : "dig";
    let { value: v } = await lua(
      `local n, under = 0, {}
       local KINDS = {Dig=1, DigChannel=1, CarveUpwardStaircase=1, CarveDownwardStaircase=1, CarveUpDownStaircase=1,
         CarveRamp=1, SmoothWall=1, SmoothFloor=1, DetailWall=1, DetailFloor=1, CarveFortification=1, RemoveStairs=1}
       local claimed = {}
       for _, j in require('utils').listpairs(df.global.world.jobs.list) do
         if KINDS[df.job_type[j.job_type]] then claimed[j.pos.x .. ',' .. j.pos.y .. ',' .. j.pos.z] = true end
       end
       for zz = ${a.z}, ${a.z} - ${(a.levels ?? 1) - 1}, -1 do
         for x = ${x}, ${x + w - 1} do for y = ${y}, ${y + h - 1} do
           local f = dfhack.maps.getTileFlags(x, y, zz)
           if f and (f.${field} ~= 0 or claimed[x .. ',' .. y .. ',' .. zz]) then
             n = n + 1
             -- v50 aquifers leak downward too: a dug tile under a revealed aquifer tile slowly floods
             local up = dfhack.maps.getTileFlags(x, y, zz + 1)
             if up and up.water_table and not up.hidden then under[#under + 1] = x .. ',' .. y .. ',' .. zz end
           end
         end end
       end
       emit({n = n, under = under})`);
    const under = v.under ?? [];
    v = v.n;
    const want = w * h * (a.levels ?? 1);
    const note = ["chop", "gather"].includes(a.kind) ? "" :
      a.kind === "undesignate" ? `
Verified: ${v} tile(s) still designated.` :
      `
Verified: ${v} of ${want} tile(s) now carry a ${a.kind} designation` +
      (v === 0 ? " - NOTHING was designated (wrong tile type? already dug? smooth needs rough stone)." : ".");
    const leak = under.length && field === "dig"
      ? `\nWARNING: ${under.length} designated tile(s) lie directly under aquifer tiles; once dug, water drips down into them. ` +
        `Undesignate them or dig one level lower. At: ${under.slice(0, 12).join("; ")}${under.length > 12 ? "; ..." : ""}`
      : "";
    return text(out + note + leak);
  });

tool("df_build", "Place a building, or dry_run=true for a real non-mutating native preview with invalid tile coordinates, terrain/occupancy reasons and ground-item reservations. No placement occurs when preflight rejects the footprint. Keys: wc carpenter, wm mason, wl still, wz kitchen, wu BUTCHER, wb BOWYER, wr craftsdwarf, D trade depot. See df_help topic=keys for the full list. Workshops use their CENTRE tile. Area buildings (p farm, Cw wall, Cf floor) use top-left plus w,h.",
  { key: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1).optional(), h: z.number().int().min(1).optional(),
    name: z.string().optional(), dry_run: z.boolean().default(false) },
  async (a) => {
    const { value: check } = await luaFile("build_check",a);
    if (check?.error) return fail(check.error);
    if (a.dry_run || !check?.can_place) return text(JSON.stringify(check,null,1));
    let cell = a.key;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    if (a.w || a.h) cell += `(${a.w ?? 1}x${a.h ?? 1})`;
    await cameraTo(a.x, a.y, a.z, `build ${a.key} at ${a.x},${a.y},${a.z}`);
    // Placement passed preflight, so only the parts worth reading: counters that fired and anything on the ground.
    const fired = Object.fromEntries(Object.values(check.stats ?? {}).filter((s) => s?.value && !/would be designated/.test(s.label)).map((s) => [s.label, s.value]));
    const preflight = { ...(Object.keys(fired).length ? { stats: fired } : {}), ...(check.ground_items?.length ? { ground_items: check.ground_items } : {}) };
    // Check parts before placing: the new plan reserves free parts at once, which would look like "none free".
    const parts = await partsNote(a.key);
    return text(await quickfort("build", [cell], a.x, a.y, a.z) + (Object.keys(preflight).length ? "\nPreflight: " + JSON.stringify(preflight) : "") + parts +`\nAfter construction finishes: df_screenshot x=${a.x} y=${a.y} z=${a.z}, then df_problems/df_rooms audit. Check workers can leave and passages remain open.`);
  });

tool("df_stockpile", "Create a stockpile rectangle. type is one or more #place letters: a animal, f food, u furniture, n coins, y corpses, r refuse, s stone, w wood, e gems, b bars/blocks, h cloth, l leather, z ammo, S sheets, g finished goods, p weapons, d armor, c custom. e.g. 'fw' = food+wood.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1), name: z.string().optional() },
  async (a) => {
    let cell = a.type;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    await cameraTo(a.x + (a.w >> 1), a.y + (a.h >> 1), a.z, `stockpile at ${a.x},${a.y},${a.z}`);
    const out = await quickfort("place", [`${cell}(${a.w}x${a.h})`], a.x, a.y, a.z);
    return text(out + await newIdNote("stockpile", a) + await skippedTilesNote(out, a));
  });

// Finished items some buildings consume. Without them the plan waits and is eventually dropped
// ("unable to complete the Well ... Needs mechanisms"), so say up front what is missing.
const BUILD_PARTS = {
  l: [["BUCKET", "a bucket (carpenter)"], ["CHAIN", "a chain or rope"], ["TRAPPARTS", "a mechanism (mechanic)"],
    ["BLOCKS", "stone blocks (mason)"]],
  Tl: [["TRAPPARTS", "a mechanism (mechanic)"]], Tc: [["TRAPPARTS", "a mechanism (mechanic)"]],
  Ts: [["TRAPPARTS", "a mechanism (mechanic)"]], Tw: [["TRAPPARTS", "a mechanism (mechanic)"]],
  H: [["HATCH_COVER", "a hatch cover (carpenter or mason)"]],
  d: [["DOOR", "a door"]], b: [["BED", "a bed (carpenter)"]], t: [["TABLE", "a table"]], c: [["CHAIR", "a chair"]],
  f: [["CABINET", "a cabinet"]], h: [["BOX", "a chest"]], s: [["STATUE", "a statue"]], n: [["COFFIN", "a coffin"]],
  r: [["WEAPONRACK", "a weapon rack"]], a: [["ARMORSTAND", "an armor stand"]], j: [["CAGE", "a cage"]],
  wf: [["ANVIL", "an anvil"]],
};
async function partsNote(key) {
  const parts = BUILD_PARTS[key];
  if (!parts) return "";
  const { value: missing } = await lua(`local out = {}
    for _, p in ipairs(ARGS.parts) do
      local n = 0
      for _, it in ipairs(df.global.world.items.other.IN_PLAY) do
        if df.item_type[it:getType()] == p[1] and stock_available(it) then n = n + 1 break end
      end
      if n == 0 then out[#out + 1] = p[2] end
    end
    emit(out)`, { parts });
  return missing?.length ? `\nNeeds (none free now): ${missing.join(", ")}. The plan waits for them; queue them first or it may be dropped.` : "";
}

// Quickfort silently leaves unusable tiles out of a stockpile or zone, which leaves a ragged edge.
// Name them, usually undug rock or tiles still being mined, so the area can be laid again once ready.
async function skippedTilesNote(out, a) {
  if (!/skipped/i.test(out)) return "";
  const { value } = await lua(`local bad = {}
    for y = ARGS.y, ARGS.y + ARGS.h - 1 do for x = ARGS.x, ARGS.x + ARGS.w - 1 do
      local tt = dfhack.maps.getTileType(x, y, ARGS.z)
      local f = dfhack.maps.getTileFlags(x, y, ARGS.z)
      local shape = tt and df.tiletype_shape[df.tiletype.attrs[tt].shape]
      local why = not tt and 'off map' or f.hidden and 'unrevealed' or (shape ~= 'FLOOR' and shape ~= 'PEBBLES') and (shape:lower() .. (f.dig ~= 0 and ' (still designated for digging)' or ''))
        or (dfhack.buildings.findAtTile(x, y, ARGS.z) and 'building already there') or nil
      if why then bad[#bad + 1] = x .. ',' .. y .. ' ' .. why end
    end end
    emit(bad)`, a);
  if (!value?.length) return "\nNote: some tiles were skipped although the area now looks clear; inspect it with df_look.";
  return `\nNote: ${value.length} tile(s) were left out, so the area is not a clean rectangle: ${value.slice(0, 8).join("; ")}` +
    (value.length > 8 ? "; ..." : "") + ". Wait for digging to finish, then remove it (df_remove allow_built=true) and place it again.";
}

tool("df_zone", "Create a zone rectangle. Bedroom zones require dry floor and completed walls/doors; repair with df_room_plan first. type: m meeting area, b bedroom, h dining hall, n pasture, p pit/pond, w water source, f fishing, o office, D dormitory, B barracks, a archery range (build archery targets A at one end; a squad trains there via df_military barracks), d garbage dump, T tomb (one burial per zone: 1x1 on each coffin), g gather fruit, s sand, c clay. Optional location: tavern, hospital, temple, library, guildhall. A guildhall needs guild=<the petitioning guild's name, e.g. 'Hall of Coal'> (its profession is read from the guild) or profession=<df.profession name>.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1),
    name: z.string().optional(), location: z.enum(["tavern", "hospital", "temple", "library", "guildhall"]).optional(),
    profession: z.string().optional(), guild: z.string().optional() },
  async (a) => {
    // A guild's name says little about its craft ("The Mechanical Guild" is CRAFTSMAN): read it from the guild.
    if (a.location === "guildhall" && a.guild && !a.profession) {
      const { value: g } = await lua(`local want = ARGS.guild:lower()
        for _, e in ipairs(df.global.world.entities.all) do
          if e.type == df.historical_entity_type.Guild then
            local n = dfhack.df2utf(dfhack.translation.translateName(e.name, true))
            if n:lower():find(want, 1, true) and #e.guild_professions > 0 then
              emit({name = n, profession = df.profession[e.guild_professions[0].profession]}) return
            end
          end
        end
        emit(nil)`, a);
      if (!g) return fail(`No guild named like "${a.guild}".`);
      a.profession = g.profession;
    }
    // quickfort makes the zone but silently skips the location when a guildhall has no profession
    if (a.location === "guildhall" && !a.profession)
      return fail("A guildhall needs guild=<the guild's name> or profession=<df.profession name, e.g. CRAFTSMAN>.");
    // a retried call would stack a second zone and a second location on the same room
    if (a.location) {
      const { value: dup } = await lua(`local p = xyz2pos(ARGS.x + (ARGS.w // 2), ARGS.y + (ARGS.h // 2), ARGS.z)
        for _, b in ipairs(dfhack.buildings.findCivzonesAt(p) or {}) do
          if b.location_id >= 0 then emit({zone = b.id, location = b.location_id}) return end
        end
        emit(nil)`, a);
      if (dup) return fail(`Zone ${dup.zone} here already carries location ${dup.location} (see df_location list); not making a second one. Remove that zone first to replace it.`);
    }
    if(a.type==="b"){
      const {value:check}=await luaFile("room_check",{z:a.z,rooms:[{x:a.x,y:a.y,w:a.w,h:a.h}]});
      if(!check?.ok) return fail(JSON.stringify({...check,guidance:"Bedroom zones require dry floor and completed walls/doors. Use df_room_plan protect, repair, wait and verify before zoning."}));
    }
    const props = [];
    if (a.name) props.push(`name="${a.name.replace(/"/g, "")}"`);
    if (a.location) props.push(`location=${a.location}`);
    if (a.location === "guildhall") props.push(`profession=${a.profession.toUpperCase().replace(/[^A-Z_]/g, "")}`);
    const cell = a.type + (props.length ? `{${props.join(" ")}}` : "") + `(${a.w}x${a.h})`;
    await cameraTo(a.x + (a.w >> 1), a.y + (a.h >> 1), a.z, `zone at ${a.x},${a.y},${a.z}`);
    const out = await quickfort("zone", [cell], a.x, a.y, a.z);
    let locNote = "";
    if (a.location && a.name) {
      // Quickfort gives every new location the same generated name; use the requested name as its nickname.
      const { value } = await lua(`local best
        for x = ARGS.x, ARGS.x + ARGS.w - 1 do for y = ARGS.y, ARGS.y + ARGS.h - 1 do
          for _, b in ipairs(dfhack.buildings.findCivzonesAt(xyz2pos(x, y, ARGS.z)) or {}) do
            if not best or b.id > best.id then best = b end
          end
        end end
        local site = dfhack.world.getCurrentSite()
        local loc
        for _, l in ipairs(site and site.buildings or {}) do if best and l.id == best.location_id then loc = l end end
        if loc then loc.name.nickname = ARGS.name emit(dfhack.translation.translateName(loc.name, true)) else emit(nil) end`, a);
      if (value) locNote = `\nLocation named: ${value}`;
    }
    // A tomb zone is one grave: DF assigns it to a single body whatever its size or coffin count.
    const tombNote = a.type === "T" && a.w * a.h > 1
      ? "\nNOTE: a tomb zone holds ONE burial however many coffins it covers. Make a 1x1 tomb zone on each coffin and no zone over the row: a coffin inside two tomb zones gets no burials." : "";
    return text(out + await newIdNote("zone", a) + locNote + tombNote + await skippedTilesNote(out, a));
  });

// Report the id of the zone/stockpile just made, so follow-up calls (assign, barracks, presets) need no listing.
async function newIdNote(kind, a) {
  const { value } = await lua(`local best
    for x = ARGS.x, ARGS.x + ARGS.w - 1 do for y = ARGS.y, ARGS.y + ARGS.h - 1 do
      local list = ARGS.kind == 'zone' and dfhack.buildings.findCivzonesAt(xyz2pos(x, y, ARGS.z))
        or {dfhack.buildings.findAtTile(x, y, ARGS.z)}
      for _, b in ipairs(list or {}) do
        if b and (ARGS.kind == 'zone' or b:getType() == df.building_type.Stockpile) and (not best or b.id > best) then best = b.id end
      end
    end end
    emit(best)`, { ...a, kind });
  return value != null ? `\n${kind === "zone" ? "Zone" : "Stockpile"} id: ${value}` : "";
}

tool("df_blueprint", "Apply a free-form quickfort blueprint. rows are CSV lines (cells separated by commas) starting at x,y,z as the top-left. Use for irregular shapes. dry_run reports what would happen without changing the game.",
  { mode: z.enum(["dig", "build", "place", "zone"]), rows: z.array(z.string()).min(1),
    x: coord, y: coord, z: coord, dry_run: z.boolean().optional(),allow_room_changes:z.boolean().default(false) },
  async (a) => {
    const out = await quickfort(a.mode, a.rows, a.x, a.y, a.z, a.dry_run ? ["--dry-run"] : [],{allow_room_changes:a.allow_room_changes});
    if (a.mode !== "build" || a.dry_run || !/Unsuitable tiles for building/.test(out)) return text(out);
    // Name the cells that got no building, with what is on the tile, so they can be fixed or moved.
    const cells = [];
    a.rows.forEach((row, dy) => row.split(",").forEach((c, dx) => { if (c.trim() && c.trim() !== "`") cells.push({ x: a.x + dx, y: a.y + dy, key: c.trim() }); }));
    const { value } = await lua(`local bad = {}
      for _, c in ipairs(ARGS.cells) do
        if not dfhack.buildings.findAtTile(c.x, c.y, ARGS.z) then
          local tt = dfhack.maps.getTileType(c.x, c.y, ARGS.z)
          local shape = tt and df.tiletype_shape[df.tiletype.attrs[tt].shape] or 'off map'
          bad[#bad + 1] = c.key .. ' at ' .. c.x .. ',' .. c.y .. ': ' .. shape:lower()
        end
      end
      emit(bad)`, { cells, z: a.z });
    return text(out + (value?.length ? `\nNot placed: ${value.join("; ")} (saplings/shrubs block furniture; doors need a wall beside them)` : ""));
  });
