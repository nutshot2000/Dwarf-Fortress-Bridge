#!/usr/bin/env node
// MCP server: play Dwarf Fortress through DFHack. Tool groups register themselves on import.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./core.js";
import "./tools/observe.js";
import "./tools/designate.js";
import "./tools/production.js";
import "./tools/fort.js";
import "./tools/military.js";
import "./tools/stores.js";
import "./tools/trade.js";
import "./tools/screen.js";
import "./tools/time.js";
import "./tools/misc.js";

const transport = new StdioServerTransport();
await server.connect(transport);
