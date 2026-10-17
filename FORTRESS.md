# Claspoceans playthrough

## Checkpoint: 12 Felsite, year 100

Saved and paused, camera on Founders Hall. Seven citizens alive, no stressed citizens,
115 drink, 70 food, 42 seeds. No visible hostiles. Cerol's current syndrome wound is
inebriation, not a combat injury; blood is full and pain is zero.

This checkout is our independent upgrade copy. Claude's checkout at
`C:/Users/batti/Dwarf-Fortress-Bridge` remains on main with its pre-existing lockfile edit.
Do not push our changes to the original repository without the user's direction.

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
- Still open: df_wait did not stop during the jaguar-man fight, despite the camera showing it.
  Its current watchdog primarily counts units classified as dangerous; examine combat/interrupt
  reports as well. Do not use raw wound counts as a fix: ordinary inebriation creates syndrome wounds.
- Stock totals include logs embedded in buildings, so the wood headline can overstate usable logs.
- df_problems warns at four empty barrels, although four are usable and another barrel is queued.
- Interrupted construction can remain suspended. One dining chair had allocated material but was
  suspended after the fight; it was resumed. All five carpentry jobs temporarily suspended for
  hatch production were restored before this checkpoint.

## Next priorities

Finish bedroom storage furniture, establish a temple using a safe accessible room, appoint a broker
and bookkeeper with appropriate offices, prepare a small militia, and plan migrant accommodation.
Keep food protected and use trade or a deliberate aquifer crossing for the first stone industry.

Save files are under `%APPDATA%/Bay 12 Games/Dwarf Fortress/save/`; latest verified checkpoint
is `autosave 3`. DFHack's getSavePath reported a misleading installation-relative path on this setup.
