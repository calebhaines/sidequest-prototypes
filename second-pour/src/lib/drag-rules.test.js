import test from "node:test";
import assert from "node:assert/strict";
import { recipes } from "./data.js";
import { createInitialState, evaluateOrder, gameReducer } from "./game.js";
import { planDrop } from "./drag-rules.js";

const cup = { kind: "cup" };
const tray = { kind: "tray" };
const station = (name) => ({ kind: "station", station: name });
const customer = (id) => ({ kind: "customer", customerId: id });
const fresh = (foodId = "croissant") => ({ kind: "pastry", foodId });
const warmed = (foodId = "croissant") => ({ kind: "warmFood", foodId });
const trayFood = (foodId = "croissant") => ({ kind: "trayFood", foodId });
const act = (state, type, fields = {}) =>
  gameReducer(state, { type, ...fields });
const start = () => act(createInitialState(), "START_SHIFT");
const drop = (state, ui, dragged, zone) => {
  const plan = planDrop(state, ui, dragged, zone);
  assert.equal(plan.accepted, true, plan.reason);
  return {
    plan,
    state: plan.actions.reduce(gameReducer, state),
    ui: Object.hasOwn(plan, "cupDock") ? { ...ui, cupDock: plan.cupDock } : ui,
  };
};
const rejectWithoutChanges = (state, ui, dragged, zone) => {
  const snapshot = structuredClone({ state, ui, dragged, zone });
  const plan = planDrop(state, ui, dragged, zone);
  assert.equal(plan.accepted, false);
  assert.ok(plan.reason);
  assert.deepEqual(plan.actions, []);
  assert.deepEqual({ state, ui, dragged, zone }, snapshot);
  assert.equal(plan.actions.reduce(gameReducer, state), state);
  return plan;
};

test("a dragged cup and croissant complete and serve the practice latte", () => {
  let state = createInitialState();
  let ui = { cupDock: null, milkMode: "milk", kettleMode: "water" };
  let result = drop(state, ui, cup, station("espresso"));
  ({ state, ui } = result);
  assert.equal(ui.cupDock, "espresso");
  assert.equal(state.jobs.espresso.ready, true);
  assert.equal(state.drink.shots, 0);
  result = drop(state, ui, cup, station("espresso"));
  ({ state, ui } = result);
  assert.equal(result.plan.pourStation, "espresso");
  assert.equal(state.drink.shots, 1);
  assert.equal(state.jobs.espresso, null);

  ({ state, ui } = drop(state, ui, cup, station("milk")));
  result = drop(state, ui, cup, station("milk"));
  ({ state, ui } = result);
  assert.equal(state.drink.milk, 1);
  assert.equal(result.plan.pourStation, "milk");
  ({ state, ui } = drop(state, ui, fresh(), station("oven")));
  assert.equal(state.jobs.oven.ready, true);
  assert.equal(state.food, null);
  ({ state, ui } = drop(state, ui, warmed(), tray));
  assert.deepEqual(state.food, { id: "croissant", warm: true });
  assert.equal(state.jobs.oven, null);
  assert.equal(evaluateOrder(state).correct, true);

  ({ state, ui } = drop(state, ui, cup, tray));
  assert.equal(ui.cupDock, null);
  result = drop(state, ui, cup, customer(state.selectedId));
  assert.equal(result.plan.served, true);
  assert.equal(result.ui.cupDock, null);
  assert.equal(result.state.served, 1);
  assert.equal(result.state.food, null);
  assert.equal(result.state.drink.shots, 0);
  assert.equal(result.state.queue.length, 0);
});

test("a working machine holds its cup while the warmer can run in parallel", () => {
  let { state, ui } = drop(
    start(),
    { cupDock: null },
    cup,
    station("espresso"),
  );
  assert.equal(state.jobs.espresso.remaining, 4);
  for (const zone of [
    tray,
    station("espresso"),
    station("milk"),
    customer(state.selectedId),
  ])
    rejectWithoutChanges(state, ui, cup, zone);
  ({ state, ui } = drop(state, ui, fresh(), station("oven")));
  assert.equal(state.jobs.oven.remaining, 7);
  assert.equal(state.jobs.espresso.remaining, 4);
  assert.equal(ui.cupDock, "espresso");
  state = act(state, "TICK", { seconds: 4 });
  ({ state, ui } = drop(state, ui, cup, station("espresso")));
  assert.equal(state.drink.shots, 1);
  assert.equal(state.jobs.oven.remaining, 3);
  ({ state, ui } = drop(state, ui, cup, tray));
  assert.equal(ui.cupDock, null);
});

test("cold milk pours immediately; steam, foam, tea, and water use the selected modes", () => {
  const cold = drop(
    createInitialState(),
    { milkMode: "cold" },
    cup,
    station("milk"),
  );
  assert.equal(cold.state.drink.coldMilk, 1);
  assert.equal(cold.state.drink.milk, 0);
  assert.equal(cold.state.jobs.milk, null);
  assert.equal(cold.plan.pourStation, "milk");
  for (const [machine, ui, ingredient, mode] of [
    ["milk", { milkMode: "milk" }, "milk", "milk"],
    ["milk", { milkMode: "foam" }, "foam", "foam"],
    ["kettle", { kettleMode: "water" }, "water", "water"],
    ["kettle", { kettleMode: "tea" }, "tea", "tea"],
  ]) {
    const first = drop(createInitialState(), ui, cup, station(machine));
    assert.equal(first.state.jobs[machine].mode, mode);
    const collected = drop(first.state, first.ui, cup, station(machine));
    assert.equal(collected.state.drink[ingredient], 1);
    assert.equal(collected.state.jobs[machine], null);
    assert.equal(collected.plan.pourStation, machine);
  }
});

test("busy drink machines reject drops without overwriting their current jobs", () => {
  const busy = act(start(), "START_JOB", { station: "milk", mode: "foam" });
  rejectWithoutChanges(
    busy,
    { cupDock: null, milkMode: "cold" },
    cup,
    station("milk"),
  );
  const ready = act(busy, "TICK", { seconds: 5 });
  const collected = drop(ready, { milkMode: "cold" }, cup, station("milk"));
  assert.equal(collected.state.drink.foam, 1);
  assert.equal(collected.state.drink.coldMilk, 0);
});

test("only valid fresh food enters an idle warmer and only its finished food reaches the tray", () => {
  let state = start();
  for (const item of [
    fresh("missing"),
    fresh("toString"),
    fresh("__proto__"),
    cup,
    warmed(),
    trayFood(),
  ])
    rejectWithoutChanges(state, {}, item, station("oven"));
  for (const zone of [station("espresso"), tray, customer(state.selectedId)])
    rejectWithoutChanges(state, {}, fresh(), zone);
  ({ state } = drop(state, {}, fresh("toastie"), station("oven")));
  rejectWithoutChanges(state, {}, fresh(), station("oven"));
  rejectWithoutChanges(state, {}, warmed("toastie"), tray);
  state = act(state, "TICK", { seconds: 10 });
  rejectWithoutChanges(state, {}, fresh(), station("oven"));
  rejectWithoutChanges(state, {}, warmed(), tray);
  rejectWithoutChanges(
    state,
    {},
    warmed("toastie"),
    customer(state.selectedId),
  );
  const occupied = { ...state, food: { id: "croissant", warm: true } };
  rejectWithoutChanges(occupied, {}, warmed("toastie"), tray);
  ({ state } = drop(state, {}, warmed("toastie"), tray));
  assert.deepEqual(state.food, { id: "toastie", warm: true });
  assert.equal(state.jobs.oven, null);
  rejectWithoutChanges(state, {}, warmed("toastie"), tray);
  rejectWithoutChanges(state, {}, trayFood(), tray);
  assert.equal(drop(state, {}, trayFood("toastie"), tray).state, state);
  rejectWithoutChanges(state, {}, trayFood("toastie"), station("oven"));
});

test("serving targets the drop customer only after its exact full order matches", () => {
  const initial = start();
  const target = initial.queue[1];
  const recipe = recipes[target.drinkId];
  const state = {
    ...initial,
    drink: { cup: recipe.cup, ...recipe.ingredients },
    food: null,
  };
  assert.notEqual(state.selectedId, target.id);
  const wrong = rejectWithoutChanges(
    state,
    {},
    cup,
    customer(state.selectedId),
  );
  assert.equal(wrong.reason, evaluateOrder(state).message);
  const served = drop(state, { cupDock: "kettle" }, cup, customer(target.id));
  assert.deepEqual(served.plan.actions, [
    { type: "SELECT_CUSTOMER", id: target.id },
    { type: "SERVE" },
  ]);
  assert.equal(served.state.lastServed.customerId, target.id);
  assert.equal(served.state.served, 1);
  assert.equal(served.state.queue[0].id, state.queue[0].id);
  assert.equal(state.selectedId, initial.selectedId);
  rejectWithoutChanges(state, {}, cup, customer("departed-customer"));
  rejectWithoutChanges(
    { ...state, drink: { ...state.drink, vanilla: 1 } },
    {},
    cup,
    customer(target.id),
  );
});

test("dragging tray food serves the complete order and never swaps or loses food on a bad target", () => {
  const initial = start();
  const target = initial.queue[0];
  const recipe = recipes[target.drinkId];
  const state = {
    ...initial,
    selectedId: initial.queue[1].id,
    drink: { cup: recipe.cup, ...recipe.ingredients },
    food: { id: target.foodId, warm: true },
  };
  rejectWithoutChanges(state, {}, trayFood(), customer(initial.queue[1].id));
  rejectWithoutChanges(state, {}, trayFood("toastie"), customer(target.id));
  rejectWithoutChanges(
    { ...state, food: { id: "croissant", warm: false } },
    {},
    trayFood(),
    customer(target.id),
  );
  const served = drop(state, {}, trayFood(), customer(target.id));
  assert.equal(served.plan.served, true);
  assert.equal(served.state.lastServed.customerId, target.id);
  assert.equal(served.state.food, null);
});

test("serving by cup or tray food waits for a docked cup's active job", () => {
  const initial = start();
  const target = initial.queue[0];
  const recipe = recipes[target.drinkId];
  const readyOrder = {
    ...initial,
    drink: { cup: recipe.cup, ...recipe.ingredients },
    food: { id: target.foodId, warm: true },
  };
  const state = act(readyOrder, "START_JOB", { station: "espresso" });
  const ui = { cupDock: "espresso" };
  assert.equal(evaluateOrder(state, target).correct, true);
  rejectWithoutChanges(state, ui, cup, customer(target.id));
  rejectWithoutChanges(state, ui, trayFood(), customer(target.id));
  assert.equal(drop(state, ui, trayFood(), tray).state, state);
});

test("cancelled drags, stale sources, invalid zones, and inactive phases are free", () => {
  const state = act(createInitialState(), "ADD_INGREDIENT", {
    ingredient: "milk",
  });
  const ui = { cupDock: "milk", milkMode: "foam" };
  rejectWithoutChanges(state, ui, cup, null);
  rejectWithoutChanges(state, ui, null, tray);
  rejectWithoutChanges(state, ui, { kind: "unknown" }, tray);
  rejectWithoutChanges(state, ui, cup, { kind: "nowhere" });
  rejectWithoutChanges(state, ui, cup, station("unknown"));
  rejectWithoutChanges(state, ui, warmed(), tray);
  rejectWithoutChanges(state, ui, trayFood(), tray);
  for (const phase of ["paused", "summary", "menu"])
    rejectWithoutChanges({ ...state, phase }, ui, cup, station("espresso"));
});
