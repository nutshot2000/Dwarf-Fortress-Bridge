// Shared plumbing for the Dwarf Fortress MCP server: the server instance, tool registration,
// Lua/quickfort helpers and common schemas. Tool groups live in src/tools/*.js.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { command, lua, luaFile, writeBlueprint } from "./dfhack.js";
export { z, command, lua, luaFile, writeBlueprint };

export const INSTRUCTIONS = `You are the overseer of a live Dwarf Fortress fort, acting through DFHack.
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
