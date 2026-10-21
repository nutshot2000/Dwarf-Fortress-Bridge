// Tools: minecarts (track, track stops, hauling routes, carts).
import { tool, luaTool, text, fail, z, lua, quickfort, optCoord } from "../core.js";

const DUMP = { n: "n", s: "s", e: "e", w: "w", north: "n", south: "s", east: "e", west: "w" };

tool("df_minecart", "Minecart hauling. list: routes (stops, stockpile links, departure conditions, cart), free carts and track stops. " +
  "track: carve a straight track line x1,y1 -> x2,y2 on z (natural floor only, one row or one column; carve each leg of a bend separately, they join). " +
  "stop: build a track stop at x,y,z (1 mechanism) and add it to route (name; created if new) as its next stop; take_from=[stockpile ids] loads from those piles; " +
  "dump=n|s|e|w makes it tip the cart that way (put the receiving stockpile on that side). A stop without take_from is set to want nothing, so the cart unloads there into piles linked with mode=give. " +
  "link: route, stop_id, stockpile_id, mode take|give. condition: route, stop_id, direction n|s|e|w, mode push|ride|guide, load_percent (e.g. 100 = leave when full), timeout (ticks); clear=true removes old ones first. " +
  "assign: put a free minecart on route (make carts with df_order job=MakeMinecart). rename: route, name. " +
  "A working line: track from A to B, stop at A (take_from the source pile, condition push toward B when full), stop at B (dump onto the target pile, condition push back toward A), a cart assigned.",
  { action: z.enum(["list", "track", "stop", "link", "condition", "assign", "rename"]).default("list"),
    x: optCoord, y: optCoord, z: optCoord, x1: optCoord, y1: optCoord, x2: optCoord, y2: optCoord,
    route: z.union([z.string(), z.number().int()]).optional(), name: z.string().optional(),
    stop_id: z.number().int().optional(), stockpile_id: z.number().int().optional(),
    take_from: z.array(z.number().int()).optional(), dump: z.enum(["n", "s", "e", "w", "north", "south", "east", "west"]).optional(),
    mode: z.string().optional(), direction: z.enum(["n", "s", "e", "w", "north", "south", "east", "west"]).optional(),
    load_percent: z.number().int().min(0).max(100).optional(), timeout: z.number().int().min(0).optional(),
    at_most: z.boolean().optional(), clear: z.boolean().optional(), dry_run: z.boolean().optional() },
  async (a) => {
    if (a.action === "track") {
      if ([a.x1, a.y1, a.x2, a.y2, a.z].some((v) => v === undefined)) return fail("track needs x1,y1,x2,y2,z");
      if (a.x1 !== a.x2 && a.y1 !== a.y2) return fail("Track lines must be straight (same x or same y). Carve each leg of a bend separately.");
      const x = Math.min(a.x1, a.x2), y = Math.min(a.y1, a.y2);
      const w = Math.abs(a.x2 - a.x1) + 1, h = Math.abs(a.y2 - a.y1) + 1;
      // quickfort works out each tile's directions from the line's shape and adds to any track already there
      const out = await quickfort("dig", [`T(${w}x${h})`], x, y, a.z, a.dry_run ? ["--dry-run"] : []);
      return text(`${out}\nCarving ${w * h} tile(s) of track (miners do it; needs natural floor). Bends: carve the second leg from the corner tile.`);
    }
    if (a.action === "stop") {
      if ([a.x, a.y, a.z].some((v) => v === undefined)) return fail("stop needs x,y,z");
      if (!a.route) return fail("stop needs route (a name; a new route is created if none has it)");
      const key = "trackstop" + (a.dump ? DUMP[a.dump] : "");
      const props = [`route="${String(a.route).replace(/"/g, "")}"`];
      if (a.name) props.push(`name="${a.name.replace(/"/g, "")}"`);
      if (a.take_from?.length) props.push(`take_from=${a.take_from.join(",")}`);
      const out = await quickfort("build", [`${key}{${props.join(" ")}}`], a.x, a.y, a.z, a.dry_run ? ["--dry-run"] : []);
      if (a.dry_run) return text(out);
      const { value } = await lua(`local H = df.global.plotinfo.hauling
        for _, r in ipairs(H.routes) do if r.name:lower() == tostring(ARGS.route):lower() or r.id == tonumber(ARGS.route) then
          for _, s in ipairs(r.stops) do if s.pos.x == ARGS.x and s.pos.y == ARGS.y and s.pos.z == ARGS.z then
            if ARGS.name then s.name = ARGS.name end
            -- quickfort makes every stop want everything, and a cart only unloads what its stop does not want:
            -- a stop that loads nothing is an unloading stop, so it wants nothing.
            if not ARGS.take_from or #ARGS.take_from == 0 then
              pcall(require('plugins.stockpiles').import_settings, 'library/everything', {route_id = r.id, stop_id = s.id, mode = 'disable'})
              for k, v in pairs(s.settings.flags) do if v == true then s.settings.flags[k] = false end end
            end
            emit({route_id = r.id, stop_id = s.id}) return end end end end
        emit(nil)`, a);
      if (!value) return fail(`${out}\nThe track stop was not placed or no route stop was created at ${a.x},${a.y},${a.z}.`);
      return text(`${out}\nRoute ${value.route_id} stop ${value.stop_id} at ${a.x},${a.y},${a.z}. It needs a mechanism to build. ` +
        `Next: action=condition route=${value.route_id} stop_id=${value.stop_id} direction=... (when to send the cart on).`);
    }
    return luaTool("minecart", a);
  });
