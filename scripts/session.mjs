// Dev helper: run several tools in ONE server session (state such as the camera director lives in the server).
// node scripts/session.mjs '[["df_camera",{"action":"follow","name":"Urist"}],["df_wait",{"days":1}]]'
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const server = fileURLToPath(new URL("../src/server.js", import.meta.url));
const client = new Client({ name: "camtest", version: "0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [server] }));
const call = async (name, args) => (await client.callTool({ name, arguments: args }, undefined, { timeout: 120000 })).content.map((c) => c.text).join("\n");
const view = async () => call("df_lua", { code: "emit({df.global.window_x, df.global.window_y, df.global.window_z})" });

for (const [name, args] of JSON.parse(process.argv[2])) {
  console.log(`== ${name} ${JSON.stringify(args)}`);
  console.log((await call(name, args)).split("\n").filter((l) => /^Ran|Camera|Following|Looking|Camera|mode|WATCHDOG/.test(l) || name !== "df_wait").slice(0, 8).join("\n"));
  console.log("   view:", (await view()).replace(/\s+/g, " "));
}
await client.close();
