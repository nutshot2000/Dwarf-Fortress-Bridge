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
  for (const [field, value] of [["pop", 6], ["moods", 1], ["caravans", 1]]) {
    const decision = waitDecision(start, { ...quiet, [field]: value }, 200);
    assert.equal(decision.stop, true, field);
    assert.equal(decision.threat, false, field);
  }
  console.log("watchdog decision checks passed");
}
