// Shared plumbing for the Dwarf Fortress MCP server: the server instance, tool registration,
// Lua/quickfort helpers and common schemas. Tool groups live in src/tools/*.js.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { command, lua, luaFile, writeBlueprint, removeBlueprint } from "./dfhack.js";
export { z, command, lua, luaFile, writeBlueprint };

// The overseer playbook: sent as the server's instructions, returned by df_help topic=playbook.
export const INSTRUCTIONS = (() => {
  try { return fs.readFileSync(new URL("../PLAYBOOK.md", import.meta.url), "utf8"); }
  catch { return "You are the overseer of a live Dwarf Fortress fort, acting through DFHack. Call df_help topic=playbook."; }
})();

// Settings for any MCP client (all optional):
//   DF_TOOLS        full (default) | core | comma-separated tool names: which tools to expose
//   DF_AGENT_NAME   name shown on camera captions in the game (default "Overseer")
//   DF_WAIT_SECONDS real-time cap for one df_wait call (default 50; keep it under your client's tool timeout)
export const VERSION = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
export const SETTINGS = {
  version: VERSION,
  agentName: process.env.DF_AGENT_NAME || "Overseer",
  waitSeconds: Math.max(5, Math.min(600, Number(process.env.DF_WAIT_SECONDS) || 50)),
};
// A small set for clients with tool limits or smaller models: observe, build, produce, wait, defend, watch.
const CORE_TOOLS = ["df_status", "df_problems", "df_look", "df_threats", "df_alerts", "df_dig", "df_build", "df_zone",
  "df_stockpile", "df_rooms", "df_order", "df_upkeep", "df_mood", "df_military", "df_trade", "df_wait", "df_camera",
  "df_save", "df_help", "df_designations", "df_jobs", "df_remove", "df_room_plan"];
const profile = (process.env.DF_TOOLS || "full").trim();
const enabled = profile === "full" ? null
  : new Set(profile === "core" ? CORE_TOOLS : profile.split(",").map((t) => t.trim()).filter(Boolean));
export const toolProfile = profile;


export const server = new McpServer({ name: "dwarf-fortress", version: VERSION }, { instructions: INSTRUCTIONS });

export const text = (s) => ({ content: [{ type: "text", text: s }] });
export const fail = (s) => ({ content: [{ type: "text", text: s }], isError: true });
export const json = (v) => JSON.stringify(v, null, 1);

export function tool(name, description, shape, fn) {
  if (enabled && !enabled.has(name)) return; // not in the DF_TOOLS profile
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

let blueprintSequence = 0;
function csvRow(line) {
  if (/[\r\n]/.test(line)) throw new Error("Blueprint rows must be individual CSV lines");
  const cells=[]; let cell="", quoted=false;
  for (let i=0;i<line.length;i++) {
    const ch=line[i];
    if (ch==='"' && (quoted || cell.length===0)) {
      if (quoted && line[i+1]==='"') {cell+='"';i++;} else quoted=!quoted;
    } else if (ch==="," && !quoted) {cells.push(cell.trim());cell="";} else cell+=ch;
  }
  if (quoted) throw new Error("Unclosed quote in blueprint row");
  cells.push(cell.trim());return cells;
}
export async function quickfort(mode, rows, x, y, zz, extra = [], options = {}) {
  if (mode === "dig") {
    let priority=4,levels=1,dry_run=false;
    for (let i=0;i<extra.length;i++) {
      if (extra[i]==="-p") priority=Number(extra[++i]);
      else if (extra[i]==="-r") levels=Number(extra[++i].split(",")[1]);
      else if (extra[i]==="--dry-run") dry_run=true;
      else throw new Error("Unsupported dig modifier: "+extra[i]);
    }
    const {value,log}=await luaFile("guarded_dig",{cells:rows.map(csvRow),x,y,z:zz,priority,levels,dry_run,
      ...options,room_plan_path:fileURLToPath(new URL("../lua/room_plan.lua",import.meta.url))});
    if (value?.error) throw new Error(JSON.stringify(value));
    return json(value)+(log?"\n"+log:"");
  }
  const name = `run-${process.pid}-${blueprintSequence++}-${mode}`;
  const file = writeBlueprint(name, `#${mode}\n${rows.join("\n")}\n`);
  try {
    const out = await command("quickfort", ["run", file, "-c", `${x},${y},${zz}`, ...extra]);
    return out.trim() || "(no output)";
  } finally { removeBlueprint(file); }
}

export const DIG_KEYS = { dig: "d", channel: "h", up_stair: "u", down_stair: "j", updown_stair: "i", ramp: "r",
  remove_stairs: "z", chop: "t", gather: "p", smooth: "s", engrave: "e", fortify: "F", undesignate: "x" };
