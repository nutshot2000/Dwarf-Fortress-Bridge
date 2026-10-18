// Tools: observe.
import { tool, luaTool, text, fail, optCoord, z, luaFile } from "../core.js";
import { upkeepTargets } from "./production.js";

tool("df_status", "Fort overview: date, pause state, population, idle/stressed counts, food/drink/wood/stone stocks, hostiles, map size and the player's current view.",
  {}, () => luaTool("status"));

tool("df_problems", "Early-warning scan sorted by severity: food/drink shortages, strange moods, stress, starvation, hostiles, missing beds/still/farms/tables, idle labour.",
  {}, () => luaTool("problems", { empty_storage_target: Math.max(0, Math.ceil(upkeepTargets().empty_storage)) }));

tool("df_units", "List citizens: id, name, profession, current job, position, stress, mood, hunger/thirst flags and top skills.",
  {}, () => luaTool("units"));

tool("df_announcements", "Recent game announcements (newest last). Pass since=<last_id> to get only new ones.",
  { since: z.number().int().optional(), limit: z.number().int().min(1).max(100).optional() },
  (a) => luaTool("announcements", a));

tool("df_look", "ASCII map slice of one z-level plus lists of units and buildings in it. A marks exposed aquifer tiles; a warning lists their coordinates. Hidden aquifers are not revealed. Defaults to the player's current view. radius 3-40.",
  { x: optCoord, y: optCoord, z: optCoord, radius: z.number().int().min(3).max(40).optional() },
  async (a) => {
    const { value } = await luaFile("look", a);
    if (value?.error) return fail(value.error);
    const { rows, x1, y1, x2, y2, z: zz, units, buildings, map_size } = value;
    const aquifers = value.aquifer_tiles ?? [];
    const ice = value.ice_tiles ?? [];
    const flooded = value.flooded_buildings ?? [];
    const hazardWarning = (ice.length ? `WARNING: ${ice.length} exposed frozen-water tiles. Ice can thaw and flood adjacent excavations. At: ${ice.slice(0,12).map(p => `${p.x},${p.y},${zz}`).join("; ")}\n` : "") +
      (flooded.length ? `WARNING: ${flooded.length} building/stockpile tiles contain liquid. At: ${flooded.slice(0,12).map(p => `${p.x},${p.y},${zz} depth ${p.depth}`).join("; ")}\n` : "");
    const waterWarning = aquifers.length
      ? `WARNING: ${aquifers.length} exposed aquifer tile(s); A marks dry tiles, wet tiles keep their liquid glyph. Avoid breaching them without a water-control plan. At: ` +
        aquifers.slice(0, 12).map((p) => `${p.x},${p.y},${zz}`).join("; ") +
        (aquifers.length > 12 ? "; ..." : "") + "\n"
      : "";
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
      waterWarning + hazardWarning + `${ruler}\n${body}\n\nunits:\n${people.join("\n") || "  none"}\nanimals: ${animals || "none"}\n` +
      `buildings:\n${blds.join("\n") || "  none"}`);
  });
