import assert from "node:assert/strict";
import test from "node:test";
import {
  dragAnchor,
  resolveDrop,
  movedEnough,
  returnedToSource,
} from "./pointer-geometry.js";

const machine = {
  id: "machine",
  kind: "station",
  station: "espresso",
  accepts: ["cup"],
  x: 20,
  y: 150,
  w: 300,
  h: 200,
};
const oven = {
  id: "oven",
  kind: "station",
  station: "oven",
  accepts: ["pastry"],
  x: 350,
  y: 150,
  w: 150,
  h: 200,
};
const cup = { kind: "cup", pointerType: "touch" };
test("a lifted preview and an off-center pickup use the displayed center for drops", () => {
  const source = { x: 0, y: 500, w: 70, h: 78 };
  const start = { x: 5, y: 510 };
  const anchor = dragAnchor({ x: 70, y: 365 }, source, start, "touch");
  assert.deepEqual(anchor, { x: 70, y: 329 });
  assert.deepEqual(dragAnchor({ x: 70, y: 365 }, source, start), {
    x: 100,
    y: 394,
  });
  assert.equal(
    resolveDrop([machine], cup, anchor, { x: 70, y: 365 }).id,
    "machine",
  );
  assert.equal(
    resolveDrop([machine], cup, { x: 100, y: 340 }, { x: 100, y: 376 }).id,
    "machine",
  );
  assert.equal(
    resolveDrop([machine], cup, { x: 100, y: 120 }, { x: 100, y: 156 }).id,
    "machine",
  );
});
test("explicit Serve and tab targets win over the tray or machine panel", () => {
  const tray = {
    id: "tray",
    kind: "tray",
    accepts: ["cup", "trayFood"],
    x: 0,
    y: 500,
    w: 400,
    h: 100,
  };
  const serve = {
    id: "serve",
    kind: "customer",
    accepts: ["cup", "trayFood"],
    x: 200,
    y: 550,
    w: 150,
    h: 48,
    priority: 2,
  };
  const tab = {
    id: "milk-tab",
    kind: "station",
    accepts: ["cup"],
    x: 80,
    y: 190,
    w: 70,
    h: 48,
    priority: 2,
  };
  assert.equal(resolveDrop([tray, serve], cup, { x: 250, y: 565 }).id, "serve");
  assert.equal(
    resolveDrop([machine, tab], cup, { x: 100, y: 215 }).id,
    "milk-tab",
  );
});
test("wrong stations and distant misses do not redirect to another destination", () => {
  assert.equal(
    resolveDrop([machine, oven], cup, { x: 315, y: 220 }, { x: 355, y: 220 })
      .id,
    "oven",
  );
  assert.equal(
    resolveDrop([machine, oven], cup, { x: 550, y: 400 }),
    undefined,
  );
  assert.equal(resolveDrop([machine], cup, { x: 338, y: 220 }).id, "machine");
  assert.equal(
    resolveDrop(
      [machine],
      { ...cup, pointerType: "mouse" },
      { x: 338, y: 220 },
    ),
    undefined,
  );
});
test("final release movement can qualify as a drag, while normal touch drift remains a tap", () => {
  assert.equal(movedEnough({ x: 0, y: 0 }, { x: 10, y: 4 }, "touch"), false);
  assert.equal(movedEnough({ x: 0, y: 0 }, { x: 60, y: 5 }, "touch"), true);
  assert.equal(movedEnough({ x: 0, y: 0 }, { x: 5, y: 0 }), true);
});
test("a finger on a station tab does not accidentally serve through the lifted preview", () => {
  const customer = {
    id: "guest",
    kind: "customer",
    accepts: ["cup"],
    x: 0,
    y: 50,
    w: 400,
    h: 100,
  };
  const tab = {
    id: "milk",
    kind: "station",
    accepts: ["cup"],
    x: 100,
    y: 150,
    w: 80,
    h: 48,
    priority: 2,
  };
  assert.equal(
    resolveDrop([customer, tab], cup, { x: 140, y: 135 }, { x: 140, y: 171 })
      .id,
    "milk",
  );
});
test("returning food to any fresh rack card or the original source never starts warming", () => {
  const rack = {
    id: "croissant",
    kind: "pastry",
    x: 100,
    y: 250,
    w: 100,
    h: 60,
  };
  const food = { id: "croissant", kind: "pastry", pointerType: "touch" };
  const warmer = { ...machine, accepts: ["pastry"], exclude: [rack] };
  assert.equal(
    resolveDrop([warmer], food, { x: 130, y: 230 }, { x: 130, y: 266 }),
    undefined,
  );
  assert.equal(
    returnedToSource(food, { x: 130, y: 230 }, { x: 130, y: 266 }, [rack]),
    true,
  );
  assert.equal(
    returnedToSource(
      { ...food, id: "other-food" },
      { x: 130, y: 270 },
      { x: 130, y: 306 },
      [rack],
    ),
    true,
  );
});
test("an explicit Warm food button wins when only the lifted preview overlaps a rack", () => {
  const rack = { id: "toastie", kind: "pastry", x: 600, y: 120, w: 100, h: 40 };
  const food = { id: "croissant", kind: "pastry", pointerType: "touch" };
  const button = {
    ...oven,
    id: "warm-button",
    x: 600,
    y: 170,
    w: 100,
    h: 44,
    priority: 2,
  };
  const panel = { ...oven, x: 500, y: 100, w: 230, h: 140, exclude: [rack] };
  const anchor = { x: 650, y: 153 },
    pointer = { x: 650, y: 189 };
  assert.equal(
    returnedToSource(food, anchor, pointer, [rack], [panel, button]),
    false,
  );
  assert.equal(
    resolveDrop([panel, button], food, anchor, pointer).id,
    "warm-button",
  );
  assert.equal(
    resolveDrop([panel, button], food, { x: 650, y: 94 }, { x: 650, y: 130 }),
    undefined,
  );
});
