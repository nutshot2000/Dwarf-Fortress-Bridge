// Smoke test: node scripts/smoke.mjs [--offline]
// Starts the server, checks every tool registers with a schema, then (unless --offline) runs the
// read-only tools against the running game and reports any that error. Nothing here changes the fort.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { testWatchdog } from "./test-watchdog.mjs";
import assert from "node:assert/strict";
testWatchdog();

const READ_ONLY = [
  ["df_lua", {code:"assert(loadfile(ARGS.path))(ARGS,emit)",args:{
    path:fileURLToPath(new URL("./test-room-repair.lua",import.meta.url)),
    root:fileURLToPath(new URL("../",import.meta.url)).replace(/\\/g,"/")
  }}],
  ["df_lua", {code:"assert(loadfile(ARGS.path))(ARGS,emit)",args:{
    path:fileURLToPath(new URL("./test-room-guard.lua",import.meta.url)),
    root:fileURLToPath(new URL("../",import.meta.url)).replace(/\\/g,"/")
  }}],
  ["df_room_plan", {}],
  ["df_blueprint", {mode:"dig",rows:["x"],x:0,y:0,z:0,dry_run:true}],
  ["df_lua", { code: "local b=df.global.world.buildings.all[0]; if b then local a={building_id=b.id,dry_run=true,allow_built=true}; local env=setmetatable({ARGS=a,emit=emit,need_map=need_map},{__index=_ENV}); assert(loadfile(ARGS.path,'t',env))() else emit({skipped=true}) end",args:{
    path:fileURLToPath(new URL("../lua/remove.lua",import.meta.url))
  }}],
  ["df_designations", { limit: 3 }],
  ["df_trade", { action: "goods", search: "barrel", limit: 2, dry_run: true }],
  ["df_lua", { code: "return {return_value_supported=true}" }],
  ["df_lua", { code: "assert(loadfile(ARGS.path))(ARGS,emit)",args:{
    path:fileURLToPath(new URL("./test-coach.lua",import.meta.url)),
    root:fileURLToPath(new URL("../",import.meta.url)).replace(/\\/g,"/")
  }}],
  ["df_tutorial", {}], ["df_screen", { action: "read", layer: "base", y1: 0, y2: 2 }],
  ["df_status", {}], ["df_problems", {}], ["df_alerts", {}], ["df_units", {}], ["df_announcements", {}],
  ["df_look", { radius: 3 }], ["df_stocks", {}], ["df_jobs", { limit: 5 }], ["df_order", {}],
  ["df_jobs", { action: "suspended" }], ["df_stocks", { type: "WOOD" }],
  ["df_lua", { code: "assert(loadfile(ARGS.test_path))(ARGS, emit, {usable=stock_usable, available=stock_available, warning=container_warning, construction=construction_review, try=try})", args: {
    test_path: fileURLToPath(new URL("./test-runtime.lua", import.meta.url)),
    heartbeat_path: fileURLToPath(new URL("../lua/heartbeat.lua", import.meta.url)),
  } }],
  ["df_lua", { code: "assert(loadfile(ARGS.test_path))(ARGS, emit)", args: {
    test_path: fileURLToPath(new URL("./test-look.lua", import.meta.url)),
    look_path: fileURLToPath(new URL("../lua/look.lua", import.meta.url)),
  } }],
  ["df_noble", {}], ["df_rooms", { action: "list" }], ["df_rooms", { action: "audit" }],
  ["df_military", {}], ["df_schedule", {}], ["df_location", {}], ["df_animals", {}], ["df_standing", {}],
  ["df_crop", {}], ["df_pile", { action: "status" }], ["df_kitchen", {}], ["df_burrow", {}],
  ["df_trade", {}], ["df_justice", {}], ["df_mood", {}], ["df_levers", {}], ["df_workshop", { action: "list" }],
  ["df_labor", {}], ["df_petition", {}], ["df_dump", { z: 170 }], ["df_screen", { action: "read", y1: 0, y2: 2 }],
  ["df_threats", {}], ["df_items", { search: "barrel", limit: 3 }], ["df_squad_status", {}], ["df_upkeep", {}],
  ["df_mood", { check: true }], ["df_camera", { action: "status" }], ["df_camera", { action: "prefs" }],
  ["df_ui", { action: "panels" }], ["df_threats", { days: 30 }], ["df_help", {}],
];

const offline = process.argv.includes("--offline");
const server = fileURLToPath(new URL("../src/server.js", import.meta.url));
const client = new Client({ name: "df-bridge-smoke", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server], env: { ...process.env } }));

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
  try {
    const call=async(name,args)=>{
      const res=await client.callTool({name,arguments:args});
      assert(!res.isError,(res.content??[]).map(c=>c.text).join("\n"));
      return JSON.parse(res.content.map(c=>c.text).join("\n"));
    };
    const r=(await call("df_room_plan",{})).rooms.find(r=>r.enclosed);
    if(r){
      const snapshot=()=>call("df_lua",{code:"local n=0 for _,it in ipairs(df.global.world.items.all) do if it.flags.dump then n=n+1 end end emit({buildings=#df.global.world.buildings.all,marked_dump=n,plans=dfhack.persistent.getSiteData('df-bridge/room-plans',{})})"});
      const before=await snapshot();
      for(let i=0;i<2;i++){
        const repair=await call("df_room_plan",{action:"repair",id:r.id});
        assert(repair.dry_run&&repair.wall_jobs===0&&repair.door_jobs===0);
        assert(repair.next_step.startsWith("Nothing to repair"));
      }
      const tidy=await call("df_room_plan",{action:"tidy",id:r.id});
      assert(tidy.dry_run);
      if(tidy.items===0) assert(!tidy.next_step.startsWith("Repeat tidy"));
      assert.deepEqual(await snapshot(),before,"room previews must not mutate plans, buildings or dump marks");
      console.log("  ✓ room repair/tidy previews: finished-room feedback, repetition and no mutations");
    } else console.log("  - room helper preview test skipped: no completed room in this fort");
  } catch(e){failures++;console.log(`  ✗ room helper previews: ${e.message}`);}
}
await client.close();
console.log(failures ? `${failures} problem(s)` : "all good");
process.exitCode = failures ? 1 : 0;
