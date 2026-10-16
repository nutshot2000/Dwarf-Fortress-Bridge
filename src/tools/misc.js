// Tools: misc.
import { server, tool, luaTool, quickfort, text, fail, json, coord, optCoord, DIG_KEYS, z, command, lua, luaFile, writeBlueprint } from "../core.js";

tool("df_view", "Move the player's camera to x,y,z so they can see what you are looking at.",
  { x: coord, y: coord, z: coord },
  async (a) => {
    await lua(`dfhack.gui.revealInDwarfmodeMap(xyz2pos(ARGS.x, ARGS.y, ARGS.z), true, true) emit(true)`, a);
    return text(`Camera centred on ${a.x},${a.y},${a.z}.`);
  });

tool("df_save", "Save the fort (DFHack quicksave).", {},
  async () => text((await command("quicksave")).trim() || "Saved."));

tool("df_cmd", "Run any DFHack console command and return its output (e.g. 'prospect', 'workorder -l Brew', 'autolabor', 'dig-now'). Some commands cheat; prefer normal play.",
  { command: z.string().min(1), args: z.array(z.string()).optional() },
  async (a) => text((await command(a.command, a.args ?? [])).trim() || "(no output)"));

tool("df_lua", "Run raw DFHack Lua inside the game. Helpers available: emit(value) returns JSON, try(fn, default), unit_name(u), unit_job(u), citizens(), date_info(), pos_of(p). ARGS holds the args object.",
  { code: z.string().min(1), args: z.record(z.string(), z.any()).optional() },
  async (a) => {
    const { value, log } = await lua(a.code, a.args ?? {});
    return text((value !== null ? json(value) : "") + (log ? `\n${log}` : "") || "(no output)");
  });

tool("df_help", "Quickfort key reference and early-fort checklist.", {}, async () => text(HELP));

const HELP = `BUILD KEYS (df_build): b bed, c chair, t table, d door, h container/box, f cabinet, r weapon rack, a armor stand,
n coffin, s statue, l well, H hatch, j cage, v restraint, A archery target, k vermin catcher, D trade depot (5x5)
Workshops (3x3, centre tile): wc carpenter, wm stoneworker(mason), wl still, wz kitchen, ww farmer, wu butcher,
wn tanner, we leatherworks, ~c bookcase, wr craftsdwarf, wf metalsmith (forge), wj jeweler, wt mechanic, wo loom, wk clothier,
wq quern, wM millstone, wb bowyer, wh fishery, wy ashery, wd dyer, wS soap maker, wp screw press, ws siege
Furnaces: ew wood furnace, es smelter, eg glass furnace, ek kiln (el/ea/en magma versions)
Area (top-left + w,h): p farm plot, o paved road, O dirt road, Cw wall, CW reinforced wall, Cf floor, Cr ramp,
Cu/Cd/Cx stairs, CF fortification
DIG KINDS (df_dig): dig, channel, up_stair, down_stair, updown_stair, ramp, remove_stairs, chop, gather, smooth,
engrave, fortify, undesignate
FIRST-YEAR CHECKLIST: 1) dig an updown stair shaft down 2-5 levels into stone near the wagon
2) dig a work area + storage room 3) stockpiles: food(f), wood(w), stone(s) near the entrance; 4) carpenter wc,
mason wm, still wl, kitchen wz, farmer ww 5) underground farm plots on soil (plant plump helmets: df_lua or in-game)
6) beds: MakeBed orders + bedroom/dormitory zone 7) dining hall: tables+chairs + zone h 8) meeting area zone
9) BrewDrink orders keep drink > 5 per dwarf 10) trade depot D, basic defence (door + hatch, or a drawbridge g).`;
