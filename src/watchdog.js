// Interpret snapshots independently of the clock target: a dangerous event on
// the final poll still needs attention, even when the requested time elapsed.
export function watchdogEvents(start, now) {
  const known = new Set(start.hostile_ids ?? []);
  const newHostile = (now.hostile_ids ?? []).some((id) => !known.has(id));
  const combat = now.combat ?? [];
  const reasons = [];
  const knownIsolated=new Set((start.isolated??[]).map(u=>u.id));
  const isolated=(now.isolated??[]).filter(u=>!knownIsolated.has(u.id));
  if(isolated.length) reasons.push(`citizen lost walking access (possibly trapped): ${isolated.map(u=>`${u.name} #${u.id} at ${u.x},${u.y},${u.z}`).join("; ")} (df_problems)`);
  if (newHostile || now.hostiles > start.hostiles) reasons.push(`hostile on the map: ${(now.hostile_names ?? []).join("; ")}`);
  if (combat.length) reasons.push(`combat involving fortress units: ${combat.map((e) => `${e.name}: ${e.text}`).join("; ")}`);
  if (now.pop < start.pop) reasons.push(`population fell ${start.pop} -> ${now.pop}`);
  if (now.moods > start.moods) reasons.push("a strange mood started (df_mood)");
  if (now.caravans > start.caravans) reasons.push("a caravan arrived (df_trade)");
  return { reasons, threat: newHostile || now.hostiles > start.hostiles || combat.length > 0 };
}

export function waitDecision(start, now, target, watch = true) {
  const event = watch ? watchdogEvents(start, now) : { reasons: [], threat: false };
  return { ...event, stop: event.reasons.length > 0 || now.abs >= target };
}
