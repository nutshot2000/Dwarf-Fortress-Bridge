// Tools: production.
import { server, tool, luaTool, quickfort, text, fail, json, coord, optCoord, DIG_KEYS, z, command, lua, luaFile, writeBlueprint } from "../core.js";

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
      return text(JSON.stringify(value, null, 1));
    }
    if (a.reaction) { a.job = "CustomReaction"; }
    if (!a.job) return luaTool("orders");
    const order = { job: a.job, amount_total: a.amount ?? 1 };
    if (a.reaction) order.reaction = a.reaction.toUpperCase();
    if (a.item_subtype) order.item_subtype = a.item_subtype.toUpperCase();
    const mat = (a.material || (WOOD_JOBS.test(a.job) ? "wood" : STONE_JOBS.test(a.job) ? "stone" : "")).toLowerCase();
    if (CATEGORY_MATS.includes(mat)) order.material_category = [mat];
    else if (mat === "stone" || mat === "rock") order.material = "INORGANIC";
    else if (mat) order.material = mat.toUpperCase();
    if (a.repeat) order.frequency = a.repeat[0].toUpperCase() + a.repeat.slice(1);
    const out = await command("workorder", [JSON.stringify(order)]);
    return text((out.trim() || "Queued") + `\norder: ${JSON.stringify(order)}`);
  });
