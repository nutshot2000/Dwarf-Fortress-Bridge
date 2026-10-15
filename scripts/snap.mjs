// node scripts/snap.mjs <unit_id> <out.json>: run noble-snapshot.lua and save the result
import { readFileSync, writeFileSync } from "node:fs";
import { lua } from "../src/dfhack.js";
const [id, out] = process.argv.slice(2);
const code = readFileSync(new URL("./noble-snapshot.lua", import.meta.url), "utf8");
const { value } = await lua(code, { unit_id: Number(id) });
writeFileSync(out, JSON.stringify(value, null, 1));
console.log("saved", out, "events", value.events);
