# Changelog

## 1.4.15

- `df_squad_status` says when a squad is off duty this month (its routine has no orders): soldiers then wear civilian
  clothes and drop the uniform where they stand, so 0/10 worn is expected, not a stuck soldier. It points to
  `df_military train routine=constant` for a squad that should stay in uniform.

## 1.4.14

- `df_workshop` lists and queues bowyer tasks (wooden/bone crossbows and bolts); the bowyer task list was empty
  because DFHack has no catalogue for it. A workshop that still has no task list says to use `df_order` instead.

## 1.4.13

- `df_military uniform` with a crossbow template also gives the squad an ammunition entry (bolts for combat and
  training). Without it marksdwarves got crossbows but never picked up a single bolt.
- `df_zone` lists `a` (archery range) among the zone types.

## 1.4.12

- Every tool now rejects unknown arguments ("Unrecognized key") instead of dropping them: `df_dig mode=chop`
  (the parameter is `kind`) quietly designated an ordinary dig, and a parameter missing from an older running server
  ran as if it were not given.

## 1.4.11

- New `df_paths`: walking distances between named points (stairs and ramps included), the longest pair, and which
  pairs are unreachable, to find the daily trips worth a shortcut and to compare routes before and after.
- `df_pile link direction=give` warns that the workshop now takes all inputs, empty barrels included, only from
  linked piles (a still linked to a produce pile stalled on "empty food storage item in linked stockpile").
- `df_dig dry_run=true` previews a dig, room-protection check included, without designating anything (the flag was
  silently ignored, so a "preview" dug for real).
- `df_rooms bedroom_wing` no longer tells you to "dig a link from the shaft at x104" for a wing nowhere near a shaft:
  the default shaft column is only mentioned when shaft_x was given or a stair is really there.

## 1.4.10

- `df_zone location=guildhall` takes `guild=<name>` (the petitioning guild; its profession is read from the guild,
  since names mislead: "The Mechanical Guild" is CRAFTSMAN) or `profession=`. Without either, quickfort made the zone
  but silently no guildhall; the tool now refuses with a hint.
- `df_zone` with a location refuses when the spot already has a zone carrying a location, so a retried call no longer
  stacks a second zone and location on the same room.
- `df_trade send` skips items under a noble's export ban (trading them is a crime) and lists them as `export_banned`.
- `df_mood check`: "any bones"/"any shells" requests (no item type) are named and counted from corpse pieces (they
  showed as "any none", 0 in fort, and a false "missing"); bars wanted in any inorganic read "metal bar" and rough
  gems "any rough gems" (both were labelled "rock"). Plain `df_mood` keeps names like Dodók readable.
- `df_workshop list filter=` picks workshops by type or name ("mason", "Quarry") when no task list is asked for; it
  only filtered task names, so a filtered list still printed every workshop.
- `df_crop list` shows only seeds a current plot can grow (the rest are summed in `seeds_for_other_plots`) and flags a
  plot's `no_seeds` seasons: a season set to a crop with no seeds in stock grows nothing.
- `df_military equip` upgrades: a filled armour slot takes a free item of a strictly higher armour level and releases
  the old one (new masterwork iron breastplates sat in storage while soldiers kept leather, since equip only filled
  empty slots). Weapons and shields are not swapped.
- `df_rooms audit` lists only zones with something missing or a warning, unfinished room layouts, and the access
  check only when someone is cut off; `zone_id=` shows one zone, `full=true` the old complete report (80+ zones).
- `df_wait` no longer echoes the camera's own "[agent] Camera: ..." captions in its report.
- `df_trade send`/`goods` list at most 15 items plus `more` and a `total_value` for the whole batch (an 80-item send
  printed every entry).

## 1.4.9

- `df_location action=dedicate`: dedicate a temple to a religion (`religion=<name or id>`, which keeps an approved
  temple petition from it), to one deity (`deity=`), or back to all faiths (`all_faiths=true`). Without a target it
  lists the religions and deities citizens follow, with follower counts. `action=list` shows each temple's dedication.
- PLAYBOOK: how to answer a temple petition (dig, zone, dedicate).

## 1.4.8

- `df_problems`: a stair opening with a hatch cover on it is no longer reported as open sky; the hatch is its gate.
- `df_dig` verification counts tiles a dwarf has already claimed: with the game running, a fresh designation can
  turn into a dig job at once (clearing the tile flag), and the check reported "NOTHING was designated".
- `df_petition` no longer crashes on a temple or guildhall request: those come from a group (religion, guild), not a
  single figure; the petition names the group, e.g. "The Creed of Pulp (Religion)".

## 1.4.7

- `df_trade send`: goods stored in bins now reach the depot. Marking an item inside a bin never created a haul
  job (crafts sat in their bins all caravan long while send reported them as marked); send now sets the item
  on the bin's own tile first and reports `unpacked: true`.

## 1.4.6

- `df_military equip` (and `uniform`) fills armour slots with real armour before clothing: it ranked by value
  alone, so silk dresses took the body slot and new leather armour stayed in the stockpile.

## 1.4.5

- Camera director is calmer and says what it shows:
  - a tour shot lasts at least 20 s, and up to 45 s while the dwarf keeps doing the same thing (was 9 s);
  - every new tour shot and every new hostile puts a "Camera: ..." line in the game's announcements;
  - a walking subject moves the view only when it nears the edge of the screen, not every few steps;
  - work orders finishing ("has been completed") no longer count as news worth a cut;
  - socialising dwarves score below crafters in the tour.
- `df_look` warns about open tiles under aquifer tiles on the level above: v50 aquifers drip downward, so a room
  dug just below an aquifer layer floods slowly even when no aquifer tile is on its own level.
- `df_dig` warns when designated tiles lie directly under revealed aquifer tiles (hidden ones stay undisclosed).
- `df_help`: key `F` builds a pedestal as well as a display case.
- `df_workshop add` of a reaction: each reagent now gets its own item type from the reaction raw. dfhack.workshops
  gave every reagent the first one's type, so 'make wooden chair' asked for a second log in place of its edged tool
  and no dwarf could ever start it.
- Material preflight: logs now count for reagents that want any plant material (flags2.plant); the chair job
  warned "0 usable logs" with hundreds in stock. Reagents that need an edged item (flags3.edged) now count only
  items with an edged attack, so a chair with every axe and knife in use warns "0 usable edged items".

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
- New `df_minecart` tool: `track` carves a straight track line, `stop` builds a track stop and adds it to a named
  hauling route (loading from `take_from` piles, or set to want nothing so carts unload there), `link` ties a stop to
  a stockpile (take/give), `condition` sets departure rules (push/ride/guide, direction, load %, timeout), `assign`
  puts a free cart on a route, `list` shows routes, stops, links, conditions and carts. `df_order job=MakeMinecart`
  makes carts. Tested live: a cart loaded stone, was guided along 17 tiles and unloaded into the far pile.
- `df_crop`: seed stock excludes seeds already planted in plots, and `set` warns when the crop has no free seeds
  (farmers otherwise cancel "Plant seeds" over and over).
- `df_mood check=true` names the workshop each mood wants and warns when the fort has none (a mood for a Clothier's
  Shop waited until one was built).
- `df_mood check=true` measures cloth, thread and bars by size: a mood asking for 10000 silk cloth was reported
  missing with four whole cloths in the fort.
- `df_kitchen` summarises seedwatch's crop cooking bans (often 100+) and says whether seedwatch is on: cooks that
  "need unrotten cookable" items usually have only plants they may not cook.
- `df_trade propose` finds the Trade button in any window size (a smaller window put it where the tool did not look,
  so proposals failed); the verdict notes that an unskilled trader's footer values are guesses.
- `df_dig` treats minecart track carving as harmless near protected rooms.
- `df_problems` reports indoor tiles with open sky above them: invaders climb walls in v50 and drop in behind a
  raised drawbridge (an unroofed stair top let an undead siege into the fort).
- `df_wait`: "hostiles at the gates" only counts hostiles with a walking path to a dwarf, so a sealed fort is not
  stopped over and over by undead standing above it.
- `df_rooms action=display building_id item_id` puts an item (an artifact) on a display case or pedestal through
  the game's own panel; writing the building's list directly made a display job nobody took. Display cases are
  key `F`. One platinum artifact turned a shrine into a temple complex.
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
