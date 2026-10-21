// Interpret snapshots independently of the clock target: a dangerous event on
// the final poll still needs attention, even when the requested time elapsed.
export function watchdogEvents(start, now) {
  const known = new Set(start.hostile_ids ?? []);
  let newHostile = (now.hostile_ids ?? []).some((id) => !known.has(id));
  // During a siege (hostiles already on the map) more keep arriving and closing in one by one. Stop in
  // stages instead: when the first comes within 40 tiles of a dwarf, then when the first is within 12.
  let stage = "";
  if ((start.hostiles ?? 0) > 0 && now.hostile_near_ids) {
    const nearNow = now.hostile_near_ids.length > 0, nearBefore = (start.hostile_near_ids ?? []).length > 0;
    const closeNow = (now.hostile_close_ids ?? []).length > 0, closeBefore = (start.hostile_close_ids ?? []).length > 0;
    stage = closeNow && !closeBefore ? "at the gates (within 12 tiles of a citizen they can walk to)"
      : nearNow && !nearBefore ? "approaching the fort (within 40 tiles of a citizen)" : "";
    newHostile = stage !== "";
  }
  const combat = now.combat ?? [];
  const reasons = [];
  const knownIsolated=new Set((start.isolated??[]).map(u=>u.id));
  const isolated=(now.isolated??[]).filter(u=>!knownIsolated.has(u.id));
  if(isolated.length) reasons.push(`citizen lost walking access (possibly trapped): ${isolated.map(u=>`${u.name} #${u.id} at ${u.x},${u.y},${u.z}`).join("; ")} (df_problems)`);
  const siege = (start.hostiles ?? 0) > 0 && now.hostile_near_ids;
  const moreHostiles = !siege && now.hostiles > start.hostiles;
  if (newHostile || moreHostiles) reasons.push(siege ? `hostiles ${stage}: ${(now.hostile_names ?? []).join("; ")}`
    : `hostile on the map: ${(now.hostile_names ?? []).join("; ")}`);
  if (combat.length) reasons.push(`combat involving fortress units: ${combat.map((e) => `${e.name}: ${e.text}`).join("; ")}`);
  if (now.pop < start.pop) reasons.push(`population fell ${start.pop} -> ${now.pop}`);
  if (now.moods > start.moods) reasons.push("a strange mood started (df_mood)");
  if (now.caravans > start.caravans) reasons.push("a caravan arrived (df_trade)");
  return { reasons, threat: newHostile || moreHostiles || combat.length > 0 };
}

export function waitDecision(start, now, target, watch = true) {
  const event = watch ? watchdogEvents(start, now) : { reasons: [], threat: false };
  return { ...event, stop: event.reasons.length > 0 || now.abs >= target };
}
