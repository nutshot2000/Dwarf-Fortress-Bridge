# Changelog

## 1.4.4

- `df_workshop action=add` and `df_order` check materials before queuing (new `lua/inputs.lua`). The job is
  still queued, but a `WARNING:` line names any input with no usable item (not forbidden, reserved, dumped or
  unreachable), e.g. "0 usable rough gems; brown jasper vein visible but unmined (44 tiles, e.g. 54,64,156):
  mine it first". Smelting says whether matching ore is visible but unmined; fuel (coke/charcoal bars) is
  checked for smelting and fuel reactions; stone furniture lists the economic stone that masons will not use.
- Tables, chairs and doors fall back to wood when no non-economic stone is free (economic stone no longer counts).
- `df_wait`: wound lines from fights are routine (only deaths are flagged); `NO_BREAK_GRIP` counts as fight noise.
- `df_look`: open ground beside a tree no longer counts as a hole in a roof.
- `df_wait` during a siege: more hostiles arriving at the map edge no longer stop every wait; it stops once when the
  first comes within 40 tiles of a dwarf and once when the first is within 12.
- Material preflight: item checks use a filter without material fields (a fresh job_item defaults to subtype 0
  and, with material type 0 plus "hard", rejected all stone); `economic_stone` is compared to 1 (0 is truthy in
  Lua, so every stone counted as economic, and stone furniture fell back to wood); mechanisms and blocks accept
  economic stone.
- `df_burrow alert_off` warns that burrow-assigned dwarves still only work inside their burrows; `clear_units=true`
  releases them. `df_jobs` reports building jobs (e.g. "Destroy building") at the building, not -30000.
- `df_dig kind=undesignate` also cancels unclaimed dig, smooth, engrave and stair jobs in the area (a designation
  that became a job no longer shows on the tile, so clearing flags alone left the work queued).
- `df_levers action=lock|unlock` forbids or allows a door or hatch (by id or x,y,z) to seal an entrance.
- `df_stocks` / `df_status` / upkeep: items inside bins, barrels and bags count as available again (DF marks them
  with the same flag as items a dwarf is carrying); `df_stocks` shows `in_container` vs `carried`.
- `df_trade send`: goods stored in bins can be sent to the depot (they were skipped as "carried"), and an explicit
  `item_ids` list is no longer cut at 20. `df_trade action=release` cancels the trader request, so dwarves waiting
  at the depot go back to hauling.
- `df_military uniform` also releases the position's old assignments: re-applying a uniform used to leave the
  previous gear listed, so soldiers carried on fetching 20+ items. `equip` picks the most valuable fitting item (a
  bronze shield over a wooden one, steel over copper) instead of the first one found.
- `df_justice action=exile unit_id=...` banishes a citizen through DFHack's emigration script (the game has no
  expel button for citizens): they give up citizenship and walk off the map. Refuses nobles, soldiers and children.
- `df_problems` warns when trees wait for felling but no woodcutter has an axe and none is free (squad weapon slots
  can reserve every axe in the fort).
- `df_problems` counts beds against adults only (children sleep with their parents).
- `df_petition approve|deny` refuses while the trade screen is open (it used to close it mid-trade).
- `df_petition approve|deny` retries when the Petitions panel is not drawn yet ("buttons not found").
- `df_order MakeBookcase/MakeDisplayCase/MakePedestal/MakeAltar` default to wood: with no material the manager
  never validated the order.
- `df_order repeat` drops "weekly": DF only has daily, monthly, seasonally and yearly orders.
- `df_dig kind=gather|chop` is no longer blocked by the bedroom-wall guard (neither digs anything).
- `df_military uniform` copies the template's `exact_matches` flag: without it the game filled "metal armor" body
  slots with wool dresses and cloth gloves over the bridge's assignments. It no longer sets the game's
  re-assignment flags (equip assigns instead).
- `df_military equip` uses gear stored in bins (they carry the same flag as gear a dwarf is holding).
- `df_military add` works while the leader slot is vacant (it tries each free slot after it).
- `df_squad_status` releases dwarves who point at a squad without holding a position in it (left by a failed add);
  they went off to train with the squad instead of working.
- Camera and unit job labels no longer go blank for jobs DF leaves unnamed (cooking shows "Prepare Meal").
- `df_problems` warns when corpses and body parts pile up with no refuse stockpile and no dump orders: they never go
  away by themselves (DF's own `gather_refuse_outside` and `dump_*` standing orders start off).
- `df_problems` names idle dwarves without item hauling (the miners' work detail leaves it off), the usual reason a
  small fort's hauling backlog never shrinks.
- `df_problems` reports forbidden weapons, armour and clothes on the floor (DF forbids the gear of everyone who dies,
  so after a siege it lies untouched), including "foreign" gear the undead dropped, which haulers ignore even unforbidden.
- `df_workshop add` refuses an empty task: it used to match the first task alphabetically, at a smelter "Melt a metal
  object" (which melts down weapons and armour). `job` and `quantity` work as aliases for `task` and `count`.
- `df_wait` lists pending petitions on every wait until they are answered (DF only announces one when it expires).
- `df_zone type=T`: tomb zones bigger than one tile get a warning (DF buries one body per tomb zone, and skips a coffin inside two tomb zones); the playbook and
  README explain coffins, tombs and memorial slabs (`~s`) for ghosts.
- `df_stocks` / `df_status`: stone and other items built into walls, floors or stairs no longer count as free stock.
- The shared Lua prelude reloads when edited, like the tool scripts.
- `df_build` names the finished parts a building consumes (now also cage, stone-fall and weapon traps) and which ones the fort has none of right now (a well
  needs a bucket, a chain or rope, a mechanism and stone blocks; a lever a mechanism; a hatch a hatch cover; plus
  furniture and the forge's anvil). DF drops the plan if a part never turns up.
- `df_zone location=... name=...` gives the new location that name. Quickfort otherwise gives every location it
  creates the same generated name.
- `df_order MakeBookcase` (also `MakePedestal`, `MakeDisplayCase`, `MakeAltar`) queues the right `MakeTool`
  subtype. The workshop catalogue's "make wooden bookcase" asks for the wrong logs and never runs.

## 1.4.3

Fight, roof and furniture reporting, from the Spearmirrors playthrough.

- `df_wait` stops once per fight: a citizen already reported fighting within a game day is listed under
  "Ongoing fights" but does not stop every following wait.
- `df_look` warns about holes that open an underground room to the sky (rain, light and flyers get in).
- `df_blueprint` (build mode) names the cells that got no building and what is on the tile.
- `df_problems` only flags a stuck noble meeting when the visitor is not a citizen; citizens bringing matters
  to their leader is routine.
- The camera marks a job "(legendary)" only when the dwarf is legendary at that job's own skill.

## 1.4.2

- `df_military add` accepts `unit_ids` (one `addToSquad` call per soldier).
- `df_workshop`: `building_id` lists only that workshop; DFHack's smelter debug dump is muted; `cancel` on an
  empty queue reports an error instead of crashing.
- `df_wait`: `COMBAT_*` and fight side-effect reports no longer flood "Other"; a stall at the start of a season
  is recognised as the seasonal autosave; saves get a 15 s grace before a menu is blamed.
- `df_trade`: `goods` summarises container contents unless `show_contained=true`; `select`/`deselect` show only
  the footer, because the merchant line answers the previous proposal.
- `df_zone` and `df_stockpile` report the new zone or stockpile id.
- `df_rooms bedroom_wing`: re-asserts a shaft stair only where one exists; the zone phase zones finished rooms
  and lists the rest instead of refusing the whole wing.
- `df_room_plan`: compact entries keep `enclosed=true`, so counts filtered by `z` are right.
- The camera names the unit a noble is meeting instead of assuming a diplomat.
- Playbook: caravan weight limits and stale merchant replies.

## 1.4.1

- Dig blueprints treat quickfort's `` ` `` blank cell as empty and report only the counters that fired.
- Lua scripts reload when edited, so Lua fixes apply without restarting the server (JS changes still need one).
- `df_look` shows queued dig jobs (DF clears a tile's dig flag once a job exists) and reports aquifer tiles
  walled off from open space as sealed instead of exposed.
- `df_order`: `ConstructChair` is accepted for chairs (DF's job is `ConstructThrone`); tables, chairs and doors
  fall back to wood while no stone boulder is free.
- `df_build`: preflight names only the tiles that actually block a footprint, and stays short on success.
- `df_stockpile` / `df_zone` name skipped tiles (usually undug rock) instead of leaving a silently ragged edge.
- `df_jobs do_now` moves the job to the front of its workshop queue (workshops ignore the do-now flag).
- `df_rooms bedroom_wing`: the corridor always reaches the shaft; a refused wing no longer leaves phantom
  protected room plans.
- `df_room_plan`: `forget` by `z`, `status` filtered by `z`, short entries for finished rooms.
- Quieter output from `df_labor` toggles, `df_kitchen` (default seed exclusions are counted) and `df_workshop`.
- Playbook: crossing a light aquifer with a sealed shaft ring.

## 1.4.0 and earlier

See the README sections "Visual inspection (v1.4.0)" and "Room protection and clearer diagnostics (v1.3.1)",
[ISSUES-REVIEW.md](ISSUES-REVIEW.md) and the git history.
