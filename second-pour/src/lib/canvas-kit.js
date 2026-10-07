export const palette = {
  ink: "#4b5148",
  muted: "#7d8875",
  green: "#56846e",
  darkGreen: "#416c56",
  cream: "#fffcf0",
  line: "#dedfc9",
  peach: "#f4ccbc",
  gold: "#c4a269",
};
export function round(ctx, x, y, w, h, r = 12, fill, stroke) {
  if (w <= 0 || h <= 0) return;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
}
export function label(
  ctx,
  text,
  x,
  y,
  {
    size = 13,
    color = palette.ink,
    font = "Nunito",
    weight = font === "DynaPuff" ? 400 : 600,
    align = "left",
    baseline = "middle",
    maxWidth,
  } = {},
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "${font}", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (maxWidth) ctx.fillText(String(text), x, y, maxWidth);
  else ctx.fillText(String(text), x, y);
}
export function wrap(
  ctx,
  text,
  x,
  y,
  width,
  {
    size = 12,
    lineHeight = 18,
    color = palette.ink,
    maxLines = 99,
    ...options
  } = {},
) {
  const font = options.font || "Nunito";
  ctx.font = `${options.weight || (font === "DynaPuff" ? 400 : 600)} ${size}px "${font}",sans-serif`;
  const lines = [];
  for (const paragraph of String(text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  lines.slice(0, maxLines).forEach((line, i) =>
    label(ctx, line, x, y + i * lineHeight, {
      size,
      color,
      ...options,
      baseline: "top",
    }),
  );
  return Math.min(lines.length, maxLines) * lineHeight;
}
export function shadow(ctx, blur = 12, color = "#7d715322", y = 5) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetY = y;
}
export function icon(ctx, name, x, y, size = 20, color = palette.green) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.7;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (name === "coffee") {
    ctx.roundRect(4, 9, 14, 12, 3);
    ctx.moveTo(18, 11);
    ctx.bezierCurveTo(25, 10, 25, 19, 18, 18);
    ctx.moveTo(8, 3);
    ctx.lineTo(8, 6);
    ctx.moveTo(13, 2);
    ctx.lineTo(13, 6);
  } else if (name === "book") {
    ctx.moveTo(12, 5);
    ctx.bezierCurveTo(9, 3, 5, 3, 2, 5);
    ctx.lineTo(2, 20);
    ctx.bezierCurveTo(6, 18, 9, 18, 12, 20);
    ctx.bezierCurveTo(15, 18, 19, 18, 22, 20);
    ctx.lineTo(22, 5);
    ctx.bezierCurveTo(18, 3, 15, 3, 12, 5);
    ctx.lineTo(12, 20);
  } else if (name === "sound" || name === "mute") {
    ctx.moveTo(3, 9);
    ctx.lineTo(7, 9);
    ctx.lineTo(13, 4);
    ctx.lineTo(13, 20);
    ctx.lineTo(7, 15);
    ctx.lineTo(3, 15);
    ctx.closePath();
    if (name === "sound") {
      ctx.moveTo(17, 8);
      ctx.bezierCurveTo(21, 10, 21, 14, 17, 16);
      ctx.moveTo(20, 4);
      ctx.bezierCurveTo(26, 9, 26, 15, 20, 20);
    } else {
      ctx.moveTo(17, 9);
      ctx.lineTo(23, 15);
      ctx.moveTo(23, 9);
      ctx.lineTo(17, 15);
    }
  } else if (name === "pause") {
    ctx.roundRect(6, 4, 4, 16, 1);
    ctx.roundRect(15, 4, 4, 16, 1);
  } else if (name === "play") {
    ctx.moveTo(8, 4);
    ctx.lineTo(20, 12);
    ctx.lineTo(8, 20);
    ctx.closePath();
  } else if (name === "check") {
    ctx.moveTo(5, 12);
    ctx.lineTo(10, 17);
    ctx.lineTo(20, 6);
  } else if (name === "close") {
    ctx.moveTo(6, 6);
    ctx.lineTo(18, 18);
    ctx.moveTo(18, 6);
    ctx.lineTo(6, 18);
  } else if (name === "chevron") {
    ctx.moveTo(6, 9);
    ctx.lineTo(12, 15);
    ctx.lineTo(18, 9);
  } else if (name === "reset") {
    ctx.arc(12, 13, 8, -Math.PI * 0.8, Math.PI * 0.8);
    ctx.moveTo(3, 4);
    ctx.lineTo(3, 10);
    ctx.lineTo(9, 9);
  } else if (name === "chat") {
    ctx.roundRect(2, 3, 20, 14, 5);
    ctx.moveTo(7, 17);
    ctx.lineTo(6, 22);
    ctx.lineTo(12, 17);
  } else if (name === "clock") {
    ctx.arc(12, 12, 9, 0, Math.PI * 2);
    ctx.moveTo(12, 6);
    ctx.lineTo(12, 12);
    ctx.lineTo(16, 14);
  } else if (name === "heart") {
    ctx.moveTo(12, 21);
    ctx.bezierCurveTo(-1, 13, 1, 3, 7, 3);
    ctx.bezierCurveTo(10, 3, 12, 6, 12, 6);
    ctx.bezierCurveTo(12, 6, 14, 3, 17, 3);
    ctx.bezierCurveTo(23, 3, 25, 13, 12, 21);
  } else if (name === "star") {
    for (let i = 0; i < 10; i++) {
      let a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? 4.5 : 10;
      let px = 12 + Math.cos(a) * r,
        py = 12 + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  } else if (name === "home") {
    ctx.moveTo(3, 11);
    ctx.lineTo(12, 3);
    ctx.lineTo(21, 11);
    ctx.moveTo(6, 9);
    ctx.lineTo(6, 21);
    ctx.lineTo(18, 21);
    ctx.lineTo(18, 9);
  } else if (name === "help") {
    ctx.arc(12, 12, 10, 0, Math.PI * 2);
    ctx.stroke();
    label(ctx, "?", 12, 12, { size: 17, weight: 600, align: "center", color });
    ctx.restore();
    return;
  } else if (name === "snow") {
    ctx.moveTo(12, 3);
    ctx.lineTo(12, 21);
    ctx.moveTo(4, 7);
    ctx.lineTo(20, 17);
    ctx.moveTo(4, 17);
    ctx.lineTo(20, 7);
  } else if (name === "plus") {
    ctx.moveTo(12, 5);
    ctx.lineTo(12, 19);
    ctx.moveTo(5, 12);
    ctx.lineTo(19, 12);
  }
  ctx.stroke();
  ctx.restore();
}
export function button(
  ctx,
  targets,
  ui,
  {
    id,
    label: accessible,
    text,
    x,
    y,
    w,
    h = 44,
    action,
    disabled = false,
    primary = false,
    icon: iconName,
    small = false,
    selected = false,
    fill,
    color,
  },
) {
  const hot = ui.hoverId === id || ui.focusId === id;
  ctx.save();
  round(
    ctx,
    x,
    y,
    w,
    h,
    Math.min(13, h / 3),
    disabled
      ? "#e9e6d8"
      : fill ||
          (primary
            ? hot
              ? "#3f7057"
              : "#56846e"
            : selected
              ? "#e3eed3"
              : hot
                ? "#f3f4df"
                : "#fffcef"),
    disabled ? "#dcdcc9" : primary ? "#3f6e55" : hot ? "#a4bd8f" : "#d9dfc6",
  );
  if (ui.focusId === id) {
    ctx.setLineDash([4, 3]);
    round(ctx, x - 3, y - 3, w + 6, h + 6, 15, null, "#879d69");
    ctx.setLineDash([]);
  }
  const ink = disabled
    ? "#969d87"
    : color || (primary ? "#fffbed" : palette.ink);
  if (iconName)
    icon(
      ctx,
      iconName,
      x + (text ? 12 : (w - 19) / 2),
      y + (h - 19) / 2,
      19,
      ink,
    );
  if (text) {
    const available = w - (iconName ? 34 : 12),
      fontSize = small ? 12 : 13;
    const words = String(text).split("\n");
    words.forEach((word, i) =>
      label(
        ctx,
        word,
        x + w / 2 + (iconName ? 8 : 0),
        y + h / 2 + (i - (words.length - 1) / 2) * 15,
        {
          size: fontSize,
          color: ink,
          weight: 600,
          align: "center",
          maxWidth: available,
        },
      ),
    );
  }
  ctx.restore();
  targets.push({
    id,
    label: accessible || text || id,
    x: x - (Math.max(44, w) - w) / 2,
    y: y - (Math.max(44, h) - h) / 2,
    w: Math.max(44, w),
    h: Math.max(44, h),
    action,
    disabled,
  });
}
