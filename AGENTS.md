# AGENTS.md

Notes for AI coding agents (Codex, OpenCode, Claude Code, ...) working on this repository.

## Playing the game

If you are here to **play** Dwarf Fortress through the bridge, read [PLAYBOOK.md](PLAYBOOK.md): it is the overseer guide the
server sends as its instructions. Play fair: never spawn, teleport or reveal anything.

## Working on the bridge

- `src/server.js` starts the MCP server; `src/core.js` holds the server instance, `tool()` registration, settings
  (`DF_TOOLS`, `DF_AGENT_NAME`, `DF_WAIT_SECONDS`) and helpers; `src/camera.js` is the camera director.
- `src/tools/*.js` registers tools by area (observe, designate, production, fort, military, stores, trade, screen, time, misc).
- `lua/*.lua` holds the DFHack Lua behind each tool. `luaTool(name, args)` runs `lua/<name>.lua` with `ARGS`; the prelude
  provides `emit(v)` (return JSON), `try(fn, default)`, `need_map()`, `unit_name(u)`, `unit_job(u)`, `citizens()`.
- DFHack v50 quirks are listed in README.md ("v50 quirks the tools work around"); read them before touching panels,
  uniforms, engraving or work orders.

## Checks before committing

- `npm run test:offline`: every tool registers with a description and schema.
- `npm test`: runs the read-only tools against a running game (changes nothing). Needs Dwarf Fortress + DFHack running.
- `node scripts/call.mjs <tool> '<json>'` for one tool; `node scripts/session.mjs '[[tool, args], ...]'` for several in one
  server session (camera state lives in the server process).
- Lua compiles inside DFHack only; a quick syntax check: `df_lua` with `loadfile(<path>)` over `lua/`.
- Lua edits are picked up on the next call (the server re-reads changed files). JS edits under `src/` need a server
  restart; `scripts/call.mjs` starts a fresh server, so use it to test JS changes against the running game.
- DFHack modules (`dfhack.workshops` and others) see the real global table: to silence their `print`, patch
  `dfhack.BASE_G`, not the script's `_G`.
- Bump the version in `package.json` and `package-lock.json` and add a `CHANGELOG.md` entry with user-visible changes.
