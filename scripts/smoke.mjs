// Smoke test: node scripts/smoke.mjs [--offline]
// Starts the server, checks every tool registers with a schema, then (unless --offline) runs the
// read-only tools against the running game and reports any that error. Nothing here changes the fort.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const READ_ONLY = [
  ["df_status", {}], ["df_problems", {}], ["df_alerts", {}], ["df_units", {}], ["df_announcements", {}],
  ["df_look", { radius: 3 }], ["df_stocks", {}], ["df_jobs", { limit: 5 }], ["df_order", {}],
  ["df_noble", {}], ["df_rooms", { action: "list" }], ["df_rooms", { action: "audit" }],
  ["df_military", {}], ["df_schedule", {}], ["df_location", {}], ["df_animals", {}], ["df_standing", {}],
  ["df_crop", {}], ["df_pile", { action: "status" }], ["df_kitchen", {}], ["df_burrow", {}],
  ["df_trade", {}], ["df_justice", {}], ["df_mood", {}], ["df_levers", {}], ["df_workshop", { action: "list" }],
  ["df_labor", {}], ["df_petition", {}], ["df_dump", { z: 170 }], ["df_screen", { action: "read", y1: 0, y2: 2 }],
  ["df_threats", {}], ["df_items", { search: "barrel", limit: 3 }], ["df_squad_status", {}], ["df_upkeep", {}],
  ["df_help", {}],
];

const offline = process.argv.includes("--offline");
const server = fileURLToPath(new URL("../src/server.js", import.meta.url));
const client = new Client({ name: "df-bridge-smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));

const tools = (await client.listTools()).tools;
const names = new Set(tools.map((t) => t.name));
let failures = 0;
console.log(`${tools.length} tools registered`);
for (const t of tools) {
  if (!t.description || !t.inputSchema) { console.log(`  ✗ ${t.name}: missing description or schema`); failures++; }
}
for (const [name] of READ_ONLY) {
  if (!names.has(name)) { console.log(`  ✗ ${name}: not registered`); failures++; }
}

if (!offline) {
  for (const [name, args] of READ_ONLY) {
    if (!names.has(name)) continue;
    const t0 = Date.now();
    try {
      const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });
      const out = (res.content ?? []).map((c) => c.text).join("\n");
      const bad = res.isError || /Lua error|stack traceback/.test(out);
      if (bad) failures++;
      console.log(`  ${bad ? "✗" : "✓"} ${name} ${JSON.stringify(args)} ${Date.now() - t0}ms${bad ? "\n      " + out.split("\n").slice(0, 3).join("\n      ") : ""}`);
    } catch (e) {
      failures++;
      console.log(`  ✗ ${name}: ${e.message}`);
    }
  }
}
await client.close();
console.log(failures ? `${failures} problem(s)` : "all good");
process.exitCode = failures ? 1 : 0;
