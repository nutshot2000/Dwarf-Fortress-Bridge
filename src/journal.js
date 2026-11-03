// The fort journal: a record of the fort's life kept for telling its story later. Notable announcements and the
// story beats between waits (arrivals, deaths, lovers, births, kills, legends, dreams) are logged automatically,
// with a screenshot of the biggest moments; the overseer adds notes and rewrites the dwarves' introductions.
// One folder per fort under DF_JOURNAL_DIR: journal.jsonl, cast.json, quotes.jsonl and shots/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lua, luaFile } from "./dfhack.js";
import { captureScreenshot } from "./screenshot.js";
import { camera } from "./camera.js";

// DF_JOURNAL: ask (default: the player chooses per fort), on (every fort), off (never).
const mode = (process.env.DF_JOURNAL ?? "ask").toLowerCase();
export const JOURNAL = {
  mode: /^(off|0|false|no)$/.test(mode) ? "off" : /^(on|1|true|yes)$/.test(mode) ? "on" : "ask",
  root: process.env.DF_JOURNAL_DIR || path.join(os.homedir(), "Documents", "df-journals"),
};

const safe = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim() || "fort";

// The player's answer for each fort, keyed by journal folder name: "on" or "off".
const choicesFile = () => path.join(JOURNAL.root, "forts.json");
const readChoices = () => { try { return JSON.parse(fs.readFileSync(choicesFile(), "utf8")); } catch { return {}; } };

/** The loaded fort: its name and world, today's date, its journal folder and whether the journal is kept. */
export async function fortInfo() {
  const { value: f } = await luaFile("journal", { action: "fort" });
  if (!f || f.error) throw new Error(f?.error ?? "No fort loaded");
  // Not the save folder: DF renames that on every save ("region3" becomes "autosave 2").
  const key = safe(`${f.fort} - ${f.world}`);
  const dir = path.join(JOURNAL.root, key);
  const choices = readChoices();
  // 1.5.0-1.5.1 keyed journals as "<save folder> - <fort>": move such a journal to its lasting name once.
  if (!(key in choices) && !fs.existsSync(dir)) {
    const old = Object.keys(choices).find((k) => k.endsWith(` - ${safe(f.fort)}`) && fs.existsSync(path.join(JOURNAL.root, k)));
    if (old) {
      fs.renameSync(path.join(JOURNAL.root, old), dir);
      choices[key] = choices[old];
      delete choices[old];
      fs.writeFileSync(choicesFile(), JSON.stringify(choices, null, 1));
    }
  }
  const choice = JOURNAL.mode === "ask" ? choices[key] : JOURNAL.mode;
  return { ...f, key, dir, choice };
}

/** Record the player's choice for this fort. */
export function setChoice(j, choice) {
  fs.mkdirSync(JOURNAL.root, { recursive: true });
  fs.writeFileSync(choicesFile(), JSON.stringify({ ...readChoices(), [j.key]: choice }, null, 1));
}

/** The journal of the loaded fort, its folder created on first use. Only for a fort whose journal is on. */
export async function fortJournal() {
  const j = await fortInfo();
  fs.mkdirSync(path.join(j.dir, "shots"), { recursive: true });
  return j;
}

export const ASK = "Journal: not set up for this fort. Ask the player once whether they want the storytelling journal " +
  "(a record of the fort's life, dwarf introductions and story chapters); then df_journal action=enable or action=disable.";

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const readLines = (file) => {
  try { return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
};
export const readEntries = (dir) => readLines(path.join(dir, "journal.jsonl"));
export const readQuotes = (dir) => readLines(path.join(dir, "quotes.jsonl"));
export const readCast = (dir) => readJson(path.join(dir, "cast.json"), null);
export const writeCast = (dir, cast) => fs.writeFileSync(path.join(dir, "cast.json"), JSON.stringify(cast, null, 1));

export function addEntry(dir, date, e) {
  const entry = { year: date.year, tick: date.tick, date: date.text, season: date.season, ...e };
  fs.appendFileSync(path.join(dir, "journal.jsonl"), JSON.stringify(entry) + "\n");
  return entry;
}

// ---- introductions -------------------------------------------------------------------------------------------

const pick = (list, n, seed) => {
  const l = [...list];
  const out = [];
  let s = seed;
  while (l.length && out.length < n) { s = (s * 9301 + 49297) % 233280; out.push(l.splice(s % l.length, 1)[0]); }
  return out;
};
const and = (l) => l.length <= 1 ? (l[0] ?? "") : `${l.slice(0, -1).join(", ")} and ${l.at(-1)}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** A short introduction, the way a book brings in a character: who they are, what stands out, who they love. */
export function intro(s) {
  const [he, his] = s.sex === "female" ? ["she", "her"] : s.sex === "male" ? ["he", "his"] : ["they", "their"];
  const plural = he === "they";
  const fix = (t) => plural ? t.replace(/^is /, "are ").replace(/^has /, "have ").replace(/^gives /, "give ")
    .replace(/^never gives /, "never give ").replace(/^takes /, "take ").replace(/^would /, "would ") : t;
  const bare = s.name.replace(/, .*$/, "");
  const name = s.nickname ? bare : bare.replace(/ "[^"]*"$/, "");
  const prof = s.profession.toLowerCase(), office = s.nobles?.[0]?.toLowerCase();
  const out = [];
  if (s.baby) out.push(`${name} is a baby.`);
  else if (s.child) out.push(`${name} is a child of ${s.age}.`);
  else if (office === prof) out.push(`${name}, ${s.age}, is the fort's ${office}.`);
  // "an 18-year-old", "an 80-year-old", "an 11-year-old": the article follows how the number is said
  else out.push(`${name} is ${/^(8|11$|18$)/.test(String(s.age)) ? "an" : "a"} ${s.age}-year-old ${prof}${office ? ` and the fort's ${office}` : ""}.`);
  const traits = (s.traits ?? []).map(fix);
  if (traits.length) out.push(`${cap(he)} ${and(traits)}.`);
  const likes = pick([...(s.likes?.like ?? []), ...(s.likes?.food ?? [])], 2, s.id);
  const bits = [];
  if (s.values?.length) bits.push(fix(s.values[0].replace(/^values /, "values ")).replace(/^values/, plural ? "value" : "values"));
  if (likes.length) bits.push(`${plural ? "like" : "likes"} ${and(likes)}`);
  if (s.likes?.hate?.length) bits.push(`can't stand ${s.likes.hate[0]}`);
  const dream = s.dreams?.find((d) => !d.done);
  if (dream) bits.push(`${plural ? "dream" : "dreams"} of one day being able to ${dream.dream}`);
  if (bits.length) out.push(`${cap(he)} ${and(bits)}.`);
  const fam = s.family ?? [];
  const here = fam.filter((f) => f.here && f.relation !== "god");
  const love = fam.find((f) => (f.relation === "spouse" || f.relation === "lover") && !f.dead);
  if (here.length) {
    // "His wife Lòr and children Etur and Nil": one phrase per relation, plural where there are several
    const PLURAL = { child: "children", parent: "parents" };
    const groups = new Map();
    for (const f of here) groups.set(f.relation, [...(groups.get(f.relation) ?? []), f.name.split(" ")[0]]);
    const parts = [...groups].map(([rel, names]) => `${names.length > 1 ? (PLURAL[rel] ?? rel + "s") : rel} ${and(names)}`);
    out.push(`${cap(his)} ${and(parts)} ${here.length > 1 ? "live" : "lives"} here too.`);
  }
  if (love && !love.here) out.push(`${cap(his)} ${love.relation}, ${love.name}, is far away.`);
  if (s.skills?.[0]?.legendary) out.push(`Already a legend ${s.skills[0].with ? "with" : "at"} ${s.skills[0].skill}.`);
  if (s.kills > 0) out.push(`${cap(he)} ${plural ? "have" : "has"} killed ${s.kills === 1 ? "once" : `${s.kills} times`} already.`);
  return out.join(" ");
}

// ---- the story beats between waits --------------------------------------------------------------------------

const state = (s) => ({
  lovers: (s.family ?? []).filter((f) => f.relation === "lover" && !f.dead).map((f) => f.hf),
  spouses: (s.family ?? []).filter((f) => f.relation === "spouse" && !f.dead).map((f) => f.hf),
  children: (s.family ?? []).filter((f) => f.relation === "child" && f.here).map((f) => f.hf),
  kills: s.kills ?? 0, legendary: (s.skills ?? []).filter((k) => k.legendary).map((k) => k.skill),
  dreams_done: (s.dreams ?? []).filter((d) => d.done).map((d) => d.dream), nobles: s.nobles ?? [],
  stress: s.stress, squad: s.squad || null, child: !!s.child, lost: s.lost ?? [],
});
const famName = (s, hf) => (s.family ?? []).find((f) => f.hf === hf)?.name ?? "someone";
const KILL_MARKS = [1, 5, 10, 25, 50, 100];

/** Compare the cast with the last snapshot and log what changed. Returns the new entries. */
export async function castBeats(j, cast) {
  const prev = readCast(j.dir);
  const entries = [];
  const book = prev ?? { founded: j.date.text, dwarves: {} };
  const add = (e) => entries.push(addEntry(j.dir, j.date, e));
  if (!prev) {
    add({ kind: "founding", text: `The journal of ${j.fort} begins with ${cast.length} dwarves.`, units: cast.map((s) => s.id) });
  }
  const seen = new Set();
  // a couple is one story beat, not one per partner
  const couples = new Set();
  const firstTime = (a, b) => { const k = [a, b].sort((x, y) => x - y).join("+"); if (couples.has(k)) return false; couples.add(k); return true; };
  for (const s of cast) {
    seen.add(String(s.id));
    const was = book.dwarves[s.id];
    const now = state(s);
    // back among the citizens (off the map for a while, or written off too soon)
    if (was?.gone) {
      add({ kind: "return", text: `${s.first_name} is back in the fort.`, units: [s.id] });
      delete was.gone; delete was.gone_date; delete was.fate;
    }
    if (!was) {
      book.dwarves[s.id] = { id: s.id, hf: s.hf, name: s.name, first_name: s.first_name, sex: s.sex, intro: intro(s),
        first_seen: j.date.text, state: now };
      if (prev) add({ kind: "arrival", text: `${s.name} joined the fort.`, units: [s.id], intro: book.dwarves[s.id].intro });
      continue;
    }
    const who = s.first_name;
    for (const hf of now.spouses) if (!was.state.spouses?.includes(hf) && firstTime(s.hf, hf)) add({ kind: "love", text: `${who} married ${famName(s, hf)}.`, units: [s.id] });
    for (const hf of now.lovers) if (!was.state.lovers?.includes(hf) && !now.spouses.includes(hf) && firstTime(s.hf, hf)) add({ kind: "love", text: `${who} and ${famName(s, hf)} became lovers.`, units: [s.id] });
    for (const hf of now.children) if (!was.state.children?.includes(hf)) add({ kind: "birth", text: `${who} became a parent: ${famName(s, hf)}.`, units: [s.id] });
    const mark = KILL_MARKS.filter((m) => was.state.kills < m && now.kills >= m).at(-1);
    if (mark) add({ kind: "kills", text: mark === 1 ? `${who} made a first kill${s.victims?.length ? `: ${s.victims.at(-1)}` : ""}.` : `${who} has now killed ${now.kills}.`, units: [s.id] });
    for (const k of now.legendary) if (!was.state.legendary?.includes(k)) add({ kind: "legend", text: `${who} became a legend ${k.startsWith("the ") ? "with" : "at"} ${k}.`, units: [s.id] });
    for (const d of now.dreams_done) if (!was.state.dreams_done?.includes(d)) add({ kind: "dream", text: `${who}'s dream came true: to ${d}.`, units: [s.id] });
    for (const n of now.nobles) if (!was.state.nobles?.includes(n)) add({ kind: "office", text: `${who} became ${n.toLowerCase()}.`, units: [s.id] });
    if (now.squad && now.squad !== was.state.squad) add({ kind: "military", text: `${who} joined the squad ${now.squad}.`, units: [s.id] });
    if (was.state.child && !now.child) add({ kind: "growing", text: `${who} has grown up and is now a ${s.profession.toLowerCase()}.`, units: [s.id] });
    // an older snapshot has no lost parts recorded: take today's as the baseline instead of announcing old wounds
    if (was.state.lost) for (const part of now.lost) if (!was.state.lost.includes(part)) add({ kind: "wound", text: `${who} lost ${/^[aeiou]/.test(part) ? "an" : "a"} ${part}.`, units: [s.id] });
    const bad = (x) => x === "very stressed" || x === "falling apart";
    if (bad(now.stress) && !bad(was.state.stress)) add({ kind: "mind", text: `${who} is ${now.stress}.`, units: [s.id] });
    if (!bad(now.stress) && bad(was.state.stress)) add({ kind: "mind", text: `${who} has recovered from a dark time.`, units: [s.id] });
    was.state = now;
    was.name = s.name;
  }
  // Those no longer among the citizens: died, or left.
  const gone = Object.values(book.dwarves).filter((d) => !d.gone && !seen.has(String(d.id)));
  if (gone.length) {
    const { value: fates } = await luaFile("journal", { action: "fate", ids: gone.map((d) => d.id) });
    for (const f of fates ?? []) {
      const d = book.dwarves[f.id];
      d.gone = f.dead ? "died" : "left";
      d.gone_date = j.date.text;
      const how = f.dead ? `${d.name} died${f.cause && f.cause !== "none" ? ` (${f.cause})` : ""}${f.killer ? `, killed by ${f.killer}` : ""}.`
        : `${d.name} is no longer part of the fort.`;
      d.fate = how;
      add({ kind: f.dead ? "death" : "departure", text: how, units: [f.id], shot_unit: f.dead ? f.id : undefined });
    }
  }
  writeCast(j.dir, book);
  return entries;
}

// ---- announcements --------------------------------------------------------------------------------------------

// What a chronicler would keep. [pattern on type or text, kind, take a screenshot]
const RULES = [
  [/masterpiece/i, "craft", false],
  [/SIEGE|AMBUSH|MEGABEAST|TITAN|FORGOTTEN|WEREBEAST|NIGHT_CREATURE|UNDEAD|vampire|necromancer|forgotten beast|titan|has come!/i, "threat", true],
  [/bestowed the name|artifact|has created .*!$|mysterious construction|taken by a .*mood|withdraws from society|stark raving mad|berserk|melancholy|possessed/i, "mood", true],
  [/has been struck down|has died|has been killed|was killed|slain|drowned|starved|bled to death|found dead|been slaughtered/i, "death", false],
  [/migrant|caravan from .* has arrived|diplomat|liaison|has arrived/i, "arrival", false],
  [/given birth|has been born/i, "birth", false],
  [/elected|has been appointed|sentenced|grown attached to|tantrum|cave-in|flood|world has passed|discovered|stolen|thief|snatcher/i, "event", false],
];
// "Name, Profession: thought" lines: dwarves speaking their minds, the best source of the fort's voice.
const SPEECH = /^([^:]{3,80}?), ([^:,]{2,40}): (.+)$/;
// DF files every dwarf's thoughts during a conflict as conflict talk, the bath with the battle cry; keep the
// thoughts, drop the cries a whole fort repeats when a buzzard flies over.
const COMBATISH = /^COMBAT|BREAK_GRIP|STAND_UP/;
const BATTLE_CRY = /This is my fight too|I cannot just stand by|I have a part in this/;

// The fight lines worth retelling: the badger that took an eye, the gem setter whose punch made a troglodyte explode.
const GORE = [
  [/gouge|sever|ripped away|explodes into gore|into gore|brain|skull|spine|artery|throat|in the (left|right) eye|eye.* (torn|ripped)/i, 3],
  [/shatter|smash|crush|torn apart|tearing apart|tearing off|lodged firmly|knocked unconscious|gives in to pain/i, 2],
  [/vomits|falls over|bites .* in the (nose|ear|lip|cheek|tongue)|latches on/i, 1],
];
const gore = (t) => GORE.find(([re]) => re.test(t))?.[1] ?? 0;

/** Log notable announcements and keep the dwarves' spoken thoughts. Returns {entries, shots} to photograph.
 *  citizens: their names; a citizen's death is left to castBeats, which records the cause and the killer. */
export function captureAnnouncements(j, messages, citizens = []) {
  const entries = [], shots = [];
  const quotes = [];
  const fights = new Map(); // citizen -> their most gruesome line this wait
  for (const m of messages) {
    if (!/^COMBAT|GRIP|VOMIT|PAIN_KO|STUN|CONSCIOUS/.test(m.type || "") || !m.citizen) continue;
    const g = gore(m.text);
    if (g && g > (fights.get(m.citizen)?.g ?? 0)) fights.set(m.citizen, { g, m });
  }
  for (const [citizen, { m }] of [...fights].sort((a, b) => b[1].g - a[1].g).slice(0, 5)) {
    entries.push(addEntry(j.dir, j.date, { kind: "injury", text: `${citizen.replace(/, .*$/, "")} in a fight: ${m.text}`, report: m.id }));
  }
  for (const m of messages) {
    const type = m.type || "";
    if (/^\[[^\]]+\] /.test(m.text)) continue; // the camera's own captions
    if (/\(Tame\)|Stray /.test(m.text) && /birth|grown/.test(m.text)) continue; // the animals' family life
    const sp = !COMBATISH.test(type) && m.text.match(SPEECH);
    if (sp && BATTLE_CRY.test(sp[3])) continue;
    // "Cilob, Miner cancels Brew drink: Needs empty food storage item." is a job report, not a dwarf speaking
    if (sp && / cancels /.test(sp[2])) continue;
    if (sp) { quotes.push({ date: j.date.text, year: j.date.year, tick: j.date.tick, season: j.date.season, speaker: sp[1], role: sp[2], text: sp[3] }); continue; }
    if (/^COMBAT/.test(type)) continue;
    const rule = RULES.find(([re]) => re.test(type) || re.test(m.text));
    if (!rule) continue;
    if (rule[1] === "death" && citizens.some((n) => m.text.includes(n))) continue;
    const e = addEntry(j.dir, j.date, { kind: rule[1], text: m.text, report: m.id });
    entries.push(e);
    if (rule[2] && m.x !== undefined) shots.push({ entry: e, x: m.x, y: m.y, z: m.z });
  }
  if (quotes.length) fs.appendFileSync(path.join(j.dir, "quotes.jsonl"), quotes.map((q) => JSON.stringify(q)).join("\n") + "\n");
  return { entries, shots, quotes: quotes.length };
}

/** Photograph a moment: centre the game view on it and keep the capture in the journal's shots folder. */
export async function snapshot(j, where, label) {
  await lua(`dfhack.gui.revealInDwarfmodeMap(xyz2pos(${where.x}, ${where.y}, ${where.z}), true, true) emit(true)`);
  await new Promise((r) => setTimeout(r, 300));
  const { metadata } = await captureScreenshot(1600);
  const name = `${j.date.year}-${String(j.date.tick).padStart(6, "0")}-${safe(label).slice(0, 40).replace(/ /g, "-")}.png`;
  fs.copyFileSync(metadata.path, path.join(j.dir, "shots", name));
  try { fs.unlinkSync(metadata.path); } catch { /* temp copy */ }
  return `shots/${name}`;
}

/** Record a photo against an entry already written (rewrite of the matching line). */
export function attachShot(dir, entry, shot) {
  const file = path.join(dir, "journal.jsonl");
  const lines = readEntries(dir).map((e) => (e.tick === entry.tick && e.year === entry.year && e.text === entry.text && !e.shot) ? { ...e, shot } : e);
  fs.writeFileSync(file, lines.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

/** Everything df_wait needs: announcements, the cast's story beats and up to two photos. Never throws. */
export async function journalAfterWait(messages) {
  if (JOURNAL.mode === "off") return "";
  try {
    const info = await fortInfo();
    if (info.choice === "off") return "";
    if (info.choice !== "on") return ASK;
    const j = await fortJournal();
    const { value: c } = await luaFile("journal", { action: "cast" });
    // everyone the journal has ever known, the dead included (a death is announced after they stop being citizens)
    const known = Object.values(readCast(j.dir)?.dwarves ?? {}).map((d) => d.name.replace(/, .*$/, "").replace(/ "[^"]*"$/, ""));
    const { entries, shots, quotes } = captureAnnouncements(j, messages, known);
    const beats = c?.cast ? await castBeats(j, c.cast) : [];
    // a citizen's death is photographed where the body lies
    for (const b of beats) if (b.shot_unit !== undefined) {
      const { value: p } = await lua(`local u = df.unit.find(${b.shot_unit}) emit(u and u.pos.x >= 0 and {x = u.pos.x, y = u.pos.y, z = u.pos.z} or nil)`);
      if (p) shots.unshift({ entry: b, ...p });
    }
    // a photo moves the game view: with the camera off the view stays where the player put it
    let photos = 0;
    for (const s of camera.mode === "off" ? [] : shots.slice(0, 2)) {
      try { attachShot(j.dir, s.entry, await snapshot(j, s, s.entry.kind + " " + s.entry.text)); photos++; } catch { /* no window to capture */ }
    }
    const n = entries.length + beats.length;
    if (!n && !quotes) return "";
    const headline = [...beats, ...entries].filter((e) => e.kind !== "craft").slice(0, 4).map((e) => e.text);
    return `Journal: +${n} entr${n === 1 ? "y" : "ies"}${quotes ? `, ${quotes} overheard line(s)` : ""}${photos ? `, ${photos} photo(s)` : ""}` +
      (headline.length ? ` (${headline.join(" | ")})` : "");
  } catch (e) {
    return `Journal: not updated (${String(e.message || e).split("\n")[0]})`;
  }
}
