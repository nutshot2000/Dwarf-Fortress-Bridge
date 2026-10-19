// Thin transport to a running Dwarf Fortress via DFHack's dfhack-run.exe.
// Every tool call writes a Lua chunk to a temp file and runs `lua -f <file>`.
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

export const DFHACK_DIR =
  process.env.DFHACK_DIR || "D:\\SteamLibrary\\steamapps\\common\\DFHack\\hack";
export const DF_DIR =
  process.env.DF_DIR || "D:\\SteamLibrary\\steamapps\\common\\Dwarf Fortress";
const RUN = join(DFHACK_DIR, "dfhack-run.exe");
const TMP = join(tmpdir(), "df-bridge");
mkdirSync(TMP, { recursive: true });

// The prelude is prepended to every call; re-read it when it changes, like the tool scripts.
const PRELUDE_PATH = join(HERE, "..", "lua", "prelude.lua");
let prelude = { mtime: -1, src: "" };
function preludeSource() {
  const mtime = statSync(PRELUDE_PATH).mtimeMs;
  if (mtime !== prelude.mtime) prelude = { mtime, src: readFileSync(PRELUDE_PATH, "utf8") };
  return prelude.src;
}
let seq = 0;

function exec(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    if (!existsSync(RUN)) return reject(new Error(`dfhack-run not found at ${RUN} (set DFHACK_DIR)`));
    execFile(RUN, args, { cwd: DFHACK_DIR, timeout: timeoutMs, windowsHide: true, maxBuffer: 16 << 20 },
      (err, stdout, stderr) => {
        const out = (stdout || "") + (stderr || "");
        if (err && !out.trim()) {
          return reject(new Error(
            `dfhack-run failed (${err.code ?? err.message}). Is Dwarf Fortress running with DFHack loaded?`));
        }
        resolve(out.replace(/\r\n/g, "\n"));
      });
  });
}

/** Run a DFHack console command, return its text output. */
export function command(cmd, args = []) {
  return exec([cmd, ...args.map(String)]);
}

/**
 * Run Lua inside DF. The chunk sees ARGS (decoded from `args`) and the prelude
 * helpers; whatever it passes to `emit(value)` comes back as parsed JSON.
 * Plain print() output is returned in `log`.
 */
export async function lua(body, args = {}) {
  const file = join(TMP, `call-${process.pid}-${seq++ % 16}.lua`);
  const argJson = JSON.stringify(args);
  let eq = "=";
  while (argJson.includes(`]${eq}]`)) eq += "=";
  writeFileSync(file, `local ARGS = require('json').decode([${eq}[${argJson}]${eq}])\n${preludeSource()}\nlocal function bridge_call()\n${body}\nend\nlocal result=bridge_call()\nif result ~= nil and not bridge_emitted then emit(result) end\n`);
  const out = await exec(["lua", "-f", file]);
  const start = out.indexOf("\u0001JSON\u0001");
  if (start < 0) {
    const msg = out.trim();
    if (/error|stack traceback/i.test(msg)) throw new Error(`Lua error:\n${msg}`);
    return { value: null, log: msg };
  }
  const end = out.indexOf("\u0001END\u0001", start);
  const json = out.slice(start + 6, end);
  const log = (out.slice(0, start) + out.slice(end + 5)).trim();
  return { value: JSON.parse(json), log };
}

const scripts = new Map();
/** Run lua/<name>.lua with ARGS = args. Re-reads the file when it changes, so Lua fixes apply without a restart. */
export function luaFile(name, args = {}) {
  const path = join(HERE, "..", "lua", `${name}.lua`);
  const mtime = statSync(path).mtimeMs;
  let entry = scripts.get(name);
  if (!entry || entry.mtime !== mtime) scripts.set(name, entry = { mtime, src: readFileSync(path, "utf8") });
  return lua(entry.src, args);
}

/** Write a quickfort CSV into dfhack-config/blueprints/df-bridge and return its quickfort name. */
export function writeBlueprint(name, text) {
  const dir = join(DF_DIR, "dfhack-config", "blueprints", "df-bridge");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.csv`), text);
  return `df-bridge/${name}.csv`;
}

export function removeBlueprint(name) {
  // Only generated single-file bridge blueprints can be removed here.
  if (!/^df-bridge\/run-[\w-]+\.csv$/.test(name)) return;
  try { unlinkSync(join(DF_DIR, "dfhack-config", "blueprints", name)); } catch {}
}
