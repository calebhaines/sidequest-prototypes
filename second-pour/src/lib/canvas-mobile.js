import { customers, foods, recipes } from "./data.js";
import {
  getSelectedCustomer,
  recipeProgress,
  evaluateOrder,
  formatMoney,
} from "./game.js";
import {
  drawRoom,
  drawCounter,
  drawCustomer,
  drawMachine,
  drawMachineControl,
  drawDrink,
  drawFood,
} from "./illustration.js";
import {
  palette as C,
  round,
  label,
  wrap,
  icon,
  button,
} from "./canvas-kit.js";
import { drawOverlay } from "./canvas-overlays.js";

const stationNames = {
  espresso: "Espresso",
  milk: "Milk",
  kettle: "Kettle",
  oven: "Warmer",
};
const ingredientNames = {
  shots: "espresso",
  milk: "milk",
  foam: "foam",
  water: "water",
  tea: "tea",
  chocolate: "chocolate",
  vanilla: "vanilla",
  caramel: "caramel",
  coldMilk: "cold milk",
};
const game = (value) => ({ type: "game", value });
const uiAction = (value) => ({ type: "ui", value });
const active = (state) => ["practice", "playing"].includes(state.phase);
const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const isPicked = (ui, item) =>
  ui.pickedItem?.id === item.id ||
  (ui.pickedItem?.kind === item.kind &&
    (!item.foodId || ui.pickedItem.foodId === item.foodId));

function outline(ctx, box, color = "#76a174") {
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  round(
    ctx,
    box.x + 3,
    box.y + 3,
    box.w - 6,
    box.h - 6,
    13,
    "#e5f0d52b",
    color,
  );
  ctx.restore();
}

function header(ctx, state, ui, W, targets) {
  round(ctx, 0, 0, W, 54, 0, "#fffdf4");
  label(ctx, "Second Pour", 12, 18, {
    font: "DynaPuff",
    size: W < 360 ? 16 : 19,
    maxWidth: W - 170,
  });
  label(
    ctx,
    state.phase === "practice"
      ? "Practice · take your time"
      : `Day ${state.day} · ${clock(state.timeLeft)} · ${formatMoney(state.tips)}`,
    12,
    39,
    { size: 12, color: C.muted, maxWidth: W - 170 },
  );
  [
    ["header-recipes", "Recipe book", "book", "openRecipes"],
    ["header-help", "How to play", "help", "openHelp"],
    [
      "header-sound",
      ui.sound ? "Mute sound" : "Turn on sound",
      ui.sound ? "sound" : "mute",
      "sound",
    ],
  ].forEach(([id, name, image, action], i) =>
    button(ctx, targets, ui, {
      id,
      label: name,
      icon: image,
      x: W - 150 + i * 48,
      y: 5,
      w: 44,
      h: 44,
      action: uiAction(action),
    }),
  );
}

function customerPanel(ctx, state, ui, box, targets, interaction, time, wide) {
  const selected = getSelectedCustomer(state),
    { x, y, w, h } = box;
  const guestW =
    (w - 58 - 8 * Math.max(0, state.queue.length - 1)) /
    Math.max(1, state.queue.length);
  state.queue.forEach((guest, i) => {
    const profile = customers[guest.profileId],
      gx = x + i * (guestW + 8),
      chosen = guest.id === selected?.id;
    button(ctx, targets, ui, {
      id: `guest-${guest.id}`,
      label: `Select ${profile.name}'s ${recipes[guest.drinkId].shortName} order`,
      text: profile.name,
      x: gx,
      y,
      w: guestW,
      h: 44,
      selected: chosen,
      action: game({ type: "SELECT_CUSTOMER", id: guest.id }),
    });
    const patience =
      state.phase === "practice" ? 1 : guest.patience / guest.maxPatience;
    round(ctx, gx + 8, y + 37, guestW - 16, 3, 2, "#e1e4cc");
    round(
      ctx,
      gx + 8,
      y + 37,
      Math.max(1, (guestW - 16) * patience),
      3,
      2,
      patience < 0.28 ? "#cc947d" : "#a6c18b",
    );
  });
  button(ctx, targets, ui, {
    id: state.phase === "practice" ? "start-shift" : "pause",
    label:
      state.phase === "practice"
        ? `Open day ${(state.best.day || 0) + 1}`
        : "Pause shift",
    text: state.phase === "practice" ? "Open" : undefined,
    icon: state.phase === "practice" ? undefined : "pause",
    x: x + w - 48,
    y,
    w: 48,
    h: 44,
    action:
      state.phase === "practice" ? uiAction("start") : game({ type: "PAUSE" }),
    primary: state.phase === "practice",
    disabled: state.phase === "summary",
  });
  const card = { x, y: y + 52, w, h: h - 52 };
  round(ctx, card.x, card.y, card.w, card.h, 17, "#fffdf0", "#d6dfbf");
  if (!selected) {
    label(ctx, "A new friend will arrive soon", x + w / 2, card.y + 35, {
      size: 14,
      align: "center",
      maxWidth: w - 24,
    });
    return;
  }
  const portrait = {
    x: x + 2,
    y: card.y + 3,
    w: wide ? 80 : 69,
    h: wide ? Math.min(card.h - 5, 142) : card.h - 5,
  };
  drawCustomer(ctx, customers[selected.profileId], portrait, {
    time,
    selected: true,
    chatted: selected.chatted,
  });
  const tx = x + (wide ? 84 : 72),
    textWidth = w - (wide ? 95 : 83);
  label(
    ctx,
    `${customers[selected.profileId].name} · ${recipes[selected.drinkId].shortName}`,
    tx,
    card.y + 17,
    { font: "DynaPuff", size: 14, maxWidth: textWidth - 47 },
  );
  button(ctx, targets, ui, {
    id: "chat-open",
    label: `Chat with ${customers[selected.profileId].name}`,
    icon: "chat",
    x: x + w - 49,
    y: card.y + 3,
    w: 44,
    h: 44,
    action: uiAction("openChat"),
  });
  const recipe = recipes[selected.drinkId],
    progress = recipeProgress(state.drink, recipe);
  const steps = progress.steps
    .filter((step) => step.ingredient === "cup" || step.expected)
    .map((step) => ({
      text:
        step.ingredient === "cup"
          ? `${recipe.cup} cup`
          : `${step.expected > 1 ? `${step.expected} ` : ""}${ingredientNames[step.ingredient]}`,
      done: step.complete,
      excess: step.excess,
    }));
  if (selected.foodId)
    steps.push({
      text: foods[selected.foodId].shortName,
      done: state.food?.id === selected.foodId && state.food?.warm,
    });
  if (
    progress.steps.some((step) => step.excess) ||
    (!selected.foodId && state.food)
  )
    steps.push({ text: "Remake extras", excess: true });
  let sx = tx,
    sy = card.y + 47;
  const availableWidth = textWidth;
  ctx.font = '600 12px "Nunito", sans-serif';
  steps.forEach((step) => {
    const width = ctx.measureText(step.text).width + 24;
    if (sx > tx && sx + width > tx + availableWidth) {
      sx = tx;
      sy += 19;
    }
    if (sy > card.y + card.h - 8) return;
    if (step.done) icon(ctx, "check", sx, sy - 6, 12, "#62906b");
    else
      round(
        ctx,
        sx + 2,
        sy - 4,
        8,
        8,
        2,
        step.excess ? "#efd4c2" : "#fffaf0",
        step.excess ? "#b68667" : "#bdc9a5",
      );
    label(ctx, step.text, sx + 16, sy, {
      size: 12,
      color: step.excess ? "#b3785c" : step.done ? "#628367" : "#71775d",
    });
    sx += width;
  });
  interaction.dropZones.push({
    id: `drop-guest-${selected.id}`,
    label: `Serve ${customers[selected.profileId].name}`,
    kind: "customer",
    customerId: selected.id,
    accepts: ["cup", "trayFood"],
    ...card,
  });
  const held = ui.drag || ui.pickedItem;
  if (held && ["cup", "trayFood"].includes(held.kind)) outline(ctx, card);
}

function tabs(ctx, state, ui, box, targets) {
  const gap = 6,
    w = (box.w - gap * 3) / 4;
  Object.keys(stationNames).forEach((station, i) => {
    const job = state.jobs[station];
    button(ctx, targets, ui, {
      id: `mobile-${station}`,
      label: `Show ${stationNames[station]}${job?.ready ? ". Ready to collect" : job ? `. ${job.remaining} seconds` : ""}`,
      text: stationNames[station],
      x: box.x + i * (w + gap),
      y: box.y,
      w,
      h: 48,
      selected: (ui.mobileStation || "espresso") === station,
      action: { type: "mobileStation", station },
      fill: job?.ready ? "#e8edbf" : undefined,
    });
    if (job) {
      const gx = box.x + i * (w + gap) + w - 17;
      round(
        ctx,
        gx - 7,
        box.y + 2,
        23,
        16,
        7,
        job.ready ? "#70965b" : "#c59872",
      );
      label(ctx, job.ready ? "✓" : `${job.remaining}`, gx + 4, box.y + 10, {
        size: 12,
        align: "center",
        color: "#fffaf0",
      });
    }
  });
}

function workspace(ctx, state, ui, box, targets, interaction, time) {
  const station = ui.mobileStation || "espresso",
    job = state.jobs[station],
    running = !!job && !job.ready;
  const { x, y, w, h } = box,
    usable = active(state);
  round(
    ctx,
    x,
    y,
    w,
    h,
    18,
    station === "oven" ? "#fff1df" : "#fcf7e8",
    "#e0cfb0",
  );
  if (station === "milk" && ui.mobileExtras) {
    label(ctx, "A little extra sweetness", x + 14, y + 23, {
      font: "DynaPuff",
      size: 16,
      maxWidth: w - 79,
    });
    button(ctx, targets, ui, {
      id: "mobile-extras",
      label: "Back to milk machine",
      icon: "close",
      x: x + w - 51,
      y: y + 5,
      w: 44,
      h: 44,
      action: { type: "mobileExtras" },
    });
    const gap = 8,
      sw = (w - 24 - gap * 2) / 3;
    ["chocolate", "vanilla", "caramel"].forEach((id, i) => {
      const sx = x + 12 + i * (sw + gap),
        by = y + h - 51;
      if (h >= 135) {
        round(
          ctx,
          sx + sw / 2 - 12,
          by - 41,
          24,
          34,
          7,
          id === "chocolate"
            ? "#a48060"
            : id === "vanilla"
              ? "#efd2a3"
              : "#d5a15f",
          "#ad916d",
        );
        round(ctx, sx + sw / 2 - 8, by - 44, 16, 7, 3, "#658773");
      }
      button(ctx, targets, ui, {
        id: `extra-${id}`,
        label:
          state.day < (id === "caramel" ? 3 : 2)
            ? `${id} unlocks on day 3`
            : `Add ${id}`,
        text:
          id === "chocolate"
            ? "Chocolate"
            : id === "vanilla"
              ? "Vanilla"
              : state.day < 3
                ? "Day 3"
                : "Caramel",
        x: sx,
        y: by,
        w: sw,
        h: 44,
        action: game({ type: "ADD_INGREDIENT", ingredient: id }),
        disabled: !usable || state.day < (id === "caramel" ? 3 : 2),
        fill: "#fff0d8",
      });
    });
    return;
  }
  const sideW = Math.max(130, Math.min(w * 0.46, 240)),
    artW = w - sideW - 15;
  const art = {
    x: x + 2,
    y: y + (station === "oven" && h < 148 ? 1 : 5),
    w: artW,
    h: Math.min(h - 8, Math.max(120, artW * 0.88)),
  };
  drawMachine(ctx, station, art, { job, time, selected: job?.ready });
  if (station === "espresso") {
    const scale = Math.min(art.w / 240, art.h / 205);
    ctx.save();
    ctx.translate(
      art.x + (art.w - 240 * scale) / 2,
      art.y + (art.h - 205 * scale) / 2,
    );
    ctx.scale(scale, scale);
    round(ctx, 55, 123, 123, 47, 8, "#456b5d");
    round(ctx, 42, 170, 154, 15, 6, "#adbba5", "#638875");
    ctx.restore();
  }
  const smallArt = h < 125,
    cupW = smallArt ? 48 : 54;
  const cupRect = {
    x: art.x + art.w * (station === "espresso" ? 0.5 : 0.33) - cupW / 2,
    y: art.y + art.h * (smallArt ? 0.51 : 0.45),
    w: cupW,
    h: smallArt ? 44 : 62,
  };
  interaction.dropZones.push({
    id: `drop-${station}`,
    label: `Place ${station === "oven" ? "food in the warmer" : `cup at ${stationNames[station]}`}`,
    kind: "station",
    station,
    accepts: station === "oven" ? ["pastry"] : ["cup"],
    ...art,
    cupRect: station === "oven" ? undefined : cupRect,
  });
  targets.push({
    id: `machine-${station}`,
    label: `Use ${stationNames[station]}`,
    ...art,
    action: { type: "station", value: station },
    disabled: !usable || running,
  });
  if (ui.cupDock === station && station !== "oven") {
    interaction.objects.cup = cupRect;
    interaction.draggables.push({
      id: "dock-cup",
      label: running ? "Cup is filling. Please wait" : "Pick up your cup",
      kind: "cup",
      ...cupRect,
      disabled: !usable || running,
    });
    if (ui.drag?.kind !== "cup" && ui.snap?.kind !== "cup")
      drawDrink(ctx, state.drink, cupRect, {
        time,
        ready: evaluateOrder(state).correct,
      });
    if ((running || ui.pour?.station === station) && ui.drag?.kind !== "cup") {
      ctx.save();
      ctx.strokeStyle =
        station === "espresso"
          ? "#966e45"
          : station === "milk"
            ? "#fff9df"
            : "#cbb679";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cupRect.x + 26, cupRect.y - 5);
      ctx.lineTo(cupRect.x + 26, cupRect.y + 18);
      ctx.stroke();
      ctx.restore();
    }
  }
  const controlSize = smallArt ? 44 : 54;
  // Large workspaces contain the illustration with empty margins. Attach the
  // control to its painted face rather than the edge of that containing box.
  const artScale = Math.min(art.w / 240, art.h / 205);
  const faceControl = {
    espresso: [170, 65],
    milk: [177, 77],
    kettle: [121, 70],
    oven: [159, 71],
  }[station];
  const anchored = art.w > 250 && art.h > 180;
  const controlCenter = anchored
    ? {
        x: art.x + (art.w - 240 * artScale) / 2 + faceControl[0] * artScale,
        y: art.y + (art.h - 205 * artScale) / 2 + faceControl[1] * artScale,
      }
    : { x: art.x + art.w * 0.64, y: art.y + 1 + controlSize / 2 };
  const control = {
    id: `control-${station}`,
    station,
    kind:
      station === "espresso"
        ? "lever"
        : station === "kettle"
          ? "switch"
          : "dial",
    x: controlCenter.x - controlSize / 2,
    y: controlCenter.y - controlSize / 2,
    w: controlSize,
    h: controlSize,
    disabled: !usable || running,
    action: { type: "station", value: station },
  };
  control.label = job?.ready
    ? `Collect from ${stationNames[station]}`
    : `${stationNames[station]} ${control.kind}. Tap or drag to start`;
  const gesturing = ui.machineGesture?.station === station,
    pulse = ui.machinePulse?.station === station;
  drawMachineControl(ctx, station, control, {
    progress: gesturing
      ? ui.machineGesture.progress
      : running || job?.ready || pulse
        ? 1
        : 0,
    working: running,
    ready: !!job?.ready,
    selected: gesturing || ui.focusId === control.id,
  });
  interaction.machineControls.push(control);
  targets.push(control);
  const sideX = x + w - sideW - 7;
  if (station === "oven") {
    const horizontalRack = h < 148,
      rackH = horizontalRack ? 44 : Math.max(44, Math.min(52, (h - 18) / 3));
    const rackW = horizontalRack ? (w - 20 - 12) / 3 : sideW;
    Object.keys(foods).forEach((foodId, i) => {
      const fy = horizontalRack ? y + h - 49 : y + 7 + i * (rackH + 2),
        fx = horizontalRack ? x + 10 + i * (rackW + 6) : sideX,
        rect = { x: fx, y: fy, w: rackW, h: rackH };
      button(ctx, targets, ui, {
        id: `pastry-${foodId}`,
        label: `Pick up ${foods[foodId].shortName} to warm`,
        ...rect,
        action: { type: "pastry", foodId },
        disabled: !usable || !!job,
        selected: ui.pickedItem?.foodId === foodId,
        fill: "#fffaf0",
      });
      drawFood(
        ctx,
        foodId,
        horizontalRack
          ? { x: fx + rackW / 2 - 15, y: fy + 2, w: 30, h: 22 }
          : { x: fx + 1, y: fy + 6, w: 34, h: rackH - 12 },
        { warm: false, time },
      );
      label(
        ctx,
        foods[foodId].shortName,
        horizontalRack ? fx + rackW / 2 : fx + 39,
        fy + (horizontalRack ? 33 : rackH / 2),
        {
          size: 12,
          align: horizontalRack ? "center" : "left",
          maxWidth: horizontalRack ? rackW - 8 : sideW - 44,
          color: job ? "#969d87" : C.ink,
        },
      );
      interaction.draggables.push({
        id: `rack-${foodId}`,
        label: `Pick up ${foods[foodId].shortName}`,
        kind: "pastry",
        foodId,
        ...rect,
        disabled: !usable || !!job,
      });
    });
    const ovenAction = horizontalRack
      ? { x: sideX, y: y + 4, w: sideW, h: 44 }
      : { x: art.x + 4, y: y + h - 50, w: artW - 8, h: 44 };
    button(ctx, targets, ui, {
      id: "station-oven",
      label: running
        ? `Warming food. ${job.remaining} seconds`
        : job?.ready
          ? "Move warm food to tray"
          : "Start warmer",
      text: running
        ? `${job.remaining}s · warming`
        : job?.ready
          ? undefined
          : "Warm food",
      ...ovenAction,
      action: { type: "station", value: "oven" },
      disabled: !usable || running,
      primary: !!job?.ready,
    });
    if (job?.ready) {
      const rect = ovenAction;
      interaction.draggables.push({
        id: "warm-food",
        label: `Pick up warm ${foods[job.foodId].shortName}`,
        kind: "warmFood",
        foodId: job.foodId,
        ...rect,
        disabled: !usable,
      });
      if (ui.drag?.kind !== "warmFood")
        drawFood(
          ctx,
          job.foodId,
          { x: rect.x + 1, y: rect.y + 2, w: 46, h: 40 },
          { warm: true, time },
        );
      label(ctx, "To tray", rect.x + rect.w - 10, rect.y + rect.h / 2, {
        size: 13,
        color: "#fffaf0",
        align: "right",
        maxWidth: rect.w - 55,
      });
      if (
        isPicked(ui, { kind: "warmFood", id: "warm-food", foodId: job.foodId })
      )
        outline(ctx, rect);
    }
  } else {
    const flavorControls = station === "milk" && state.day >= 2,
      short = h < 140,
      tight = h < 150 || (flavorControls && h < 180);
    if (!tight)
      label(ctx, stationNames[station], sideX + sideW / 2, y + 19, {
        font: "DynaPuff",
        size: 17,
        align: "center",
      });
    const mode =
      station === "milk"
        ? job?.mode || ui.milkMode || "milk"
        : station === "kettle"
          ? job?.mode || ui.kettleMode || "water"
          : null;
    const modeName =
      mode === "foam"
        ? "Milk foam"
        : mode === "cold"
          ? "Cold milk"
          : mode === "milk"
            ? "Steamed milk"
            : mode === "tea"
              ? "Tea"
              : "Hot water";
    if (mode)
      button(ctx, targets, ui, {
        id: `mode-${station}`,
        label: `${stationNames[station]} mode: ${modeName}. Tap to change`,
        text: `${modeName} ↻`,
        x: sideX,
        y: y + (tight ? 4 : 37),
        w: sideW,
        h: 44,
        action: { type: "mode", station },
        disabled: !usable || !!job,
      });
    else
      label(ctx, "One fresh shot", sideX + sideW / 2, y + (tight ? 25 : 58), {
        size: 13,
        align: "center",
        color: C.muted,
      });
    const by = tight
      ? y + 50
      : flavorControls
        ? y + 87
        : Math.max(y + 86, y + h - 55);
    const verb =
      station === "espresso"
        ? "Pull shot"
        : station === "milk"
          ? mode === "foam"
            ? "Make foam"
            : mode === "cold"
              ? "Pour milk"
              : "Steam milk"
          : mode === "tea"
            ? "Brew tea"
            : "Heat water";
    const narrowAction = flavorControls && short && sideW < 160;
    button(ctx, targets, ui, {
      id: `station-${station}`,
      label: running
        ? `${job.remaining} seconds. Working`
        : job?.ready
          ? `Pour ${modeName}`
          : verb,
      text: running
        ? `${job.remaining}s`
        : job?.ready
          ? narrowAction
            ? "Pour"
            : "Pour into cup"
          : narrowAction && mode === "milk"
            ? "Steam"
            : verb,
      x: sideX,
      y: Math.min(by, y + h - 48),
      w: flavorControls && short ? sideW - 60 : sideW,
      h: tight ? 44 : 48,
      action: { type: "station", value: station },
      disabled: !usable || running,
      primary: !!job?.ready,
      fill: job?.ready ? undefined : "#e4eedb",
    });
    if (flavorControls)
      button(ctx, targets, ui, {
        id: "mobile-extras",
        label: "Open chocolate, vanilla and caramel shelf",
        text: short ? "Extras" : "Syrups & cocoa",
        x: short ? sideX + sideW - 52 : sideX,
        y: short ? Math.min(by, y + h - 48) : tight ? y + 96 : y + 142,
        w: short ? 52 : sideW,
        h: 44,
        action: { type: "mobileExtras" },
        disabled: !usable,
        fill: "#fff0da",
      });
  }
  if (running) {
    round(ctx, x + 8, y + h - 6, w - 16, 3, 2, "#e0d8c1");
    round(
      ctx,
      x + 8,
      y + h - 6,
      Math.max(1, (w - 16) * (1 - job.remaining / job.duration)),
      3,
      2,
      "#95b27c",
    );
  }
  const held = ui.drag || ui.pickedItem;
  if (
    held &&
    ((held.kind === "cup" && station !== "oven") ||
      (held.kind === "pastry" && station === "oven"))
  )
    outline(ctx, art, running ? "#be947a" : "#75a16d");
}

function tray(ctx, state, ui, W, H, targets, interaction, time) {
  const y = H - 140,
    usable = active(state),
    busy = !!(
      ui.cupDock &&
      state.jobs[ui.cupDock] &&
      !state.jobs[ui.cupDock].ready
    ),
    selected = getSelectedCustomer(state),
    correct = evaluateOrder(state, selected).correct;
  round(ctx, 0, y, W, 140, 17, "#fffaf0", "#d3c6a9");
  const trayBox = { x: 7, y: y + 4, w: W - 14, h: 65 },
    cup = { x: 9, y: y + 1, w: 72, h: 66 },
    food = { x: 89, y: y + 4, w: 67, h: 58 };
  interaction.objects.tray = trayBox;
  interaction.objects.foodSlot = food;
  interaction.objects.cup ||= cup;
  interaction.dropZones.push({
    id: "drop-tray",
    label: "Place on serving tray",
    kind: "tray",
    accepts: ["cup", "warmFood", "trayFood"],
    ...trayBox,
    cupRect: cup,
  });
  const source = {
    id: "drag-cup",
    label: busy
      ? "Cup is filling. Please wait"
      : "Pick up cup. Tap a machine to place it",
    kind: "cup",
    ...cup,
    disabled: !usable || busy,
  };
  interaction.draggables.push(source);
  targets.push({
    ...source,
    id: "pick-cup",
    action: { type: "pickItem", id: "drag-cup" },
  });
  if (ui.cupDock) {
    round(
      ctx,
      cup.x + 3,
      cup.y + 4,
      cup.w - 6,
      cup.h - 8,
      12,
      "#eaf0de",
      "#cbd8b9",
    );
    icon(ctx, busy ? "clock" : "coffee", cup.x + 25, cup.y + 10, 21, "#75926e");
    label(
      ctx,
      `At ${stationNames[ui.cupDock]}`,
      cup.x + cup.w / 2,
      cup.y + 48,
      { size: 12, align: "center", maxWidth: cup.w - 8 },
    );
  } else if (ui.drag?.kind !== "cup" && ui.snap?.kind !== "cup")
    drawDrink(ctx, state.drink, cup, { time, ready: correct });
  if (isPicked(ui, source)) outline(ctx, cup);
  if (state.food) {
    const sourceFood = {
      id: "tray-food",
      label: `Pick up ${foods[state.food.id].shortName}`,
      kind: "trayFood",
      foodId: state.food.id,
      ...food,
      disabled: !usable,
    };
    interaction.draggables.push(sourceFood);
    targets.push({
      ...sourceFood,
      id: "pick-food",
      action: { type: "pickItem", id: "tray-food" },
    });
    if (ui.drag?.kind !== "trayFood" && ui.snap?.kind !== "warmFood")
      drawFood(ctx, state.food.id, food, { time, warm: true });
    if (isPicked(ui, sourceFood)) outline(ctx, food);
  } else {
    round(
      ctx,
      food.x + 3,
      food.y + 7,
      food.w - 6,
      food.h - 12,
      13,
      "#faf1db",
      "#e1d2b0",
    );
    label(ctx, "Food tray", food.x + food.w / 2, food.y + food.h / 2, {
      size: 12,
      align: "center",
      color: "#a08e6f",
    });
  }
  const components = Object.keys(ingredientNames)
    .filter((key) => state.drink[key] > 0)
    .map((key) => `${state.drink[key]} ${ingredientNames[key]}`);
  label(ctx, correct ? "Order ready!" : "Your drink", 166, y + 18, {
    size: 13,
    color: correct ? "#64865d" : C.ink,
    maxWidth: W - 179,
  });
  label(ctx, components.slice(0, 2).join(" · ") || "Empty cup", 166, y + 38, {
    size: 12,
    color: C.muted,
    maxWidth: W - 179,
  });
  if (components.length > 2)
    label(ctx, components.slice(2).join(" · "), 166, y + 56, {
      size: 12,
      color: C.muted,
      maxWidth: W - 179,
    });
  const by = H - 65;
  button(ctx, targets, ui, {
    id: "cup-type",
    label: `${state.drink.cup} cup. Change cup type`,
    text: `${state.drink.cup === "hot" ? "Hot" : "Iced"} cup`,
    x: 9,
    y: by,
    w: 85,
    h: 44,
    action: game({
      type: "SET_CUP",
      cup: state.drink.cup === "hot" ? "iced" : "hot",
    }),
    disabled: !usable || busy,
  });
  button(ctx, targets, ui, {
    id: "remake",
    label: "Remake drink",
    icon: "reset",
    x: 100,
    y: by,
    w: 44,
    h: 44,
    action: game({ type: "CLEAR_DRINK" }),
    disabled: !usable || busy,
  });
  button(ctx, targets, ui, {
    id: "clear-food",
    label: "Clear food",
    icon: "close",
    x: 150,
    y: by,
    w: 44,
    h: 44,
    action: game({ type: "CLEAR_FOOD" }),
    disabled: !usable || !state.food,
  });
  button(ctx, targets, ui, {
    id: "serve",
    label: `Serve ${selected ? customers[selected.profileId].name : "order"}${correct ? ". Order ready." : ""}`,
    text: correct ? "Serve ✓" : "Serve",
    x: 201,
    y: by - 2,
    w: W - 210,
    h: 48,
    action: game({ type: "SERVE" }),
    disabled: !usable || !selected || busy,
    primary: correct,
    fill: correct ? undefined : "#f2e5c6",
  });
  if ((ui.drag || ui.pickedItem)?.kind === "warmFood") outline(ctx, trayBox);
}

function floatingItem(ctx, state, ui, time) {
  let item = ui.drag;
  const snap = ui.snap,
    now = performance.now();
  if (!item && snap && now - snap.startedAt < (snap.duration || 300)) {
    const t = Math.min(
        1,
        Math.max(0, (now - snap.startedAt) / (snap.duration || 300)),
      ),
      ease = 1 - (1 - t) ** 3;
    item = {
      ...snap,
      x: snap.from.x + (snap.to.x - snap.from.x) * ease,
      y: snap.from.y + (snap.to.y - snap.from.y) * ease,
    };
  }
  if (!item) return;
  const lift = item.pointerType === "touch" ? 48 : 0;
  const rect = { x: item.x - 35, y: item.y - 39 - lift, w: 70, h: 78 };
  ctx.save();
  ctx.shadowColor = "#5b473b44";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  if (item.kind === "cup")
    drawDrink(ctx, item.drink || state.drink, rect, { time });
  else
    drawFood(
      ctx,
      item.foodId,
      { ...rect, y: item.y - 29 - lift, h: 58 },
      { time, warm: item.kind !== "pastry" },
    );
  ctx.restore();
}

/** A focused counter that keeps the order, active machine and tray within reach. */
export function drawMobileGame(
  ctx,
  state,
  ui,
  { width: W, height: H, time = 0 },
) {
  const targets = [],
    interaction = {
      draggables: [],
      dropZones: [],
      machineControls: [],
      objects: {},
    },
    wide = W >= 620;
  const leftW = wide ? Math.min(340, W * 0.36) : W - 20;
  const customerBox = wide
    ? { x: 10, y: 61, w: leftW, h: H - 225 }
    : { x: 10, y: 60, w: W - 20, h: 136 };
  const tabBox = wide
    ? { x: leftW + 22, y: 61, w: W - leftW - 32 }
    : { x: 10, y: 202, w: W - 20 };
  const machineBox = {
    x: tabBox.x,
    y: tabBox.y + 56,
    w: tabBox.w,
    h: Math.max(97, H - 176 - (tabBox.y + 56)),
  };
  interaction.objects.workspace = machineBox;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f6ecd7";
  ctx.fillRect(0, 0, W, H);
  drawRoom(ctx, { x: 0, y: 54, w: W, h: wide ? 130 : 154 }, { time });
  drawCounter(
    ctx,
    { x: 0, y: wide ? 160 : 194, w: W, h: H - (wide ? 160 : 194) },
    { time },
  );
  customerPanel(ctx, state, ui, customerBox, targets, interaction, time, wide);
  tabs(ctx, state, ui, tabBox, targets);
  workspace(ctx, state, ui, machineBox, targets, interaction, time);
  tray(ctx, state, ui, W, H, targets, interaction, time);
  const picked = ui.pickedItem;
  const error =
    ui.feedback?.tone === "error"
      ? ui.feedback.text
      : state.notice?.type === "error"
        ? state.notice.text
        : null;
  const hint =
    error ||
    (picked
      ? picked.kind === "cup"
        ? "Tap a machine to place the cup"
        : picked.kind === "pastry"
          ? "Tap the warmer to place food"
          : "Tap your guest to serve the order"
      : ui.feedback?.text ||
        state.notice?.text ||
        (ui.cupDock && state.jobs[ui.cupDock] && !state.jobs[ui.cupDock].ready
          ? "Your cup is filling — one little moment"
          : "Tap an item, then its destination · or drag"));
  wrap(ctx, hint, W / 2, H - 173, W - 20, {
    size: 12,
    lineHeight: 15,
    maxLines: 2,
    align: "center",
    color: error ? "#a9765b" : "#6f7a58",
  });
  header(ctx, state, ui, W, targets);
  let overlay = null;
  if (ui.modal || state.phase === "paused" || state.phase === "summary") {
    targets.length = 0;
    interaction.draggables.length = 0;
    interaction.dropZones.length = 0;
    interaction.machineControls.length = 0;
    overlay = drawOverlay(ctx, state, ui, { width: W, height: H }, (target) =>
      targets.push(target),
    );
  } else floatingItem(ctx, state, ui, time);
  ctx.restore();
  return { targets, overlay, compact: true, mobile: true, ...interaction };
}
