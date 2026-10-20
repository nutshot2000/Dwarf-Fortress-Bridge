# Changelog

## 1.4.4

- `df_workshop action=add` and `df_order` check materials before queuing (new `lua/inputs.lua`). The job is
  still queued, but a `WARNING:` line names any input with no usable item (not forbidden, reserved, dumped or
  unreachable), e.g. "0 usable rough gems; brown jasper vein visible but unmined (44 tiles, e.g. 54,64,156):
  mine it first". Smelting says whether matching ore is visible but unmined; fuel (coke/charcoal bars) is
  checked for smelting and fuel reactions; stone furniture lists the economic stone that masons will not use.
- Tables, chairs and doors fall back to wood when no non-economic stone is free (economic stone no longer counts).
- `df_stocks` / `df_status` / upkeep: items inside bins, barrels and bags count as available again (DF marks them
  with the same flag as items a dwarf is carrying); `df_stocks` shows `in_container` vs `carried`.
- `df_stocks` / `df_status`: stone and other items built into walls, floors or stairs no longer count as free stock.
- The shared Lua prelude reloads when edited, like the tool scripts.
- `df_build` names the finished parts a building consumes and which ones the fort has none of right now (a well
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
