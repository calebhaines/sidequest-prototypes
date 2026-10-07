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
  espressoCupRect,
  drawEspressoPour,
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
const wideCounter = (width, height) =>
  width >= 620 || (width >= 480 && width > height);
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
  const guestW = Math.min(
    140,
    (w - 58 - 8 * Math.max(0, state.queue.length - 1)) /
      Math.max(1, state.queue.length),
  );
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
    const guestZone = {
      id: `drop-guest-selector-${guest.id}`,
      label: `Serve ${profile.name}`,
      kind: "customer",
      customerId: guest.id,
      priority: 2,
      accepts: ["cup", "trayFood"],
      x: gx,
      y,
      w: guestW,
      h: 44,
    };
    interaction.dropZones.push(guestZone);
    if (
      ui.drag?.validDropId === guestZone.id ||
      (!ui.drag &&
        ui.pickedItem &&
        ["cup", "trayFood"].includes(ui.pickedItem.kind) &&
        evaluateOrder(state, guest).correct)
    )
      outline(ctx, guestZone);
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
  const compactOrder = wide && card.h < 90;
  interaction.objects.orderCard = card;
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
    w: compactOrder ? 52 : wide ? 80 : 69,
    h: compactOrder ? 40 : wide ? Math.min(card.h - 5, 142) : card.h - 5,
  };
  drawCustomer(ctx, customers[selected.profileId], portrait, {
    time,
    selected: true,
    chatted: selected.chatted,
  });
  const tx = x + (compactOrder ? 56 : wide ? 84 : 72),
    textWidth = w - (compactOrder ? 67 : wide ? 95 : 83);
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
    sy = card.y + (compactOrder ? 38 : 47),
    rowStart = tx,
    rowRight = compactOrder ? card.x + card.w - 54 : tx + textWidth;
  const availableWidth = textWidth;
  ctx.font = '600 12px "Nunito", sans-serif';
  steps.forEach((step) => {
    const width = ctx.measureText(step.text).width + 24;
    if (sx > rowStart && sx + width > rowRight) {
      rowStart = compactOrder ? card.x + 12 : tx;
      rowRight = compactOrder ? card.x + card.w - 12 : tx + availableWidth;
      sx = rowStart;
      sy += compactOrder ? 14 : 19;
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
  if (
    ui.drag?.validDropId === `drop-guest-${selected.id}` ||
    (!ui.drag &&
      held &&
      ["cup", "trayFood"].includes(held.kind) &&
      evaluateOrder(state, selected).correct)
  )
    outline(ctx, card);
}

function tabs(ctx, state, ui, box, targets, interaction) {
  const gap = 6,
    w = (box.w - gap * 3) / 4;
  Object.keys(stationNames).forEach((station, i) => {
    const job = state.jobs[station],
      rect = { x: box.x + i * (w + gap), y: box.y, w, h: 48 },
      zoneId = `drop-stationtab-${station}`;
    button(ctx, targets, ui, {
      id: `mobile-${station}`,
      label: `Show ${stationNames[station]}${job?.ready ? ". Ready to collect" : job ? `. ${job.remaining} seconds` : ""}`,
      text: stationNames[station],
      ...rect,
      selected: (ui.mobileStation || "espresso") === station,
      action: { type: "mobileStation", station },
      fill: job?.ready ? "#e8edbf" : undefined,
    });
    interaction.dropZones.push({
      id: zoneId,
      label:
        station === "oven"
          ? "Food to Warmer"
          : `Cup to ${stationNames[station]}`,
      kind: "station",
      station,
      stationTab: true,
      priority: 2,
      accepts: station === "oven" ? ["pastry"] : ["cup"],
      ...rect,
    });
    const held = ui.drag || ui.pickedItem;
    if (
      ui.drag?.validDropId === zoneId ||
      (!ui.drag &&
        held &&
        ((held.kind === "cup" && station !== "oven") ||
          (held.kind === "pastry" && station === "oven")))
    )
      outline(ctx, rect);
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
    interaction.dropZones.push({
      id: "drop-milk",
      label: "Cup to Milk",
      kind: "station",
      station: "milk",
      accepts: ["cup"],
      ...box,
    });
    if (
      ui.drag?.validDropId === "drop-milk" ||
      (!ui.drag && ui.pickedItem?.kind === "cup")
    )
      outline(ctx, box);
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
  if (station === "oven" && h < 148 && w < 440) art.h = Math.max(40, h - 55);
  // Short screens still need room for the cup and lever as separate objects.
  if (station === "espresso") {
    art.h = Math.max(105, art.h);
    if (h < 125) art.y = y - (h < 105 ? 14 : 0);
  }
  drawMachine(ctx, station, art, {
    job,
    time,
    selected: job?.ready,
    movableCup: station === "espresso",
  });
  if (station === "espresso") {
    interaction.objects.espressoCup = espressoCupRect(art);
    interaction.objects.espressoArt = art;
    const cup = interaction.objects.espressoCup;
    interaction.objects.espressoWell = {
      x: cup.x - 5,
      y: cup.y - 3,
      w: cup.w + 10,
      h: cup.h + 6,
    };
  }
  const smallArt = h < 125;
  const dropWell =
    station === "espresso"
      ? interaction.objects.espressoWell
      : { x: art.x + 5, y: art.y + 2, w: art.w - 10, h: art.h - 3 };
  ctx.save();
  ctx.setLineDash([4, 5]);
  round(
    ctx,
    dropWell.x,
    dropWell.y,
    dropWell.w,
    dropWell.h,
    13,
    "transparent",
    "#bea980",
  );
  ctx.restore();
  if (
    art.h >= 65 &&
    art.y + art.h <= y + h &&
    !(station === "espresso" && ui.cupDock === "espresso")
  )
    label(
      ctx,
      station === "oven"
        ? "Drop food here"
        : station === "espresso" && ui.cupDock === "espresso"
          ? "Cup in place"
          : "Drop cup here",
      art.x + art.w / 2,
      art.y + art.h - 7,
      {
        size: 12,
        align: "center",
        color: "#7e775c",
        maxWidth: art.w - 15,
      },
    );
  const stationZone = {
    id: `drop-${station}`,
    label: `Place ${station === "oven" ? "food in the warmer" : `cup at ${stationNames[station]}`}`,
    kind: "station",
    station,
    accepts: station === "oven" ? ["pastry"] : ["cup"],
    ...box,
    well: dropWell,
    exclude: [],
  };
  interaction.dropZones.push(stationZone);
  if (station === "espresso")
    interaction.dropZones.push({
      id: "drop-espresso-well",
      label: "Place cup beneath the espresso nozzle",
      kind: "station",
      station: "espresso",
      accepts: ["cup"],
      exclude: [],
      priority: 1,
      cupRect: interaction.objects.espressoCup,
      ...dropWell,
    });
  if (ui.drag?.validDropId === "drop-espresso-well") outline(ctx, dropWell);
  targets.push({
    id: `machine-${station}`,
    label: `Use ${stationNames[station]}`,
    ...art,
    action: { type: "station", value: station },
    disabled: !usable || running,
  });
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
  const controlCenter = {
    x: art.x + (art.w - 240 * artScale) / 2 + faceControl[0] * artScale,
    y: art.y + (art.h - 205 * artScale) / 2 + faceControl[1] * artScale,
  };
  if (station === "espresso") {
    const cup = interaction.objects.espressoCup,
      cupHitTop = cup.y + cup.h / 2 - Math.max(44, cup.h) / 2;
    controlCenter.y = Math.min(
      controlCenter.y,
      cupHitTop - controlSize / 2 - 3,
    );
  }
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
      sideRack = horizontalRack && w >= 440,
      rackH = horizontalRack ? 44 : Math.max(44, Math.min(52, (h - 18) / 3));
    const rackW = horizontalRack
      ? ((sideRack ? sideW : w - 20) - 12) / 3
      : sideW;
    Object.keys(foods).forEach((foodId, i) => {
      const fy = horizontalRack
          ? sideRack
            ? y + 4
            : y + h - 49
          : y + 7 + i * (rackH + 2),
        fx = horizontalRack
          ? (sideRack ? sideX : x + 10) + i * (rackW + 6)
          : sideX,
        rect = { x: fx, y: fy, w: rackW, h: rackH };
      stationZone.exclude.push(rect);
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
      ? { x: sideX, y: y + (sideRack ? 50 : 4), w: sideW, h: 44 }
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
    interaction.dropZones.push({
      id: "drop-stationbutton-oven",
      label: "Food to Warmer",
      kind: "station",
      station: "oven",
      priority: 2,
      accepts: ["pastry"],
      ...ovenAction,
    });
    if (ui.drag?.validDropId === "drop-stationbutton-oven")
      outline(ctx, ovenAction);
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
      label(
        ctx,
        ui.cupDock === "espresso"
          ? running
            ? "Your shot is brewing"
            : state.drink.shots > 0
              ? "Take your cup to the tray"
              : "Pull the lever for one shot"
          : "Place cup, then pull",
        sideX + sideW / 2,
        y + (tight ? 25 : 58),
        {
          size: 13,
          align: "center",
          color: C.muted,
          maxWidth: sideW - 8,
        },
      );
    const by = tight
      ? y + 50
      : flavorControls
        ? y + 87
        : Math.max(y + 86, y + h - 55);
    const verb =
      station === "espresso"
        ? state.drink.shots > 0 && ui.cupDock === "espresso"
          ? "Pull another shot"
          : "Pull shot"
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
    const actionRect = {
      x: sideX,
      y: Math.min(by, y + h - 48),
      w: flavorControls && short ? sideW - 60 : sideW,
      h: tight ? 44 : 48,
    };
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
      ...actionRect,
      action: { type: "station", value: station },
      disabled: !usable || running,
      primary: !!job?.ready,
      fill: job?.ready ? undefined : "#e4eedb",
    });
    const actionZone = {
      id: `drop-stationbutton-${station}`,
      label: `Cup to ${stationNames[station]}`,
      kind: "station",
      station,
      activate: station === "espresso",
      priority: 2,
      accepts: ["cup"],
      ...actionRect,
    };
    interaction.dropZones.push(actionZone);
    if (ui.drag?.validDropId === actionZone.id) outline(ctx, actionRect);
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
    if (!ui.drag || ui.drag.validDropId === `drop-${station}`)
      outline(ctx, box, running ? "#be947a" : "#75a16d");
}

function tray(ctx, state, ui, W, H, targets, interaction, time) {
  const compactWide = wideCounter(W, H) && H < 380,
    trayHeight = compactWide ? 112 : 140,
    y = H - trayHeight,
    usable = active(state),
    busy = !!(
      ui.cupDock &&
      state.jobs[ui.cupDock] &&
      !state.jobs[ui.cupDock].ready
    ),
    selected = getSelectedCustomer(state),
    correct = evaluateOrder(state, selected).correct;
  round(ctx, 0, y, W, trayHeight, 17, "#fffaf0", "#d3c6a9");
  const trayBox = { x: 7, y: y + 4, w: W - 14, h: compactWide ? 50 : 65 },
    trayCup = {
      x: 9,
      y: y + 2,
      w: compactWide ? 54 : 72,
      h: compactWide ? 48 : 66,
    },
    atEspresso = ui.cupDock === "espresso",
    visibleEspresso =
      atEspresso && (ui.mobileStation || "espresso") === "espresso",
    cup = visibleEspresso ? interaction.objects.espressoCup : trayCup,
    food = {
      x: compactWide ? 75 : 89,
      y: y + 4,
      w: compactWide ? 60 : 67,
      h: compactWide ? 46 : 58,
    };
  interaction.objects.tray = trayBox;
  interaction.objects.foodSlot = food;
  interaction.objects.cup = cup;
  interaction.objects.trayCup = trayCup;
  interaction.dropZones.forEach((zone) => {
    if (zone.kind === "station" && zone.station !== "oven")
      zone.cupRect =
        zone.station === "espresso"
          ? interaction.objects.espressoCup || trayCup
          : trayCup;
  });
  interaction.dropZones.push({
    id: "drop-tray",
    label: "Place on serving tray",
    kind: "tray",
    // When retrieving from espresso, a finger on the tray is deliberate even
    // if the lifted cup preview still overlaps its old machine well.
    priority: atEspresso ? 2 : 0,
    accepts: ["cup", "warmFood", "trayFood"],
    ...trayBox,
    cupRect: trayCup,
  });
  const source = {
    id: "drag-cup",
    label: busy
      ? "Cup is filling. Please wait"
      : visibleEspresso
        ? "Pick up cup from espresso machine. Return it to the tray or move to another machine"
        : "Pick up cup. Tap a machine to place it",
    kind: "cup",
    paintRect: cup,
    x: cup.x + cup.w / 2 - Math.max(44, cup.w) / 2,
    y: cup.y + cup.h / 2 - Math.max(44, cup.h) / 2,
    w: Math.max(44, cup.w),
    h: Math.max(44, cup.h),
    disabled: !usable || busy,
  };
  interaction.draggables.push(source);
  targets.push({
    ...source,
    id: "pick-cup",
    action: { type: "pickItem", id: "drag-cup" },
  });
  if (
    ui.drag?.kind !== "cup" &&
    ui.snap?.kind !== "cup" &&
    (!atEspresso || visibleEspresso)
  )
    drawDrink(ctx, state.drink, cup, { time, ready: correct });
  if (atEspresso) {
    ctx.save();
    ctx.setLineDash([3, 4]);
    round(
      ctx,
      trayCup.x + 4,
      trayCup.y + 5,
      trayCup.w - 8,
      trayCup.h - 10,
      13,
      "#faf1db",
      "#cabd9e",
    );
    ctx.restore();
    label(
      ctx,
      compactWide ? "Espresso" : "At espresso",
      trayCup.x + trayCup.w / 2,
      trayCup.y + (compactWide ? 17 : 28),
      {
        size: 12,
        align: "center",
        color: C.muted,
        maxWidth: trayCup.w - (compactWide ? 2 : 6),
      },
    );
    label(
      ctx,
      compactWide
        ? busy
          ? `${state.jobs[ui.cupDock].remaining}s`
          : "Return"
        : busy
          ? "Brewing…"
          : "Return cup",
      trayCup.x + trayCup.w / 2,
      trayCup.y + (compactWide ? 34 : 45),
      {
        size: 12,
        align: "center",
        color: "#77916a",
        maxWidth: trayCup.w - 6,
      },
    );
    targets.push({
      id: "return-cup",
      label: "Return the espresso cup to the serving tray",
      ...trayCup,
      action: { type: "returnCup" },
      disabled: !usable || busy,
    });
  }
  if (busy && !(compactWide && atEspresso)) {
    round(
      ctx,
      trayCup.x + trayCup.w - 29,
      trayCup.y + 5,
      28,
      22,
      9,
      "#e8eed9",
      "#bccaa1",
    );
    label(
      ctx,
      `${state.jobs[ui.cupDock].remaining}s`,
      trayCup.x + trayCup.w - 15,
      trayCup.y + 16,
      {
        size: 12,
        align: "center",
        color: "#64805c",
      },
    );
  }
  if (ui.pour && ui.drag?.kind !== "cup") {
    const elapsed = performance.now() - ui.pour.startedAt;
    if (
      elapsed >= 0 &&
      elapsed < ui.pour.duration &&
      ui.pour.station !== "espresso"
    ) {
      ctx.save();
      ctx.strokeStyle =
        ui.pour.station === "espresso"
          ? "#9d734d"
          : ui.pour.station === "milk"
            ? "#e7d7a8"
            : "#c5a36b";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cup.x + 33, cup.y + 2);
      ctx.lineTo(cup.x + 33, cup.y + 24);
      ctx.stroke();
      ctx.restore();
    }
  }
  const espressoJob = state.jobs.espresso,
    espressoPour =
      ui.pour?.station === "espresso" &&
      performance.now() >= ui.pour.startedAt &&
      performance.now() - ui.pour.startedAt < ui.pour.duration;
  if (
    visibleEspresso &&
    ui.drag?.kind !== "cup" &&
    ui.snap?.kind !== "cup" &&
    ((espressoJob && !espressoJob.ready) || espressoPour)
  )
    drawEspressoPour(ctx, interaction.objects.espressoArt, cup, time);
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
  const summaryX = compactWide ? 149 : 166;
  label(ctx, correct ? "Order ready!" : "Your drink", summaryX, y + 18, {
    size: 13,
    color: correct ? "#64865d" : C.ink,
    maxWidth: W - summaryX - 13,
  });
  label(
    ctx,
    (compactWide ? components : components.slice(0, 2)).join(" · ") ||
      "Empty cup",
    summaryX,
    y + 38,
    {
      size: 12,
      color: C.muted,
      maxWidth: W - summaryX - 13,
    },
  );
  if (!compactWide && components.length > 2)
    label(ctx, components.slice(2).join(" · "), 166, y + 56, {
      size: 12,
      color: C.muted,
      maxWidth: W - 179,
    });
  const by = H - (compactWide ? 54 : 65);
  const serveRect = {
    // Keep the primary action beside the tray-return path on short screens.
    // A lifted cup over the tray must not put its finger on Serve below it.
    x: compactWide ? W - 189 : 201,
    y: by - (compactWide ? 0 : 2),
    w: compactWide ? 180 : W - 210,
    h: compactWide ? 44 : 48,
  };
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
  if (ui.pickedItem) {
    button(ctx, targets, ui, {
      id: "cancel-picked",
      label: "Cancel selected item",
      text: "Cancel",
      x: 100,
      y: by,
      w: 94,
      h: 44,
      action: { type: "cancelPick" },
      fill: "#f6ebdd",
    });
  } else {
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
  }
  button(ctx, targets, ui, {
    id: "serve",
    label: `Serve ${selected ? customers[selected.profileId].name : "order"}${correct ? ". Order ready." : ""}`,
    text: correct ? "Serve ✓" : "Serve",
    ...serveRect,
    action: game({ type: "SERVE" }),
    disabled: !usable || !selected || busy,
    primary: correct,
    fill: correct ? undefined : "#f2e5c6",
  });
  if (selected)
    interaction.dropZones.push({
      id: "drop-serve",
      label: `Serve ${customers[selected.profileId].name}`,
      kind: "customer",
      customerId: selected.id,
      priority: 2,
      accepts: ["cup", "trayFood"],
      ...serveRect,
    });
  if (
    ui.drag?.validDropId === "drop-serve" ||
    (!ui.drag &&
      ui.pickedItem &&
      correct &&
      ["cup", "trayFood"].includes(ui.pickedItem.kind))
  )
    outline(ctx, serveRect);
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
  const rect = { x: item.x - 35, y: item.y - 39, w: 70, h: 78 };
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
      { ...rect, y: item.y - 29, h: 58 },
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
    wide = wideCounter(W, H),
    compactWide = wide && H < 380;
  const leftW = wide ? Math.min(340, W * 0.36) : W - 20;
  const customerBox = wide
    ? { x: 10, y: 61, w: leftW, h: compactWide ? 130 : Math.min(215, H - 225) }
    : { x: 10, y: 60, w: W - 20, h: 136 };
  const tabBox = wide
    ? {
        x: leftW + 22,
        y: H > W ? Math.max(61, H - 600) : 61,
        w: W - leftW - 32,
      }
    : { x: 10, y: 202, w: W - 20 };
  const machineBox = {
    x: tabBox.x,
    y: tabBox.y + 56,
    w: tabBox.w,
    h: compactWide
      ? Math.min(340, Math.max(44, H - 120 - (tabBox.y + 56)))
      : Math.min(wide ? 340 : 320, Math.max(97, H - 176 - (tabBox.y + 56))),
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
  tabs(ctx, state, ui, tabBox, targets, interaction);
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
          : picked.kind === "warmFood"
            ? "Tap the tray to collect warm food"
            : "Tap your guest or Serve"
      : ui.feedback?.text ||
        state.notice?.text ||
        (ui.cupDock && state.jobs[ui.cupDock] && !state.jobs[ui.cupDock].ready
          ? "Your cup is filling — one little moment"
          : "Tap or drag to a machine"));
  wrap(
    ctx,
    hint,
    compactWide ? leftW / 2 + 10 : W / 2,
    compactWide
      ? customerBox.y + customerBox.h + 3
      : Math.min(H - 173, machineBox.y + machineBox.h + 7),
    compactWide ? leftW - 20 : W - 20,
    {
      size: 12,
      lineHeight: compactWide ? 13 : 15,
      maxLines: compactWide && H < 340 ? 1 : 2,
      align: "center",
      color: error ? "#a9765b" : "#6f7a58",
    },
  );
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
