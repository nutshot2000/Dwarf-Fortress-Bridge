// Tools: designate.
import { cameraTo } from "../camera.js";
import { server, tool, luaTool, quickfort, text, fail, json, coord, optCoord, DIG_KEYS, z, command, lua, luaFile, writeBlueprint } from "../core.js";

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
    const out = await quickfort("dig", [`${DIG_KEYS[a.kind]}(${w}x${h})`], x, y, a.z, extra);
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

tool("df_build", "Place a building with a quickfort #build key (see df_help). Multi-tile buildings like workshops ('wc' carpenter, 'wm' mason, 'wl' still, 'wz' kitchen, 'ww' farmer, 'wr' craftsdwarf, 'D' trade depot) are placed by their CENTRE tile. Give w,h for area buildings (farm plot 'p', roads, constructions 'Cw' wall / 'Cf' floor), then x,y is the top-left.",
  { key: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1).optional(), h: z.number().int().min(1).optional(),
    name: z.string().optional() },
  async (a) => {
    let cell = a.key;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    if (a.w || a.h) cell += `(${a.w ?? 1}x${a.h ?? 1})`;
    await cameraTo(a.x, a.y, a.z, `build ${a.key} at ${a.x},${a.y},${a.z}`);
    return text(await quickfort("build", [cell], a.x, a.y, a.z));
  });

tool("df_stockpile", "Create a stockpile rectangle. type is one or more #place letters: a animal, f food, u furniture, n coins, y corpses, r refuse, s stone, w wood, e gems, b bars/blocks, h cloth, l leather, z ammo, S sheets, g finished goods, p weapons, d armor, c custom. e.g. 'fw' = food+wood.",
  { type: z.string().min(1), x: coord, y: coord, z: coord,
    w: z.number().int().min(1), h: z.number().int().min(1), name: z.string().optional() },
  async (a) => {
    let cell = a.type;
    if (a.name) cell += `{name="${a.name.replace(/"/g, "")}"}`;
    await cameraTo(a.x + (a.w >> 1), a.y + (a.h >> 1), a.z, `stockpile at ${a.x},${a.y},${a.z}`);
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
    await cameraTo(a.x + (a.w >> 1), a.y + (a.h >> 1), a.z, `zone at ${a.x},${a.y},${a.z}`);
    return text(await quickfort("zone", [cell], a.x, a.y, a.z));
  });

tool("df_blueprint", "Apply a free-form quickfort blueprint. rows are CSV lines (cells separated by commas) starting at x,y,z as the top-left. Use for irregular shapes. dry_run reports what would happen without changing the game.",
  { mode: z.enum(["dig", "build", "place", "zone"]), rows: z.array(z.string()).min(1),
    x: coord, y: coord, z: coord, dry_run: z.boolean().optional() },
  async (a) => text(await quickfort(a.mode, a.rows, a.x, a.y, a.z, a.dry_run ? ["--dry-run"] : [])));
