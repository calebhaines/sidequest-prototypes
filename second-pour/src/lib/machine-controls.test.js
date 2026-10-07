import assert from "node:assert/strict";
import test from "node:test";
import {
  machineDragProgress,
  machineDragCommitted,
} from "./machine-controls.js";

const dial = { kind: "dial", x: 80, y: 80, w: 40, h: 40 };
test("machine pulls and upward dial drags require a deliberate movement", () => {
  const start = { x: 100, y: 100 };
  assert.equal(
    machineDragCommitted(
      machineDragProgress({ kind: "lever" }, start, { x: 100, y: 105 }),
    ),
    false,
  );
  assert.equal(
    machineDragCommitted(
      machineDragProgress({ kind: "lever" }, start, { x: 100, y: 135 }),
    ),
    true,
  );
  assert.equal(
    machineDragProgress({ kind: "switch" }, start, { x: 100, y: 75 }),
    0,
  );
  assert.equal(
    machineDragCommitted(machineDragProgress(dial, start, { x: 100, y: 65 })),
    true,
  );
  assert.equal(machineDragProgress(dial, start, { x: 100, y: 140 }), 0);
  assert.equal(
    machineDragCommitted(machineDragProgress(dial, start, start)),
    false,
  );
});
test("clockwise dial turns work across the angle boundary and counterclockwise slips do not activate", () => {
  assert.equal(
    machineDragProgress(dial, { x: 100, y: 80 }, { x: 120, y: 100 }),
    1,
  );
  assert.equal(
    machineDragCommitted(
      machineDragProgress(dial, { x: 80, y: 101 }, { x: 100, y: 80 }),
    ),
    true,
  );
  assert.equal(
    machineDragProgress(dial, { x: 100, y: 80 }, { x: 80, y: 100 }),
    0,
  );
  assert.equal(
    machineDragCommitted(
      machineDragProgress(dial, { x: 100, y: 80 }, { x: 104, y: 81 }),
    ),
    false,
  );
});
