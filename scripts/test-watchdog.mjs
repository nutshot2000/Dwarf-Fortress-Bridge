import assert from "node:assert/strict";
import { waitDecision } from "../src/watchdog.js";

export function testWatchdog() {
  const start = { abs: 100, hostiles: 0, hostile_ids: [], pop: 7, moods: 0, caravans: 0 };
  const quiet = { ...start, abs: 120, combat: [] };
  assert.equal(waitDecision(start, quiet, 200).stop, false);
  assert.equal(waitDecision(start, quiet, 120).stop, true);
  const fight = { ...quiet, combat: [{ name: "Dog", text: "Attacked by a non-dangerous creature" }] };
  const endOfWait = waitDecision(start, fight, 120);
  assert.equal(endOfWait.stop, true);
  assert.equal(endOfWait.threat, true);
  assert.match(endOfWait.reasons.join(" "), /combat.*Dog/);
  assert.equal(waitDecision(start, fight, 200, false).stop, false);
  assert.deepEqual(waitDecision(start, fight, 120, false).reasons, []);
  const replacement = waitDecision({ ...start, hostiles: 1, hostile_ids: [1] },
    { ...quiet, hostiles: 1, hostile_ids: [2], hostile_names: ["New enemy"] }, 200);
  assert.equal(replacement.threat, true);
  // Siege: more hostiles at the map edge do not stop a wait; one newly within reach of the fort does.
  const siegeStart = { ...start, hostiles: 10, hostile_ids: [1, 2], hostile_near_ids: [] };
  const edge = waitDecision(siegeStart, { ...quiet, hostiles: 30, hostile_ids: [1, 2, 3, 4], hostile_near_ids: [] }, 200);
  assert.equal(edge.stop, false);
  const close = waitDecision(siegeStart, { ...quiet, hostiles: 30, hostile_ids: [1, 2, 3], hostile_near_ids: [3] }, 200);
  assert.equal(close.stop, true);
  assert.equal(close.threat, true);
  assert.match(close.reasons.join(" "), /approaching the fort/);
  // Already approaching: more of them closing in does not stop again, until the first reaches the gates.
  const nearStart = { ...siegeStart, hostile_near_ids: [3], hostile_close_ids: [] };
  assert.equal(waitDecision(nearStart, { ...quiet, hostiles: 30, hostile_ids: [1, 2, 3, 5], hostile_near_ids: [3, 5], hostile_close_ids: [] }, 200).stop, false);
  const gates = waitDecision(nearStart, { ...quiet, hostiles: 30, hostile_ids: [1, 2, 3], hostile_near_ids: [3], hostile_close_ids: [3] }, 200);
  assert.equal(gates.stop, true);
  assert.match(gates.reasons.join(" "), /at the gates/);
  const trapped={id:42,name:"Builder",x:10,y:20,z:3};
  const lost=waitDecision(start,{...quiet,isolated:[trapped]},200);
  assert.equal(lost.stop,true);
  assert.equal(lost.threat,false);
  assert.match(lost.reasons.join(" "),/lost walking access.*Builder/);
  assert.equal(waitDecision({...start,isolated:[trapped]},{...quiet,isolated:[trapped]},200).stop,false);
  for (const [field, value] of [["pop", 6], ["moods", 1], ["caravans", 1]]) {
    const decision = waitDecision(start, { ...quiet, [field]: value }, 200);
    assert.equal(decision.stop, true, field);
    assert.equal(decision.threat, false, field);
  }
  console.log("watchdog decision checks passed");
}
