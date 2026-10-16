// Camera director: moves the player's view to whatever they most likely want to see.
// The game's own follow mode (plotinfo.follow_unit) switches itself off, so following is done here:
// df_wait calls directorStep() on every heartbeat (~0.7 s) and re-centres on the current subject.
//
// What it shows, in order: real fights > a visible hostile > news (arrivals, deaths, births, artifacts,
// masterworks, moods) > in quiet moments a tour of the most interesting activity (lua/scenes.lua),
// every choice weighted by the player's preferences (like/dislike per category, saved per fort).
import fs from "node:fs";
import path from "node:path";
import { lua, luaFile, DF_DIR } from "./dfhack.js";

export const CATEGORIES = ["fights", "hostiles", "crafting", "building", "military", "farming", "animals", "social",
  "kids", "visitors", "mood", "news"];
const PREFS_FILE = path.join(DF_DIR, "dfhack-config", "df-bridge", "camera.json");

export const camera = {
  mode: "auto",          // auto: director picks; follow: stick to one unit; off: never move the view
  tour: true,            // in quiet moments, show interesting activity instead of standing still
  followId: null,
  subject: null,         // { kind, cat, id?, label }
  last: { x: -1, y: -1, z: -1 },
  lastSwitch: 0,
  recent: [],            // unit ids the tour showed lately, so it rotates
  log: [],               // what the camera showed during the current wait
  prefs: loadPrefs(),    // category -> weight (1 = neutral, 2.5 = like, 0.2 = dislike, 0 = never)
};

function loadPrefs() {
  try { return JSON.parse(fs.readFileSync(PREFS_FILE, "utf8")); } catch { return {}; }
}
export function savePrefs() {
  fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
  fs.writeFileSync(PREFS_FILE, JSON.stringify(camera.prefs, null, 1));
}
const weight = (cat) => camera.prefs[cat] ?? 1;

// Show the player a spot, optionally with a caption in the game's announcement log.
export async function cameraTo(x, y, z, why, caption) {
  if (camera.mode === "off" || x === undefined || x < 0) return;
  const cap = caption ? `dfhack.gui.showAnnouncement(${JSON.stringify("[Claude] " + caption)}, COLOR_LIGHTCYAN, false)` : "";
  await lua(`dfhack.gui.revealInDwarfmodeMap(xyz2pos(${x}, ${y}, ${z}), true, true) ${cap} emit(true)`);
  camera.last = { x, y, z };
  if (why && camera.log.at(-1) !== why) camera.log.push(why);
}

// Per heartbeat: hostiles, the best new report with a position (scored and categorised), the followed unit.
const SCAN = (since, followId) => `
  local HURT = {'struck down', 'severed', 'mangled', 'torn', 'shattered', 'killed', 'dead', 'unconscious', 'bleeding', 'falls over'}
  local NEWS = {
    {'masterpiece', 'crafting'}, {'has created', 'crafting'}, {'mysterious construction', 'mood'}, {'taken by a', 'mood'},
    {'withdraws from society', 'mood'}, {'possessed', 'mood'}, {'given birth', 'kids'}, {'arrived', 'visitors'},
    {'has come', 'hostiles'}, {'thief', 'hostiles'}, {'ambush', 'hostiles'}, {'siege', 'hostiles'},
    {'found dead', 'news'}, {'has been', 'news'}, {'struck', 'news'}, {'is visiting', 'visitors'}}
  local out = {}
  for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not u.flags1.caged
       and not dfhack.maps.getTileFlags(u.pos).hidden and dfhack.units.isDanger(u) then
      out.hostile = {id = u.id, x = u.pos.x, y = u.pos.y, z = u.pos.z, label = unit_name(u)}
      break
    end
  end
  local r = df.global.world.status.reports
  local best
  for i = #r - 1, 0, -1 do
    local rep = r[i]
    if rep.id <= ${since} then break end
    if rep.pos.x >= 0 then
      local t = dfhack.df2utf(rep.text)
      local low = t:lower()
      local score, c = 0, nil
      for _, w in ipairs(HURT) do if low:find(w, 1, true) then score, c = 3, 'fights' end end
      if score == 0 and out.hostile and df.announcement_type[rep.type]:find('COMBAT') then score, c = 3, 'fights' end
      if score == 0 then for _, w in ipairs(NEWS) do if low:find(w[1], 1, true) then score, c = 2, w[2] break end end end
      if score > 0 and (not best or score > best.score) then best = {x = rep.pos.x, y = rep.pos.y, z = rep.pos.z, text = t, score = score, cat = c} end
    end
  end
  out.event = best
  out.last = #r > 0 and r[#r - 1].id or ${since}
  local f = ${followId ?? -1} >= 0 and df.unit.find(${followId ?? -1})
  if f and not dfhack.units.isDead(f) then out.follow = {id = f.id, x = f.pos.x, y = f.pos.y, z = f.pos.z, label = unit_name(f)} end
  emit(out)`;

let lastReport = -1;
export function directorReset(reportId) { lastReport = reportId; camera.log = []; }

const moved = (p) => p && (p.z !== camera.last.z || Math.abs(p.x - camera.last.x) > 4 || Math.abs(p.y - camera.last.y) > 4);

export async function directorStep() {
  if (camera.mode === "off") return;
  const { value: s } = await lua(SCAN(lastReport, camera.followId));
  if (!s) return;
  lastReport = s.last ?? lastReport;
  const now = Date.now();

  if (camera.mode === "follow") {
    if (s.follow && moved(s.follow)) await cameraTo(s.follow.x, s.follow.y, s.follow.z, `following ${s.follow.label}`);
    return;
  }

  // keep the current subject for a while so the view does not flicker; better things may interrupt
  const held = now - camera.lastSwitch;
  const rank = { fight: 4, hostile: 3, news: 2, tour: 1 };
  const cur = camera.subject;
  const canTake = (kind, minHold) => !cur || rank[kind] > rank[cur.kind] || held > minHold;

  // 1. real fighting
  if (s.event?.score === 3 && weight("fights") > 0 && canTake("fight", 6000)) {
    camera.subject = { kind: "fight", cat: "fights", label: s.event.text };
    camera.lastSwitch = now;
    return cameraTo(s.event.x, s.event.y, s.event.z, `fight: ${s.event.text}`);
  }
  // 2. a visible hostile: track it while it is on screen
  if (s.hostile && weight("hostiles") > 0 && (cur?.kind === "hostile" || canTake("hostile", 6000))) {
    if (cur?.kind !== "hostile" || cur.id !== s.hostile.id) {
      camera.subject = { kind: "hostile", cat: "hostiles", id: s.hostile.id, label: s.hostile.label };
      camera.lastSwitch = now;
    }
    if (moved(s.hostile)) await cameraTo(s.hostile.x, s.hostile.y, s.hostile.z, `tracking hostile ${s.hostile.label}`);
    return;
  }
  // 3. news, weighted by preference (a disliked category needs to be rarer to win)
  if (s.event?.score === 2 && weight(s.event.cat) > 0 && canTake("news", 7000 / weight(s.event.cat))) {
    camera.subject = { kind: "news", cat: s.event.cat, label: s.event.text };
    camera.lastSwitch = now;
    return cameraTo(s.event.x, s.event.y, s.event.z, s.event.text);
  }
  // 4. quiet: tour the most interesting activity, rotating between subjects
  if (camera.tour && (!cur || cur.kind === "tour" ? held > 9000 : held > 12000)) {
    const { value: scenes } = await luaFile("scenes", {});
    const pick = (scenes ?? [])
      .map((sc) => ({ ...sc, w: sc.score * weight(sc.cat) * (camera.recent.includes(sc.id) ? 0.25 : 1) }))
      .filter((sc) => sc.w > 0)
      .sort((a, b) => b.w - a.w)[0];
    if (pick) {
      camera.subject = { kind: "tour", cat: pick.cat, id: pick.id, label: pick.label };
      camera.lastSwitch = now;
      camera.recent = [pick.id, ...camera.recent].slice(0, 6);
      return cameraTo(pick.x, pick.y, pick.z, `tour (${pick.cat}): ${pick.label}`);
    }
  }
  // while touring, keep the subject in view as it walks around
  if (cur?.kind === "tour" && cur.id !== undefined) {
    const { value: u } = await lua(`local u = df.unit.find(${cur.id}) if u then emit({x = u.pos.x, y = u.pos.y, z = u.pos.z}) else emit({}) end`);
    if (u?.x !== undefined && moved(u)) await cameraTo(u.x, u.y, u.z);
  }
}
