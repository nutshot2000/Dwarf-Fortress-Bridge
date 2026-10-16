// Camera director: moves the player's view to whatever matters so an observer can follow the game.
// The game's own follow mode (plotinfo.follow_unit) switches itself off, so following is done here:
// df_wait calls directorStep() on every heartbeat and re-centres on the current subject.
import { lua } from "./dfhack.js";

export const camera = {
  mode: "auto",          // auto: pick the action yourself; follow: stick to one unit; off: never move the view
  followId: null,        // unit followed in follow mode (or the current auto subject)
  subject: null,         // { kind, id?, label, until } current auto subject
  last: { x: -1, y: -1, z: -1 },
  lastSwitch: 0,
  log: [],               // what the camera showed during the current wait
};

export async function cameraTo(x, y, z, why) {
  if (camera.mode === "off" || x === undefined || x < 0) return;
  await lua(`dfhack.gui.revealInDwarfmodeMap(xyz2pos(${x}, ${y}, ${z}), true, true) emit(true)`);
  camera.last = { x, y, z };
  if (why && camera.log.at(-1) !== why) camera.log.push(why);
}

// Lua that gathers everything the director may want to look at since report `since`.
// Priority: real fighting (an injury, or combat while a hostile is visible) > a visible hostile >
// deaths, migrants, caravans, births, artifacts, moods > a strange-mood dwarf at work.
const SCAN = (since, followId) => `
  local HURT = {'struck down', 'severed', 'mangled', 'torn', 'shattered', 'killed', 'dead', 'unconscious', 'bleeding', 'falls over'}
  local NEWS = {'arrived', 'has come', 'given birth', 'has created', 'withdraws from society', 'mysterious construction',
    'taken by a', 'possessed', 'found dead', 'has been', 'struck', 'migrants', 'thief', 'ambush', 'siege'}
  local out = {}
  local hostile
  for _, u in ipairs(df.global.world.units.active) do
    if dfhack.units.isActive(u) and not dfhack.units.isDead(u) and not u.flags1.caged
       and not dfhack.maps.getTileFlags(u.pos).hidden and dfhack.units.isDanger(u) then
      hostile = {id = u.id, x = u.pos.x, y = u.pos.y, z = u.pos.z, label = unit_name(u)}
      break
    end
  end
  out.hostile = hostile
  local r = df.global.world.status.reports
  local best, bestScore = nil, 0
  for i = #r - 1, 0, -1 do
    local rep = r[i]
    if rep.id <= ${since} then break end
    if rep.pos.x >= 0 then
      local t = dfhack.df2utf(rep.text)
      local low = t:lower()
      local score = 0
      for _, w in ipairs(HURT) do if low:find(w, 1, true) then score = 3 end end
      if score == 0 and hostile and df.announcement_type[rep.type]:find('COMBAT') then score = 3 end
      if score == 0 then for _, w in ipairs(NEWS) do if low:find(w, 1, true) then score = 2 end end end
      if score > bestScore then best, bestScore = {x = rep.pos.x, y = rep.pos.y, z = rep.pos.z, text = t, score = score}, score end
    end
  end
  out.event = best
  out.last = #r > 0 and r[#r - 1].id or ${since}
  local f = ${followId ?? -1} >= 0 and df.unit.find(${followId ?? -1})
  if f and not dfhack.units.isDead(f) then out.follow = {id = f.id, x = f.pos.x, y = f.pos.y, z = f.pos.z, label = unit_name(f)} end
  for _, u in ipairs(citizens()) do
    local j = u.job.current_job
    if u.mood >= 0 and df.mood_type[u.mood] ~= 'Baby' and j then
      out.mood = {id = u.id, x = u.pos.x, y = u.pos.y, z = u.pos.z, label = unit_name(u)}
      break
    end
  end
  emit(out)`;

let lastReport = -1;
export function directorReset(reportId) { lastReport = reportId; camera.log = []; }

// One heartbeat of the director; cheap enough to run every poll.
export async function directorStep() {
  if (camera.mode === "off") return;
  const { value: s } = await lua(SCAN(lastReport, camera.followId));
  if (!s) return;
  lastReport = s.last ?? lastReport;
  const now = Date.now();
  const moved = (p) => p && (p.z !== camera.last.z || Math.abs(p.x - camera.last.x) > 4 || Math.abs(p.y - camera.last.y) > 4);

  if (camera.mode === "follow") {
    if (s.follow && moved(s.follow)) await cameraTo(s.follow.x, s.follow.y, s.follow.z, `following ${s.follow.label}`);
    return;
  }
  // auto: keep a subject for a few seconds so the view does not flicker between events
  const sticky = camera.subject && now - camera.lastSwitch < 6000;
  if (s.event?.score === 3 && (!sticky || camera.subject.kind !== "fight")) {
    camera.subject = { kind: "fight", label: s.event.text };
    camera.lastSwitch = now;
    await cameraTo(s.event.x, s.event.y, s.event.z, `fight: ${s.event.text}`);
  } else if (s.hostile && (!sticky || ["news", "mood"].includes(camera.subject.kind))) {
    if (camera.subject?.kind !== "hostile" || camera.subject.id !== s.hostile.id) {
      camera.subject = { kind: "hostile", id: s.hostile.id, label: s.hostile.label };
      camera.lastSwitch = now;
    }
    if (moved(s.hostile)) await cameraTo(s.hostile.x, s.hostile.y, s.hostile.z, `tracking hostile ${s.hostile.label}`);
  } else if (s.event?.score === 2 && !sticky) {
    camera.subject = { kind: "news", label: s.event.text };
    camera.lastSwitch = now;
    await cameraTo(s.event.x, s.event.y, s.event.z, s.event.text);
  } else if (s.mood && !sticky && camera.subject?.kind !== "mood") {
    camera.subject = { kind: "mood", id: s.mood.id, label: s.mood.label };
    camera.lastSwitch = now;
    await cameraTo(s.mood.x, s.mood.y, s.mood.z, `mood: ${s.mood.label} at work`);
  }
}
