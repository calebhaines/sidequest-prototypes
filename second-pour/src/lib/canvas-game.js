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
  shadow,
} from "./canvas-kit.js";
import { drawOverlay } from "./canvas-overlays.js";
const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const ingredientLabels = {
  shots: "espresso",
  milk: "steamed milk",
  foam: "foam",
  water: "hot water",
  tea: "tea",
  chocolate: "chocolate",
  vanilla: "vanilla",
  caramel: "caramel",
  coldMilk: "cold milk",
};
const stations = {
  espresso: "Espresso",
  milk: "Milk & foam",
  kettle: "Kettle",
  oven: "Little oven",
};
const game = (value) => ({ type: "game", value });
const uiAction = (value) => ({ type: "ui", value });

function hud(ctx, state, ui, W, compact, targets) {
  const h = compact ? 104 : 80;
  ctx.save();
  shadow(ctx, 10, "#74634d14", 3);
  round(ctx, 0, 0, W, h, 0, "#fffcf2");
  ctx.restore();
  round(ctx, compact ? 14 : 25, compact ? 14 : 17, 42, 42, 15, "#e5edd9");
  icon(ctx, "coffee", compact ? 23 : 34, compact ? 23 : 26, 24, "#63846b");
  label(ctx, "Second Pour", compact ? 66 : 79, compact ? 29 : 32, {
    font: "Fraunces",
    size: compact ? 23 : 28,
    weight: 600,
  });
  label(
    ctx,
    "COFFEE, COMPANY & A LITTLE CHAOS",
    compact ? 67 : 80,
    compact ? 49 : 55,
    { size: compact ? 6.4 : 8, color: "#879276", weight: 600 },
  );
  const buttons = [
    ["header-recipes", "Recipe book", "book", "openRecipes"],
    [
      "header-sound",
      ui.sound ? "Mute sound" : "Turn on sound",
      ui.sound ? "sound" : "mute",
      "sound",
    ],
    ["header-help", "How to play", "help", "openHelp"],
  ];
  buttons.forEach(([id, name, image, action], i) =>
    button(ctx, targets, ui, {
      id,
      label: name,
      icon: image,
      x: W - (compact ? 146 : 182) + i * 46,
      y: compact ? 13 : 17,
      w: 42,
      h: 42,
      action: uiAction(action),
      fill: "#fffdf4",
    }),
  );
  if (!compact)
    button(ctx, targets, ui, {
      id: "header-home",
      label: "Return to Sidequest",
      icon: "home",
      x: W - 44,
      y: 17,
      w: 33,
      h: 42,
      action: uiAction("home"),
    });
  const rowY = compact ? 83 : 42;
  const baseX = compact ? 18 : Math.max(320, W * 0.29);
  label(
    ctx,
    state.phase === "practice"
      ? "A gentle warm-up"
      : `Day ${state.day} · morning shift`,
    baseX,
    rowY,
    { size: compact ? 11 : 13, color: "#718268", weight: 500 },
  );
  const tipX = compact ? W * 0.4 : baseX + 190;
  icon(ctx, "heart", tipX, rowY - 8, 15, "#a99567");
  label(ctx, formatMoney(state.tips), tipX + 22, rowY, {
    size: compact ? 12 : 15,
    color: "#6d7e57",
    weight: 600,
  });
  if (!compact) {
    icon(ctx, "star", tipX + 90, rowY - 9, 17, "#b59e65");
    label(ctx, `${state.served}/6 happy guests`, tipX + 114, rowY, {
      size: 12,
      color: "#848d72",
    });
  }
  if (state.phase === "practice")
    button(ctx, targets, ui, {
      id: "start-shift",
      label: `Open day ${(state.best.day || 0) + 1}`,
      text:
        state.best.day || 0 ? `Open day ${state.best.day + 1}` : "Open café",
      x: compact ? W - 139 : W - 365,
      y: compact ? 65 : 18,
      w: compact ? 124 : 154,
      h: compact ? 34 : 44,
      action: uiAction("start"),
      primary: true,
      small: compact,
    });
  else {
    const x = compact ? W - 136 : W - 340;
    icon(ctx, "clock", x, rowY - 8, 16, C.green);
    label(ctx, clock(state.timeLeft), x + 22, rowY, {
      size: compact ? 18 : 24,
      font: "Fraunces",
      color: state.timeLeft < 30 ? "#ad6d53" : C.ink,
    });
    button(ctx, targets, ui, {
      id: "pause",
      label: state.phase === "paused" ? "Resume shift" : "Pause shift",
      icon: state.phase === "paused" ? "play" : "pause",
      x: compact ? W - 53 : x + 82,
      y: compact ? 63 : 18,
      w: 40,
      h: compact ? 38 : 44,
      action: game({ type: state.phase === "paused" ? "RESUME" : "PAUSE" }),
      disabled: state.phase === "summary",
    });
  }
}

function orderBubble(ctx, state, customer, box, selected, targets) {
  const profile = customers[customer.profileId],
    recipe = recipes[customer.drinkId],
    { x, y, w, h } = box;
  ctx.save();
  shadow(ctx, 8, "#745e3c16", 3);
  round(
    ctx,
    x,
    y,
    w,
    h,
    15,
    selected ? "#fffef0" : "#fff9e9",
    selected ? "#b3c995" : "#e1d5b8",
  );
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.42, y + h - 1);
  ctx.lineTo(x + w * 0.5, y + h + 9);
  ctx.lineTo(x + w * 0.57, y + h - 1);
  ctx.fillStyle = selected ? "#fffef0" : "#fff9e9";
  ctx.fill();
  const small = w < 140;
  label(ctx, profile.name, x + 12, y + 15, {
    font: "Fraunces",
    size: small ? 14 : 17,
  });
  if (customer.chatted) icon(ctx, "heart", x + w - 28, y + 9, 12, "#c18d7b");
  label(ctx, recipe.shortName, x + 12, y + 36, {
    size: small ? 10 : 12,
    color: "#6f775d",
    weight: 600,
    maxWidth: w - 22,
  });
  if (customer.foodId)
    label(
      ctx,
      `+ warm ${foods[customer.foodId].shortName.toLowerCase()}`,
      x + 12,
      y + 53,
      { size: small ? 8.5 : 10, color: "#8d8060", maxWidth: w - 22 },
    );
  const patience =
    state.phase === "practice" ? 1 : customer.patience / customer.maxPatience;
  round(ctx, x + 12, y + h - 9, w - 24, 3, 2, "#e6e9d6");
  round(
    ctx,
    x + 12,
    y + h - 9,
    Math.max(1, (w - 24) * patience),
    3,
    2,
    patience < 0.28 ? "#ce987e" : "#abc292",
  );
  ctx.restore();
}

function guests(ctx, state, ui, W, compact, counterY, targets, time) {
  const queue = state.queue,
    selected = getSelectedCustomer(state),
    count = queue.length;
  if (!count) {
    label(
      ctx,
      state.phase === "practice"
        ? "One lovely first coffee. Ready to open?"
        : "A little quiet between coffees.",
      W / 2,
      counterY - 90,
      {
        font: "Fraunces",
        size: compact ? 17 : 27,
        color: "#7b896c",
        align: "center",
      },
    );
    return [];
  }
  const hands = [];
  queue.forEach((customer, i) => {
    const profile = customers[customer.profileId],
      active = selected?.id === customer.id;
    let center =
      count === 1
        ? compact
          ? W * 0.32
          : W * 0.5
        : compact
          ? ((i + 0.5) * W) / count
          : W * 0.5 + (i - (count - 1) / 2) * Math.min(245, W * 0.2);
    const guestH = compact ? (count === 1 ? 157 : 119) : 205;
    const guestW = compact
      ? count === 1
        ? 134
        : Math.min(120, W / count - 12)
      : 180;
    const person = {
      x: center - guestW / 2,
      y: counterY - guestH + 15,
      w: guestW,
      h: guestH,
    };
    drawCustomer(ctx, profile, person, {
      time,
      selected: active,
      chatted: customer.chatted,
    });
    const bubbleW = compact
      ? count === 1
        ? Math.min(185, W * 0.44)
        : Math.min(185, W / count - 12)
      : 209;
    const bubble = {
      x:
        count === 1
          ? Math.min(W - bubbleW - 12, center + (compact ? 62 : 100))
          : center - bubbleW / 2,
      y: count === 1 ? counterY - (compact ? 149 : 186) : compact ? 114 : 105,
      w: bubbleW,
      h: compact ? (count === 1 ? 86 : 78) : 91,
    };
    if (count === 1 && !compact) bubble.y = counterY - 182;
    orderBubble(ctx, state, customer, bubble, active, targets);
    targets.push({
      id: `guest-${customer.id}`,
      label: `Select ${profile.name}'s ${recipes[customer.drinkId].name} order`,
      x: Math.min(person.x, bubble.x),
      y: Math.min(person.y, bubble.y),
      w:
        Math.max(person.x + person.w, bubble.x + bubble.w) -
        Math.min(person.x, bubble.x),
      h: counterY - Math.min(person.y, bubble.y) + 10,
      action: game({ type: "SELECT_CUSTOMER", id: customer.id }),
      disabled: !["practice", "playing"].includes(state.phase),
    });
    if (active)
      button(ctx, targets, ui, {
        id: "chat-open",
        label: `Chat with ${profile.name}`,
        text: customer.chatted ? "Chat again" : "Chat",
        icon: "chat",
        x: center - 43,
        y: counterY - 33,
        w: 86,
        h: 36,
        action: uiAction("openChat"),
        small: true,
        fill: "#fff9ec",
        color: "#79936b",
        disabled: !["practice", "playing"].includes(state.phase),
      });
    hands.push({ center, width: guestW, skin: profile.skin });
  });
  return hands;
}

function notebook(ctx, state, W, compact, counterY) {
  const selected = getSelectedCustomer(state),
    recipe = recipes[selected?.drinkId],
    evaluation = evaluateOrder(state, selected);
  const w = compact ? W - 28 : Math.min(380, W * 0.3),
    h = compact ? 90 : 152,
    x = (W - w) / 2,
    y = counterY + (compact ? 10 : 25);
  ctx.save();
  shadow(ctx, 10, "#836b4120", 4);
  round(ctx, x, y, w, h, 10, "#fffdf0", "#e5d9bd");
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#e9ddc9";
  ctx.lineWidth = 1;
  for (let yy = y + 34; yy < y + h - 8; yy += 19) {
    ctx.beginPath();
    ctx.moveTo(x + 15, yy);
    ctx.lineTo(x + w - 12, yy);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    round(ctx, x + 8, y + 13 + i * 24, 3, 10, 1, "#cab996");
  }
  label(
    ctx,
    recipe
      ? `${customers[selected.profileId].name}’s ${recipe.shortName.toLowerCase()}`
      : "Your little recipe notebook",
    x + 23,
    y + 18,
    {
      font: "Fraunces",
      size: compact ? 16 : 20,
      color: "#627652",
      maxWidth: w - 60,
    },
  );
  if (evaluation.correct) icon(ctx, "check", x + w - 28, y + 10, 16, C.green);
  else if (compact)
    label(ctx, `${state.served}/6`, x + w - 21, y + 18, {
      size: 9,
      color: "#a19a70",
      align: "center",
    });
  if (!selected) {
    label(ctx, "The next order brings a fresh little recipe.", x + 23, y + 48, {
      size: compact ? 10 : 12,
      color: "#939677",
      maxWidth: w - 35,
    });
    ctx.restore();
    return;
  }
  const progress = recipeProgress(state.drink, recipe);
  const extraIngredients = progress.steps.filter(
    (step) => step.ingredient !== "cup" && !step.expected,
  );
  const steps = progress.steps
    .filter((step) => step.ingredient === "cup" || step.expected)
    .map((step) => ({
      ...step,
      text:
        step.ingredient === "cup"
          ? step.label
          : step.excess
            ? `Extra ${ingredientLabels[step.ingredient]}`
            : `${step.expected} ${ingredientLabels[step.ingredient]}`,
    }));
  if (extraIngredients.length)
    steps.push({ text: "Extra ingredients · remake", excess: true });
  if (!selected.foodId && state.food)
    steps.push({ text: "Clear extra food", excess: true });
  if (selected.foodId)
    steps.push({
      text: `Warm ${foods[selected.foodId].shortName.toLowerCase()}`,
      complete: state.food?.id === selected.foodId && state.food?.warm,
    });
  steps.forEach((step, i) => {
    const col = compact ? i % 2 : i >= 3 ? 1 : 0,
      row = compact ? Math.floor(i / 2) : i % 3;
    const sx = x + 23 + col * (w / 2 - 2),
      sy = y + (compact ? 39 : 54) + row * (compact ? 17 : 26);
    round(
      ctx,
      sx,
      sy - 6,
      12,
      12,
      3,
      step.complete ? "#dfeccb" : step.excess ? "#f0d9c6" : "#fffdf2",
      step.excess ? "#d8a48b" : "#d7dfc5",
    );
    if (step.complete) icon(ctx, "check", sx + 1, sy - 5, 10, "#719051");
    label(ctx, step.text, sx + 18, sy, {
      size: compact ? 9.5 : 11,
      color: step.excess ? "#b27053" : step.complete ? "#708453" : "#959775",
      maxWidth: w / 2 - 35,
    });
  });
  if (!compact)
    label(
      ctx,
      evaluation.correct
        ? "Made with care. Ready to serve."
        : "Every ingredient is one serving. Extras need a fresh cup.",
      x + 23,
      y + h - 16,
      { size: 9, color: "#8f9878", maxWidth: w - 45 },
    );
  ctx.restore();
}

function machine(ctx, state, ui, station, box, compact, targets, time) {
  const job = state.jobs[station],
    active = ["practice", "playing"].includes(state.phase),
    running = job && !job.ready;
  const { x, y, w, h } = box;
  const art = compact
    ? { x: x - 3, y: y + 14, w: 83, h: 92 }
    : { x: x + 4, y: y + 2, w: w - 8, h: 175 };
  const hovered =
    ui.hoverId === `machine-${station}` || ui.hoverId === `station-${station}`;
  drawMachine(ctx, station, art, {
    job,
    time,
    selected: hovered || job?.ready,
  });
  targets.push({
    id: `machine-${station}`,
    label: `Use ${stations[station]}${job?.ready ? " and collect" : ""}`,
    ...art,
    action: { type: "station", value: station },
    disabled: !active || !!running,
  });
  const bx = compact ? x + 82 : x + 8,
    bw = compact ? w - 82 : w - 16;
  label(
    ctx,
    stations[station],
    compact ? bx : x + w / 2,
    y + (compact ? 8 : 180),
    {
      font: "Fraunces",
      size: compact ? 13 : 16,
      align: compact ? "left" : "center",
      color: "#5e684e",
      maxWidth: bw,
    },
  );
  let mode;
  if (station === "milk")
    mode = {
      label: job
        ? job.mode === "foam"
          ? "Foam"
          : "Milk"
        : ui.milkMode === "foam"
          ? "Foam"
          : ui.milkMode === "cold"
            ? "Cold milk"
            : "Milk",
      name: "Milk mode",
    };
  if (station === "kettle")
    mode = {
      label: (job?.mode || ui.kettleMode) === "tea" ? "Tea" : "Water",
      name: "Kettle mode",
    };
  if (station === "oven")
    mode = {
      label: foods[job?.foodId || ui.ovenFood].shortName,
      name: "Food to warm",
    };
  if (mode) {
    const my = y + (compact ? 21 : 198);
    button(ctx, targets, ui, {
      id: `mode-${station}`,
      label: `${mode.name}: ${mode.label}. Change selection`,
      text: mode.label,
      x: bx,
      y: my,
      w: bw,
      h: 44,
      action: { type: "mode", station },
      disabled: !!job || !active,
      small: compact,
      fill: "#fffbed",
    });
    icon(ctx, "chevron", bx + bw - 18, my + 16, 12, "#91a079");
  } else
    label(
      ctx,
      state.phase === "practice"
        ? "Instant in practice"
        : job?.ready
          ? "Fresh shot ready"
          : "One fresh shot · 4s",
      compact ? bx : x + w / 2,
      y + (compact ? 39 : 215),
      {
        size: compact ? 9 : 11,
        color: "#929576",
        align: compact ? "left" : "center",
        maxWidth: bw,
      },
    );
  let text =
    station === "espresso"
      ? "Pull espresso"
      : station === "milk"
        ? ui.milkMode === "foam"
          ? "Make foam"
          : ui.milkMode === "cold"
            ? "Pour cold milk"
            : "Steam milk"
        : station === "kettle"
          ? ui.kettleMode === "tea"
            ? "Brew tea"
            : "Heat water"
          : "Warm food";
  if (job?.ready)
    text =
      station === "espresso"
        ? "Pour espresso"
        : station === "milk"
          ? job.mode === "foam"
            ? "Add foam"
            : "Add milk"
          : station === "kettle"
            ? job.mode === "tea"
              ? "Pour tea"
              : "Pour water"
            : "Place on tray";
  if (running)
    text = `${job.remaining}s · ${station === "oven" ? "warming" : "working"}`;
  button(ctx, targets, ui, {
    id: `station-${station}`,
    label: text,
    text,
    x: bx,
    y: y + (compact ? 68 : 251),
    w: bw,
    h: 44,
    action: { type: "station", value: station },
    disabled: !active || !!running,
    primary: !!job?.ready,
    small: compact,
    fill: job?.ready
      ? undefined
      : station === "oven"
        ? "#f4e9c9"
        : station === "milk"
          ? "#f4e0d3"
          : station === "kettle"
            ? "#e4eee4"
            : "#e0ecd4",
  });
  if (running) {
    round(
      ctx,
      compact ? x + 8 : x + 15,
      y + (compact ? 108 : 306),
      compact ? 62 : w - 30,
      3,
      2,
      "#dedec4",
    );
    round(
      ctx,
      compact ? x + 8 : x + 15,
      y + (compact ? 108 : 306),
      Math.max(1, (compact ? 62 : w - 30) * (1 - job.remaining / job.duration)),
      3,
      2,
      "#9baf77",
    );
  }
}

function syrups(ctx, state, ui, W, H, compact, targets) {
  const available = ["practice", "playing"].includes(state.phase);
  const specs = [
    ["chocolate", "Chocolate", 2, "#8d664c"],
    ["vanilla", "Vanilla", 2, "#e5cda0"],
    ["caramel", "Caramel", 3, "#c99c60"],
  ];
  const x = compact ? 14 : 31,
    y = compact ? H - 185 : H - 171,
    totalW = compact ? W - 28 : 330,
    gap = compact ? 7 : 12,
    w = (totalW - gap * 2) / 3;

  specs.forEach(([id, name, day, color], i) => {
    const bx = x + i * (w + gap),
      locked = state.day < day;
    if (!compact) {
      ctx.save();
      shadow(ctx, 6, "#82633b15", 3);
      round(ctx, bx + w / 2 - 13, y + 20, 26, 47, 7, color, "#bb9b6e");
      round(ctx, bx + w / 2 - 8, y + 11, 16, 14, 3, "#6b7156");
      round(ctx, bx + w / 2 - 11, y + 36, 22, 19, 3, "#fcf4d5");
      icon(ctx, "heart", bx + w / 2 - 6, y + 40, 12, "#b7a775");
      ctx.restore();
    }
    button(ctx, targets, ui, {
      id: `extra-${id}`,
      label: locked
        ? `${name} unlocks on day ${day}`
        : `Add ${name.toLowerCase()}`,
      text: locked ? `${name} · day ${day}` : name,
      x: bx,
      y: compact ? y : y + 74,
      w,
      h: compact ? 34 : 36,
      action: game({ type: "ADD_INGREDIENT", ingredient: id }),
      disabled: !available || locked,
      small: true,
      fill: "#fff7e4",
    });
  });
}

function tray(ctx, state, ui, W, H, compact, targets, time) {
  const available = ["practice", "playing"].includes(state.phase),
    selected = getSelectedCustomer(state),
    correct = evaluateOrder(state, selected).correct;
  const x = compact ? 14 : W / 2 - 240,
    y = compact ? H - 141 : H - 212,
    w = compact ? W - 28 : 480,
    h = compact ? 76 : 130;
  ctx.save();
  shadow(ctx, 8, "#8d735416", 3);
  round(
    ctx,
    x,
    y,
    w,
    h,
    16,
    correct ? "#f5f8e4" : "#fbf3dc",
    correct ? "#b7cc92" : "#dacdb0",
  );
  ctx.restore();
  if (!compact)
    label(ctx, "YOUR SERVING TRAY", x + 15, y - 17, {
      size: 9,
      color: "#928560",
      weight: 600,
    });
  drawDrink(
    ctx,
    state.drink,
    {
      x: x + (compact ? 0 : 5),
      y: y + (compact ? -7 : -9),
      w: compact ? 58 : 80,
      h: compact ? 76 : 111,
    },
    { time, ready: correct },
  );
  const cupX = x + (compact ? 64 : 96),
    cupY = y + (compact ? 7 : 15);
  button(ctx, targets, ui, {
    id: "cup-type",
    label: `${state.drink.cup === "hot" ? "Hot" : "Iced"} cup. Change cup type`,
    text: state.drink.cup === "hot" ? "Hot cup" : "Iced cup",
    x: cupX,
    y: cupY,
    w: compact ? 79 : 94,
    h: 44,
    action: game({
      type: "SET_CUP",
      cup: state.drink.cup === "hot" ? "iced" : "hot",
    }),
    disabled: !available,
    small: compact,
    fill: "#fff9e8",
  });
  button(ctx, targets, ui, {
    id: "remake",
    label: "Remake drink with a fresh cup",
    icon: "reset",
    x: cupX + (compact ? 84 : 102),
    y: cupY,
    w: 42,
    h: 44,
    action: game({ type: "CLEAR_DRINK" }),
    disabled: !available,
    fill: "#fff9e8",
  });
  const components = Object.keys(ingredientLabels)
    .filter((key) => state.drink[key] > 0)
    .map((key) => `${state.drink[key]} ${ingredientLabels[key]}`)
    .join(" · ");
  if (!compact)
    wrap(
      ctx,
      components || "An empty cup, full of possibility.",
      cupX,
      y + 72,
      165,
      { size: 10, lineHeight: 14, color: "#8b8966", maxLines: 3 },
    );
  else
    label(ctx, components || "A fresh little cup.", cupX, y + 63, {
      size: 7.5,
      color: "#8c8966",
      maxWidth: 135,
    });
  const foodX = compact ? x + w - 112 : x + 276;
  if (state.food) {
    drawFood(
      ctx,
      state.food.id,
      {
        x: foodX,
        y: y + (compact ? -3 : 2),
        w: compact ? 76 : 100,
        h: compact ? 54 : 80,
      },
      { time, warm: true },
    );
    label(
      ctx,
      foods[state.food.id].shortName,
      foodX + (compact ? 37 : 50),
      y + (compact ? 59 : 98),
      {
        size: compact ? 8 : 12,
        color: "#9c875a",
        align: "center",
        maxWidth: compact ? 78 : 140,
      },
    );
  } else {
    ctx.save();
    ctx.strokeStyle = "#d4c5a3";
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.ellipse(
      foodX + (compact ? 35 : 48),
      y + (compact ? 29 : 43),
      compact ? 28 : 37,
      compact ? 14 : 22,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.restore();
    label(
      ctx,
      "For warm food",
      foodX + (compact ? 36 : 48),
      y + (compact ? 59 : 98),
      { size: compact ? 7 : 10, color: "#b0a17b", align: "center" },
    );
  }
  button(ctx, targets, ui, {
    id: "clear-food",
    label: "Clear food from tray",
    icon: "close",
    x: x + w - 46,
    y: y + (compact ? 8 : 28),
    w: 38,
    h: 44,
    action: game({ type: "CLEAR_FOOD" }),
    disabled: !available || !state.food,
    fill: "#fff9e8",
  });
  const serveW = compact ? W - 28 : 310;
  button(ctx, targets, ui, {
    id: "serve",
    label: `Serve ${selected ? customers[selected.profileId].name : "order"}${correct ? ". Order ready." : ""}`,
    text: correct
      ? `Serve ${customers[selected.profileId].name} · made with care`
      : `Serve ${selected ? customers[selected.profileId].name : "order"}`,
    icon: correct ? "check" : "coffee",
    x: (W - serveW) / 2,
    y: H - (compact ? 53 : 65),
    w: serveW,
    h: compact ? 44 : 46,
    action: game({ type: "SERVE" }),
    disabled: !available || !selected,
    primary: correct,
    fill: correct ? undefined : "#f5e8c9",
    color: correct ? undefined : "#8b7952",
  });
  if (!compact) {
    label(
      ctx,
      "Click a guest to choose their order. Machines run together.",
      W / 2,
      H - 8,
      { size: 9, color: "#967f58", align: "center" },
    );
  }
}

function tipJar(ctx, state, W, H) {
  const x = W - 206,
    y = H - 159;
  ctx.save();
  ctx.fillStyle = "#e4d2a5";
  ctx.beginPath();
  ctx.ellipse(x + 70, y + 102, 64, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  round(ctx, x + 27, y + 11, 86, 94, 21, "#faf3d47d", "#c4b689");
  round(ctx, x + 23, y, 94, 19, 8, "#c7c9a3", "#afa778");
  round(ctx, x + 37, y + 43, 66, 42, 7, "#fff9e6", "#dfd1a6");
  label(ctx, "little joys", x + 70, y + 52, {
    font: "Fraunces",
    size: 12,
    align: "center",
    color: "#898355",
  });
  label(ctx, formatMoney(state.tips), x + 70, y + 71, {
    size: 13,
    align: "center",
    color: "#849666",
    weight: 600,
  });
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x + 44 + i * 19, y + 94 - i * 2, 9, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#dbc181";
    ctx.fill();
  }
  label(ctx, `${state.served}/6 lovely coffees`, x + 70, y + 124, {
    size: 10,
    align: "center",
    color: "#8d805a",
  });
  ctx.restore();
}

function notice(ctx, state, ui, W, compact, targets) {
  if (!state.notice) return;
  const w = Math.min(W - 28, 650),
    x = (W - w) / 2,
    y = compact ? 105 : 83;
  ctx.font = '500 11px "DM Sans",sans-serif';
  let count = Math.ceil(ctx.measureText(state.notice.text).width / (w - 74));
  const h = Math.max(44, Math.min(80, count * 17 + 18));
  ctx.save();
  shadow(ctx, 12, "#84755420", 4);
  round(
    ctx,
    x,
    y,
    w,
    h,
    11,
    state.notice.type === "error" ? "#fff0df" : "#fcffef",
    state.notice.type === "error" ? "#d7aa84" : "#bdcf9c",
  );
  ctx.restore();
  icon(
    ctx,
    state.notice.type === "error"
      ? "coffee"
      : state.notice.type === "success"
        ? "check"
        : "chat",
    x + 11,
    y + 12,
    18,
    state.notice.type === "error" ? "#b4805b" : "#7a9462",
  );
  wrap(ctx, state.notice.text, x + 38, y + 11, w - 78, {
    size: 11,
    lineHeight: 17,
    color: state.notice.type === "error" ? "#9c714f" : "#74885c",
    maxLines: 3,
  });
  button(ctx, targets, ui, {
    id: "notice-close",
    label: "Dismiss message",
    icon: "close",
    x: x + w - 38,
    y: y + (h - 34) / 2,
    w: 32,
    h: 34,
    action: game({ type: "DISMISS_NOTICE" }),
    fill: "transparent",
  });
}

/** Render the entire playable view, including every display and hit target. */
export function drawGame(
  ctx,
  state,
  ui,
  { width: W, height: H, time = 0, viewport = null },
) {
  const compact = W < 1180,
    targets = [];
  const counterY = compact ? Math.max(280, H - 540) : H * 0.46;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f9eddb";
  ctx.fillRect(0, 0, W, H);
  drawRoom(
    ctx,
    { x: 0, y: compact ? 98 : 73, w: W, h: counterY - (compact ? 69 : 30) },
    { time },
  );
  const hands = guests(ctx, state, ui, W, compact, counterY, targets, time);
  drawCounter(ctx, { x: 0, y: counterY, w: W, h: H - counterY }, { time });
  hands.forEach((hand) => {
    ctx.fillStyle = hand.skin || "#ddb18d";
    ctx.strokeStyle = "#b98768";
    ctx.lineWidth = 1;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(
        hand.center + side * hand.width * 0.27,
        counterY + 3,
        compact ? 9 : 13,
        compact ? 5 : 7,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.stroke();
    });
  });
  notebook(ctx, state, W, compact, counterY);
  if (compact) {
    const gap = 12,
      w = (W - 40) / 2,
      y = counterY + 108;
    Object.keys(stations).forEach((station, i) =>
      machine(
        ctx,
        state,
        ui,
        station,
        {
          x: 14 + (i % 2) * (w + gap),
          y: y + Math.floor(i / 2) * 124,
          w,
          h: 112,
        },
        true,
        targets,
        time,
      ),
    );
  } else {
    const w = Math.min(190, W * 0.15),
      y = counterY + 33;
    const positions = [26, w + 56, W - w * 2 - 56, W - w - 26];
    Object.keys(stations).forEach((station, i) =>
      machine(
        ctx,
        state,
        ui,
        station,
        { x: positions[i], y: y + (i === 1 || i === 2 ? 9 : 0), w, h: 312 },
        false,
        targets,
        time,
      ),
    );
    tipJar(ctx, state, W, H);
  }
  syrups(ctx, state, ui, W, H, compact, targets);
  tray(ctx, state, ui, W, H, compact, targets, time);
  hud(ctx, state, ui, W, compact, targets);
  notice(ctx, state, ui, W, compact, targets);
  let overlay = null;
  if (ui.modal || state.phase === "paused" || state.phase === "summary") {
    targets.length = 0;
    const vy = viewport?.y || 0,
      vh = viewport?.height || H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, vy, W, vh);
    ctx.clip();
    ctx.translate(0, vy);
    overlay = drawOverlay(ctx, state, ui, { width: W, height: vh }, (target) =>
      targets.push({ ...target, y: target.y + vy }),
    );
    if (overlay?.scrollRect)
      overlay = {
        ...overlay,
        scrollRect: { ...overlay.scrollRect, y: overlay.scrollRect.y + vy },
      };
    ctx.restore();
  }
  ctx.restore();
  return { targets, overlay, compact };
}
