import { recipes, foods, customers } from "./data.js";
import { formatMoney, getSelectedCustomer } from "./game.js";

const C = {
  ink: "#493f36",
  muted: "#81776b",
  paper: "#fffaf0",
  line: "#e0d7c4",
  sage: "#c6d8ba",
  sageDark: "#47634d",
  coral: "#eba794",
  peach: "#f8e3d6",
  gold: "#edc46e",
  cream: "#f7f0df",
  white: "#fffef8",
  dim: "rgba(57, 48, 43, .40)",
};

function round(ctx, x, y, w, h, r = 16, fill = C.paper, stroke = null) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function text(
  ctx,
  value,
  x,
  y,
  size = 14,
  color = C.ink,
  weight = 500,
  align = "left",
  serif = false,
) {
  ctx.font = `${weight} ${size}px ${serif ? "Fraunces" : '"DM Sans"'}, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  ctx.fillText(String(value), x, y);
}

function lines(ctx, value, maxWidth, size = 14, weight = 500, serif = false) {
  ctx.font = `${weight} ${size}px ${serif ? "Fraunces" : '"DM Sans"'}, sans-serif`;
  const output = [];
  for (const paragraph of String(value || "").split("\n")) {
    if (!paragraph) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        output.push(line);
        line = word;
      } else line = candidate;
    }
    output.push(line);
  }
  return output;
}

function paragraph(
  ctx,
  value,
  x,
  y,
  maxWidth,
  size = 14,
  color = C.muted,
  weight = 500,
  leading = 1.5,
  align = "left",
) {
  const wrapped = lines(ctx, value, maxWidth, size, weight);
  wrapped.forEach((line, index) =>
    text(ctx, line, x, y + index * size * leading, size, color, weight, align),
  );
  return wrapped.length * size * leading;
}

function leaf(ctx, x, y, size, rotation = 0, color = C.sage) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.beginPath();
  ctx.moveTo(0, size * 0.75);
  ctx.bezierCurveTo(
    -size * 0.9,
    size * 0.05,
    -size * 0.45,
    -size * 0.8,
    size * 0.15,
    -size * 0.9,
  );
  ctx.bezierCurveTo(
    size * 0.8,
    -size * 0.4,
    size * 0.65,
    size * 0.5,
    0,
    size * 0.75,
  );
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, size * 0.66);
  ctx.lineTo(size * 0.09, -size * 0.62);
  ctx.strokeStyle = C.sageDark;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function heart(ctx, x, y, size, color = C.coral) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-19, -4, -10, -17, 0, -8);
  ctx.bezierCurveTo(10, -17, 19, -4, 0, 7);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function cup(ctx, x, y, size = 70, color = C.sage) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 90, size / 90);
  ctx.beginPath();
  ctx.ellipse(0, 33, 48, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#e8dcc5";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 29, 45, 9, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.white;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(33, 1, 15, 16, -0.2, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.stroke();
  round(ctx, -34, -18, 66, 51, 15, color);
  ctx.beginPath();
  ctx.ellipse(-1, -17, 32, 8, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#7d5942";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-1, -17, 23, 5.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#d7ad7e";
  ctx.fill();
  heart(ctx, -1, -17, 8, "#fff2d4");
  ctx.fillStyle = C.ink;
  for (const eye of [-11, 9]) {
    ctx.beginPath();
    ctx.ellipse(eye, 5, 2.2, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(-1, 8, 5, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#df9a83";
  for (const cheek of [-19, 17]) {
    ctx.beginPath();
    ctx.ellipse(cheek, 12, 4.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#a8b9a0";
  ctx.lineWidth = 2.6;
  ctx.lineCap = "round";
  for (const sx of [-13, 4, 20]) {
    ctx.beginPath();
    ctx.moveTo(sx, -34);
    ctx.bezierCurveTo(sx - 9, -43, sx + 9, -48, sx, -58);
    ctx.stroke();
  }
  ctx.restore();
}

function star(ctx, x, y, size, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? size * 0.48 : size;
    const px = x + Math.cos(angle) * radius,
      py = y + Math.sin(angle) * radius;
    if (!i) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = fill === C.gold ? "#d4aa50" : C.line;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function button(
  ctx,
  ui,
  addTarget,
  {
    id,
    label,
    x,
    y,
    w,
    h = 44,
    action,
    primary = false,
    active = false,
    disabled = false,
    size = 14,
  },
) {
  const hover = ui.hoverId === id,
    focus = ui.focusId === id;
  const fill = disabled
    ? "#eee9de"
    : primary
      ? hover
        ? "#38583f"
        : C.sageDark
      : active
        ? C.sage
        : hover
          ? "#f2e8d6"
          : C.white;
  round(ctx, x, y + (hover ? -1 : 0), w, h, 12, fill, primary ? null : C.line);
  if (focus) round(ctx, x - 3, y - 3, w + 6, h + 6, 15, null, "#bf795d");
  text(
    ctx,
    label,
    x + w / 2,
    y + (h - size) / 2 - 1,
    size,
    disabled ? "#999085" : primary ? C.white : C.ink,
    700,
    "center",
  );
  const targetH = Math.max(44, h);
  addTarget({
    id,
    label,
    x,
    y: y - (targetH - h) / 2,
    w,
    h: targetH,
    action,
    disabled,
  });
}

function closeButton(ctx, ui, addTarget, panel) {
  const x = panel.x + panel.w - 51,
    y = panel.y + 17,
    id = "overlay-close";
  round(ctx, x, y, 34, 34, 11, ui.hoverId === id ? "#eadccc" : "#f3ebdc");
  if (ui.focusId === id) round(ctx, x - 3, y - 3, 40, 40, 14, null, "#bf795d");
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 12);
  ctx.lineTo(x + 22, y + 22);
  ctx.moveTo(x + 22, y + 12);
  ctx.lineTo(x + 12, y + 22);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.stroke();
  addTarget({
    id,
    label: "Close window",
    x: x - 5,
    y: y - 5,
    w: 44,
    h: 44,
    action: { type: "ui", value: "close" },
  });
}

function panel(ctx, width, height, idealW, idealH) {
  const w = Math.min(idealW, width - 28),
    h = Math.min(idealH, height - 28);
  const x = (width - w) / 2,
    y = (height - h) / 2;
  ctx.fillStyle = C.dim;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.shadowColor = "rgba(43, 36, 29, .18)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 10;
  round(ctx, x, y, w, h, 25, C.paper);
  ctx.restore();
  round(ctx, x + 7, y + 7, w - 14, h - 14, 20, null, "#eadfcb");
  leaf(ctx, x + 30, y + h - 27, 13, -0.8);
  leaf(ctx, x + 48, y + h - 26, 11, 0.3);
  return { x, y, w, h };
}

function scrollArea(ctx, ui, rectangle, contentHeight, drawContent) {
  const maxScroll = Math.max(0, contentHeight - rectangle.h);
  const scroll = Math.max(
    0,
    Math.min(maxScroll, Number(ui.overlayScroll) || 0),
  );
  ctx.save();
  ctx.beginPath();
  ctx.rect(rectangle.x, rectangle.y, rectangle.w, rectangle.h);
  ctx.clip();
  drawContent(scroll);
  ctx.restore();
  if (maxScroll > 0) {
    // A soft paper edge keeps clipped text and illustrations from ending abruptly.
    const fadeH = Math.min(18, rectangle.h / 4);
    if (scroll > 0) {
      const fade = ctx.createLinearGradient(
        0,
        rectangle.y,
        0,
        rectangle.y + fadeH,
      );
      fade.addColorStop(0, C.paper);
      fade.addColorStop(1, "rgba(255, 250, 240, 0)");
      ctx.fillStyle = fade;
      ctx.fillRect(rectangle.x, rectangle.y, rectangle.w, fadeH);
    }
    if (scroll < maxScroll) {
      const y = rectangle.y + rectangle.h - fadeH;
      const fade = ctx.createLinearGradient(0, y, 0, y + fadeH);
      fade.addColorStop(0, "rgba(255, 250, 240, 0)");
      fade.addColorStop(1, C.paper);
      ctx.fillStyle = fade;
      ctx.fillRect(rectangle.x, y, rectangle.w, fadeH);
    }
    const trackX = rectangle.x + rectangle.w - 4;
    round(ctx, trackX, rectangle.y + 4, 3, rectangle.h - 8, 2, "#eee4d3");
    const knobH = Math.max(
      28,
      ((rectangle.h - 8) * rectangle.h) / contentHeight,
    );
    const knobY =
      rectangle.y + 4 + (scroll / maxScroll) * (rectangle.h - 8 - knobH);
    round(ctx, trackX, knobY, 3, knobH, 2, "#9bb18f");
  }
  return { maxScroll, scrollRect: rectangle };
}

function recipeBook(ctx, state, ui, options, addTarget) {
  const p = panel(ctx, options.width, options.height, 860, 760);
  const pad = p.w < 500 ? 22 : 33;
  const compact = p.w < 620;
  closeButton(ctx, ui, addTarget, p);
  text(
    ctx,
    "FROM OUR LITTLE KITCHEN",
    p.x + pad,
    p.y + 28,
    10,
    C.sageDark,
    800,
  );
  text(
    ctx,
    "The house recipes",
    p.x + pad,
    p.y + 49,
    compact ? 28 : 35,
    C.ink,
    550,
    "left",
    true,
  );
  const descH = paragraph(
    ctx,
    "A pinch of care. Exactly the right ingredients.",
    p.x + pad,
    p.y + 94,
    p.w - pad * 2,
    13,
  );
  const filterY = p.y + 101 + descH;
  const filterWidth = Math.min(160, (p.w - pad * 2 - 9) / 2);
  button(ctx, ui, addTarget, {
    id: "recipes-all",
    label: "All recipes",
    x: p.x + pad,
    y: filterY,
    w: filterWidth,
    h: 34,
    active: ui.recipeFilter !== "available",
    action: { type: "ui", value: "recipesAll" },
    size: 12,
  });
  button(ctx, ui, addTarget, {
    id: "recipes-available",
    label: "Today’s menu",
    x: p.x + pad + filterWidth + 9,
    y: filterY,
    w: filterWidth,
    h: 34,
    active: ui.recipeFilter === "available",
    action: { type: "ui", value: "recipesAvailable" },
    size: 12,
  });
  const rect = {
    x: p.x + pad,
    y: filterY + 50,
    w: p.w - pad * 2,
    h: Math.max(50, p.y + p.h - 46 - (filterY + 50)),
  };
  const gap = 12,
    cols = compact ? 1 : 2,
    cardW = (rect.w - gap * (cols - 1) - 8) / cols;
  const available = Object.values(recipes).filter(
    (recipe) => ui.recipeFilter !== "available" || recipe.day <= state.day,
  );
  const rows = [];
  for (let i = 0; i < available.length; i += cols) {
    const entries = available.slice(i, i + cols);
    const cardHeights = entries.map(
      (recipe) =>
        67 +
        lines(ctx, recipe.description, cardW - 32, 11).length * 15 +
        recipe.steps.length * 21,
    );
    rows.push({ entries, height: Math.max(...cardHeights) });
  }
  const recipesH = rows.reduce((sum, row) => sum + row.height + gap, 0);
  const ovenHeight = compact ? 156 : 114;
  const result = scrollArea(
    ctx,
    ui,
    rect,
    recipesH + ovenHeight + 24,
    (scroll) => {
      let cy = rect.y - scroll;
      rows.forEach((row) => {
        row.entries.forEach((recipe, index) => {
          const x = rect.x + index * (cardW + gap),
            locked = recipe.day > state.day;
          round(
            ctx,
            x,
            cy,
            cardW,
            row.height,
            15,
            locked ? "#f0ebdf" : C.white,
            "#e6dece",
          );
          text(
            ctx,
            recipe.name,
            x + 15,
            cy + 14,
            17,
            locked ? "#807668" : C.ink,
            550,
            "left",
            true,
          );
          text(
            ctx,
            locked ? `DAY ${recipe.day}` : formatMoney(recipe.price),
            x + cardW - 15,
            cy + 18,
            10,
            locked ? "#998776" : C.sageDark,
            800,
            "right",
          );
          const desc = paragraph(
            ctx,
            recipe.description,
            x + 15,
            cy + 42,
            cardW - 30,
            11,
            C.muted,
            500,
            1.36,
          );
          let stepY = cy + 50 + desc;
          recipe.steps.forEach((step, stepIndex) => {
            ctx.beginPath();
            ctx.arc(x + 21, stepY + 6, 7, 0, Math.PI * 2);
            ctx.fillStyle = locked ? "#e1d9c9" : "#e1ead8";
            ctx.fill();
            text(
              ctx,
              stepIndex + 1,
              x + 21,
              stepY + 1,
              8,
              C.sageDark,
              700,
              "center",
            );
            text(
              ctx,
              step,
              x + 35,
              stepY,
              compact ? 11 : 12,
              locked ? "#8c8276" : C.ink,
              500,
            );
            stepY += 21;
          });
        });
        cy += row.height + gap;
      });
      text(
        ctx,
        "A little something warm",
        rect.x + 1,
        cy + 9,
        21,
        C.ink,
        550,
        "left",
        true,
      );
      text(
        ctx,
        "OVEN TIME · READY MEANS WARM",
        rect.x + 2,
        cy + 39,
        9,
        C.muted,
        700,
      );
      if (compact) {
        Object.values(foods).forEach((food, i) => {
          const y = cy + 62 + i * 30;
          round(ctx, rect.x, y, cardW, 26, 8, "#f4e8d6");
          text(ctx, food.name, rect.x + 11, y + 6, 11, C.ink, 600);
          text(
            ctx,
            `${food.duration} seconds`,
            rect.x + cardW - 11,
            y + 6,
            11,
            "#896d47",
            600,
            "right",
          );
        });
      } else {
        const foodW = (rect.w - 28) / 3;
        Object.values(foods).forEach((food, i) => {
          const x = rect.x + i * (foodW + 10);
          round(ctx, x, cy + 61, foodW, 53, 11, "#f4e8d6");
          text(ctx, food.name, x + 12, cy + 71, 12, C.ink, 600);
          text(
            ctx,
            `${food.duration} seconds in the oven`,
            x + 12,
            cy + 90,
            10,
            "#896d47",
            500,
          );
        });
      }
    },
  );
  text(
    ctx,
    result.maxScroll > 0
      ? "Scroll to see the whole menu"
      : "Good coffee starts with the little details.",
    p.x + p.w / 2,
    p.y + p.h - 27,
    10,
    C.muted,
    500,
    "center",
  );
  return result;
}

const HELP_STEPS = [
  [
    "Meet your guests",
    "Select a guest to read their order. Talk to them for a little story, extra patience, and a better tip.",
  ],
  [
    "Start a little magic",
    "Click a machine to start it. When it says ready, click again to collect. Several machines can work together.",
  ],
  [
    "Pick the right setting",
    "Choose milk, foam, or cold milk at the milk station. Choose water or tea at the kettle. Pick a pastry or toastie for the oven.",
  ],
  [
    "Make it just right",
    "Match the recipe, use a hot or iced cup, and warm any food. Extra ingredients count too! A fresh cup lets you try again.",
  ],
  [
    "Make their morning",
    "Serve a complete tray. Practice has instant machines and no rush. Open the café for a 3-minute shift; aim to serve 6 guests.",
  ],
];

function help(ctx, state, ui, options, addTarget) {
  const p = panel(ctx, options.width, options.height, 620, 705),
    compact = p.w < 450;
  const pad = compact ? 24 : 36;
  closeButton(ctx, ui, addTarget, p);
  text(
    ctx,
    "A VERY SMALL BARISTA SCHOOL",
    p.x + pad,
    p.y + 28,
    10,
    C.sageDark,
    800,
  );
  text(
    ctx,
    "Welcome to your café",
    p.x + pad,
    p.y + 52,
    compact ? 27 : 34,
    C.ink,
    550,
    "left",
    true,
  );
  paragraph(
    ctx,
    "Small cups. Warm food. Good company.",
    p.x + pad,
    p.y + 97,
    p.w - pad * 2,
    13,
  );
  const rect = {
    x: p.x + pad,
    y: p.y + 135,
    w: p.w - pad * 2,
    h: Math.max(60, p.h - 226),
  };
  const rowHeights = HELP_STEPS.map(([, desc]) =>
    Math.max(
      61,
      30 +
        lines(ctx, desc, rect.w - 48, compact ? 12 : 13).length *
          (compact ? 18 : 19.5),
    ),
  );
  const totalHeight = rowHeights.reduce((sum, h) => sum + h + 11, 0) + 112;
  const result = scrollArea(ctx, ui, rect, totalHeight, (scroll) => {
    let y = rect.y - scroll;
    HELP_STEPS.forEach(([title, desc], i) => {
      ctx.beginPath();
      ctx.arc(rect.x + 15, y + 15, 15, 0, Math.PI * 2);
      ctx.fillStyle = [C.sage, C.peach, "#ece4c7", "#dbe6e2", "#f4d8c4"][i];
      ctx.fill();
      text(ctx, i + 1, rect.x + 15, y + 7, 14, C.ink, 700, "center");
      text(ctx, title, rect.x + 43, y + 2, 16, C.ink, 550, "left", true);
      paragraph(
        ctx,
        desc,
        rect.x + 43,
        y + 28,
        rect.w - 52,
        compact ? 12 : 13,
        C.muted,
        500,
        1.5,
      );
      y += rowHeights[i] + 11;
    });
    round(ctx, rect.x, y + 7, rect.w - 8, 99, 13, "#eee9dc");
    text(ctx, "A few handy shortcuts", rect.x + 14, y + 19, 11, C.ink, 700);
    paragraph(
      ctx,
      "Tab + Enter / Space: choose  ·  P: pause\nR: recipes  ·  C: chat  ·  ?: help  ·  M: sound\nEscape: close",
      rect.x + 14,
      y + 39,
      rect.w - 38,
      compact ? 10 : 11,
      C.muted,
      500,
      1.5,
    );
  });
  button(ctx, ui, addTarget, {
    id: "help-close",
    label:
      state.phase === "practice"
        ? "Let’s make a little coffee"
        : "Back to the counter",
    x: p.x + pad,
    y: p.y + p.h - 72,
    w: p.w - pad * 2,
    h: 44,
    primary: true,
    action: { type: "ui", value: "close" },
  });
  return result;
}

function portrait(ctx, profile, x, y, size = 66) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 66, size / 66);
  ctx.beginPath();
  ctx.arc(0, 0, 33, 0, Math.PI * 2);
  ctx.fillStyle = "#f0e1c9";
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(0, 36, 28, 24, 0, 0, Math.PI * 2);
  ctx.fillStyle = profile?.shirtColor || C.coral;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, -3, 22, 28, 0, 0, Math.PI * 2);
  ctx.fillStyle = profile?.hairColor || "#543e33";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 2, 17, 20, 0, 0, Math.PI * 2);
  ctx.fillStyle = profile?.skin || "#dbaa82";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-20, -7);
  ctx.quadraticCurveTo(-14, -33, 13, -17);
  ctx.lineTo(20, -2);
  ctx.quadraticCurveTo(8, -5, 2, -15);
  ctx.quadraticCurveTo(-10, -6, -20, -7);
  ctx.fillStyle = profile?.hairColor || "#543e33";
  ctx.fill();
  ctx.fillStyle = C.ink;
  for (const ex of [-6, 6]) {
    ctx.beginPath();
    ctx.ellipse(ex, 3, 1.6, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 8, 3.8, 0.2, Math.PI - 0.2);
  ctx.strokeStyle = C.ink;
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#df9283";
  for (const ex of [-11, 11]) {
    ctx.beginPath();
    ctx.ellipse(ex, 8, 3.5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

function chat(ctx, state, ui, options, addTarget) {
  const customer = getSelectedCustomer(state),
    profile = customers[customer?.profileId];
  const p = panel(ctx, options.width, options.height, 620, 560),
    compact = p.w < 450;
  const pad = compact ? 24 : 36;
  closeButton(ctx, ui, addTarget, p);
  portrait(ctx, profile, p.x + pad + 32, p.y + 60, 64);
  text(
    ctx,
    "A LITTLE CONVERSATION",
    p.x + pad + 80,
    p.y + 29,
    compact ? 8 : 10,
    C.sageDark,
    800,
  );
  text(
    ctx,
    profile?.name || "Good company",
    p.x + pad + 80,
    p.y + 48,
    compact ? 27 : 32,
    C.ink,
    550,
    "left",
    true,
  );
  paragraph(
    ctx,
    profile?.role || "Your neighborhood regular",
    p.x + pad + 80,
    p.y + 86,
    p.w - pad * 2 - 80,
    compact ? 10 : 12,
  );
  const rect = {
    x: p.x + pad,
    y: p.y + 125,
    w: p.w - pad * 2,
    h: Math.max(70, p.h - 211),
  };
  const greeting =
    profile?.greeting || "Thanks for making a little time for me.";
  const topic = customer?.chatted
    ? customer.chatReply
    : customer?.chatTopic || "It’s a lovely day for a warm drink.";
  const greetingH =
    lines(ctx, greeting, rect.w - 8, compact ? 12 : 13).length * 19;
  const topicH =
    lines(ctx, topic, rect.w - 40, compact ? 15 : 17).length *
    (compact ? 23 : 26);
  const bubbleH = topicH + 34,
    choices = customer?.chatOptions || [];
  const choiceHeights = choices
    .slice(0, 2)
    .map((choice) =>
      Math.max(
        43,
        lines(ctx, choice.label, rect.w - 38, compact ? 12 : 13).length * 18 +
          22,
      ),
    );
  const contentHeight =
    greetingH +
    21 +
    bubbleH +
    (customer?.chatted
      ? 44
      : 28 + choiceHeights.reduce((sum, h) => sum + h + 10, 0));
  const result = scrollArea(ctx, ui, rect, contentHeight, (scroll) => {
    let y = rect.y - scroll;
    paragraph(
      ctx,
      `“${greeting}”`,
      rect.x + 1,
      y,
      rect.w - 8,
      compact ? 12 : 13,
      C.muted,
      500,
      1.46,
    );
    y += greetingH + 21;
    round(
      ctx,
      rect.x,
      y,
      rect.w - 8,
      bubbleH,
      17,
      customer?.chatted ? "#e5ebdb" : "#f6e4d6",
    );
    paragraph(
      ctx,
      `“${topic}”`,
      rect.x + 16,
      y + 17,
      rect.w - 40,
      compact ? 15 : 17,
      C.ink,
      500,
      1.52,
    );
    y += bubbleH + 20;
    if (customer?.chatted) {
      heart(ctx, rect.x + 9, y + 9, 10, "#b17b65");
      text(
        ctx,
        "A little listening goes a long way.",
        rect.x + 27,
        y + 2,
        compact ? 10 : 12,
        C.sageDark,
        600,
      );
    } else {
      text(ctx, "YOU SAY…", rect.x + 2, y, 9, C.muted, 800);
      y += 24;
      choices.slice(0, 2).forEach((choice, i) => {
        const id = `chat-${i}`,
          bh = choiceHeights[i],
          x = rect.x,
          bw = rect.w - 8;
        const visibleY = Math.max(y, rect.y),
          visibleBottom = Math.min(y + bh, rect.y + rect.h);
        round(
          ctx,
          x,
          y,
          bw,
          bh,
          12,
          ui.hoverId === id ? "#e5eada" : C.white,
          C.line,
        );
        if (ui.focusId === id)
          round(ctx, x + 2, y + 2, bw - 4, bh - 4, 10, null, "#bf795d");
        paragraph(
          ctx,
          choice.label,
          x + 15,
          y + 11,
          bw - 30,
          compact ? 12 : 13,
          C.ink,
          600,
          1.5,
        );
        if (visibleBottom > visibleY)
          addTarget({
            id,
            label: choice.label,
            x,
            y: visibleY,
            w: bw,
            h: visibleBottom - visibleY,
            action: { type: "game", value: { type: "CHAT", choice: i } },
          });
        y += bh + 10;
      });
    }
  });
  button(ctx, ui, addTarget, {
    id: "chat-close",
    label: customer?.chatted ? "Back to the coffee" : "Talk a little later",
    x: p.x + pad,
    y: p.y + p.h - 66,
    w: p.w - pad * 2,
    h: 40,
    primary: !!customer?.chatted,
    action: { type: "ui", value: "close" },
  });
  return result;
}

function pause(ctx, state, ui, options, addTarget) {
  const p = panel(ctx, options.width, options.height, 420, 395);
  const scale = Math.min(1, p.h / 395);
  cup(ctx, p.x + p.w / 2, p.y + 103 * scale, 89 * scale);
  leaf(ctx, p.x + p.w / 2 - 75, p.y + 96 * scale, 15 * scale, -0.8);
  leaf(ctx, p.x + p.w / 2 + 77, p.y + 100 * scale, 17 * scale, 0.6);
  text(
    ctx,
    "A LITTLE BREATHER",
    p.x + p.w / 2,
    p.y + 164 * scale,
    10,
    C.sageDark,
    800,
    "center",
  );
  text(
    ctx,
    "Your coffee can wait.",
    p.x + p.w / 2,
    p.y + 189 * scale,
    Math.max(24, (p.w < 370 ? 27 : 31) * scale),
    C.ink,
    550,
    "center",
    true,
  );
  paragraph(
    ctx,
    "The clock, customers, and machines are all paused. Take your time.",
    p.x + p.w / 2,
    p.y + (p.h < 340 ? 215 : 237) * scale,
    p.w - 65,
    Math.max(11, 13 * scale),
    C.muted,
    500,
    1.5,
    "center",
  );
  button(ctx, ui, addTarget, {
    id: "resume",
    label: "Back to the warm little chaos",
    x: p.x + 29,
    y: p.y + p.h - 75,
    w: p.w - 58,
    h: 44,
    primary: true,
    action: { type: "game", value: { type: "RESUME" } },
    size: p.w < 370 ? 12 : 14,
  });
  return null;
}

function summary(ctx, state, ui, options, addTarget) {
  const p = panel(ctx, options.width, options.height, 560, 625),
    compact = p.w < 450;
  const center = p.x + p.w / 2,
    pad = compact ? 25 : 36,
    short = p.h < 500;
  const title =
    state.served >= 6
      ? "You made their morning."
      : state.served >= 3
        ? "A lovely little shift."
        : "Every barista starts here.";
  const titleSize = short ? 24 : compact ? 28 : 34;
  const titleLeading = short ? 29 : compact ? 34 : 41;
  const titleLines = lines(
    ctx,
    title,
    p.w - pad * 2 - (short ? 82 : 0),
    titleSize,
    550,
    true,
  );
  const earned = state.served >= 6 ? 3 : state.served >= 3 ? 2 : 1;
  const nextDay = state.day + 1;
  const flavor =
    nextDay === 2
      ? "Tomorrow: chocolate, vanilla, and the next chapter of your regulars’ stories."
      : nextDay === 3
        ? "Tomorrow: iced lattes, caramel, and a few familiar faces with new stories."
        : "Tomorrow brings familiar faces, a fresh tip jar, and another chapter of café life.";
  const bottom = p.y + p.h;
  const rect = {
    x: p.x + 15,
    y: p.y + 20,
    w: p.w - 30,
    h: Math.max(40, p.h - 193),
  };
  const starsOffset = short
    ? 38 + titleLines.length * titleLeading
    : 139 + titleLines.length * titleLeading + 13;
  const statsOffset = starsOffset + (short ? 23 : 29),
    statsH = short ? 61 : 77;
  const flavorOffset = statsOffset + statsH + (short ? 17 : 21);
  const flavorH =
    lines(ctx, flavor, p.w - pad * 2 - 5, compact ? 12 : 13).length *
    (compact ? 18 : 19.5);
  const contentHeight = flavorOffset + flavorH + 12;
  const result = scrollArea(ctx, ui, rect, contentHeight, (scroll) => {
    const y = rect.y - scroll;
    if (short) {
      cup(ctx, p.x + pad + 29, y + 38, 57, C.coral);
      text(
        ctx,
        `DAY ${String(state.day).padStart(2, "0")} · CAFÉ CLOSED`,
        p.x + pad + 78,
        y + 7,
        compact ? 8 : 9,
        C.sageDark,
        800,
      );
      titleLines.forEach((line, i) =>
        text(
          ctx,
          line,
          p.x + pad + 78,
          y + 29 + i * titleLeading,
          titleSize,
          C.ink,
          550,
          "left",
          true,
        ),
      );
    } else {
      cup(ctx, center, y + 53, compact ? 67 : 76, C.coral);
      text(
        ctx,
        `DAY ${String(state.day).padStart(2, "0")} · THE CAFÉ IS CLOSED`,
        center,
        y + 112,
        compact ? 9 : 10,
        C.sageDark,
        800,
        "center",
      );
      titleLines.forEach((line, i) =>
        text(
          ctx,
          line,
          center,
          y + 134 + i * titleLeading,
          titleSize,
          C.ink,
          550,
          "center",
          true,
        ),
      );
    }
    for (let i = 0; i < 3; i++)
      star(
        ctx,
        center + (i - 1) * (short ? 27 : 36),
        y + starsOffset,
        short ? 9 : 13,
        i < earned ? C.gold : "#eee7d7",
      );
    const statW = (p.w - pad * 2 - 16) / 3;
    [
      ["GUESTS SERVED", state.served],
      ["HAPPY TIPS", formatMoney(state.tips)],
      ["YOUR SCORE", state.score],
    ].forEach(([label, value], i) => {
      const x = p.x + pad + i * (statW + 8),
        statY = y + statsOffset;
      round(ctx, x, statY, statW, statsH, 13, i === 1 ? "#e5ecdc" : "#f2ebde");
      text(
        ctx,
        label,
        x + statW / 2,
        statY + (short ? 10 : 14),
        compact ? 7 : 9,
        C.muted,
        800,
        "center",
      );
      text(
        ctx,
        value,
        x + statW / 2,
        statY + (short ? 28 : 35),
        compact || short ? 24 : 29,
        i === 1 ? C.sageDark : C.ink,
        550,
        "center",
        true,
      );
    });
    paragraph(
      ctx,
      flavor,
      center,
      y + flavorOffset,
      p.w - pad * 2 - 5,
      compact ? 12 : 13,
      C.muted,
      500,
      1.5,
      "center",
    );
  });
  if (result.maxScroll > 0)
    text(
      ctx,
      "Scroll for the rest of your shift",
      center,
      bottom - 166,
      9,
      C.muted,
      500,
      "center",
    );
  button(ctx, ui, addTarget, {
    id: "next-shift",
    label: `Open for day ${nextDay}`,
    x: p.x + pad,
    y: bottom - 153,
    w: p.w - pad * 2,
    h: 45,
    primary: true,
    action: { type: "game", value: { type: "NEXT_SHIFT" } },
  });
  button(ctx, ui, addTarget, {
    id: "retry-shift",
    label: "Try this morning again",
    x: p.x + pad,
    y: bottom - 96,
    w: p.w - pad * 2,
    h: 37,
    action: { type: "game", value: { type: "RETRY_SHIFT" } },
    size: 12,
  });
  text(
    ctx,
    `BEST SHIFT · ${Number(state.best?.served) || 0} GUESTS · ${formatMoney(state.best?.tips)} TIPS`,
    center,
    bottom - 36,
    compact ? 8 : 10,
    C.muted,
    700,
    "center",
  );
  return result;
}

/** Draws every popup inside the game canvas; coordinates and targets use CSS pixels. */
export function drawOverlay(ctx, state, ui, options, addTarget) {
  if (!(options.width > 28 && options.height > 28)) return null;
  ctx.save();
  let result = null;
  if (ui.modal === "recipes")
    result = recipeBook(ctx, state, ui, options, addTarget);
  else if (ui.modal === "help")
    result = help(ctx, state, ui, options, addTarget);
  else if (ui.modal === "chat")
    result = chat(ctx, state, ui, options, addTarget);
  else if (state.phase === "summary")
    result = summary(ctx, state, ui, options, addTarget);
  else if (state.phase === "paused")
    result = pause(ctx, state, ui, options, addTarget);
  ctx.restore();
  return result;
}
