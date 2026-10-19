# Claspoceans playthrough

## Checkpoint: 14 Felsite, year 100 — bridge 1.1.0

Saved and paused, camera on Founders Hall. Seven citizens alive, no stressed citizens,
113 drink, 70 food, 30 uninstalled seeds and 103 available logs. No visible hostiles.
The earlier count of 42 seeds included planted seeds. Cerol's earlier syndrome wound
was verified as inebriation, not a combat injury.

These notes were written in the separate Codex upgrade copy. Those commits have since been merged into
the main repository (nutshot2000/Dwarf-Fortress-Bridge) and released as 1.4.0; see CHANGELOG.md for later work.

## Layout and management

- Main shaft: x89-90, y96-97. Surface z149; workshops and food z148; bedrooms and dining z147.
- z149: trade depot centred 98,88; four completed entrance hatches #72-75, normally unlocked.
  South Meadow pasture #1 at 92,102..103,109 holds the four grazing animals.
  Outdoor refuse #70 at 103,88..106,90. South Timber Yard is 80,111..91,122 (144 tiles).
- z148: still #5 at 80,90; carpenter #48 at 84,90; craftsdwarf #71 at 79,93;
  fishery #51 at 84,93; stoneworker #6 at 83,101. Temporary surface carpenter #2 is at 102,94,149.
  Plump-helmet plot #4 is 93,91..95,94, set all seasons, cooking forbidden and brewing allowed.
  Food Cellar #3 is 93,99..99,105. Separate timber, stone, and furniture buffers serve workshops.
  Furniture Warehouse is 78,108..86,110; Indoor Timber Reserve is 78,115..86,117.
- z147: eight private 3x3 bedrooms, seven assigned and one spare. Wing parameters:
  x1=78, y=96, per_side=4, shaft_x=89. Never repeat the zone phase unnecessarily.
  Founders Hall #65 is 85,105..95,111, with six tables and six chairs.
  Manager's office #69 is 79,104..83,108, assigned to expedition leader #6564.
  Last audit: no unhoused adults, no untidy stockpiles, no missing essential room furniture,
  manager satisfied. Some bedroom cabinets/chests and doors remain under construction.
- Inside burrow covers the main underground fort and the warehouse extension.
  It is prepared for civilian alerts but is not currently restricting civilians.
- Zuntir #6558 and Cerol #6561 are the two miners. Unrelated production labors were reduced
  to keep them available for digging. Urist #6562's fishing was restored after construction work.
- Upkeep targets: drink 10/dwarf, five empty food containers, two spare beds/cabinets/chests.
  Automatic stone doors/goblets, fuel, and soap are disabled during this early wooden phase.
  Seven wooden-cup jobs produced about twenty cups. Latest work orders cover the remaining
  furniture plus modest reserves; avoid duplicating them.

## Aquifer and safety

The lower shaft reached aquifer-bearing walls on z146 and damp stone below.
Its unused stairs contain water. All four hatches #76-79 at z147 are fully built,
closed, and forbidden (locked), isolating access below the occupied floors.
No citizens were below when locked; both occupied floors were checked dry afterwards.
Do not unlock these covers or resume lower excavation without a proper aquifer plan.
The abandoned z146 warehouse and proposed east-side temple designations were cleared.

A jaguar man fought the dogs on 19 Slate. Cerol killed it with her iron pick.
All founders survived without combat wounds; the dog that was injured later recovered.

## Bridge findings and upgrades

- Implemented: df_look marks exposed dry aquifer tiles A and lists their coordinates.
  Water retains its depth glyph; hidden aquifer information stays hidden.
  Commits: 4b56cb6 and dc4d220. Offline registration, live read-only smoke checks,
  and seven synthetic Lua assertions passed. Tests are included in npm test.
- Fixed in 1.1.0: the watchdog reads new Combat log entries for visible citizens and owned tame
  animals, even when their opponent is not classified as dangerous. Hunting and sparring are excluded.
  Events on the final wait poll are checked before the time target, and errors attempt to pause.
  Read-only replay of the retained jaguar fight detected three fortress combatants with zero
  dangerous creatures. No new attack was staged to test it. Raw wound counts are deliberately not used:
  ordinary inebriation creates syndrome wounds.
- Fixed: status resource counts exclude installed, reserved, carried, forbidden and owned materials.
  df_stocks preserves inventory totals and supplies separate available counts. At the original
  checkpoint, 126 total logs included only 108 available logs.
- Fixed: container warnings distinguish a blocked new batch from a low reserve, respect the configured
  upkeep reserve target, and account for queued production. Four containers plus one queued no longer
  generate the old false brewing-stall warning. The latest check has six available and one queued.
- Added: df_jobs action=suspended separates jobs requiring review from plans awaiting materials;
  df_problems and df_wait flag the former. No jobs are automatically resumed, preserving intentional
  suspensions. At this checkpoint nine construction plans await materials and none need interruption review.
- Validation: offline registration, JavaScript watchdog decision tests, synthetic Lua regressions,
  historical fight-log replay, live read-only checks, and normal gameplay using 1.1.0 all passed.

## Next priorities

Finish bedroom storage furniture, establish a temple using a safe accessible room, appoint a broker
and bookkeeper with appropriate offices, prepare a small militia, and plan migrant accommodation.
Keep food protected and use trade or a deliberate aquifer crossing for the first stone industry.

Save files are under `%APPDATA%/Bay 12 Games/Dwarf Fortress/save/`; latest verified checkpoint
is `autosave 1` at 14 Felsite. DFHack's getSavePath reported a misleading installation-relative path on this setup.
