// Tools: time.
import { runUpkeep } from "./production.js";
import { camera, directorReset, directorStep } from "../camera.js";
import { waitDecision } from "../watchdog.js";
import { tool, luaTool, text, fail, z, lua, luaFile, SETTINGS } from "../core.js";

// One heartbeat per poll: the clock plus the watchdog counters (visible hostiles, active moods, caravans).
async function tick(since, animalFights = "stop") {
  const { value } = await luaFile("heartbeat", { since, report_animal_combat: animalFights === "report" });
  if (value?.error) throw new Error(value.error);
  return value;
}

// Automatic first response to a threat: civilians into a burrow, every squad to the Ready routine.
async function threatResponse(burrow) {
  const done = [];
  const { value: b } = await luaFile("burrow", { action: "alert_on", burrow });
  done.push(b?.error ? `civilian alert failed: ${b.error}` : `civilian alert on (burrow ${burrow})`);
  const { value: s } = await luaFile("schedule", { action: "alert", routine: "ready" });
  done.push(s?.error ? `squad alert failed: ${s.error}` : `squads on ${s.routine}`);
  return done;
}
const setPause = (p) => lua(`df.global.pause_state = ${p ? "true" : "false"} emit(true)`);
let lastConstructionWarning = "";
// Announcement popups ("X has bestowed the name..." etc.) freeze the clock until clicked away.
// Esc/Enter don't close them; clicking the on-screen Okay button does.
async function dismissPopup() {
  const count = async () => (await lua(`emit(#df.global.world.status.popups)`)).value ?? 0;
  const n = await count();
  if (!n) return { n: 0 };
  const { value: txt } = await lua(`emit(dfhack.df2utf(try(function() return df.global.world.status.popups[0].text end, '?')))`);
  const { value: f } = await luaFile("screen", { action: "find", text: "Okay" });
  const hit = f?.hits?.[0];
  if (hit) await luaFile("screen", { action: "click", x: hit.x + 1, y: hit.y });
  await new Promise((r) => setTimeout(r, 300));
  return { n, text: txt, after: await count() };
}

// Citizen name -> absolute tick of the last fight that stopped a wait (see "stop once per fight").
const recentFights = new Map();

tool("df_wait","Unpause and let the game run for a number of in-game days (1 day = 1200 ticks), then pause again and report new announcements. Stops early if the game pauses itself, and (watch, default on) when a hostile becomes visible, real combat involves a citizen or owned tame animal (excluding hunting/sparring), a citizen dies or leaves, a strange mood starts, a caravan arrives, or a citizen newly loses walking connection to the majority citizen group (possibly trapped). on_threat=alert also turns on the civilian alert (burrow, default Inside) and puts squads on Ready when a hostile or fortress combat is detected. animal_fights=report reports owned-animal fights without stopping for them; citizen combat and new hostiles still stop the wait. upkeep=true tops up stocks (df_upkeep apply) afterwards. The camera director (df_camera) moves the player's view to the action while time runs. Announcement popups are clicked away. Capped at DF_WAIT_SECONDS (default 50) real seconds per call; call again to continue.",
  { days: z.number().min(0.1).max(28).default(1), watch: z.boolean().default(true),
    animal_fights: z.enum(["stop", "report"]).default("stop"),
    on_threat: z.enum(["stop", "alert"]).default("stop"), burrow: z.string().default("Inside"),
    upkeep: z.boolean().default(false) },
  async (a) => {
    const start = await tick(undefined,a.animal_fights);
    if (start.abs === undefined) return fail("No game state");
    const target = start.abs + Math.round(a.days * 1200);
    await setPause(false);
    const t0 = Date.now();
    let now = start, reason = "done", lastAbs = start.abs, lastMove = Date.now();
    const popups = [], animalReports = new Map();
    directorReset(start.last);
    try {
      while (true) {
        await new Promise((r) => setTimeout(r, 700));
        now = await tick(now.last,a.animal_fights);
        for (const e of now.animal_combat ?? []) animalReports.set(e.report_id,e);
        // Stop once per fight: a citizen already reported fighting within the last game day keeps
        // being listed but does not stop the wait again on every blow.
        const fresh = [];
        for (const e of now.combat ?? []) {
          const seen = recentFights.get(e.name);
          if (seen !== undefined && now.abs - seen < 1200) animalReports.set(e.report_id ?? `${e.name}:${e.text}`, e);
          else fresh.push(e);
        }
        try { await directorStep(); } catch { /* the camera must never break a wait */ }
        const event = waitDecision(start, { ...now, combat: fresh }, target, a.watch !== false);
        for (const e of fresh) recentFights.set(e.name, now.abs);
        if (a.watch !== false) {
          if (event.reasons.length) {
            await setPause(true);
            reason = `WATCHDOG stopped early: ${event.reasons.join("; ")}`;
            if (a.on_threat === "alert" && event.threat) {
              reason += ` -> ${(await threatResponse(a.burrow)).join(", ")}`;
            }
            break;
          }
        }
        if (event.stop) break;
        if (now.abs !== lastAbs) { lastAbs = now.abs; lastMove = Date.now(); }
        if (now.paused || Date.now() - lastMove > 2500) {
          const p = popups.length < 8 ? await dismissPopup() : { n: 0 };
          if (p.n > 0 && p.after < p.n) {
            popups.push(p.text);
            await setPause(false);
            lastMove = Date.now();
            continue;
          }
        }
        if (now.paused) { reason = "game paused itself (check announcements)"; break; }
        // DF autosaves when a season begins (every 100800 ticks) and time stands still while it writes.
        const seasonStart = now.abs % 100800 < 1200;
        // Saves (df_save or autosave) also freeze time for several seconds, so allow 15 s before blaming a menu.
        if (Date.now() - lastMove > (seasonStart ? 45000 : 15000)) {
          reason = seasonStart
            ? "time stalled at the start of a season, most likely DF's seasonal autosave; call df_wait again"
            : "time is not advancing - a save may still be writing, or a game menu or dialog is open (retry once; if it persists ask the player to close it with Esc)";
          const { value: op } = await lua(
            `local r = {} for k, v in pairs(df.global.game.main_interface) do
               local ok, o = pcall(function() return v.open end) if ok and o == true then r[#r + 1] = k end end emit(r)`);
          if (op?.length) reason = `time is not advancing - panel(s) open: ${op.join(", ")} (df_ui close shuts them; they ignore Esc from scripts)`;
          // diplomacy meetings and other dialogs: show their text so the overseer can answer with df_screen
          const { value: sc } = await luaFile("screen", { action: "read" });
          if (sc?.focus?.some((f) => /Diplomacy|Petition|Mandate/.test(f))) {
            const lines = (sc.lines ?? []).map((l) => (typeof l === "string" ? l : l.text ?? "")).filter((l) => l.trim()).slice(0, 25).join(String.fromCharCode(10));
            reason = `a ${sc.focus.join(" ")} dialog is open - answer it with df_screen (click its buttons):` + String.fromCharCode(10) + lines;
          }
          break;
        }
        if (Date.now() - t0 > SETTINGS.waitSeconds * 1000) { reason = "real-time cap reached; call df_wait again to continue"; break; }
      }
    } finally {
      await setPause(true);
    }
    const ran = (now.abs - start.abs) / 1200;
    const { value: ann } = await luaFile("announcements", { since: start.last, limit: 200 });
    const all = ann?.messages ?? [];
    // Events the overseer must react to are always listed first and never truncated.
    const IMPORTANT = /CARAVAN|MERCHANT|MIGRANT|SIEGE|AMBUSH|THIEF|INVASION|ENEMY|MEGABEAST|FORGOTTEN|TITAN|WEREBEAST|NIGHT_CREATURE|UNDEAD|MOOD|BERSERK|MADNESS|INSANE|TANTRUM|DEATH|DIED|KILLED|BIRTH|ARTIFACT|DIPLOMAT|LIAISON|NOBLE|PETITION|FLOOD|CAVE_IN|COLLAPSE|STRUCK|DEMAND|MANDATE|CITIZEN|ELECTION|ANIMAL_?ATTACK|INJUR|SCREAM/i;
    const IMPORTANT_TEXT = /caravan|merchants|migrant|siege|ambush|stolen|thief|snatcher|invad|attack|dead|died|killed|been slaughtered by|mood|berserk|insane|tantrum|withdraw|born|given birth|artifact|diplomat|liaison|petition|arrived|has become|struck|forgotten beast|titan|vampire|were/i;
    // Blow-by-blow combat lines (mostly squad sparring) are noise unless someone actually got hurt.
    const COMBAT = /lightly tapping|misses the|charges at|collides with|strikes at|parried|deflected|rolls away|jumps away|attacks the .* but|no longer stunned|is knocked over|punches|kicks|scratches|bites|grabs|releases the grip/i;
    // DF tags every blow-by-blow line with a COMBAT_* report type; the text patterns catch the rest.
    const isCombat = (m) => /^(COMBAT|BREAK_GRIP|NO_BREAK_GRIP|EXHAUSTION|VOMIT|NOT_STUNNED|STAND_UP|LOSE_EMOTION|.*CONSCIOUS|PASS_OUT)/.test(m.type || "") || COMBAT.test(m.text);
    // A wound line is routine in any fight; only a death is news (a hurt citizen already stops the wait).
    const DEATH = /\b(dies|died|killed|struck down|has been slain|is dead)\b/i;
    const imp = all.filter((m) => (IMPORTANT.test(m.type || "") || IMPORTANT_TEXT.test(m.text)) && !(isCombat(m) && !DEATH.test(m.text)));
    const rest = all.filter((m) => !imp.includes(m) && !isCombat(m));
    const sparring = all.length - imp.length - rest.length;
    let out = `Ran ${ran.toFixed(2)} days in ${((Date.now() - t0) / 1000).toFixed(0)}s: ${reason}. Paused.\n`;
    if(now.isolated?.length) out+=`ACCESS WARNING: possibly trapped citizen(s): ${now.isolated.map(u=>`${u.name} #${u.id} at ${u.x},${u.y},${u.z}`).join("; ")}. Inspect with df_problems before further construction.\n`;
    if (animalReports.size) out += `Ongoing fights (animal fights in ${a.animal_fights} mode; a citizen's fight stops a wait once per day; new hostiles always stop):\n${[...animalReports.values()].slice(-3).map(e=>`${e.name}: ${e.text}`).join("\n")}\n`;
    if (start.hostiles > 0) out += `(${start.hostiles} hostile(s) were already visible when the wait began: ${(start.hostile_names ?? []).join("; ")})\n`;
    // Migrant waves arrive as a big popup, not a regular report, so also compare the population.
    if (now.pop !== undefined && start.pop !== undefined && now.pop !== start.pop) {
      const d = now.pop - start.pop;
      imp.unshift({ text: `Population ${start.pop} -> ${now.pop} (${d > 0 ? `+${d}: migrants or births` : `${d}: deaths or departures`}). Check df_units and bedrooms.` });
    }
    if (camera.mode !== "off" && camera.log.length) out += `Camera (${camera.mode}) showed: ${camera.log.slice(-6).join(" | ")}\n`;
    if (popups.length) out += `POPUPS (dismissed so time could run):\n${popups.map((t) => `! ${t}`).join("\n")}\n`;
    if (imp.length) out += `IMPORTANT:\n${imp.map((m) => `! ${m.text}`).join("\n")}\n`;
    if (rest.length) out += `Other:\n${rest.slice(-20).map((m) => `- ${m.text}`).join("\n")}\n`;
    if (sparring > 0) out += `(${sparring} combat/sparring lines omitted)\n`;
    if (!all.length) out += "No new announcements.";
    const { value: construction } = await luaFile("jobs", { action: "suspended" });
    const constructionSignature=JSON.stringify((construction?.review??[]).map(j=>[j.id,j.building,j.other_ground_items?.map(i=>[i.id,i.reserved])]));
    if (construction?.review?.length && constructionSignature!==lastConstructionWarning) {
      out += `\nCONSTRUCTION: ${construction.review.length} suspended construction job(s) need review. Review df_jobs action=suspended; resume specific jobs only after any danger or obstruction is resolved.`;
    }
    lastConstructionWarning=constructionSignature;
    if (a.upkeep) {
      const u = await runUpkeep("apply");
      const queued = u.split("\n").filter((l) => l.includes("-> added"));
      out += "\n" + (queued.length ? `Upkeep queued:\n${queued.join("\n")}` : "Upkeep: all stocks on target.");
    }
    return text(out.trim());
  });

tool("df_alerts", "The game's alert panel (red ALE button): grouped alerts newest first (caravans, deaths, migrants, moods, sieges...) with their latest messages, plus any open popup messages that pause the game. Check it at the start of every session and whenever df_wait reports IMPORTANT events.",
  { limit: z.number().int().min(1).max(40).optional(), per_group: z.number().int().min(1).max(20).optional() },
  (a) => luaTool("alerts", a));

tool("df_pause", "Pause the game.", {}, async () => { await setPause(true); return text("Paused."); });
tool("df_resume", "Unpause the game and leave it running (prefer df_wait for controlled steps).", {},
  async () => { await setPause(false); return text("Running."); });
