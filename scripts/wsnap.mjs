// node scripts/wsnap.mjs <unit_id> <out.json> [compare.json]: wide snapshot, optional diff
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { lua } from "../src/dfhack.js";
const [id, out, cmp] = process.argv.slice(2);
const code = readFileSync(new URL("./wide-snapshot.lua", import.meta.url), "utf8");
const { value } = await lua(code, { unit_id: Number(id) });
writeFileSync(out, JSON.stringify(value));
console.log("saved", out, Object.keys(value).length, "keys");
if (cmp && existsSync(cmp)) {
  const old = JSON.parse(readFileSync(cmp, "utf8"));
  for (const k of new Set([...Object.keys(old), ...Object.keys(value)]))
    if (old[k] !== value[k] && !/scroll|hover|anim|frame|timer_|cursor/i.test(k)) console.log(k, ":", old[k], "->", value[k]);
}
