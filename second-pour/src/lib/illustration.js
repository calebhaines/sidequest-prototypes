// Soft, hand-drawn café illustrations. Everything is drawn at canvas resolution.
const ink = "#654c43";

function valid(rect) {
  return (
    rect &&
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    rect.w > 0 &&
    rect.h > 0
  );
}

function space(ctx, rect, width, height, contain = false) {
  if (!valid(rect)) return false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  if (contain) {
    const scale = Math.min(rect.w / width, rect.h / height);
    ctx.translate(
      rect.x + (rect.w - width * scale) / 2,
      rect.y + (rect.h - height * scale) / 2,
    );
    ctx.scale(scale, scale);
  } else {
    ctx.translate(rect.x, rect.y);
    ctx.scale(rect.w / width, rect.h / height);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  return true;
}

function path(ctx, commands, fill, stroke = null, lineWidth = 2) {
  ctx.beginPath();
  commands(ctx);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function round(ctx, x, y, w, h, radius, fill, stroke = null, width = 2) {
  if (w <= 0 || h <= 0) return;
  path(ctx, (p) => p.roundRect(x, y, w, h, radius), fill, stroke, width);
}

function oval(ctx, x, y, rx, ry, fill, stroke = null, width = 2) {
  if (rx <= 0 || ry <= 0) return;
  path(
    ctx,
    (p) => p.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2),
    fill,
    stroke,
    width,
  );
}

function line(ctx, x1, y1, x2, y2, color = ink, width = 2) {
  path(
    ctx,
    (p) => {
      p.moveTo(x1, y1);
      p.lineTo(x2, y2);
    },
    null,
    color,
    width,
  );
}

function gradient(ctx, x1, y1, x2, y2, colors) {
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  colors.forEach(([at, color]) => g.addColorStop(at, color));
  return g;
}

function shadow(ctx, x, y, rx, ry, opacity = 0.12) {
  oval(ctx, x, y, rx, ry, `rgba(88,65,45,${opacity})`);
}

function heart(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  path(
    ctx,
    (p) => {
      p.moveTo(0, 9);
      p.bezierCurveTo(-17, -2, -8, -14, 0, -5);
      p.bezierCurveTo(8, -14, 17, -2, 0, 9);
      p.closePath();
    },
    color,
  );
  ctx.restore();
}

function sparkle(ctx, x, y, size, color = "#f2bf64") {
  path(
    ctx,
    (p) => {
      p.moveTo(x, y - size);
      p.quadraticCurveTo(x + size * 0.2, y - size * 0.2, x + size, y);
      p.quadraticCurveTo(x + size * 0.2, y + size * 0.2, x, y + size);
      p.quadraticCurveTo(x - size * 0.2, y + size * 0.2, x - size, y);
      p.quadraticCurveTo(x - size * 0.2, y - size * 0.2, x, y - size);
      p.closePath();
    },
    color,
  );
}

function steam(ctx, x, y, time, size = 1, color = "#fff7eacc") {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * size;
  for (let i = 0; i < 3; i++) {
    const wave = Math.sin(time * 1.5 + i * 1.3) * 3 * size;
    const xx = x + (i - 1) * 12 * size;
    path(
      ctx,
      (p) => {
        p.moveTo(xx, y);
        p.bezierCurveTo(
          xx - 6 * size + wave,
          y - 9 * size,
          xx + 9 * size + wave,
          y - 16 * size,
          xx + wave,
          y - 28 * size,
        );
      },
      null,
      color,
      3 * size,
    );
  }
  ctx.restore();
}

function plant(ctx, x, y, size = 1, pot = "#d59377") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  shadow(ctx, 0, 14, 30, 8, 0.09);
  path(
    ctx,
    (p) => {
      p.moveTo(-23, -23);
      p.lineTo(-18, 16);
      p.quadraticCurveTo(0, 23, 18, 16);
      p.lineTo(23, -23);
      p.closePath();
    },
    pot,
    "#ad7762",
    2,
  );
  round(ctx, -27, -27, 54, 11, 5, pot, "#ad7762", 2);
  line(ctx, 0, -22, 0, -93, "#658665", 3);
  for (let i = 0; i < 5; i++) {
    const yy = -42 - i * 11;
    const dir = i % 2 ? 1 : -1;
    path(
      ctx,
      (p) => {
        p.moveTo(0, yy + 8);
        p.bezierCurveTo(
          dir * 35,
          yy + 10,
          dir * 34,
          yy - 24,
          dir * 17,
          yy - 18,
        );
        p.quadraticCurveTo(dir * 4, yy - 12, 0, yy + 8);
        p.closePath();
      },
      i % 2 ? "#88a876" : "#a5bf8a",
      "#6b906c",
      1.6,
    );
    line(ctx, 0, yy + 7, dir * 19, yy - 10, "#749672", 1);
  }
  oval(ctx, 0, -102, 10, 24, "#90b17d", "#729768", 1.6);
  ctx.restore();
}

function cloud(ctx, x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  path(
    ctx,
    (p) => {
      p.moveTo(-47, 12);
      p.bezierCurveTo(-66, 4, -45, -28, -25, -17);
      p.bezierCurveTo(-20, -49, 24, -41, 23, -19);
      p.bezierCurveTo(44, -28, 66, 0, 45, 12);
      p.closePath();
    },
    "#ffffffb3",
  );
  ctx.restore();
}

function windowView(ctx, x, y, w, h, door = false) {
  // The arch opens onto a quiet street, so the player is looking out from the café.
  ctx.save();
  const arch = new Path2D();
  arch.moveTo(x, y + h);
  arch.lineTo(x, y + w * 0.5);
  arch.bezierCurveTo(x, y - w * 0.15, x + w, y - w * 0.15, x + w, y + w * 0.5);
  arch.lineTo(x + w, y + h);
  arch.closePath();
  ctx.fillStyle = "#dfb89a";
  ctx.fill(arch);
  ctx.save();
  ctx.clip(arch);
  ctx.fillStyle = gradient(ctx, 0, y, 0, y + h, [
    [0, "#c9e2df"],
    [0.65, "#edf1d4"],
    [1, "#e8cfb0"],
  ]);
  ctx.fillRect(x, y, w, h);
  cloud(ctx, x + w * 0.22, y + h * 0.22, 0.75);
  cloud(ctx, x + w * 0.9, y + h * 0.08, 0.7);
  oval(ctx, x + w * 0.8, y + 40, 24, 24, "#fff1ae");
  // Rounded buildings and soft trees outside.
  round(ctx, x - 30, y + h * 0.51, w * 0.5, h * 0.5, 8, "#e0bca9");
  path(
    ctx,
    (p) => {
      p.moveTo(x - 45, y + h * 0.54);
      p.lineTo(x + w * 0.21, y + h * 0.37);
      p.lineTo(x + w * 0.51, y + h * 0.54);
    },
    "#c5907c",
  );
  round(ctx, x + w * 0.74, y + h * 0.48, w * 0.55, h * 0.6, 7, "#e5d1ac");
  for (let i = 0; i < 3; i++) {
    round(ctx, x + 10 + i * w * 0.11, y + h * 0.61, w * 0.07, 22, 5, "#f8e9ce");
    round(
      ctx,
      x + w * 0.79 + i * w * 0.12,
      y + h * 0.56,
      w * 0.08,
      22,
      5,
      "#faf0d5",
    );
  }
  line(ctx, x + w * 0.62, y + h * 0.64, x + w * 0.62, y + h, "#b8b799", 9);
  oval(ctx, x + w * 0.62, y + h * 0.57, w * 0.23, h * 0.2, "#afc49b");
  oval(ctx, x + w * 0.52, y + h * 0.63, w * 0.17, h * 0.13, "#9fbd99");
  oval(ctx, x + w * 0.71, y + h * 0.64, w * 0.16, h * 0.16, "#b5ceaa");
  ctx.fillStyle = "#decbb4";
  ctx.fillRect(x, y + h * 0.86, w, h * 0.14);
  line(ctx, x, y + h * 0.87, x + w, y + h * 0.87, "#d2b9a0", 4);
  ctx.restore();
  ctx.strokeStyle = "#bb8d70";
  ctx.lineWidth = 12;
  ctx.stroke(arch);
  ctx.strokeStyle = "#faf0d8";
  ctx.lineWidth = 4;
  ctx.stroke(arch);
  line(ctx, x + w * 0.5, y + 10, x + w * 0.5, y + h, "#b6896d", 8);
  line(ctx, x, y + h * 0.46, x + w, y + h * 0.46, "#b6896d", 8);
  line(ctx, x + w * 0.5 + 2, y + 12, x + w * 0.5 + 2, y + h - 2, "#e2c4a0", 2);
  // Small glossy streaks make the panes feel softly illustrated.
  line(
    ctx,
    x + w * 0.16,
    y + h * 0.36,
    x + w * 0.34,
    y + h * 0.14,
    "#ffffff66",
    12,
  );
  line(
    ctx,
    x + w * 0.7,
    y + h * 0.75,
    x + w * 0.89,
    y + h * 0.52,
    "#ffffff55",
    7,
  );
  if (door) {
    round(ctx, x + w * 0.71, y + h * 0.66, 12, 42, 6, "#b88b5a", "#967052", 2);
    oval(ctx, x + w * 0.73, y + h * 0.7, 3, 3, "#f5d398");
    line(
      ctx,
      x + w * 0.72,
      y + h * 0.33,
      x + w * 0.69,
      y + h * 0.43,
      "#a7816a",
      1.4,
    );
    line(
      ctx,
      x + w * 0.87,
      y + h * 0.33,
      x + w * 0.9,
      y + h * 0.43,
      "#a7816a",
      1.4,
    );
    round(
      ctx,
      x + w * 0.62,
      y + h * 0.4,
      w * 0.36,
      27,
      5,
      "#fcf5df",
      "#cda887",
      2,
    );
    // A heart on the door sign, instead of interface lettering.
    heart(ctx, x + w * 0.8, y + h * 0.4 + 15, 12, "#bd8271");
  }
  ctx.restore();
}

function chair(ctx, x, y, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  line(ctx, -25, -28, -35, 48, "#aa8162", 6);
  line(ctx, 25, -28, 35, 48, "#aa8162", 6);
  round(ctx, -35, -85, 70, 59, 17, "#d8a783", "#b68567", 3);
  round(ctx, -34, -24, 68, 15, 7, "#dcad86", "#b68567", 2);
  for (let i = 0; i < 3; i++)
    line(ctx, -19 + i * 19, -72, -19 + i * 19, -40, "#c49874", 3);
  ctx.restore();
}

function cafeTable(ctx, x, y, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  shadow(ctx, 0, 56, 75, 17, 0.075);
  chair(ctx, -67, -8, 0.72);
  chair(ctx, 62, -8, 0.72);
  line(ctx, -37, -8, -49, 56, "#a27d63", 7);
  line(ctx, 37, -8, 48, 56, "#a27d63", 7);
  oval(ctx, 0, -19, 82, 24, "#cc9c7c", "#b8876a", 2);
  oval(ctx, 0, -25, 82, 24, "#edc6a1", "#c99b77", 2);
  round(ctx, -4, -49, 11, 24, 4, "#fff9df", "#caa682", 1.4);
  line(ctx, 1, -48, 1, -61, "#83a67b", 2);
  oval(ctx, 1, -63, 9, 8, "#e9aa9b");
  oval(ctx, 0, -62, 3, 3, "#f7dba4");
  round(ctx, -41, -41, 14, 12, 4, "#fff9e7", "#caab8e", 1);
  oval(ctx, -24, -36, 4, 4, null, "#caab8e", 2);
  ctx.restore();
}

function cat(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y);
  shadow(ctx, 0, 18, 40, 9, 0.07);
  path(
    ctx,
    (p) => {
      p.moveTo(20, 12);
      p.bezierCurveTo(68, 20, 46, -15, 36, -9);
    },
    null,
    "#cc9c75",
    13,
  );
  oval(ctx, 0, 2, 30, 21, "#e2b58c", "#ba8b68", 2);
  path(
    ctx,
    (p) => {
      p.moveTo(-30, -1);
      p.lineTo(-28, -33);
      p.lineTo(-11, -22);
      p.quadraticCurveTo(0, -28, 11, -22);
      p.lineTo(27, -34);
      p.lineTo(30, -1);
      p.quadraticCurveTo(23, 22, 0, 23);
      p.quadraticCurveTo(-26, 22, -30, -1);
    },
    "#efc99f",
    "#ba8b68",
    2,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(-24, -24);
      p.lineTo(-22, -10);
      p.lineTo(-13, -20);
      p.closePath();
    },
    "#dc9d91",
  );
  path(
    ctx,
    (p) => {
      p.moveTo(23, -24);
      p.lineTo(21, -10);
      p.lineTo(13, -20);
      p.closePath();
    },
    "#dc9d91",
  );
  path(
    ctx,
    (p) => {
      p.moveTo(-19, 1);
      p.quadraticCurveTo(-13, 5, -7, 1);
    },
    null,
    ink,
    2,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(7, 1);
      p.quadraticCurveTo(13, 5, 19, 1);
    },
    null,
    ink,
    2,
  );
  oval(ctx, 0, 8, 3, 2, "#ba7d73");
  path(
    ctx,
    (p) => {
      p.moveTo(-5, 12);
      p.quadraticCurveTo(0, 16, 5, 12);
    },
    null,
    "#9b7061",
    1.6,
  );
  line(ctx, -27, 9, -36, 7, "#b08c71", 1);
  line(ctx, -27, 14, -37, 16, "#b08c71", 1);
  line(ctx, 27, 9, 36, 7, "#b08c71", 1);
  line(ctx, 27, 14, 37, 16, "#b08c71", 1);
  oval(ctx, -14, 18, 9, 5, "#f1d1b2", "#ba8b68", 1);
  oval(ctx, 14, 18, 9, 5, "#f1d1b2", "#ba8b68", 1);
  ctx.restore();
}

export function drawRoom(ctx, rect, { time = 0 } = {}) {
  if (!space(ctx, rect, 1280, 600)) return;
  ctx.fillStyle = gradient(ctx, 0, 0, 0, 600, [
    [0, "#faead5"],
    [0.58, "#f7e4ce"],
    [1, "#dcc3a7"],
  ]);
  ctx.fillRect(0, 0, 1280, 600);
  // Painted arch alcoves and warm paneling around the storefront.
  path(
    ctx,
    (p) => {
      p.moveTo(0, 336);
      p.lineTo(1280, 336);
      p.lineTo(1280, 436);
      p.lineTo(0, 436);
      p.closePath();
    },
    "#e4c2a6",
  );
  line(ctx, 0, 336, 1280, 336, "#caab8e", 4);
  line(ctx, 0, 344, 1280, 344, "#f7dcc0", 3);
  for (let x = 12; x < 1280; x += 92) line(ctx, x, 346, x, 429, "#d2ad90", 2);
  // Perspective floor: the café extends away from the bar.
  ctx.fillStyle = "#ead1b2";
  ctx.fillRect(0, 431, 1280, 169);
  for (let i = -4; i < 15; i++)
    line(ctx, 640 + i * 74, 431, 640 + i * 210, 600, "#d3b491", 2);
  [450, 479, 520, 577].forEach((y) => line(ctx, 0, y, 1280, y, "#d4b695", 2));
  windowView(ctx, 122, 72, 254, 338);
  windowView(ctx, 490, 83, 268, 351, true);
  windowView(ctx, 894, 72, 254, 338);
  // Trim and the delicate ceiling scallop.
  line(ctx, 0, 18, 1280, 18, "#e3c4a4", 8);
  line(ctx, 0, 25, 1280, 25, "#fff5df", 3);
  for (const [x, length, color] of [
    [395, 72, "#d3ac7d"],
    [850, 72, "#a8ba9d"],
  ]) {
    line(ctx, x, 18, x, length, "#8f8170", 2);
    path(
      ctx,
      (p) => {
        p.moveTo(x - 39, length + 29);
        p.quadraticCurveTo(x - 26, length - 4, x, length - 2);
        p.quadraticCurveTo(x + 26, length - 4, x + 39, length + 29);
        p.closePath();
      },
      color,
      "#9a8871",
      2,
    );
    oval(ctx, x, length + 29, 39, 7, "#fdf0cb", "#ac987c", 1.4);
    oval(ctx, x, length + 30, 8, 6, "#fff4d2");
  }
  // Tiny framed botanical paintings.
  for (const [x, y, color] of [
    [26, 112, "#93b197"],
    [801, 161, "#e3a090"],
  ]) {
    round(ctx, x, y, 70, 92, 8, "#c5a178", "#aa8566", 2);
    round(ctx, x + 7, y + 7, 56, 78, 3, "#fcf5e0");
    line(ctx, x + 35, y + 70, x + 35, y + 29, "#8ca37d", 2);
    oval(ctx, x + 25, y + 52, 11, 5, "#a5bd91");
    oval(ctx, x + 45, y + 42, 10, 5, "#a5bd91");
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 0.4;
      oval(
        ctx,
        x + 35 + Math.sin(a) * 9,
        y + 27 + Math.cos(a) * 9,
        7,
        7,
        color,
      );
    }
    oval(ctx, x + 35, y + 27, 5, 5, "#f5cd7f");
  }
  cafeTable(ctx, 200, 436, 1.08);
  cafeTable(ctx, 1075, 437, 1.02);
  plant(ctx, 49, 461, 1.15, "#d49b80");
  plant(ctx, 1220, 460, 1.24, "#bdc09b");
  plant(ctx, 824, 408, 0.61, "#e8bd89");
  // Pastry cabinet in the shop, beyond the counter.
  round(ctx, 362, 386, 106, 71, 9, "#b68b70", "#99755e", 2);
  round(ctx, 365, 356, 100, 47, 12, "#e5f1e8b3", "#ab947b", 2);
  line(ctx, 381, 364, 381, 394, "#fcfffccc", 5);
  oval(ctx, 390, 389, 13, 6, "#d7aa72");
  oval(ctx, 422, 388, 16, 6, "#efc388");
  oval(ctx, 444, 389, 9, 6, "#d5a16d");
  cat(ctx, 1182, 424, time);
  // Sunlight across the floor never obscures controls.
  path(
    ctx,
    (p) => {
      p.moveTo(920, 435);
      p.lineTo(1130, 435);
      p.lineTo(1250, 588);
      p.lineTo(860, 588);
      p.closePath();
    },
    "#fff2cc35",
  );
  ctx.restore();
}

export function drawCounter(ctx, rect, { time = 0 } = {}) {
  if (!space(ctx, rect, 1280, 420)) return;
  shadow(ctx, 640, 34, 670, 38, 0.09);
  path(
    ctx,
    (p) => {
      p.moveTo(-20, 24);
      p.quadraticCurveTo(640, 3, 1300, 24);
      p.lineTo(1300, 343);
      p.quadraticCurveTo(640, 373, -20, 343);
      p.closePath();
    },
    gradient(ctx, 0, 0, 0, 370, [
      [0, "#f7dec0"],
      [0.2, "#fff1d8"],
      [0.8, "#f7e6ca"],
      [1, "#ead0af"],
    ]),
    "#c8a184",
    3,
  );
  // Countertop grain is understated enough to support the player's objects.
  path(
    ctx,
    (p) => {
      p.moveTo(0, 103);
      p.bezierCurveTo(270, 80, 430, 128, 713, 101);
      p.bezierCurveTo(915, 82, 1066, 104, 1280, 85);
    },
    null,
    "#c3a98e16",
    2,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(0, 268);
      p.bezierCurveTo(350, 246, 570, 278, 820, 259);
      p.bezierCurveTo(1050, 245, 1170, 270, 1280, 258);
    },
    null,
    "#c3a98e16",
    2,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(-10, 340);
      p.quadraticCurveTo(640, 369, 1290, 340);
      p.lineTo(1290, 430);
      p.lineTo(-10, 430);
      p.closePath();
    },
    gradient(ctx, 0, 342, 0, 420, [
      [0, "#b5876e"],
      [0.09, "#c7997a"],
      [1, "#ae7c61"],
    ]),
    "#9e775f",
    2,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(-10, 345);
      p.quadraticCurveTo(640, 374, 1290, 345);
    },
    null,
    "#f5d5b0",
    4,
  );
  for (let x = 38; x < 1280; x += 104)
    line(ctx, x, 363, x, 420, "#9e735929", 2);
  ctx.restore();
}

function fringe(ctx, profile) {
  const c = profile.hairColor || "#67473d";
  const id = profile.id;
  if (id === "mina") {
    path(
      ctx,
      (p) => {
        p.moveTo(53, 104);
        p.bezierCurveTo(37, 56, 62, 20, 103, 27);
        p.bezierCurveTo(145, 10, 176, 40, 167, 105);
        p.lineTo(153, 116);
        p.bezierCurveTo(161, 63, 137, 80, 126, 57);
        p.bezierCurveTo(112, 84, 83, 83, 69, 69);
        p.lineTo(66, 115);
        p.closePath();
      },
      c,
      ink,
      2.5,
    );
    oval(ctx, 60, 91, 13, 27, c);
    oval(ctx, 159, 91, 12, 27, c);
    path(
      ctx,
      (p) => {
        p.moveTo(78, 41);
        p.bezierCurveTo(94, 29, 116, 31, 131, 34);
      },
      null,
      "#ffffff20",
      5,
    );
  } else if (id === "june") {
    for (let i = 0; i < 8; i++) {
      const a = Math.PI + (i * Math.PI) / 7;
      oval(
        ctx,
        110 + Math.cos(a) * 48,
        71 + Math.sin(a) * 35,
        21,
        24,
        c,
        ink,
        2,
      );
    }
    path(
      ctx,
      (p) => {
        p.moveTo(57, 85);
        p.quadraticCurveTo(61, 25, 113, 32);
        p.quadraticCurveTo(162, 25, 163, 81);
        p.quadraticCurveTo(132, 81, 124, 55);
        p.quadraticCurveTo(107, 84, 57, 85);
      },
      c,
    );
  } else if (id === "ada") {
    oval(ctx, 160, 50, 22, 22, "#c5c1b3", "#a49b8d", 2);
    path(
      ctx,
      (p) => {
        p.moveTo(53, 81);
        p.bezierCurveTo(52, 24, 141, 16, 164, 74);
        p.lineTo(164, 92);
        p.bezierCurveTo(150, 77, 148, 60, 126, 53);
        p.bezierCurveTo(99, 78, 73, 78, 53, 81);
      },
      c,
      "#a49b8d",
      2,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(79, 51);
        p.quadraticCurveTo(106, 30, 136, 47);
      },
      null,
      "#eeebe1",
      4,
    );
  } else {
    path(
      ctx,
      (p) => {
        p.moveTo(53, 91);
        p.bezierCurveTo(44, 43, 77, 22, 114, 28);
        p.bezierCurveTo(141, 18, 171, 45, 164, 90);
        p.lineTo(151, 84);
        p.lineTo(149, 65);
        p.bezierCurveTo(120, 64, 116, 49, 109, 51);
        p.bezierCurveTo(94, 80, 72, 71, 69, 68);
        p.lineTo(67, 88);
        p.closePath();
      },
      c,
      ink,
      2.3,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(72, 46);
        p.quadraticCurveTo(92, 34, 111, 36);
      },
      null,
      "#ffffff20",
      4,
    );
  }
}

export function drawCustomer(
  ctx,
  profile = {},
  rect,
  { time = 0, selected = false, chatted = false } = {},
) {
  if (!space(ctx, rect, 220, 260, true)) return;
  const skin = profile.skin || "#dcaa83";
  const shirt = profile.shirtColor || "#8caf9a";
  const hair = profile.hairColor || "#604239";
  const bounce = Math.sin(time * 1.4 + (profile.id || "").length) * 1.3;
  ctx.translate(0, bounce);
  shadow(ctx, 110, 245, 75, 11, 0.12);
  // Sweater and gently rounded shoulders.
  path(
    ctx,
    (p) => {
      p.moveTo(29, 249);
      p.lineTo(35, 195);
      p.bezierCurveTo(38, 164, 66, 149, 89, 151);
      p.lineTo(131, 151);
      p.bezierCurveTo(155, 149, 182, 165, 185, 195);
      p.lineTo(192, 249);
      p.closePath();
    },
    shirt,
    ink,
    2.8,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(36, 192);
      p.quadraticCurveTo(61, 185, 60, 218);
      p.lineTo(58, 247);
    },
    null,
    "#ffffff32",
    3,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(183, 192);
      p.quadraticCurveTo(159, 185, 160, 218);
      p.lineTo(161, 247);
    },
    null,
    "#00000015",
    2,
  );
  round(ctx, 94, 136, 33, 30, 12, skin, ink, 2);
  path(
    ctx,
    (p) => {
      p.moveTo(86, 151);
      p.quadraticCurveTo(110, 170, 134, 151);
    },
    null,
    "#fff4e37a",
    6,
  );
  // The large head is central to the cozy, storybook proportions.
  if (profile.id === "mina") {
    oval(ctx, 63, 117, 24, 48, hair, ink, 2);
    oval(ctx, 156, 117, 23, 48, hair, ink, 2);
  }
  oval(ctx, 54, 102, 11, 15, skin, ink, 2);
  oval(ctx, 166, 102, 11, 15, skin, ink, 2);
  oval(ctx, 110, 94, 55, 60, skin, ink, 2.4);
  oval(ctx, 90, 80, 23, 28, "#ffffff09");
  fringe(ctx, profile);
  const blink = Math.sin(time * 0.41 + (profile.name || "").length) > 0.996;
  const eyes = profile.id === "june" || chatted;
  if (eyes || blink) {
    path(
      ctx,
      (p) => {
        p.moveTo(78, 102);
        p.quadraticCurveTo(84, 94, 90, 102);
      },
      null,
      ink,
      3,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(130, 102);
        p.quadraticCurveTo(136, 94, 142, 102);
      },
      null,
      ink,
      3,
    );
  } else {
    oval(ctx, 84, 100, 4.2, 6.3, ink);
    oval(ctx, 136, 100, 4.2, 6.3, ink);
    oval(ctx, 85, 98, 1.3, 1.7, "#fff9ea");
    oval(ctx, 137, 98, 1.3, 1.7, "#fff9ea");
  }
  path(
    ctx,
    (p) => {
      p.moveTo(77, 88);
      p.quadraticCurveTo(84, 84, 91, 87);
    },
    null,
    hair,
    2.2,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(130, 87);
      p.quadraticCurveTo(137, 84, 144, 88);
    },
    null,
    hair,
    2.2,
  );
  oval(ctx, 72, 116, 10, 5.5, "#ed8f8870");
  oval(ctx, 148, 116, 10, 5.5, "#ed8f8870");
  path(
    ctx,
    (p) => {
      p.moveTo(106, 109);
      p.quadraticCurveTo(111, 113, 115, 109);
    },
    null,
    "#a9765d",
    1.6,
  );
  path(
    ctx,
    (p) => {
      p.moveTo(100, 123);
      p.quadraticCurveTo(110, 132, 121, 123);
    },
    null,
    ink,
    2.4,
  );
  if (profile.accessory === "scarf") {
    path(
      ctx,
      (p) => {
        p.moveTo(77, 150);
        p.quadraticCurveTo(110, 178, 144, 149);
        p.lineTo(145, 165);
        p.quadraticCurveTo(111, 190, 75, 166);
        p.closePath();
      },
      "#f4c789",
      "#bd9471",
      2,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(91, 173);
        p.lineTo(87, 216);
        p.quadraticCurveTo(99, 222, 112, 216);
        p.lineTo(118, 177);
        p.closePath();
      },
      "#f4c789",
      "#bd9471",
      2,
    );
    for (let x = 91; x < 112; x += 5)
      line(ctx, x, 216, x - 1, 223, "#bd9471", 1.5);
    line(ctx, 88, 201, 113, 204, "#eaa779", 3);
  }
  if (profile.accessory === "cap") {
    path(
      ctx,
      (p) => {
        p.moveTo(54, 65);
        p.quadraticCurveTo(61, 22, 112, 25);
        p.quadraticCurveTo(164, 25, 166, 70);
        p.quadraticCurveTo(107, 59, 54, 65);
      },
      "#91afa7",
      "#5c807b",
      2.4,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(83, 61);
        p.bezierCurveTo(116, 63, 154, 70, 178, 78);
        p.bezierCurveTo(164, 91, 113, 91, 82, 73);
        p.closePath();
      },
      "#729d94",
      "#5c807b",
      2,
    );
    round(ctx, 91, 40, 18, 13, 4, "#e7f0d9");
    heart(ctx, 100, 46, 8, "#729d94");
  }
  if (profile.accessory === "beanie") {
    path(
      ctx,
      (p) => {
        p.moveTo(53, 62);
        p.quadraticCurveTo(56, 14, 106, 20);
        p.quadraticCurveTo(160, 12, 165, 63);
        p.closePath();
      },
      "#d39b67",
      "#aa764f",
      2.2,
    );
    round(ctx, 48, 57, 124, 24, 9, "#e4b486", "#aa764f", 2);
    for (let x = 59; x < 166; x += 10) line(ctx, x, 61, x, 77, "#c78f63", 1.4);
    oval(ctx, 113, 15, 14, 13, "#d9a271", "#aa764f", 2);
  }
  if (profile.accessory === "glasses") {
    round(
      ctx,
      65,
      86,
      39,
      29,
      12,
      "#ffffff0b",
      profile.id === "ada" ? "#ad795f" : "#796352",
      3,
    );
    round(
      ctx,
      117,
      86,
      39,
      29,
      12,
      "#ffffff0b",
      profile.id === "ada" ? "#ad795f" : "#796352",
      3,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(104, 96);
        p.quadraticCurveTo(110, 93, 117, 96);
      },
      null,
      "#796352",
      2,
    );
    line(ctx, 65, 96, 57, 94, "#796352", 2);
    line(ctx, 156, 96, 164, 94, "#796352", 2);
    line(ctx, 75, 91, 80, 89, "#ffffff99", 2);
    line(ctx, 128, 91, 133, 89, "#ffffff99", 2);
  }
  if (profile.accessory === "earrings") {
    oval(ctx, 52, 119, 6, 9, null, "#e7bd63", 3);
    oval(ctx, 168, 119, 6, 9, null, "#e7bd63", 3);
  }
  if (profile.accessory === "headphones") {
    path(
      ctx,
      (p) => {
        p.moveTo(52, 97);
        p.bezierCurveTo(34, 16, 177, 12, 168, 99);
      },
      null,
      "#746584",
      8,
    );
    round(ctx, 43, 86, 18, 37, 9, "#bea8c7", "#746584", 2);
    round(ctx, 158, 86, 18, 37, 9, "#bea8c7", "#746584", 2);
    round(ctx, 46, 92, 5, 24, 2, "#decfe3");
    round(ctx, 167, 92, 5, 24, 2, "#decfe3");
  }
  if (profile.id === "june") {
    round(ctx, 73, 179, 74, 69, 13, "#ead0a4", "#ba9b74", 2);
    line(ctx, 81, 174, 82, 191, "#ead0a4", 6);
    line(ctx, 140, 174, 138, 191, "#ead0a4", 6);
    oval(ctx, 110, 206, 16, 15, "#a7b68c");
    line(ctx, 110, 219, 110, 194, "#759268", 2);
    path(
      ctx,
      (p) => {
        p.moveTo(110, 208);
        p.quadraticCurveTo(96, 208, 103, 197);
      },
      "#719367",
    );
  }
  if (profile.id === "ren") {
    round(ctx, 88, 187, 46, 28, 7, "#d8e9dc", "#507d79", 2);
    for (let i = 0; i < 3; i++)
      round(ctx, 96 + i * 10, 193 + (i % 2) * 4, 5, 12, 2, "#77a7a2");
  }
  // Soft mitten-like hands, placed on the customer's side of the counter.
  oval(ctx, 56, 246, 23, 12, skin, ink, 2);
  oval(ctx, 165, 246, 23, 12, skin, ink, 2);
  line(ctx, 50, 242, 49, 248, "#a77762", 1.1);
  line(ctx, 58, 241, 58, 248, "#a77762", 1.1);
  line(ctx, 161, 242, 161, 248, "#a77762", 1.1);
  line(ctx, 169, 242, 169, 248, "#a77762", 1.1);
  if (chatted) heart(ctx, 192, 47 + Math.sin(time * 2) * 3, 13, "#d79a8b");
  ctx.restore();
}

function dial(ctx, x, y, value = 0.65, color = "#6f998c") {
  oval(ctx, x, y, 15, 15, "#fff9e9", "#6e8378", 2);
  path(ctx, (p) => p.arc(x, y, 10, Math.PI, Math.PI * 1.9), null, "#cad8bf", 2);
  const angle = Math.PI + value * Math.PI;
  line(ctx, x, y, x + Math.cos(angle) * 9, y + Math.sin(angle) * 9, color, 2);
  oval(ctx, x, y, 2.3, 2.3, color);
}

function machineCup(ctx, x, y, coffee = false) {
  oval(ctx, x, y + 23, 30, 6, "#e6d9bd");
  oval(ctx, x + 25, y + 3, 12, 13, null, "#f8f0d6", 6);
  path(
    ctx,
    (p) => {
      p.moveTo(x - 23, y - 12);
      p.lineTo(x - 18, y + 18);
      p.quadraticCurveTo(x, y + 28, x + 18, y + 18);
      p.lineTo(x + 23, y - 12);
      p.closePath();
    },
    "#fff8e2",
    "#9b8e74",
    1.5,
  );
  oval(ctx, x, y - 12, 23, 7, coffee ? "#956b49" : "#f1e5cc", "#9b8e74", 1.5);
  if (coffee) oval(ctx, x, y - 11, 19, 4, "#b48657");
}

// The movable cup uses the same contained coordinate system as the machine.
// Its rim sits below the portafilter and its saucer sits on the drip tray.
export function espressoCupRect(art) {
  const scale = Math.min(art.w / 240, art.h / 205);
  return {
    x: art.x + (art.w - 240 * scale) / 2 + 77 * scale,
    y: art.y + (art.h - 205 * scale) / 2 + 109 * scale,
    w: 84 * scale,
    h: 75.6 * scale,
  };
}

export function drawEspressoPour(ctx, art, cup, time = 0) {
  const scale = Math.min(art.w / 240, art.h / 205),
    ox = art.x + (art.w - 240 * scale) / 2,
    oy = art.y + (art.h - 205 * scale) / 2,
    rimY = cup.y + (55 / 180) * cup.h;
  ctx.save();
  ctx.strokeStyle = "#9a714b";
  ctx.lineWidth = Math.max(1.5, scale * 2);
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.8 + Math.sin(time * 13) * 0.15;
  for (const x of [112, 124]) {
    ctx.beginPath();
    ctx.moveTo(ox + x * scale, oy + 120 * scale);
    ctx.lineTo(ox + x * scale, rimY);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawMachine(
  ctx,
  station,
  rect,
  { job = null, time = 0, selected = false, movableCup = false } = {},
) {
  if (!space(ctx, rect, 240, 205, true)) return;
  const working = job && !job.ready;
  const ready = job?.ready;
  shadow(ctx, 120, 190, 89, 11, 0.1);
  if (station === "espresso") {
    round(ctx, 31, 42, 179, 138, 24, "#789d8c", "#567a6c", 2.5);
    round(
      ctx,
      36,
      35,
      169,
      65,
      19,
      gradient(ctx, 0, 35, 0, 100, [
        [0, "#b6d1b8"],
        [1, "#9cbca8"],
      ]),
      "#638875",
      2.5,
    );
    round(ctx, 45, 44, 150, 9, 4, "#d7e4c7");
    dial(ctx, 92, 72, working ? 0.45 + Math.sin(time * 2) * 0.12 : 0.65);
    oval(ctx, 151, 72, 7, 7, ready ? "#ffdd88" : "#638a77", "#50715e", 1.5);
    oval(ctx, 173, 72, 5, 5, "#d9e4c9", "#668671", 1.5);
    round(ctx, 55, 104, 123, 65, 12, "#456b5d", "#5b7e6d", 2);
    round(ctx, 42, 170, 154, 15, 6, "#adbba5", "#638875", 2);
    for (let i = 0; i < 11; i++)
      line(ctx, 52 + i * 12, 177, 57 + i * 12, 177, "#718c7d", 2);
    round(ctx, 100, 99, 36, 14, 5, "#d9d9c2", "#6a8270", 2);
    round(ctx, 130, 104, 36, 7, 3, "#6c6453", "#514e43", 1.5);
    line(ctx, 112, 113, 112, 121, "#d6d4bf", 4);
    line(ctx, 124, 113, 124, 121, "#d6d4bf", 4);
    if (!movableCup) machineCup(ctx, 117, 146, ready || working);
    if (working && !movableCup) {
      line(ctx, 112, 120, 112, 135, "#9a714b", 2);
      line(ctx, 124, 120, 124, 135, "#9a714b", 2);
    }
    path(
      ctx,
      (p) => {
        p.moveTo(197, 90);
        p.lineTo(214, 109);
        p.lineTo(205, 140);
      },
      null,
      "#d6dac3",
      5,
    );
    round(ctx, 66, 19, 36, 18, 6, "#fff8e1", "#a49b81", 1.5);
    oval(ctx, 106, 27, 6, 5, null, "#fff8e1", 3);
    round(ctx, 122, 19, 36, 18, 6, "#eac4ad", "#a8937d", 1.5);
    oval(ctx, 163, 27, 6, 5, null, "#eac4ad", 3);
    if (ready) steam(ctx, 117, 125, time, 0.6);
  } else if (station === "milk") {
    round(ctx, 157, 36, 41, 148, 15, "#adc1b7", "#788f85", 2.5);
    round(ctx, 155, 36, 45, 20, 8, "#d1ddd0", "#788f85", 2);
    oval(ctx, 177, 77, 9, 9, "#eff0d8", "#859888", 2);
    line(ctx, 177, 77, 177, 70, "#7e9785", 2);
    path(
      ctx,
      (p) => {
        p.moveTo(158, 98);
        p.lineTo(121, 117);
        p.lineTo(127, 148);
      },
      null,
      "#e0e2cf",
      7,
    );
    round(ctx, 40, 174, 172, 13, 7, "#b7c9b7", "#889e8d", 2);
    for (let i = 0; i < 10; i++)
      line(ctx, 48 + i * 16, 181, 56 + i * 16, 181, "#889e8d", 1.4);
    oval(ctx, 69, 106, 35, 39, null, "#a9bdb8", 12);
    path(
      ctx,
      (p) => {
        p.moveTo(74, 76);
        p.quadraticCurveTo(121, 65, 147, 82);
        p.lineTo(132, 164);
        p.quadraticCurveTo(101, 181, 72, 164);
        p.lineTo(62, 86);
        p.lineTo(74, 76);
        p.closePath();
      },
      gradient(ctx, 67, 0, 148, 0, [
        [0, "#b8cec8"],
        [0.42, "#e3ebe2"],
        [1, "#a2bcb4"],
      ]),
      "#7a9a8f",
      2.5,
    );
    oval(ctx, 104, 81, 38, 10, "#789b8c", "#7a9a8f", 2);
    oval(ctx, 104, 83, 30, 6, job ? "#fff8e6" : "#c8ddd0");
    path(
      ctx,
      (p) => {
        p.moveTo(66, 83);
        p.lineTo(52, 77);
        p.quadraticCurveTo(51, 93, 69, 103);
      },
      "#c8dbd4",
      "#7a9a8f",
      2,
    );
    line(ctx, 91, 109, 95, 156, "#ffffff75", 5);
    // A tiny heart stamped into the pitcher.
    heart(ctx, 111, 128, 13, "#8eafa2");
    if (working || ready) steam(ctx, 107, 72, time, 0.9, "#fff9eae6");
  } else if (station === "kettle") {
    round(ctx, 48, 179, 153, 12, 6, "#c9b698", "#ac937b", 2);
    oval(ctx, 128, 97, 62, 62, null, "#a97c58", 12);
    oval(ctx, 129, 98, 59, 59, null, "#d6ac7e", 5);
    path(
      ctx,
      (p) => {
        p.moveTo(83, 86);
        p.bezierCurveTo(91, 65, 146, 66, 157, 88);
        p.lineTo(177, 141);
        p.quadraticCurveTo(167, 179, 124, 179);
        p.quadraticCurveTo(73, 176, 68, 147);
        p.closePath();
      },
      gradient(ctx, 63, 95, 177, 150, [
        [0, "#e7bc8b"],
        [0.5, "#ce996b"],
        [1, "#b58059"],
      ]),
      "#a47757",
      2.5,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(77, 113);
        p.quadraticCurveTo(53, 106, 48, 87);
        p.lineTo(33, 88);
        p.quadraticCurveTo(34, 130, 70, 144);
        p.closePath();
      },
      "#d3a277",
      "#a47757",
      2.5,
    );
    oval(ctx, 121, 82, 35, 11, "#e4bb89", "#a47757", 2);
    oval(ctx, 121, 70, 9, 8, "#a27858", "#866348", 2);
    path(
      ctx,
      (p) => {
        p.moveTo(91, 108);
        p.quadraticCurveTo(80, 130, 94, 151);
      },
      null,
      "#f6d6ac",
      6,
    );
    heart(ctx, 130, 137, 16, "#eaca9c");
    if (working || ready) steam(ctx, 42, 85, time, 1);
    round(ctx, 189, 110, 26, 56, 5, "#f4e4bd", "#baa27e", 1.7);
    round(ctx, 185, 104, 34, 10, 3, "#98ad8d", "#788f71", 1.5);
    round(ctx, 195, 124, 14, 24, 3, "#d2d6b0");
    path(
      ctx,
      (p) => {
        p.moveTo(202, 140);
        p.quadraticCurveTo(194, 133, 202, 127);
        p.quadraticCurveTo(211, 133, 202, 140);
      },
      "#819973",
    );
  } else if (station === "oven") {
    round(ctx, 30, 57, 181, 125, 22, "#d9917f", "#b97566", 2.5);
    round(
      ctx,
      36,
      48,
      169,
      43,
      16,
      gradient(ctx, 0, 48, 0, 95, [
        [0, "#f2c0a5"],
        [1, "#e6ad94"],
      ]),
      "#ba806b",
      2,
    );
    oval(ctx, 159, 71, 10, 10, "#fdf0d2", "#b98a70", 2);
    line(ctx, 159, 71, 163, 65, "#a27d61", 2);
    oval(
      ctx,
      187,
      71,
      5,
      5,
      working || ready ? "#f6d37f" : "#c18f74",
      "#b78168",
      1.5,
    );
    round(ctx, 45, 100, 146, 64, 13, "#936b55", "#b97566", 2);
    round(
      ctx,
      52,
      107,
      132,
      49,
      10,
      gradient(ctx, 0, 104, 0, 157, [
        [0, "#ba7d51"],
        [1, "#dcab6e"],
      ]),
      "#7f604d",
      1.5,
    );
    if (working || ready) {
      ctx.save();
      ctx.shadowColor = "#ffda85";
      ctx.shadowBlur = 12;
      oval(ctx, 172, 117, 3, 3, "#ffdf8b");
      ctx.restore();
      drawFood(
        ctx,
        job.foodId || "croissant",
        { x: 73, y: 110, w: 100, h: 48 },
        { warm: false, time },
      );
    } else {
      line(ctx, 65, 143, 171, 143, "#c29a79", 2);
      for (let x = 74; x < 168; x += 16)
        line(ctx, x, 136, x, 149, "#ac805f", 1.6);
    }
    round(ctx, 71, 95, 97, 9, 4, "#f5d7b1", "#ad806a", 1.6);
    path(
      ctx,
      (p) => {
        p.moveTo(60, 114);
        p.lineTo(60, 133);
      },
      null,
      "#fbe6bc66",
      5,
    );
    round(ctx, 44, 180, 22, 10, 4, "#97735b");
    round(ctx, 176, 180, 22, 10, 4, "#97735b");
    if (ready) steam(ctx, 119, 49, time, 0.7);
  }
  if (ready) {
    sparkle(ctx, 208, 42 + Math.sin(time * 2) * 2, 10, "#f5c164");
    sparkle(ctx, 27, 125, 6, "#f2d59d");
  }
  ctx.restore();
}

export function drawMachineControl(
  ctx,
  station,
  rect,
  { progress = 0, working = false, ready = false, selected = false } = {},
) {
  if (!space(ctx, rect, 48, 48)) return;
  const p = Math.max(0, Math.min(1, progress));
  const colors = {
    espresso: ["#aac5ac", "#638673", "#5a7866"],
    milk: ["#c6dbce", "#7c9e8d", "#668773"],
    kettle: ["#e8c299", "#bb916d", "#9c7757"],
    oven: ["#efb9a4", "#be8774", "#a87865"],
  };
  const [shell, rim, detail] = colors[station];
  const light = ready ? "#ffdf8d" : working || p > 0.5 ? "#b8d99d" : "#c5bea1";
  // A little raised control deck is attached to the machine's upper face.
  round(ctx, 1.5, 3, 45, 43, 12, shell, rim, 1.5);
  round(ctx, 4.5, 5, 39, 36, 9, "#fff5dc55");
  if (selected) {
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = "#e6edb1";
    round(ctx, 1.5, 3, 45, 43, 12, null, "#8aa77b", 2.2);
    ctx.restore();
  }
  oval(ctx, 39, 9, 2.8, 2.8, light, detail, 0.8);
  if (station === "espresso") {
    round(ctx, 20, 7, 8, 25, 4, "#6e887455", detail, 1);
    line(ctx, 24, 10, 24, 29, "#f3edcf", 2.5);
    const handleY = 12 + p * 15;
    shadow(ctx, 24, handleY + 4, 11, 3, 0.15);
    line(ctx, 13, handleY, 35, handleY, "#6f7e61", 6);
    line(ctx, 14, handleY - 1.3, 34, handleY - 1.3, "#fff0c7", 4);
    oval(ctx, 24, handleY, 4, 4, "#f2ccaa", "#aa9b72", 1);
    // The chevron points in the same direction as the pull gesture.
    line(ctx, 8, 20, 11, 24, detail, 1.3);
    line(ctx, 11, 24, 14, 20, detail, 1.3);
  } else if (station === "milk" || station === "oven") {
    const cx = 23,
      cy = 21;
    path(
      ctx,
      (c) => c.arc(cx, cy, 17, Math.PI * 0.8, Math.PI * 2.25),
      null,
      "#fff4d9",
      2,
    );
    path(
      ctx,
      (c) =>
        c.arc(
          cx,
          cy,
          17,
          Math.PI * 0.8,
          Math.PI * (0.8 + 1.45 * Math.max(0.04, p)),
        ),
      null,
      ready ? "#f4ca70" : "#8ba87b",
      2.3,
    );
    [
      Math.PI * 0.8,
      Math.PI * 1.15,
      Math.PI * 1.55,
      Math.PI * 1.9,
      Math.PI * 2.25,
    ].forEach((a) => {
      line(
        ctx,
        cx + Math.cos(a) * 17,
        cy + Math.sin(a) * 17,
        cx + Math.cos(a) * 19,
        cy + Math.sin(a) * 19,
        detail,
        1.1,
      );
    });
    shadow(ctx, cx + 1, cy + 3, 13, 12, 0.12);
    oval(ctx, cx, cy, 12.5, 12.5, "#f9efd4", rim, 1.6);
    oval(ctx, cx - 1, cy - 1, 9, 9, "#fff9e5");
    const angle = Math.PI * (1.2 + p * 0.5);
    line(
      ctx,
      cx + Math.cos(angle) * 3,
      cy + Math.sin(angle) * 3,
      cx + Math.cos(angle) * 9,
      cy + Math.sin(angle) * 9,
      detail,
      2.6,
    );
    oval(ctx, cx, cy, 2, 2, shell);
  } else {
    round(ctx, 13, 8, 22, 26, 10, detail, rim, 1);
    round(ctx, 15, 9 + p * 10, 18, 14, 7, "#ffefd0", "#c1a17b", 1.2);
    const sy = 15.5 + p * 10;
    path(
      ctx,
      (c) => c.arc(24, sy, 3.3, -Math.PI * 0.3, Math.PI * 1.3),
      null,
      detail,
      1.2,
    );
    line(ctx, 24, sy - 4, 24, sy - 0.8, detail, 1.2);
  }
  ctx.restore();
}

export function drawDrink(
  ctx,
  drink = {},
  rect,
  { time = 0, ready = false } = {},
) {
  if (!space(ctx, rect, 200, 180, true)) return;
  const hasMilk = drink.milk || drink.coldMilk || drink.foam;
  const hasCoffee = drink.shots;
  const hasChocolate = drink.chocolate;
  const liquid = drink.tea
    ? "#b58851"
    : hasChocolate
      ? "#8b604c"
      : hasMilk && hasCoffee
        ? "#c8a67c"
        : hasMilk
          ? "#f5e8c9"
          : hasCoffee
            ? "#7c5841"
            : drink.water
              ? "#d3e5d7"
              : "#f7eed8";
  shadow(ctx, 95, 157, 71, 11, 0.1);
  if (drink.cup === "iced") {
    const straw = "#93b9aa";
    line(ctx, 121, 115, 145, 9, straw, 7);
    line(ctx, 146, 10, 160, 10, straw, 7);
    path(
      ctx,
      (p) => {
        p.moveTo(51, 36);
        p.lineTo(61, 145);
        p.quadraticCurveTo(95, 161, 131, 145);
        p.lineTo(143, 36);
        p.closePath();
      },
      "#fffef33d",
      "#93aca0",
      2.5,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(57, 67);
        p.lineTo(65, 143);
        p.quadraticCurveTo(97, 154, 127, 143);
        p.lineTo(137, 67);
        p.closePath();
      },
      liquid,
    );
    if (hasMilk && hasCoffee) {
      path(
        ctx,
        (p) => {
          p.moveTo(58, 68);
          p.quadraticCurveTo(92, 78, 137, 68);
          p.lineTo(134, 95);
          p.bezierCurveTo(117, 103, 91, 80, 61, 100);
          p.closePath();
        },
        "#916448",
      );
    }
    for (const [x, y, angle] of [
      [74, 54, -0.13],
      [100, 61, 0.19],
      [121, 47, -0.1],
      [80, 89, 0.2],
    ]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      round(ctx, -10, -8, 22, 18, 5, "#e8f4e799", "#fffae599", 1.5);
      line(ctx, -5, -5, 6, -5, "#ffffffa8", 2);
      ctx.restore();
    }
    oval(ctx, 97, 36, 46, 11, "#fff9e324", "#93aca0", 2);
    line(ctx, 61, 52, 67, 134, "#ffffed99", 4);
    round(ctx, 73, 112, 50, 22, 8, "#fbf1d6e8");
    heart(ctx, 98, 123, 12, "#91b4a0");
  } else {
    oval(ctx, 93, 149, 74, 16, "#e2d7bc", "#b7a889", 1.5);
    oval(ctx, 93, 146, 74, 13, "#fcf4de", "#d3c4a4", 1.5);
    oval(ctx, 149, 93, 27, 31, null, "#d5aa9c", 13);
    oval(ctx, 149, 93, 26, 30, null, "#f2cebd", 7);
    path(
      ctx,
      (p) => {
        p.moveTo(41, 55);
        p.lineTo(47, 122);
        p.bezierCurveTo(51, 153, 135, 153, 139, 122);
        p.lineTo(145, 55);
        p.closePath();
      },
      gradient(ctx, 35, 70, 150, 140, [
        [0, "#fae4cf"],
        [0.6, "#f0cbbb"],
        [1, "#dbae9c"],
      ]),
      "#b4937b",
      2.5,
    );
    oval(ctx, 93, 55, 52, 16, "#fff7df", "#b4937b", 2);
    oval(ctx, 93, 55, 46, 12, liquid);
    if (hasMilk && hasCoffee) {
      ctx.save();
      ctx.translate(94, 54);
      ctx.scale(1.4, 0.6);
      heart(ctx, 0, 0, 21, "#fff3d7");
      ctx.restore();
      path(
        ctx,
        (p) => {
          p.moveTo(94, 48);
          p.quadraticCurveTo(91, 56, 97, 65);
        },
        null,
        "#b28b60",
        1,
      );
    }
    if (drink.foam) {
      oval(ctx, 91, 55, 40, 9, "#fff6dd");
      oval(ctx, 83, 50, 13, 6, "#fff9e7");
      oval(ctx, 103, 50, 15, 6, "#fff9e7");
      for (const [x, y] of [
        [80, 53],
        [113, 56],
        [94, 58],
      ])
        oval(ctx, x, y, 1.5, 1, "#dcbf93");
    }
    heart(ctx, 94, 104, 17, "#fff5df");
    path(
      ctx,
      (p) => {
        p.moveTo(52, 72);
        p.lineTo(56, 112);
        p.quadraticCurveTo(57, 125, 64, 128);
      },
      null,
      "#fff7e766",
      4,
    );
    if (hasCoffee || hasMilk || drink.water || drink.tea)
      steam(ctx, 95, 36, time, 0.8, "#fff7eac9");
  }
  if (ready) sparkle(ctx, 171, 43 + Math.sin(time * 2) * 3, 8, "#eec46b");
  ctx.restore();
}

export function drawFood(ctx, id, rect, { warm = true, time = 0 } = {}) {
  if (!space(ctx, rect, 200, 145, true)) return;
  shadow(ctx, 100, 119, 72, 9, 0.09);
  oval(ctx, 100, 108, 82, 22, "#dae3c8", "#a4b698", 2);
  oval(ctx, 100, 104, 76, 18, "#f6f5df", "#c5d0af", 1.5);
  if (id === "croissant") {
    path(
      ctx,
      (p) => {
        p.moveTo(35, 96);
        p.bezierCurveTo(40, 58, 68, 39, 100, 41);
        p.bezierCurveTo(134, 38, 159, 63, 166, 96);
        p.quadraticCurveTo(149, 109, 135, 101);
        p.quadraticCurveTo(112, 83, 100, 84);
        p.quadraticCurveTo(78, 85, 62, 102);
        p.quadraticCurveTo(47, 109, 35, 96);
        p.closePath();
      },
      gradient(ctx, 0, 39, 0, 107, [
        [0, "#f2ca81"],
        [0.5, "#e5ac61"],
        [1, "#c99150"],
      ]),
      "#bc884c",
      2.5,
    );
    for (const [x, y, bend] of [
      [56, 63, -11],
      [77, 48, -4],
      [100, 44, 1],
      [125, 52, 8],
      [146, 72, 10],
    ]) {
      path(
        ctx,
        (p) => {
          p.moveTo(x, y);
          p.quadraticCurveTo(x + bend, y + 19, x + bend * 0.5, y + 38);
        },
        null,
        "#c78c46",
        2.5,
      );
      path(
        ctx,
        (p) => {
          p.moveTo(x + 4, y + 3);
          p.quadraticCurveTo(x + bend + 5, y + 15, x + bend * 0.5 + 4, y + 28);
        },
        null,
        "#ffe1a188",
        3,
      );
    }
    oval(ctx, 92, 59, 5, 2, "#ffe6ae");
    oval(ctx, 121, 72, 3, 1.5, "#ffe6ae");
  } else if (id === "toastie") {
    path(
      ctx,
      (p) => {
        p.moveTo(37, 99);
        p.lineTo(89, 36);
        p.quadraticCurveTo(93, 31, 100, 35);
        p.lineTo(165, 96);
        p.closePath();
      },
      "#cc985f",
      "#b5824c",
      3,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(40, 99);
        p.lineTo(96, 47);
        p.lineTo(164, 98);
        p.lineTo(155, 108);
        p.lineTo(44, 109);
        p.closePath();
      },
      "#f1c363",
      "#c99648",
      2,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(36, 92);
        p.lineTo(89, 28);
        p.quadraticCurveTo(96, 22, 102, 29);
        p.lineTo(166, 90);
        p.quadraticCurveTo(166, 98, 155, 99);
        p.lineTo(45, 100);
        p.quadraticCurveTo(32, 99, 36, 92);
      },
      "#edc896",
      "#b68a58",
      3,
    );
    for (const [x1, y1, x2, y2] of [
      [62, 77, 82, 96],
      [73, 63, 107, 96],
      [86, 48, 132, 95],
      [99, 38, 153, 91],
    ])
      line(ctx, x1, y1, x2, y2, "#c29665", 3);
    path(
      ctx,
      (p) => {
        p.moveTo(118, 100);
        p.lineTo(121, 112);
        p.quadraticCurveTo(127, 118, 130, 109);
        p.lineTo(130, 101);
      },
      "#f6d573",
      "#d5a84b",
      1,
    );
  } else {
    oval(ctx, 100, 90, 60, 25, "#d2a16a", "#b27d47", 2.5);
    oval(ctx, 100, 74, 60, 34, "#ebc58c", "#b27d47", 2.5);
    path(
      ctx,
      (p) => {
        p.moveTo(99, 75);
        p.bezierCurveTo(112, 87, 128, 74, 115, 65);
        p.bezierCurveTo(96, 48, 76, 62, 82, 78);
        p.bezierCurveTo(91, 101, 130, 99, 142, 77);
        p.bezierCurveTo(150, 57, 120, 42, 99, 45);
        p.bezierCurveTo(63, 47, 47, 74, 67, 91);
      },
      null,
      "#ae794c",
      7,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(60, 63);
        p.bezierCurveTo(87, 44, 114, 53, 145, 68);
      },
      null,
      "#fff2dc",
      6,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(60, 82);
        p.bezierCurveTo(82, 61, 114, 75, 138, 84);
      },
      null,
      "#fff2dc",
      5,
    );
    path(
      ctx,
      (p) => {
        p.moveTo(82, 98);
        p.quadraticCurveTo(104, 84, 124, 99);
      },
      null,
      "#fff2dc",
      5,
    );
  }
  if (warm) steam(ctx, 100, 32, time, 0.65, "#fff8e0cf");
  ctx.restore();
}
