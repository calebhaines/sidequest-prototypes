import { test, expect } from "@playwright/test";
import { cafe } from "./cafe.js";

test("a complete order uses visible machine buttons, the food slot, and Serve", async ({
  page,
  context,
  browserName,
}) => {
  const game = await cafe(page, context, browserName);
  await game.drag("cup", "target", "station-espresso", { edge: true });
  expect((await game.state()).drink.shots).toBe(1);
  expect((await game.state()).jobs.espresso).toBeNull();
  if (game.touch) {
    // Releasing onto a visible station tab both reveals it and places the cup.
    await game.drag("cup", "target", "mobile-milk", {
      edge: true,
      preview: true,
    });
    expect((await game.state()).mobileStation).toBe("milk");
  } else
    await game.drag("cup", "control", "control-milk", {
      edge: true,
      preview: true,
    });
  expect((await game.state()).drink.milk).toBe(1);
  await game.station("oven");
  await game.drag("rack-croissant", "target", "station-oven", {
    edge: true,
    preview: true,
  });
  expect((await game.state()).jobs.oven).toMatchObject({
    foodId: "croissant",
    ready: true,
  });
  await game.drag("warm-food", "object", "foodSlot", {
    edge: true,
    preview: true,
  });
  expect((await game.state()).food).toEqual({ id: "croissant", warm: true });
  await game.drag("cup", "target", "serve", { edge: true, preview: true });
  expect((await game.state()).served).toBe(1);
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).food).toBeNull();
  await game.assertClean();
});

test("misses and cancelled gestures return items without losing or duplicating ingredients", async ({
  page,
  context,
  browserName,
}) => {
  const game = await cafe(page, context, browserName);
  const blank = (await game.state()).drink;
  await game.drag("cup", { x: 8, y: 52 }, null, { edge: true });
  expect((await game.state()).drink).toEqual(blank);
  expect((await game.state()).cupDock).toBe("");
  const { from, to } = await game.drag("cup", "target", "station-espresso", {
    release: false,
  });
  await game.pointer("cancel");
  await game.frame(400);
  expect((await game.state()).drink).toEqual(blank);
  expect((await game.state()).drag).toBe("");
  if (!game.touch) {
    await game.drag("cup", "target", "station-espresso", { release: false });
    await page.keyboard.press("Escape");
    await game.pointer("up");
    await game.frame(400);
    expect((await game.state()).drink).toEqual(blank);
  }
  await game.drag("cup", "target", "station-espresso", { edge: true });
  expect((await game.state()).drink.shots).toBe(1);
  await game.drag("cup", { x: 8, y: 52 });
  expect((await game.state()).drink.shots).toBe(1);
  await game.station("oven");
  const rack = await game.begin("rack-croissant", { edge: true });
  const warmer = await game.point("target", "station-oven");
  await game.move(rack, warmer);
  const returned = await game.point("source", "rack-croissant");
  await game.move(warmer, returned);
  await game.pointer("up");
  await game.frame(400);
  expect((await game.state()).jobs.oven).toBeNull();
  expect((await game.state()).food).toBeNull();
  await game.assertClean();
});

test("real timed machines lock their cup, warm food in parallel, and reject the wrong guest", async ({
  page,
  context,
  browserName,
}) => {
  test.setTimeout(90_000);
  const game = await cafe(page, context, browserName);
  await game.click("start-shift");
  expect((await game.state()).phase).toBe("playing");
  await game.drag("cup", "target", "station-espresso");
  expect((await game.state()).jobs.espresso).toMatchObject({ ready: false });
  await game.station("oven");
  await game.drag("rack-croissant", "target", "station-oven");
  let current = await game.state();
  expect(current.jobs.espresso).not.toBeNull();
  expect(current.jobs.oven).toMatchObject({
    foodId: "croissant",
    ready: false,
  });
  // The locked cup is deliberately attempted even though it is disabled.
  await game.drag("cup", "target", "guest-day-1-customer-0");
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).served).toBe(0);
  await game.frame(8_000);
  current = await game.state();
  expect(current.drink.shots).toBe(1);
  expect(current.jobs.espresso).toBeNull();
  expect(current.jobs.oven).toMatchObject({ ready: true });
  await game.drag("warm-food", "object", "foodSlot");
  await game.station("milk");
  await game.drag("cup", "target", "station-milk");
  await game.frame(5_200);
  expect((await game.state()).drink).toMatchObject({ shots: 1, milk: 1 });
  const complete = await game.state();
  const wrongGuest = "guest-day-1-customer-1";
  await game.drag("cup", "target", wrongGuest);
  current = await game.state();
  expect(current.served).toBe(0);
  expect(current.drink).toEqual(complete.drink);
  expect(current.food).toEqual(complete.food);
  await game.drag("cup", "target", "guest-day-1-customer-0");
  expect((await game.state()).served).toBe(1);
  await game.assertClean();
});

test("pause, recipe modal, and resize cancel a held object before a later release", async ({
  page,
  context,
  browserName,
}) => {
  const game = await cafe(page, context, browserName);
  await game.click("start-shift");
  const original = (await game.state()).drink;
  await game.drag("cup", "target", "station-espresso", { release: false });
  await page.keyboard.press("p");
  await game.frame();
  await game.pointer("up");
  await game.frame();
  expect((await game.state()).phase).toBe("paused");
  expect((await game.state()).drink).toEqual(original);
  const pausedClock = (await game.state()).clock;
  await game.frame(3_000);
  expect((await game.state()).clock).toBe(pausedClock);
  if (game.touch) {
    const workspace = await game.point("object", "workspace");
    const station = (await game.state()).mobileStation;
    await game.pointer("down", workspace);
    await game.move(workspace, { x: workspace.x + 90, y: workspace.y });
    await game.pointer("up");
    await game.frame();
    expect((await game.state()).mobileStation).toBe(station);
  }
  await game.click("resume");
  await game.drag("cup", "target", "station-espresso", { release: false });
  await page.keyboard.press("r");
  await game.frame();
  await game.pointer("up");
  await game.frame();
  expect((await game.state()).modal).toBe("recipes");
  expect((await game.state()).drink).toEqual(original);
  await game.click("overlay-close");
  await game.drag("cup", "target", "station-espresso", { release: false });
  const viewport = page.viewportSize();
  await page.setViewportSize({
    width: viewport.width - 20,
    height: viewport.height,
  });
  await game.frame();
  await game.pointer("up");
  await game.frame();
  expect((await game.state()).drink).toEqual(original);
  expect((await game.state()).drag).toBe("");
  await game.assertClean();
});

test("phone taps make a full order without dragging or scrolling the document", async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch-specific fallback");
  const game = await cafe(page, context, browserName);
  await game.click("pick-cup");
  await game.click("station-espresso");
  await game.station("milk");
  await game.click("pick-cup");
  await game.click("control-milk");
  await game.station("oven");
  await game.click("pastry-croissant");
  await game.click("station-oven");
  await game.click("station-oven");
  await game.click("serve");
  expect((await game.state()).served).toBe(1);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await game.assertClean();
});

test("machine lever and dial gestures activate once and cancellation activates nothing", async ({
  page,
  context,
  browserName,
}) => {
  const game = await cafe(page, context, browserName);
  await game.click("control-espresso");
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).jobs.espresso).toBeNull();
  const trayCup = await game.point("source", "cup");
  await game.drag("cup", "object", "espressoWell", {
    edge: true,
    preview: true,
  });
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).cupDock).toBe("espresso");
  const placedCup = await game.point("source", "cup");
  const well = await game.point("object", "espressoWell");
  expect(
    Math.hypot(
      placedCup.center.x - trayCup.center.x,
      placedCup.center.y - trayCup.center.y,
    ),
  ).toBeGreaterThan(40);
  expect(Math.abs(placedCup.center.x - well.center.x)).toBeLessThan(well.w / 2);
  expect(Math.abs(placedCup.center.y - well.center.y)).toBeLessThan(well.h / 2);
  await game.controlGesture("control-espresso", 0, 40, { cancel: true });
  expect((await game.state()).jobs.espresso).toBeNull();
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).cupDock).toBe("espresso");
  await game.controlGesture("control-espresso", 0, 40);
  expect((await game.state()).drink.shots).toBe(1);
  expect((await game.state()).jobs.espresso).toBeNull();
  expect((await game.state()).cupDock).toBe("espresso");
  await game.drag("cup", "object", "trayCup", {
    edge: true,
    preview: true,
  });
  expect((await game.state()).drink.shots).toBe(1);
  expect((await game.state()).cupDock).toBe("");
  await game.station("milk");
  await game.click("mode-milk");
  await game.controlGesture("control-milk", 0, -40);
  expect((await game.state()).jobs.milk).toMatchObject({
    mode: "foam",
    ready: true,
  });
  await game.click("control-milk");
  expect((await game.state()).drink.foam).toBe(1);
  await game.station("kettle");
  await game.click("mode-kettle");
  await game.controlGesture("control-kettle", 0, 40);
  expect((await game.state()).jobs.kettle).toMatchObject({
    mode: "tea",
    ready: true,
  });
  await game.click("control-kettle");
  expect((await game.state()).drink.tea).toBe(1);
  await game.assertClean();
});

test("picking a cup and tapping the espresso body places it without a hidden pour", async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(!isMobile, "Phone tap placement and retrieval");
  const game = await cafe(page, context, browserName);
  await game.click("control-espresso");
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).jobs.espresso).toBeNull();
  const cup = await game.point("source", "cup");
  await page.touchscreen.tap(cup.x, cup.y);
  await game.frame();
  expect((await game.state()).selectedItem).toMatchObject({ kind: "cup" });
  // Use the body's upper-left area; on short landscape screens its geometric
  // center overlaps the separately painted lever.
  const body = await game.point("target", "machine-espresso", { edge: true });
  await page.touchscreen.tap(body.x, body.y);
  await game.frame();
  expect((await game.state()).drink.shots).toBe(0);
  expect((await game.state()).jobs.espresso).toBeNull();
  expect((await game.state()).cupDock).toBe("espresso");
  expect((await game.state()).selectedItem).toBeNull();
  await game.click("control-espresso");
  expect((await game.state()).drink.shots).toBe(1);
  expect((await game.state()).jobs.espresso).toBeNull();
  await game.click("pick-cup");
  expect((await game.state()).selectedItem).toMatchObject({ kind: "cup" });
  await game.click("return-cup");
  expect((await game.state()).selectedItem).toBeNull();
  expect((await game.state()).cupDock).toBe("");
  expect((await game.state()).drink.shots).toBe(1);
  await game.assertClean();
});

test("day three iced orders and the end-of-shift reset preserve the next playable shift", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "Representative persistence and longer shift coverage",
  );
  const game = await cafe(page, context, browserName, {
    best: { day: 2, score: 30, served: 3, tips: 8 },
  });
  await game.click("start-shift");
  expect((await game.state()).day).toBe(3);
  await game.click("cup-type");
  await game.drag("cup", "target", "station-espresso");
  await game.drag("rack-croissant", "target", "station-oven");
  await game.frame(8_000);
  await game.click("mode-milk");
  await game.click("mode-milk");
  await game.drag("cup", "target", "station-milk");
  expect((await game.state()).drink).toMatchObject({
    cup: "iced",
    shots: 1,
    coldMilk: 1,
    milk: 0,
  });
  await game.drag("warm-food", "object", "foodSlot");
  await game.drag("cup", "target", "serve");
  expect((await game.state()).served).toBe(1);
  await game.finishShift();
  expect((await game.state()).phase).toBe("summary");
  await game.click("next-shift");
  const next = await game.state();
  expect(next).toMatchObject({
    phase: "playing",
    day: 4,
    served: 0,
    cupDock: "",
    food: null,
  });
  expect(next.jobs).toEqual({
    espresso: null,
    milk: null,
    kettle: null,
    oven: null,
  });
  expect(next.drink).toMatchObject({ cup: "hot", shots: 0, coldMilk: 0 });
  expect(next.clock).toBe(180);
  await game.assertClean();
});

test("a selected phone cup survives mode changes and Extras navigation without starting a pour", async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(!isMobile, "Phone selection regression");
  const game = await cafe(page, context, browserName, { best: { day: 2 } });
  await game.click("start-shift");
  await game.station("milk");
  await game.click("pick-cup");
  const original = (await game.state()).drink;
  await game.click("mode-milk");
  expect((await game.state()).selectedItem).toMatchObject({ kind: "cup" });
  expect((await game.state()).jobs.milk).toBeNull();
  expect((await game.state()).drink).toEqual(original);
  expect((await game.point("target", "mode-milk")).label).toContain(
    "Milk foam",
  );
  await game.click("mobile-extras");
  await game.point("target", "extra-chocolate");
  await game.click("mobile-extras");
  await game.station("kettle");
  await game.click("mode-kettle");
  expect((await game.state()).jobs.kettle).toBeNull();
  expect((await game.state()).selectedItem).toMatchObject({ kind: "cup" });
  expect((await game.state()).drink).toEqual(original);
  expect((await game.point("target", "mode-kettle")).label).toContain("Tea");
  await game.click("cancel-picked");
  expect((await game.state()).selectedItem).toBeNull();
  await game.assertClean();
});

test("a six-pixel button slip and a coalesced object release retain their intended actions", async ({
  page,
  context,
  browserName,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-desktop",
    "Native CDP mouse release and click-slip regression",
  );
  const game = await cafe(page, context, browserName);
  const mode = await game.point("target", "mode-milk");
  await page.mouse.move(mode.x, mode.y);
  await page.mouse.down();
  await page.mouse.move(mode.x + 6, mode.y);
  await page.mouse.up();
  await game.frame();
  expect((await game.point("target", "mode-milk")).label).toContain("Foam");
  const cup = await game.begin("cup");
  await page.mouse.move(cup.x + 2, cup.y);
  await game.releaseAt(await game.point("target", "station-espresso"));
  expect((await game.state()).drink.shots).toBe(1);
  expect((await game.state()).jobs.espresso).toBeNull();
  await game.assertClean();
});
