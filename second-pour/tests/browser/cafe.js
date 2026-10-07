import { expect } from "@playwright/test";

// Metadata describes the canvas's painted controls and objects. Destinations in
// these tests are visible controls, tabs, food slots, or guest cards: never the
// implementation's invisible drop-zone centers.
export async function cafe(page, context, browserName, { best = null } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    errors.push(`${request.url()}: ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()}: ${response.url()}`);
  });
  if (best)
    await page.addInitScript(
      (value) =>
        localStorage.setItem("second-pour-best", JSON.stringify(value)),
      best,
    );
  await page.addInitScript(() => {
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.isTrusted && event.pointerType === "mouse")
          window.__qaMousePointerId = event.pointerId;
      },
      true,
    );
  });
  const date = new Date("2026-10-07T10:00:00Z");
  await page.clock.install({ time: date });
  await page.clock.pauseAt(new Date(date.getTime() + 1_000));
  await page.goto("./");
  await page.clock.runFor(150);
  await page.evaluate(() => document.fonts.ready);
  const canvas = page.locator("canvas.cafe-game");
  await expect(canvas).toHaveAttribute("data-phase", "practice");
  const touch = await page.evaluate(
    () =>
      navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches,
  );
  const cdp =
    touch && browserName === "chromium"
      ? await context.newCDPSession(page)
      : null;
  const state = () =>
    canvas.evaluate((c) => ({
      phase: c.dataset.phase,
      day: +c.dataset.day,
      served: +c.dataset.served,
      clock: +c.dataset.clock,
      tips: +c.dataset.tips,
      cupDock: c.dataset.cupDock,
      drag: c.dataset.drag,
      selectedItem: JSON.parse(c.dataset.selectedItem || "null"),
      mobileStation: c.dataset.mobileStation,
      drink: JSON.parse(c.dataset.drink),
      food: JSON.parse(c.dataset.food),
      jobs: JSON.parse(c.dataset.jobs),
      modal: c.dataset.modal,
    }));
  async function frame(ms = 100) {
    await page.clock.runFor(ms);
  }
  async function point(kind, id, { edge = false } = {}) {
    await frame(70);
    return canvas.evaluate(
      (c, { kind, id, edge }) => {
        let box;
        if (kind === "object") box = c.__view.objects[id];
        else {
          const list =
            kind === "source"
              ? c.__draggables
              : kind === "control"
                ? c.__machineControls
                : c.__targets;
          if (id === "cup") {
            const cups = list.filter((item) => item.kind === "cup");
            if (cups.length !== 1)
              throw Error(
                `Expected one painted cup source, found ${cups.length}: ${cups.map((item) => item.id).join(", ")}`,
              );
            box = cups[0];
          } else box = list.find((item) => item.id === id);
          if (!box)
            throw Error(
              `Missing visible ${kind}: ${id}; available: ${list.map((item) => item.id).join(", ")}`,
            );
        }
        const rect = c.getBoundingClientRect();
        const world = {
          x: box.x + (edge ? 5 : box.w / 2),
          y: box.y + (edge ? 5 : box.h / 2),
        };
        const x = rect.left + (world.x * rect.width) / c.__view.width;
        const y = rect.top + (world.y * rect.height) / c.__view.height;
        if (x < 0 || x > innerWidth || y < 0 || y > innerHeight)
          throw Error(
            `Visible ${kind} ${id} lies outside the viewport (${Math.round(x)}, ${Math.round(y)})`,
          );
        return {
          ...box,
          x,
          y,
          world,
          center: {
            x: rect.left + ((box.x + box.w / 2) * rect.width) / c.__view.width,
            y: rect.top + ((box.y + box.h / 2) * rect.height) / c.__view.height,
          },
        };
      },
      { kind, id, edge },
    );
  }
  async function click(id) {
    const p = await point("target", id);
    expect(p.disabled, `${id} must be usable`).not.toBe(true);
    if (touch) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    await frame();
  }
  async function pointer(type, p = null) {
    if (cdp) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: {
          down: "touchStart",
          move: "touchMove",
          up: "touchEnd",
          cancel: "touchCancel",
        }[type],
        touchPoints: p
          ? [{ x: p.x, y: p.y, id: 1, radiusX: 7, radiusY: 7, force: 1 }]
          : [],
      });
    } else if (touch) {
      // WebKit has no CDP touch-move API. These events exercise its touch-pointer
      // handling; touchscreen.tap above still uses Playwright's native input.
      // Hold an intercepted native mouse pointer so setPointerCapture remains
      // legal. Only the synthetic touch events reach the game during this drag.
      if (type === "down") {
        await canvas.evaluate((c) => {
          c.__qaInterceptMouse = (event) => {
            if (event.isTrusted && event.pointerType === "mouse")
              event.stopImmediatePropagation();
          };
          for (const name of ["pointerdown", "pointermove", "pointerup"])
            c.addEventListener(name, c.__qaInterceptMouse, true);
        });
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
      }
      await canvas.evaluate(
        (c, { type, p }) => {
          const last = c.__qaTouchPoint;
          if (p) c.__qaTouchPoint = p;
          const at = p || last;
          c.dispatchEvent(
            new PointerEvent(`pointer${type}`, {
              bubbles: true,
              pointerId: window.__qaMousePointerId ?? 1,
              pointerType: "touch",
              isPrimary: true,
              clientX: at.x,
              clientY: at.y,
              button: 0,
              buttons: type === "up" || type === "cancel" ? 0 : 1,
            }),
          );
        },
        { type, p },
      );
      if (type === "up" || type === "cancel") {
        await page.mouse.up();
        await canvas.evaluate((c) => {
          for (const name of ["pointerdown", "pointermove", "pointerup"])
            c.removeEventListener(name, c.__qaInterceptMouse, true);
          delete c.__qaInterceptMouse;
        });
      }
    } else if (type === "down") {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
    } else if (type === "move") await page.mouse.move(p.x, p.y);
    else if (type === "up") await page.mouse.up();
    else {
      await canvas.evaluate((c) =>
        c.dispatchEvent(
          new PointerEvent("pointercancel", {
            pointerId: window.__qaMousePointerId ?? 1,
            pointerType: "mouse",
            bubbles: true,
          }),
        ),
      );
      await page.mouse.up();
    }
  }
  async function begin(source, { edge = false } = {}) {
    const from = await point("source", source, { edge });
    await pointer("down", from);
    return from;
  }
  async function move(from, to, steps = 12) {
    for (let i = 1; i <= steps; i++) {
      await pointer("move", {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
      await frame(34);
    }
  }
  async function drag(
    source,
    toKind,
    toId,
    { edge = false, release = true, preview = false } = {},
  ) {
    const from = await begin(source, { edge });
    const to = typeof toKind === "object" ? toKind : await point(toKind, toId);
    const aim = preview
      ? {
          x: to.x - (touch ? 0 : from.center.x - from.x),
          y: to.y - (touch ? -36 : from.center.y - from.y),
        }
      : to;
    if (touch) aim.y = Math.min(aim.y, page.viewportSize().height - 6);
    await move(from, aim);
    if (release) {
      await pointer("up");
      await frame(400);
    }
    return { from, to: aim };
  }
  async function station(name) {
    if (touch) await click(`mobile-${name}`);
  }
  async function controlGesture(id, dx, dy, { cancel = false } = {}) {
    const from = await point("control", id);
    await pointer("down", from);
    await move(from, { x: from.x + dx, y: from.y + dy });
    await pointer(cancel ? "cancel" : "up");
    await frame(400);
  }
  async function releaseAt(point) {
    if (browserName !== "chromium" || touch)
      throw Error(
        "Coalesced native mouse release is Chromium desktop coverage",
      );
    const mouse = await context.newCDPSession(page);
    await mouse.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: point.x,
      y: point.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
    await page.mouse.up();
    await mouse.detach();
    await frame(400);
  }
  async function finishShift() {
    // Keep the real one-second reducer timer, but avoid drawing thousands of
    // unchanged canvas frames while advancing through the rest of a shift.
    await page.evaluate(() => {
      window.__qaRAF = window.requestAnimationFrame;
      window.requestAnimationFrame = (callback) => {
        window.__qaNextFrame = callback;
        return 0;
      };
    });
    await frame(181_000);
    await page.evaluate(() => {
      window.requestAnimationFrame = window.__qaRAF;
      if (window.__qaNextFrame) requestAnimationFrame(window.__qaNextFrame);
      delete window.__qaNextFrame;
      delete window.__qaRAF;
    });
    await frame();
  }
  async function assertClean() {
    expect(
      errors,
      "No browser exceptions, console errors, or failed assets",
    ).toEqual([]);
  }
  return {
    canvas,
    state,
    frame,
    point,
    click,
    pointer,
    begin,
    move,
    drag,
    station,
    controlGesture,
    releaseAt,
    finishShift,
    assertClean,
    errors,
    touch,
    cdp,
  };
}
