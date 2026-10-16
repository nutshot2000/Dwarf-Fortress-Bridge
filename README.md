# df-bridge

An MCP server that lets Claude play Dwarf Fortress (Steam, v53) through DFHack.

Each tool call writes a short Lua chunk and runs it with `dfhack-run lua -f`. There is no game mod and nothing is injected. Digging, buildings, stockpiles and zones all go through DFHack's `quickfort`. The bridge plays by the game's rules: it never spawns or teleports items.

## Setup

1. Install Dwarf Fortress and the free **DFHack** app on Steam, then launch DF (the DFHack console should open).
2. `npm install`
3. `claude mcp add -s user dwarf-fortress -- node <path>\src\server.js`

If DF/DFHack aren't in `D:\SteamLibrary`, set `DF_DIR` and `DFHACK_DIR`.

## Tools (50)

| Group | Tools |
|---|---|
| Observe | `df_status` `df_problems` `df_units` `df_unit` `df_announcements` `df_look` `df_alerts` |
| Diagnose | `df_threats` `df_items` `df_squad_status` `df_mood` (`check=true`) `df_stocks` |
| Build | `df_dig` `df_build` `df_stockpile` `df_zone` `df_blueprint` `df_rooms` (`bedroom_wing`, `audit`) |
| Produce | `df_order` `df_upkeep` `df_workshop` `df_jobs` `df_crop` `df_kitchen` `df_pile` `df_dump` |
| People | `df_labor` `df_noble` `df_location` `df_standing` `df_animals` `df_petition` `df_justice` |
| Defence | `df_military` (`equip`) `df_schedule` `df_burrow` `df_levers` |
| Trade | `df_trade` |
| Time | `df_wait` `df_pause` `df_resume` `df_save` |
| UI | `df_camera` `df_ui` `df_screen` `df_view` |
| Expert | `df_auto` `df_cmd` `df_lua` `df_help` |

### How a turn works

`df_status` → `df_problems` → one action → `df_wait upkeep=true`.

- **Watchdog.** `df_wait` stops early, and says why, when a hostile becomes visible, a citizen dies or leaves, a strange mood starts or a caravan arrives. `on_threat=alert` also sends civilians into a burrow and puts squads on Ready.
- **Upkeep.** `df_upkeep` keeps drink (per dwarf), empty barrels/pots, spare beds/doors/cabinets/chests, goblets, soap (with its lye and ash chain) and fuel topped up. It only queues the shortfall and never duplicates a running order. Targets are saved per fort (`action=set`).
- **Camera director.** For a player who is watching: during `df_wait` the view jumps to real fights, tracks visible hostiles and shows arrivals, deaths, births, artifacts and moods; it also goes to wherever Claude digs or builds. `df_camera follow` keeps the view on one dwarf or creature, `df_camera off` leaves the view alone.
- **Self-checking actions.** `df_dig` reports how many tiles actually got designated. `df_military uniform` re-equips the squad straight away. Kill orders warn when the target isn't hostile.

## Notes from playing (v50 quirks the tools handle)

- **Work orders** need a manager. If the Work orders screen says "A manager is required" although one is appointed, run `df_noble action=repair`: the game finds its manager through `fortress_entity.assignments_by_type`, which can be empty (found by reverse engineering the check in the game binary). Orders also need a material, so `df_order` defaults to wood or stone.
- **Panels** (trade, squads, petitions, building sheets) live inside the main screen and ignore Esc sent from scripts; some freeze time while open. `df_ui close` shuts them, and `df_wait` names any panel that stalls the clock.
- **Popups** (weapon namings and the like) pause the game until their Okay button is clicked; `df_wait` clicks them away and lists them.
- **Engraving**: quickfort's engrave key designates nothing in v50, so `df_dig kind=engrave` sets the designation itself (smooth first).
- **Uniforms**: soldiers only fetch items listed in their position's `assigned_items`. `df_military equip` fills empty slots from free gear (including gear missing from the game's unassigned index) and keeps that list in sync.
- **Kill orders** are ignored for targets the game doesn't count as hostile, e.g. a werebeast in human form. Station the squad nearby instead.
- **Diplomats** meet nobles in an office. Without an office of decent quality the meeting, and depot trading with it, stalls (`df_problems` warns). Office zones should include their walls; engraving and metal furniture raise the value.
- **Dumps** forbid whatever lands in them; `df_dump action=unforbid` makes dumped stone usable again.
- **Linked stockpiles**: a workshop with linked "give" piles only takes from those piles.
- **Petitions**: `df_petition` flags cursed petitioners (werebeasts and vampires arrive disguised as visitors).
- **Farm plots** reset to fallow when construction finishes, so set crops with `df_crop` afterwards.

## Development

- Code: `src/core.js` (server, tool registration, helpers) and `src/tools/*.js` (one file per area); the Lua for each tool is in `lua/`.
- Try one tool: `node scripts/call.mjs df_look "{\"radius\":20}"`
- Several calls in one server session (camera state lives in the server): `node scripts/session.mjs '[["df_camera",{"action":"follow","name":"Urist"}],["df_wait",{"days":1}]]'`
- Smoke test against the running game (read-only, changes nothing): `node scripts/smoke.mjs`; `--offline` only checks that every tool registers.
