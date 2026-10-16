// Shared plumbing for the Dwarf Fortress MCP server: the server instance, tool registration,
// Lua/quickfort helpers and common schemas. Tool groups live in src/tools/*.js.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { command, lua, luaFile, writeBlueprint } from "./dfhack.js";
export { z, command, lua, luaFile, writeBlueprint };

export const INSTRUCTIONS = `You are the overseer of a live Dwarf Fortress fort, acting through DFHack.
Coordinates are map tiles: x east, y south, z UP (higher z = closer to the sky). Underground is lower z.
Loop: df_status -> df_problems -> df_look (around the area you will change) -> ONE action -> df_wait upkeep=true -> verify.
df_wait has a watchdog: it stops early when a hostile appears, a citizen dies, a mood starts or a caravan arrives, and says why.
React to a WATCHDOG stop before waiting again (df_threats for danger, df_mood check=true for moods, df_trade for caravans).
df_upkeep keeps drink, barrels, spare furniture, goblets, soap and fuel topped up; set its targets once per fort.
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
Camera: the player is watching. df_camera (auto by default) moves their view to the action during df_wait;
before something worth watching (soldiers sent out, a room finished, a trade, a mood starting work) point the camera
there first with a caption: df_camera goto x,y,z caption=... or df_camera follow name=... caption=...
If the player says what they enjoy or dislike watching, record it: df_camera like/dislike categories=[...].
Screen: df_ui opens/closes v50 panels, presses buttons and ticks squads; df_screen read/find/click/key for anything else.
Panels (trade, squads, petitions) ignore Esc from scripts and some freeze time: df_ui close.
Diagnosis: df_threats (hostiles, cursed units, killers), df_items (where something is and why it is unused),
df_squad_status (gear worn vs assigned; df_military equip fixes empty slots), df_mood check=true (can the mood be satisfied?),
df_petition (vets petitioners for curses). Kill orders only work on hostile targets.
Inventory: df_stocks. df_lua runs raw DFHack Lua (call emit(v) to return data). Save with df_save before risky moves.`;

export const server = new McpServer({ name: "dwarf-fortress", version: "0.1.0" }, { instructions: INSTRUCTIONS });

export const text = (s) => ({ content: [{ type: "text", text: s }] });
export const fail = (s) => ({ content: [{ type: "text", text: s }], isError: true });
export const json = (v) => JSON.stringify(v, null, 1);

export function tool(name, description, shape, fn) {
  server.registerTool(name, { description, inputSchema: shape }, async (args) => {
    try {
      return await fn(args ?? {});
    } catch (e) {
      return fail(String(e.message || e));
    }
  });
}

export async function luaTool(name, args) {
  const { value, log } = await luaFile(name, args);
  if (value?.error) return fail(value.error);
  return text(json(value) + (log ? `\n--- log ---\n${log}` : ""));
}

export const coord = z.number().int();
export const optCoord = coord.optional();

export async function quickfort(mode, rows, x, y, zz, extra = []) {
  const name = `last-${mode}`;
  const file = writeBlueprint(name, `#${mode}\n${rows.join("\n")}\n`);
  const out = await command("quickfort", ["run", file, "-c", `${x},${y},${zz}`, ...extra]);
  return out.trim() || "(no output)";
}

export const DIG_KEYS = { dig: "d", channel: "h", up_stair: "u", down_stair: "j", updown_stair: "i", ramp: "r",
  remove_stairs: "z", chop: "t", gather: "p", smooth: "s", engrave: "e", fortify: "F", undesignate: "x" };
