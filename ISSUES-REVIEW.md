# Review of the Monkmirror model report

Reviewed against bridge 1.2.0, installed DF 0.53.16 / DFHack 53.16-r2 and the paused
Monkmirror save; resulting improvements are in 1.3.0. The report labels itself
0.4.3-coach.2, so these findings do not prove what a different earlier server exposed.
The original issues.md is preserved unchanged.

| Report | Finding | Result |
|---|---|---|
| 1. Dig orders wipe unrelated orders | Not reproduced. A real marked tree at 3,44,174 survived a separate dig order at 115,112,172. Installed Quickfort changes only its footprint. Tree marks are separate from tile dig flags; canopy-only chop calls could report success without marking a base. | Added actual marked-plant verification, df_designations, and correct unmarking of plant work. Eliminated shared last-dig.csv filenames to prevent a separate possible concurrent-call collision. No claim that global wiping was reproduced. |
| 2. Dump misses loose items / construction loop | Blanket claim false; diagnostic gap real. A genuinely loose eligible boulder was counted. At kitchen #170, stone #1730 was reserved by roof plan #24/job #969; the kitchen's own material was #1914. At craft shop #171, stone #1839 belonged to roof #49/job #994; its own material was #1929. | Suspended jobs now expose both sets of materials and foreign reservation owners. Dump results explain exclusions. Removing the two unwanted roof plans released the two blockers; ordinary dump hauling then cleared them. After targeted resumes, BOTH workshops completed. |
| 3. Build diagnostics / butcher key | Missing diagnostics was real. The claimed butcher key was wrong: wb is bowyer, wu is butcher. The save contains built bowyers #160 and #169. A loose boulder is not by itself proof that Quickfort must reject a footprint. | Native dry-run preflight reports exact rejected tiles, occupancy and observed ground items. df_help topic=build aliases the existing key list. |
| 4. Opaque trade / 22x ratio | Mixed. Existing tools already returned selected totals and native profit/weight after selection/proposal. However bare container values excluded contents, and sending full supply containers was unprotected. No evidence establishes a universal 22x requirement. | Goods/send previews, explicit full-container opt-in, contents-aware values/totals without double counting. No arbitrary guaranteed ratio. A new trade with merchants was not performed in this winter test. |
| 5. Farm reset / roofed crops | Early assignment was a real trap. Reporting roofed surface plots as non-underground was correct. Plots #7/#8 had Light tiles and selected plump helmets; #60 was genuinely Dark and compatible. | Reject assignments to unbuilt or incompatible plots. Lists show light/dark counts and invalid existing selections. |
| 6. Look ignores coordinates | Not reproduced. Requests centred at 20,30,174 and 120,110,173 returned exactly those requested bounds. | Correct x/y/z/radius use documented. Unsupported parameter names are not a valid coordinate test. |
| 7. Lua works only with print | Incorrect for emit(): emit returned JSON before changes. Bare return previously produced no output, matching the old documented emit/print contract. | Added JSON capture for return values as a convenience. |
| 8. Cannot find raw boulders | Not reproduced. type=BOULDER, search=brimstone returned boulder #1632. Generic stone/boulder words need not appear in material-only item descriptions. Some position records are not actually on the ground. Invalid type names did silently broaden searches. | Reject invalid types, give search hints, expose on_ground and distinguish loose items from non-ground position records. |
| 9. Furnish open pits / no bedrooms | Missing enclosure guard was real. Furnish and zone are separate documented phases. Removing a dig designation does not itself excavate a wall. | Furnish checks dry excavated interiors and enclosing walls before placing anything. Triage explains phase=zone for assignment. |
| 10. Animal fight watchdog | Real usability problem, not evidence of false combat detection. A fresh dog–wild boar combat event actually stopped a test wait. Old reports are excluded by report ID. A honey badger woman threatening citizens is not safely dismissible as harmless noise. | Added animal_fights=report: animal reports retained, citizen combat and new hostiles still stop. Default remains stop. Synthetic tests cover both modes. |

## Other points

- `df_build dry_run=true` was a genuine dangerous interface trap: the parameter did
  not exist and could be ignored. It is now supported. A valid preview left the
  building count unchanged at 114. Native preview counters are labelled as previews.
- Upkeep mixed expected item output with newly queued job counts. Output now names
  those units separately.
- A manager requirement already existed in the tool description. New order creation
  now checks it, and problems warns about unvalidated orders without an active manager.
- The 50-second wait cap was already configurable through DF_WAIT_SECONDS. It is
  not a fixed game-day limit.
- Screen text does not cover every graphical/pre-embark widget. 1.2.0 added base-layer
  reads for tutorial overlays; that does not prove universal screen coverage.

## Validation and test-fort changes

The later screenshot prompted stronger prevention: private-room plans now persist
per site. Bedroom-wing planning registers them automatically; existing bedroom zones
are inferred too. Native Quickfort previews run atomically before destructive dig
actions, rejecting any request that crosses protected boundaries or alters existing
bedroom floors. Interior mining remains allowed. Furnishing AND zoning check
enclosure. Room audits now expose missing walls rather than just counting furniture.
The current save reports five bedroom layouts with missing boundary tiles (four
substantially open rooms plus one missing doorway/boundary tile). These are reported,
not silently rebuilt. Tests demonstrated that an existing wall stayed undesignated,
a new protected plan allowed its 3x3 interior, and a crossing blueprint was refused.
The temporary test plan and dig designations were removed. Explicit remodelling
override is available; raw Lua, console and manual UI remain outside these guards.

- Offline registration and live read-only smoke tests; synthetic crop, enclosure,
  search-filter, map-visibility and watchdog checks.
- Actual disjoint tree/dig designation preservation and actual dry-run building count
  check. Temporary test designations removed afterward.
- Two unbuilt roof tiles (#24/#49) removed to release reservations. Dump marks set
  only on the two foreign blockers, workers hauled them, construction jobs #2942/#2943
  resumed individually, kitchen #170 and craft shop #171 finished. The two roof tiles
  remain removed; this is recorded rather than silently restoring the conflict.
- No spawned items, instant building, teleportation or map revelation.

Roof/light mechanics reference: https://dwarffortresswiki.org/index.php/Agriculture
