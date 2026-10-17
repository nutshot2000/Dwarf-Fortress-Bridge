// Tools: production.
import fs from "node:fs";
import path from "node:path";
import { DF_DIR } from "../dfhack.js";
import { tool, luaTool, text, fail, z, command, lua, luaFile } from "../core.js";

// Orders without a material never get dispatched (the game's own UI always sets one), so pick a
// sensible default per job and let the caller override it.
const WOOD_JOBS = /^(ConstructBed|MakeBarrel|ConstructChest|ConstructBin|MakeBucket|ConstructCabinet|ConstructCoffin|ConstructWeaponRack|ConstructArmorStand|ConstructHatchCover|ConstructSplint|ConstructCrutch|MakeCage|MakeAnimalTrap|ConstructGrate|ConstructFloodgate)$/;
const STONE_JOBS = /^(ConstructTable|ConstructThrone|ConstructDoor|ConstructStatue|ConstructSlab|ConstructQuern|ConstructMillstone|MakeGoblet|MakeCrafts|ConstructBlocks|ConstructBox|ConstructMechanisms)$/;
const CATEGORY_MATS = ["wood", "plant", "cloth", "silk", "leather", "bone", "shell", "yarn", "tooth", "horn", "pearl", "soap"];

tool("df_order", "Queue a manager work order (needs a MANAGER; df_noble repair if the game says one is required). job is a df.job_type name, e.g. ConstructBed, MakeBarrel, ConstructTable, ConstructThrone, ConstructDoor, BrewDrink, PrepareMeal, ConstructBlocks. material: wood, stone, bone, leather, cloth, ... (defaults: wood for carpenter jobs, stone for mason jobs). repeat: daily/weekly/monthly/seasonally/yearly. Metal gear: job MakeArmor/MakeHelm/MakePants/MakeGloves/MakeShoes/MakeShield/MakeWeapon with item_subtype (ITEM_ARMOR_BREASTPLATE, ITEM_ARMOR_MAIL_SHIRT, ITEM_HELM_HELM, ITEM_PANTS_GREAVES, ITEM_GLOVES_GAUNTLETS, ITEM_SHOES_BOOTS, ITEM_SHIELD_SHIELD, ITEM_WEAPON_AXE_BATTLE, ITEM_WEAPON_SPEAR, ITEM_WEAPON_PICK...) and material INORGANIC:IRON. Brewing, cooking and many crafts are reactions: pass reaction instead of job (BREW_DRINK_FROM_PLANT, BREW_DRINK_FROM_PLANT_GROWTH, MAKE_SOAP...). Omit job to list orders; cancel_id removes an order (and its pending jobs). df_cmd 'workorder -l <filter>' lists job names.",
  { job: z.string().optional(), reaction: z.string().optional(), item_subtype: z.string().optional(), amount: z.number().int().min(1).max(1000).optional(), material: z.string().optional(),
    repeat: z.enum(["daily", "weekly", "monthly", "seasonally", "yearly"]).optional(),
    cancel_id: z.number().int().optional() },
  async (a) => {
    if (a.cancel_id !== undefined) {
      const { value } = await lua(
        `local id = ${a.cancel_id}
         local orders = df.global.world.manager_orders.all
         for i = #orders - 1, 0, -1 do
           if orders[i].id == id then
             local jobs = 0
             for _, j in require('utils').listpairs(df.global.world.jobs.list) do
               if j.order_id == id and not j.flags.working then dfhack.job.removeJob(j) jobs = jobs + 1 end
             end
             orders:erase(i)
             emit({cancelled = id, jobs_removed = jobs}) return
           end
         end
         emit({error = 'no order ' .. id})`);
      if (value?.error) return fail(value.error);
      return text(JSON.stringify(value, null, 1));
    }
    if (a.reaction) { a.job = "CustomReaction"; }
    if (!a.job) return luaTool("orders");
    const { out, order } = await queueOrder(a);
    return text((out.trim() || "Queued") + `\norder: ${JSON.stringify(order)}`);
  });

// Build and queue a manager order (shared by df_order and df_upkeep).
async function queueOrder(a) {
  const job = a.reaction ? "CustomReaction" : a.job;
  const order = { job, amount_total: a.amount ?? 1 };
  if (a.reaction) order.reaction = a.reaction.toUpperCase();
  if (a.item_subtype) order.item_subtype = a.item_subtype.toUpperCase();
  const mat = (a.material || (WOOD_JOBS.test(job) ? "wood" : STONE_JOBS.test(job) ? "stone" : "")).toLowerCase();
  if (CATEGORY_MATS.includes(mat)) order.material_category = [mat];
  else if (mat === "stone" || mat === "rock") order.material = "INORGANIC";
  else if (mat) order.material = mat.toUpperCase();
  if (a.repeat) order.frequency = a.repeat[0].toUpperCase() + a.repeat.slice(1);
  const out = await command("workorder", [JSON.stringify(order)]);
  return { out, order };
}

// ---------- upkeep: keep everyday stocks topped up ----------
const UPKEEP_FILE = path.join(DF_DIR, "dfhack-config", "df-bridge", "upkeep.json");
const UPKEEP_DEFAULTS = { drink_per_dwarf: 5, empty_storage: 10, free_beds: 3, free_doors: 2, free_cabinets: 2,
  free_chests: 2, goblets: 10, soap: 5, fuel: 30 };
export function upkeepTargets() {
  try { return { ...UPKEEP_DEFAULTS, ...JSON.parse(fs.readFileSync(UPKEEP_FILE, "utf8")) }; }
  catch { return { ...UPKEEP_DEFAULTS }; }
}
// What each stock is refilled with; per = items one order unit yields.
const REFILL = [
  { key: "drink", have: (s) => s.drink, want: (t, s) => t.drink_per_dwarf * s.pop, per: 5,
    order: { reaction: "BREW_DRINK_FROM_PLANT" }, pending: "CustomReaction:BREW_DRINK_FROM_PLANT", needs: (s) => s.plants > 0 },
  { key: "empty_storage", have: (s) => s.empty_barrels + s.empty_pots, want: (t) => t.empty_storage, per: 1,
    order: { job: "MakeBarrel" }, pending: ["MakeBarrel", "MakeTool:ITEM_TOOL_LARGE_POT"] },
  { key: "free_beds", have: (s) => s.free_beds, want: (t) => t.free_beds, per: 1, order: { job: "ConstructBed" }, pending: "ConstructBed" },
  { key: "free_doors", have: (s) => s.free_doors, want: (t) => t.free_doors, per: 1, order: { job: "ConstructDoor" }, pending: "ConstructDoor" },
  { key: "free_cabinets", have: (s) => s.free_cabinets, want: (t) => t.free_cabinets, per: 1, order: { job: "ConstructCabinet" }, pending: "ConstructCabinet" },
  { key: "free_chests", have: (s) => s.free_chests, want: (t) => t.free_chests, per: 1, order: { job: "ConstructChest" }, pending: "ConstructChest" },
  { key: "goblets", have: (s) => s.goblets, want: (t) => t.goblets, per: 1, order: { job: "MakeGoblet" }, pending: "MakeGoblet" },
  { key: "soap", have: (s) => s.soap, want: (t) => t.soap, per: 1, order: { reaction: "MAKE_SOAP_FROM_TALLOW" },
    pending: "CustomReaction:MAKE_SOAP_FROM_TALLOW", chain: [{ job: "MakeLye" }, { job: "MakeAsh", material: "wood" }] },
  { key: "fuel", have: (s) => s.fuel, want: (t) => t.fuel, per: 1, order: { job: "MakeCharcoal", material: "wood" }, pending: "MakeCharcoal" },
];

tool("df_upkeep", "Keep everyday stocks topped up with work orders: drink (per dwarf), empty barrels/pots, spare beds, doors, cabinets, chests, goblets, soap (with its lye/ash chain) and fuel. check: report each stock vs target and what is already queued. apply: queue only the shortfall (never duplicates running orders). set: change targets (saved per fort), e.g. {drink_per_dwarf: 6, goblets: 20}. df_wait upkeep=true runs apply after each wait.",
  { action: z.enum(["check", "apply", "set"]).default("check"), targets: z.record(z.string(), z.number()).optional() },
  async (a) => text(await runUpkeep(a.action, a.targets)));

export async function runUpkeep(action = "check", targets) {
  if (action === "set") {
    const t = { ...upkeepTargets(), ...(targets ?? {}) };
    fs.mkdirSync(path.dirname(UPKEEP_FILE), { recursive: true });
    fs.writeFileSync(UPKEEP_FILE, JSON.stringify(t, null, 1));
    return `Targets saved: ${JSON.stringify(t)}`;
  }
  const t = upkeepTargets();
  const { value } = await luaFile("upkeep", {});
  if (!value?.stock) throw new Error(value?.error ?? "upkeep scan failed");
  const { stock, pending } = value;
  const lines = [];
  for (const r of REFILL) {
    const have = r.have(stock), want = Math.ceil(r.want(t, stock));
    const queued = [].concat(r.pending).reduce((n, k) => n + (pending[k] ?? 0), 0) * r.per;
    const short = Math.max(0, want - have - queued);
    let note = "";
    if (short > 0 && r.needs && !r.needs(stock)) note = " (no ingredients)";
    else if (short > 0 && action === "apply") {
      const amount = Math.ceil(short / r.per);
      await queueOrder({ ...r.order, amount });
      for (const c of r.chain ?? []) await queueOrder({ ...c, amount });
      note = ` -> queued ${amount}`;
    } else if (short > 0) note = " (short)";
    lines.push(`${r.key.padEnd(14)} ${String(have).padStart(5)} / ${String(want).padEnd(5)} queued ${queued}${note}`);
  }
  return `Upkeep ${action} (stock / target):\n` + lines.join("\n");
}
