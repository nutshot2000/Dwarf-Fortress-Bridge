# df-bridge

An MCP server that lets Claude play Dwarf Fortress (Steam, v53) through DFHack.

Each tool call writes a short Lua chunk and runs it with `dfhack-run lua -f`. There is no game mod and nothing is injected. Digging, buildings, stockpiles and zones all go through DFHack's `quickfort`.

## Setup

1. Install Dwarf Fortress and the free **DFHack** app on Steam, then launch DF (the DFHack console should open).
2. `npm install`
3. `claude mcp add -s user dwarf-fortress -- node <path>\src\server.js`

If DF/DFHack aren't in `D:\SteamLibrary`, set `DF_DIR` and `DFHACK_DIR`.

## Tools

| Observe | Act | Time / misc |
|---|---|---|
| `df_status` `df_problems` `df_units` `df_announcements` `df_look` | `df_dig` `df_build` `df_stockpile` `df_zone` `df_blueprint` `df_order` | `df_wait` `df_pause` `df_resume` `df_view` `df_save` `df_cmd` `df_lua` `df_help` |

Try a single tool without Claude: `node scripts/call.mjs df_look "{\"radius\":20}"`
