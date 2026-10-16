# df-bridge

An MCP server that lets Claude play Dwarf Fortress (Steam, v53) through DFHack.

Each tool call writes a short Lua chunk and runs it with `dfhack-run lua -f`. There is no game mod and nothing is injected. Digging, buildings, stockpiles and zones all go through DFHack's `quickfort`.

## Setup

1. Install Dwarf Fortress and the free **DFHack** app on Steam, then launch DF (the DFHack console should open).
2. `npm install`
3. `claude mcp add -s user dwarf-fortress -- node <path>\src\server.js`

If DF/DFHack aren't in `D:\SteamLibrary`, set `DF_DIR` and `DFHACK_DIR`.

## Tools

| Observe | Build | Manage | Time / misc |
|---|---|---|---|
| `df_status` `df_problems` `df_units` `df_unit` `df_announcements` `df_look` `df_stocks` | `df_dig` `df_build` `df_stockpile` `df_zone` `df_blueprint` | `df_workshop` `df_jobs` `df_order` `df_crop` `df_labor` `df_standing` `df_noble` `df_rooms` `df_animals` `df_military` `df_schedule` `df_location` `df_levers` `df_mood` `df_pile` `df_dump` `df_kitchen` `df_burrow` `df_trade` `df_justice` | `df_wait` `df_pause` `df_resume` `df_view` `df_save` `df_screen` `df_auto` `df_cmd` `df_lua` `df_help` |

Notes:
- `df_workshop add` queues tasks directly at a workshop, the same as the in-game "Add task" button. `df_order` creates manager work orders, which need a manager. If the Work orders screen still says "A manager is required", run `df_noble action=repair`: the game finds its manager through an index (`fortress_entity.assignments_by_type`) that can be empty on a fresh embark. That index was found by reverse engineering the check in the game binary. Orders also need a material, so `df_order` picks wood or stone by default.
- `df_wait` clicks away announcement popups (weapon namings and the like) so time keeps running, and lists them under POPUPS. Esc and Enter do not close these popups; clicking the on-screen Okay button does. Squad sparring lines are filtered out unless someone is actually hurt.
- `df_dump` clears loose boulders (or other items) out of rooms: it marks them for dumping and dwarves haul them to a garbage dump zone. A small dump next to a mason's workshop keeps the stone in one tidy spot, close to where it gets used.
- `df_screen` reads the game UI as text (DFHack `screen.readTile`) and presses keys or clicks labels, which covers pop-ups and screens without a dedicated tool. Screen capture tools only see a blank window.
- Uniforms only get equipped after `plotinfo.equipment.update` is flagged, which `df_military uniform` does.
- Farm plots reset to fallow when construction finishes, so set crops with `df_crop` after the plot is built.

Try a single tool without Claude: `node scripts/call.mjs df_look "{\"radius\":20}"`
