import test from "node:test";
import assert from "node:assert/strict";
import { recipes } from "./data.js";
import {
  createInitialState,
  gameReducer,
  getSelectedCustomer,
  recipeProgress,
  evaluateOrder,
} from "./game.js";

const act = (state, type, fields = {}) =>
  gameReducer(state, { type, ...fields });
const start = (day = 1, best = {}) =>
  act(createInitialState(best), "START_SHIFT", { day });
const tick = (state, seconds) => act(state, "TICK", { seconds });
const job = (state, station, fields = {}) =>
  act(state, "START_JOB", { station, ...fields });
const collect = (state, station) => act(state, "COLLECT_JOB", { station });
const readyOrder = (state) => {
  const customer = getSelectedCustomer(state);
  const recipe = recipes[customer.drinkId];
  return {
    ...state,
    drink: { cup: recipe.cup, ...recipe.ingredients },
    food: customer.foodId ? { id: customer.foodId, warm: true } : null,
  };
};

test("all ten recipes require exact ingredients and the correct cup", () => {
  assert.equal(Object.keys(recipes).length, 10);
  for (const recipe of Object.values(recipes)) {
    const drink = { cup: recipe.cup, ...recipe.ingredients };
    assert.equal(recipeProgress(drink, recipe).correct, true, recipe.id);
    for (const ingredient of Object.keys(recipe.ingredients)) {
      assert.equal(
        recipeProgress(
          { ...drink, [ingredient]: drink[ingredient] + 1 },
          recipe,
        ).correct,
        false,
        `${recipe.id}: extra ${ingredient}`,
      );
      if (drink[ingredient])
        assert.equal(
          recipeProgress({ ...drink, [ingredient]: 0 }, recipe).correct,
          false,
          `${recipe.id}: missing ${ingredient}`,
        );
    }
    assert.equal(
      recipeProgress(
        { ...drink, cup: recipe.cup === "hot" ? "iced" : "hot" },
        recipe,
      ).correct,
      false,
      `${recipe.id}: wrong cup`,
    );
  }
});

test("orders reject missing, cold, wrong, and unrequested food", () => {
  const state = readyOrder(start());
  assert.equal(evaluateOrder(state).correct, true);
  for (const food of [
    null,
    { id: "croissant", warm: false },
    { id: "toastie", warm: true },
  ]) {
    assert.equal(evaluateOrder({ ...state, food }).correct, false);
  }
  const customer = { ...getSelectedCustomer(state), foodId: null };
  assert.equal(evaluateOrder({ ...state, food: null }, customer).correct, true);
  assert.equal(evaluateOrder(state, customer).correct, false);
});

test("practice gives immediate machine results and never counts down", () => {
  let state = createInitialState();
  assert.equal(tick(state, 600), state);
  for (const [station, fields] of [
    ["espresso", {}],
    ["milk", {}],
    ["oven", { foodId: "croissant" }],
  ]) {
    state = job(state, station, fields);
    assert.equal(state.jobs[station].ready, true);
    state = collect(state, station);
  }
  assert.equal(evaluateOrder(state).correct, true);
  state = act(state, "SERVE");
  assert.equal(state.phase, "practice");
  assert.equal(state.queue.length, 0);
  assert.equal(state.tutorialComplete, true);
  assert.equal(state.served, 1);
});

test("machines run concurrently and pausing freezes machines, customers, and shift time", () => {
  let state = start();
  state = job(
    job(job(job(state, "espresso"), "milk", { mode: "foam" }), "kettle", {
      mode: "tea",
    }),
    "oven",
    { foodId: "toastie" },
  );
  const paused = act(state, "PAUSE");
  assert.equal(tick(paused, 50), paused);
  assert.equal(collect(paused, "espresso"), paused);
  state = tick(act(paused, "RESUME"), 4);
  assert.equal(state.jobs.espresso.ready, true);
  assert.equal(state.jobs.milk.remaining, 1);
  assert.equal(state.jobs.kettle.remaining, 2);
  assert.equal(state.jobs.oven.remaining, 6);
  assert.equal(state.timeLeft, 176);
  assert.equal(state.queue[0].patience, 146);
  state = tick(state, 6);
  assert.ok(Object.values(state.jobs).every((machine) => machine.ready));
});

test("unfinished jobs cannot be collected or overwritten; ready jobs collect independently", () => {
  let state = job(job(start(), "espresso"), "milk");
  const premature = collect(state, "espresso");
  assert.equal(premature.drink.shots, 0);
  assert.deepEqual(premature.jobs, state.jobs);
  assert.deepEqual(
    job(state, "espresso", { mode: "double" }).jobs.espresso,
    state.jobs.espresso,
  );
  state = tick(state, 4);
  state = collect(state, "espresso");
  assert.equal(state.drink.shots, 1);
  assert.equal(state.jobs.espresso, null);
  assert.equal(state.jobs.milk.remaining, 1);
  state = collect(tick(state, 1), "milk");
  assert.equal(state.drink.milk, 1);
  assert.equal(state.jobs.milk, null);
});

test("oven collection preserves occupied food trays until cleared", () => {
  let state = collect(
    job(createInitialState(), "oven", { foodId: "croissant" }),
    "oven",
  );
  state = job(state, "oven", { foodId: "toastie" });
  const blocked = collect(state, "oven");
  assert.deepEqual(blocked.food, { id: "croissant", warm: true });
  assert.equal(blocked.jobs.oven.foodId, "toastie");
  state = collect(act(blocked, "CLEAR_FOOD"), "oven");
  assert.deepEqual(state.food, { id: "toastie", warm: true });
  assert.equal(state.jobs.oven, null);
});

test("selecting the current cup preserves the drink; changing cups clears only the drink", () => {
  let state = act(start(), "ADD_INGREDIENT", { ingredient: "vanilla" });
  state = job(state, "oven", { foodId: "croissant" });
  assert.equal(act(state, "SET_CUP", { cup: "hot" }), state);
  const iced = act(state, "SET_CUP", { cup: "iced" });
  assert.equal(iced.drink.cup, "iced");
  assert.equal(iced.drink.vanilla, 0);
  assert.deepEqual(iced.jobs, state.jobs);
});

test("chat increases capped patience once and earns a separate tip bonus", () => {
  const ready = readyOrder(tick(start(), 30));
  const chatted = act(ready, "CHAT", { choice: 1 });
  const customer = getSelectedCustomer(chatted);
  assert.equal(customer.patience, getSelectedCustomer(ready).patience + 20);
  assert.ok(customer.chatReply);
  assert.equal(customer.chatted, true);
  assert.equal(act(chatted, "CHAT", { choice: 0 }), chatted);
  const control = {
    ...chatted,
    queue: chatted.queue.map((item) => ({ ...item, chatted: false })),
  };
  const withChat = act(chatted, "SERVE");
  const withoutChat = act(control, "SERVE");
  assert.ok(Math.abs(withChat.tips - withoutChat.tips - 0.65) < 0.001);
  assert.equal(withChat.lastServed.chatBonus, true);
  const capped = act(tick(start(), 5), "CHAT", { choice: 0 });
  assert.equal(
    getSelectedCustomer(capped).patience,
    getSelectedCustomer(capped).maxPatience,
  );
});

test("failed serving keeps the draft and order; correct serving clears the tray and selects the next order", () => {
  const state = job(start(), "oven", { foodId: "toastie" });
  const failed = act(state, "SERVE");
  assert.equal(failed.served, 0);
  assert.deepEqual(failed.drink, state.drink);
  assert.deepEqual(failed.food, state.food);
  assert.equal(failed.queue.length, state.queue.length);
  assert.ok(failed.notice.text.includes("Add"));
  const served = act(readyOrder(state), "SERVE");
  assert.equal(served.served, 1);
  assert.equal(served.food, null);
  assert.equal(served.drink.shots, 0);
  assert.equal(served.selectedId, served.queue[0].id);
  assert.deepEqual(served.jobs, state.jobs);
  assert.ok(served.score > 0 && served.tips > 0);
});

test("arrivals are reproducible and each day orders only unlocked recipes", () => {
  for (const day of [1, 2, 3]) {
    const initial = start(day);
    assert.equal(initial.day, day);
    assert.equal(
      initial.queue[0].drinkId,
      ["latte", "mocha", "icedlatte"][day - 1],
    );
    assert.deepEqual(tick(initial, 24), tick(start(day), 24));
    assert.equal(tick(initial, 24).queue.length, 3);
    let a = initial;
    let b = start(day);
    for (let index = 0; index < 50; index += 1) {
      assert.deepEqual(a.queue, b.queue);
      assert.ok(
        a.queue.every((customer) => recipes[customer.drinkId].unlockDay <= day),
      );
      a = act(readyOrder(a), "SERVE");
      b = act(readyOrder(b), "SERVE");
    }
  }
});

test("a successful shift records best scores, closes machines, and starts a fresh next day", () => {
  let state = start(1, { score: 1, served: 20, tips: 1, day: 4 });
  state = act(readyOrder(state), "SERVE");
  state = job(state, "kettle", { mode: "tea" });
  const summary = tick(state, 180);
  assert.equal(summary.phase, "summary");
  assert.equal(summary.timeLeft, 0);
  assert.equal(summary.elapsed, 180);
  assert.equal(summary.queue.length, 0);
  assert.ok(Object.values(summary.jobs).every((machine) => machine === null));
  assert.equal(summary.best.score, summary.score);
  assert.equal(summary.best.tips, summary.tips);
  assert.equal(summary.best.served, 20);
  assert.equal(summary.best.day, 4);
  assert.equal(tick(summary, 5), summary);
  const next = act(summary, "NEXT_SHIFT");
  assert.equal(next.phase, "playing");
  assert.equal(next.day, 2);
  assert.equal(next.queue[0].drinkId, "mocha");
  assert.equal(next.timeLeft, 180);
  assert.equal(next.score, 0);
  assert.equal(next.served, 0);
  assert.equal(next.tips, 0);
  assert.deepEqual(next.best, summary.best);
});
