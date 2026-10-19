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

tool("df_dig", "Designate a rectangle for digging (or channel/stairs/ramp/chop/gather/smooth/undesignate). x1,y1 to x2,y2 inclusive on level z. levels>1 repeats the same rectangle DOWNWARD (useful for updown_stair shafts). Unrevealed tiles can be designated.",
  {
    kind: z.enum(Object.keys(DIG_KEYS)).default("dig"),
    x1: coord, y1: coord, x2: coord, y2: coord, z: coord,
    levels: z.number().int().min(1).max(100).optional(),
    priority: z.number().int().min(1).max(7).optional(),
    allow_room_changes:z.boolean().default(false),
  },
  async (a) => {
    const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2);
    const w = Math.abs(a.x2 - a.x1) + 1, h = Math.abs(a.y2 - a.y1) + 1;
    const extra = [];
    if (a.levels > 1) extra.push("-r", `down,${a.levels}`);
    if (a.priority) extra.push("-p", String(a.priority));
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
        local tiles=0
        if ARGS.kind=='undesignate' then
          for zz=ARGS.z,ARGS.z-(ARGS.levels or 1)+1,-1 do for xx=ARGS.x,ARGS.x+ARGS.w-1 do for yy=ARGS.y,ARGS.y+ARGS.h-1 do
            local f=dfhack.maps.getTileFlags(xx,yy,zz)
            if f and (f.dig~=0 or f.smooth~=0) then tiles=tiles+1 end
          end end end
        end
        emit({marked_plants=n,tile_designations=tiles})`,{...a,x,y,w,h});
      return text(out + `\nVerified: ${value.marked_plants} marked plant(s) in the requested footprint.` +
        (a.kind === "undesignate" ? ` ${value.tile_designations} tile designation(s) remain.` : "") +
        (a.kind !== "undesignate" && value.marked_plants === 0 ? " No tree/plant work is marked. Select tree bases, not canopy or another elevation; use df_designations to inspect." : ""));
    }
    await cameraTo(x + (w >> 1), y + (h >> 1), a.z, `dig ${a.kind} at ${x},${y},${a.z}`);
    // verify: count tiles in the area that now actually carry a designation of this kind
    const field = a.kind === "smooth" ? "smooth" : "dig";
    const { value: v } = await lua(
      `local n = 0
       for zz = ${a.z}, ${a.z} - ${(a.levels ?? 1) - 1}, -1 do
         for x = ${x}, ${x + w - 1} do for y = ${y}, ${y + h - 1} do
           local f = dfhack.maps.getTileFlags(x, y, zz)
           if f and f.${field} ~= 0 then n = n + 1 end
         end end
       end
       emit(n)`);
    const want = w * h * (a.levels ?? 1);
    const note = ["chop", "gather"].includes(a.kind) ? "" :
      a.kind === "undesignate" ? `
Verified: ${v} tile(s) still designated.` :
      `
Verified: ${v} of ${want} tile(s) now carry a ${a.kind} designation` +
      (v === 0 ? " - NOTHING was designated (wrong tile type? already dug? smooth needs rough stone)." : ".");
    return text(out + note);
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
    return text(await quickfort("build", [cell], a.x, a.y, a.z) + (Object.keys(preflight).length ? "\nPreflight: " + JSON.stringify(preflight) : "") +`\nAfter construction finishes: df_screenshot x=${a.x} y=${a.y} z=${a.z}, then df_problems/df_rooms audit. Check workers can leave and passages remain open.`);
  });

tool("df_stockpile", "Create a stockpile rectangle. type is one or more #place letters: a animal, f food, u furniture, n coins, y corpses, r refuse, s stone, w wood, e gems, b bars/blocks, h cloth, l leather, z ammo, S sheets, g finished goods, p weapons, d armor, c custom. e.g. 'fw' = food+wood.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1), name: z.string().optional() },
  async (a) => {
    let cell = a.type;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    await cameraTo(a.x + (a.w >> 1), a.y + (a.h >> 1), a.z, `stockpile at ${a.x},${a.y},${a.z}`);
    const out = await quickfort("place", [`${cell}(${a.w}x${a.h})`], a.x, a.y, a.z);
    return text(out + await skippedTilesNote(out, a));
  });

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

tool("df_zone", "Create a zone rectangle. Bedroom zones require dry floor and completed walls/doors; repair with df_room_plan first. type: m meeting area, b bedroom, h dining hall, n pasture, p pit/pond, w water source, f fishing, o office, D dormitory, B barracks, d garbage dump, T tomb, g gather fruit, s sand, c clay. Optional location: tavern, hospital, temple, library, guildhall.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1),
    name: z.string().optional(), location: z.enum(["tavern", "hospital", "temple", "library", "guildhall"]).optional() },
  async (a) => {
    if(a.type==="b"){
      const {value:check}=await luaFile("room_check",{z:a.z,rooms:[{x:a.x,y:a.y,w:a.w,h:a.h}]});
      if(!check?.ok) return fail(JSON.stringify({...check,guidance:"Bedroom zones require dry floor and completed walls/doors. Use df_room_plan protect, repair, wait and verify before zoning."}));
    }
    const props = [];
    if (a.name) props.push(`name="${a.name.replace(/"/g, "")}"`);
    if (a.location) props.push(`location=${a.location}`);
    const cell = a.type + (props.length ? `{${props.join(" ")}}` : "") + `(${a.w}x${a.h})`;
    await cameraTo(a.x + (a.w >> 1), a.y + (a.h >> 1), a.z, `zone at ${a.x},${a.y},${a.z}`);
    const out = await quickfort("zone", [cell], a.x, a.y, a.z);
    return text(out + await skippedTilesNote(out, a));
  });

tool("df_blueprint", "Apply a free-form quickfort blueprint. rows are CSV lines (cells separated by commas) starting at x,y,z as the top-left. Use for irregular shapes. dry_run reports what would happen without changing the game.",
  { mode: z.enum(["dig", "build", "place", "zone"]), rows: z.array(z.string()).min(1),
    x: coord, y: coord, z: coord, dry_run: z.boolean().optional(),allow_room_changes:z.boolean().default(false) },
  async (a) => text(await quickfort(a.mode, a.rows, a.x, a.y, a.z, a.dry_run ? ["--dry-run"] : [],{allow_room_changes:a.allow_room_changes})));
