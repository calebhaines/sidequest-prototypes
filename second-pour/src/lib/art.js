/* Second Pour's art is drawn in a tiny, deliberately chunky pixel grid. */
import { customers } from "./data.js";

const C = {
  ink: "#2e4038",
  inkLight: "#55604a",
  cream: "#f3e4c8",
  ivory: "#fff2d4",
  wall: "#ead9b9",
  wallShade: "#decaab",
  peach: "#f4cb9e",
  wood: "#b47850",
  oak: "#d69d69",
  woodLight: "#e8b582",
  woodDark: "#80573f",
  green: "#486f62",
  mint: "#a0ba99",
  paleMint: "#d0d9b4",
  pink: "#dba294",
  copper: "#d88961",
  copperLight: "#f0ae78",
  gold: "#f4bc57",
  sky: "#b5cfbc",
  skyLight: "#daead0",
  tile: "#ead7bc",
  tileShade: "#d4b998",
  steel: "#c7d0b8",
  coffee: "#6b4532",
};

const fallbackProfiles = [
  {
    name: "June",
    skin: "#d7a37b",
    hair: "#593e34",
    shirt: "#b4c193",
    hairStyle: "bob",
  },
  {
    name: "Oliver",
    skin: "#ebbf95",
    hair: "#bf8353",
    shirt: "#71907f",
    hairStyle: "curly",
  },
  {
    name: "Maya",
    skin: "#ae7857",
    hair: "#362f2b",
    shirt: "#cc8b77",
    hairStyle: "bun",
  },
  {
    name: "Theo",
    skin: "#e3b28d",
    hair: "#614c3c",
    shirt: "#9aacc0",
    hairStyle: "short",
    glasses: true,
  },
  {
    name: "Luca",
    skin: "#ba845f",
    hair: "#332f2b",
    shirt: "#d4af69",
    hairStyle: "curly",
  },
];

let knownProfiles = customers;
/** The UI may supply profiles without coupling the renderer to its content module. */
export function setArtProfiles(profiles) {
  knownProfiles = Array.isArray(profiles)
    ? Object.fromEntries(profiles.map((p) => [p.id, p]))
    : profiles || {};
}

function rect(ctx, x, y, w, h, color) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function poly(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

function pixelCircle(ctx, x, y, size, color) {
  const s = Math.max(1, Math.round(size / 5));
  rect(ctx, x + s, y, size - 2 * s, size, color);
  rect(ctx, x, y + s, size, size - 2 * s, color);
}

function text(ctx, label, x, y, color = C.ink, size = 8, align = "left") {
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  ctx.fillText(String(label), x, y);
}

function hash(str = "") {
  let result = 0;
  for (let i = 0; i < String(str).length; i++)
    result = (result * 31 + String(str).charCodeAt(i)) >>> 0;
  return result;
}

function profileFor(customer, index) {
  const explicit = customer?.profile || knownProfiles[customer?.profileId];
  return (
    explicit ||
    fallbackProfiles[
      hash(customer?.profileId || customer?.id || index) %
        fallbackProfiles.length
    ]
  );
}

function normalizeProfile(profile = {}) {
  const defaults =
    fallbackProfiles[
      hash(profile.id || profile.name) % fallbackProfiles.length
    ];
  const colors = profile.colors || profile.appearance || {};
  return {
    ...defaults,
    ...profile,
    skin: profile.skin || profile.skinColor || colors.skin || defaults.skin,
    hair:
      profile.hairColor ||
      (typeof profile.hair === "string" && profile.hair[0] === "#"
        ? profile.hair
        : null) ||
      colors.hair ||
      defaults.hair,
    shirt:
      profile.shirt ||
      profile.shirtColor ||
      profile.color ||
      colors.shirt ||
      defaults.shirt,
    hairStyle:
      profile.hairStyle ||
      profile.style ||
      colors.hairStyle ||
      {
        mina: "bob",
        ollie: "cap",
        june: "bun",
        theo: "short",
        bea: "beanie",
        sam: "curly",
        ren: "bob",
        ada: "short",
      }[profile.id] ||
      defaults.hairStyle,
    glasses:
      profile.glasses ??
      colors.glasses ??
      (profile.accessory ? profile.accessory === "glasses" : defaults.glasses),
  };
}

function sparkle(ctx, x, y, color = C.ivory, size = 1) {
  rect(ctx, x - size, y, size * 3, size, color);
  rect(ctx, x, y - size, size, size * 3, color);
}

function pot(ctx, x, y, scale = 1, shade = C.copper) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  rect(ctx, -9, 0, 18, 4, C.ink);
  rect(ctx, -7, 4, 14, 11, C.ink);
  rect(ctx, -6, 1, 12, 4, shade);
  rect(ctx, -5, 5, 10, 8, shade);
  rect(ctx, -4, 5, 3, 7, C.copperLight);
  ctx.restore();
}

function plant(ctx, x, y, size = 1, style = "leaf") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  rect(ctx, -1, -30, 2, 30, C.green);
  rect(ctx, -9, -23, 9, 5, C.green);
  rect(ctx, -12, -28, 8, 6, C.green);
  rect(ctx, -8, -29, 5, 3, C.mint);
  rect(ctx, 1, -18, 10, 5, C.green);
  rect(ctx, 7, -23, 9, 7, C.green);
  rect(ctx, 8, -23, 6, 3, C.mint);
  rect(ctx, -6, -10, 6, 4, C.green);
  rect(ctx, -10, -14, 7, 6, C.green);
  rect(ctx, 0, -34, 6, 7, C.green);
  rect(ctx, 3, -36, 5, 5, C.mint);
  if (style === "flower") {
    pixelCircle(ctx, -10, -30, 6, C.pink);
    pixelCircle(ctx, 9, -27, 6, C.peach);
    rect(ctx, -8, -28, 2, 2, C.gold);
  }
  pot(ctx, 0, 0);
  ctx.restore();
}

function window(ctx, x, y, w, h, time) {
  const shape = (inset = 0) => [
    [x + inset, y + 22],
    [x + 4 + inset, y + 12],
    [x + 12 + inset, y + 5],
    [x + 24, y + inset],
    [x + w - 24, y + inset],
    [x + w - 12 - inset, y + 5],
    [x + w - 4 - inset, y + 12],
    [x + w - inset, y + 22],
    [x + w - inset, y + h - inset],
    [x + inset, y + h - inset],
  ];
  poly(ctx, shape(), C.woodDark);
  poly(ctx, shape(3), C.woodLight);
  ctx.save();
  ctx.beginPath();
  shape(7).forEach(([px, py], i) =>
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py),
  );
  ctx.closePath();
  ctx.clip();
  rect(ctx, x, y, w, h, C.sky);
  rect(ctx, x, y + 45, w, h - 45, "#9bb79f");
  rect(ctx, x + 9, y + 21, 29, 6, C.skyLight);
  rect(ctx, x + 14, y + 17, 19, 10, C.skyLight);
  rect(ctx, x + 51, y + 32, 32, 5, C.skyLight);
  rect(ctx, x + 59, y + 28, 17, 9, C.skyLight);
  pixelCircle(ctx, x + w - 29, y + 14, 14, "#f2d69c");
  rect(ctx, x + 5, y + 68, 27, 30, "#789782");
  rect(ctx, x + 9, y + 59, 19, 10, "#789782");
  rect(ctx, x + w - 28, y + 57, 31, 42, "#8fa98e");
  rect(ctx, x + w - 23, y + 49, 16, 10, "#8fa98e");
  rect(ctx, x + 10, y + 73, 5, 8, "#b9c3a1");
  rect(ctx, x + 21, y + 73, 5, 8, "#b9c3a1");
  rect(ctx, x + 10, y + 87, 5, 8, "#b9c3a1");
  rect(ctx, x + 21, y + 87, 5, 8, "#b9c3a1");
  const bird = Math.floor((time / 140 + x) % (w + 20)) - 10;
  rect(ctx, x + bird, y + 39, 3, 1, C.green);
  rect(ctx, x + bird + 2, y + 40, 3, 1, C.green);
  ctx.restore();
  rect(ctx, x + Math.floor(w / 2) - 2, y + 7, 4, h - 10, C.woodLight);
  rect(ctx, x + 5, y + 47, w - 10, 4, C.woodLight);
  rect(ctx, x - 4, y + h, w + 8, 6, C.woodDark);
  rect(ctx, x - 4, y + h, w + 8, 3, C.woodLight);
}

function lamp(ctx, x, y, time, offset = 0) {
  rect(ctx, x, 0, 2, y, C.woodDark);
  rect(ctx, x - 9, y, 20, 3, C.ink);
  poly(
    ctx,
    [
      [x - 8, y + 2],
      [x + 10, y + 2],
      [x + 16, y + 12],
      [x - 14, y + 12],
    ],
    C.copper,
  );
  rect(ctx, x - 14, y + 12, 30, 3, C.ink);
  rect(ctx, x - 11, y + 12, 24, 2, C.gold);
  rect(ctx, x - 3, y + 15, 7, 3, "#ffdfa1");
  ctx.globalAlpha = 0.07 + Math.sin(time / 1600 + offset) * 0.01;
  poly(
    ctx,
    [
      [x - 10, y + 15],
      [x + 13, y + 15],
      [x + 48, 144],
      [x - 45, 144],
    ],
    C.gold,
  );
  ctx.globalAlpha = 1;
}

function cat(ctx, x, y, time) {
  rect(ctx, x + 3, y + 7, 20, 9, "#b8754f");
  rect(ctx, x + 2, y + 4, 13, 10, C.copper);
  rect(ctx, x + 3, y, 4, 6, C.copper);
  rect(ctx, x + 11, y, 4, 6, C.copper);
  rect(ctx, x + 4, y + 1, 2, 3, "#ddb08a");
  rect(ctx, x + 12, y + 1, 2, 3, "#ddb08a");
  rect(ctx, x + 5, y + 7, 2, 1, C.ink);
  rect(ctx, x + 11, y + 7, 2, 1, C.ink);
  rect(ctx, x + 8, y + 10, 2, 1, C.cream);
  rect(ctx, x + 4, y + 15, 21, 2, "#996448");
  rect(ctx, x + 23, y + 10, 8, 4, "#b8754f");
  rect(
    ctx,
    x + 28,
    y + 5 + (Math.sin(time / 1000) > 0 ? 1 : 0),
    3,
    7,
    "#b8754f",
  );
}

function books(ctx, x, y) {
  ["#b66e57", "#a1b28f", "#d3aa71", "#7e9a91", "#c49483"].forEach(
    (color, i) => {
      const h = 17 + (i % 3) * 3;
      rect(ctx, x + i * 6, y - h, 5, h, C.ink);
      rect(ctx, x + i * 6 + 1, y - h + 1, 3, h - 2, color);
      rect(ctx, x + i * 6 + 1, y - h + 5, 3, 1, C.ivory);
    },
  );
}

function mug(ctx, x, y, color = C.ivory, steam = false, time = 0) {
  rect(ctx, x, y, 12, 10, C.ink);
  rect(ctx, x + 1, y + 1, 10, 8, color);
  rect(ctx, x + 12, y + 2, 4, 6, C.ink);
  rect(ctx, x + 12, y + 3, 2, 3, C.cream);
  rect(ctx, x + 1, y, 10, 2, C.coffee);
  rect(ctx, x - 2, y + 10, 18, 2, C.steel);
  if (steam) steamCloud(ctx, x + 5, y - 2, time, 1);
}

function steamCloud(ctx, x, y, time, intensity = 1) {
  const ticks = time / 550;
  for (let i = 0; i < 3; i++) {
    const phase = (ticks + i * 0.65) % 2.2;
    const rise = Math.floor(phase * 9 * intensity);
    const drift = Math.round(Math.sin(phase * 2 + i) * 3);
    ctx.globalAlpha = Math.max(0, 0.56 * (1 - phase / 2.2));
    rect(
      ctx,
      x + drift + i * 4 - 4,
      y - rise,
      3 + (phase > 1 ? 2 : 0),
      3,
      C.ivory,
    );
    rect(ctx, x + drift + i * 4 - 3, y - rise - 3, 2, 4, C.ivory);
  }
  ctx.globalAlpha = 1;
}

function jobRunning(job) {
  return (
    !!job &&
    !job.ready &&
    (job.remaining > 0 || job.status === "working" || job.status === "running")
  );
}

function jobReady(job) {
  return !!job && (job.ready || job.status === "ready");
}

function statusLight(ctx, x, y, job, time) {
  rect(ctx, x - 1, y - 1, 5, 5, C.ink);
  rect(
    ctx,
    x,
    y,
    3,
    3,
    jobReady(job)
      ? "#b5d677"
      : jobRunning(job)
        ? Math.floor(time / 380) % 2
          ? C.gold
          : C.copper
        : "#859980",
  );
}

function espressoMachine(ctx, x, y, job, time) {
  rect(ctx, x - 4, y + 48, 103, 6, "rgba(66,51,37,.16)");
  rect(ctx, x, y + 1, 93, 44, C.ink);
  rect(ctx, x + 3, y + 3, 87, 21, C.green);
  rect(ctx, x + 3, y + 24, 87, 18, "#749180");
  rect(ctx, x + 5, y + 5, 83, 3, "#789785");
  rect(ctx, x + 8, y + 11, 39, 7, "#d8d4b8");
  text(ctx, "SECOND POUR", x + 12, y + 12, C.green, 5);
  rect(ctx, x + 55, y + 10, 14, 9, C.ink);
  rect(ctx, x + 57, y + 12, 10, 5, "#d1c5a5");
  rect(ctx, x + 61, y + 13, 1, 3, C.copper);
  statusLight(ctx, x + 78, y + 13, job, time);
  rect(ctx, x + 2, y + 24, 89, 4, C.ink);
  rect(ctx, x + 10, y + 28, 21, 7, C.ink);
  rect(ctx, x + 48, y + 28, 21, 7, C.ink);
  rect(ctx, x + 13, y + 28, 14, 3, C.steel);
  rect(ctx, x + 51, y + 28, 14, 3, C.steel);
  rect(ctx, x + 27, y + 29, 15, 4, C.woodDark);
  rect(ctx, x + 65, y + 29, 15, 4, C.woodDark);
  rect(ctx, x + 85, y + 26, 3, 15, C.steel);
  rect(ctx, x + 81, y + 39, 6, 3, C.steel);
  rect(ctx, x + 9, y + 36, 71, 12, "#273f35");
  mug(ctx, x + 16, y + 36, C.ivory);
  mug(ctx, x + 52, y + 36, C.pink);
  if (jobRunning(job)) {
    rect(ctx, x + 21, y + 32, 1, 4, C.coffee);
    rect(ctx, x + 57, y + 32, 1, 4, C.coffee);
    steamCloud(ctx, x + 19, y + 36, time, 0.8);
    steamCloud(ctx, x + 59, y + 36, time + 250, 0.8);
  }
  rect(ctx, x + 2, y + 48, 89, 4, C.ink);
  rect(ctx, x + 6, y + 48, 81, 2, C.steel);
  for (let n = 10; n < 83; n += 6) rect(ctx, x + n, y + 49, 2, 2, "#7c9584");
  mug(ctx, x + 10, y - 10, C.ivory);
  mug(ctx, x + 29, y - 10, C.ivory);
  mug(ctx, x + 48, y - 10, C.ivory);
}

function milkStation(ctx, x, y, job, time) {
  rect(ctx, x, y + 48, 91, 5, "rgba(66,51,37,.16)");
  rect(ctx, x + 1, y + 9, 26, 37, C.ink);
  rect(ctx, x + 3, y + 12, 22, 31, C.ivory);
  poly(
    ctx,
    [
      [x + 2, y + 10],
      [x + 8, y],
      [x + 20, y],
      [x + 26, y + 10],
    ],
    C.ink,
  );
  poly(
    ctx,
    [
      [x + 5, y + 10],
      [x + 10, y + 3],
      [x + 19, y + 3],
      [x + 23, y + 10],
    ],
    C.paleMint,
  );
  rect(ctx, x + 9, y + 2, 11, 3, C.green);
  rect(ctx, x + 4, y + 23, 21, 11, C.green);
  text(ctx, "MILK", x + 7, y + 26, C.ivory, 5);
  rect(ctx, x + 31, y + 2, 6, 41, C.ink);
  rect(ctx, x + 32, y + 3, 4, 36, C.steel);
  rect(ctx, x + 34, y + 2, 18, 5, C.ink);
  rect(ctx, x + 37, y + 3, 13, 2, C.steel);
  rect(ctx, x + 47, y + 6, 4, 20, C.ink);
  rect(ctx, x + 48, y + 7, 2, 18, C.steel);
  rect(ctx, x + 43, y + 25, 23, 21, C.ink);
  rect(ctx, x + 45, y + 27, 18, 17, C.steel);
  rect(ctx, x + 47, y + 29, 4, 13, "#e6e4cc");
  rect(ctx, x + 63, y + 28, 7, 13, C.ink);
  rect(ctx, x + 64, y + 30, 3, 8, C.wall);
  rect(ctx, x + 44, y + 25, 20, 3, C.ivory);
  rect(ctx, x + 76, y + 13, 8, 33, C.ink);
  rect(ctx, x + 78, y + 14, 4, 27, "#e3b778");
  rect(ctx, x + 77, y + 10, 6, 4, C.green);
  rect(ctx, x + 75, y + 7, 8, 3, C.ink);
  statusLight(ctx, x + 33, y + 40, job, time);
  if (jobRunning(job) || jobReady(job))
    steamCloud(ctx, x + 52, y + 23, time, jobRunning(job) ? 1.25 : 0.7);
}

function kettleStation(ctx, x, y, job, time) {
  rect(ctx, x, y + 48, 93, 5, "rgba(66,51,37,.16)");
  rect(ctx, x + 4, y + 43, 54, 8, C.ink);
  rect(ctx, x + 7, y + 44, 48, 4, C.woodLight);
  rect(ctx, x + 13, y + 16, 35, 27, C.ink);
  rect(ctx, x + 18, y + 11, 25, 7, C.ink);
  rect(ctx, x + 18, y + 18, 26, 21, C.copper);
  rect(ctx, x + 15, y + 22, 30, 14, C.copper);
  rect(ctx, x + 20, y + 16, 22, 5, C.copperLight);
  rect(ctx, x + 20, y + 19, 4, 15, "#efb98a");
  rect(ctx, x + 47, y + 16, 13, 19, C.ink);
  rect(ctx, x + 50, y + 19, 7, 12, C.wall);
  rect(ctx, x + 5, y + 20, 12, 5, C.ink);
  rect(ctx, x + 2, y + 15, 7, 9, C.ink);
  rect(ctx, x + 5, y + 16, 3, 6, C.copperLight);
  rect(ctx, x + 24, y + 9, 12, 4, C.ink);
  rect(ctx, x + 27, y + 6, 6, 4, C.woodDark);
  statusLight(ctx, x + 46, y + 45, job, time);
  rect(ctx, x + 67, y + 27, 20, 21, C.ink);
  rect(ctx, x + 69, y + 29, 16, 17, "#a9b591");
  rect(ctx, x + 67, y + 24, 20, 5, C.woodDark);
  text(ctx, "TEA", x + 70, y + 35, C.ink, 5);
  rect(ctx, x + 73, y + 21, 2, 3, C.ivory);
  rect(ctx, x + 80, y + 22, 2, 2, C.ivory);
  if (jobRunning(job) || jobReady(job))
    steamCloud(ctx, x + 7, y + 15, time, 1.2);
}

function croissant(ctx, x, y, size = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  poly(
    ctx,
    [
      [0, 7],
      [2, 2],
      [6, 0],
      [16, 0],
      [20, 2],
      [23, 7],
      [21, 11],
      [17, 8],
      [6, 8],
      [2, 11],
    ],
    C.woodDark,
  );
  poly(
    ctx,
    [
      [2, 6],
      [5, 2],
      [16, 2],
      [20, 5],
      [20, 8],
      [16, 6],
      [7, 6],
      [4, 8],
    ],
    "#e3a754",
  );
  rect(ctx, 7, 2, 2, 5, "#f8ce83");
  rect(ctx, 12, 1, 2, 6, "#b77836");
  rect(ctx, 17, 3, 2, 4, "#b77836");
  ctx.restore();
}

function ovenStation(ctx, x, y, job, time) {
  rect(ctx, x - 3, y + 48, 99, 5, "rgba(66,51,37,.16)");
  rect(ctx, x, y + 2, 91, 48, C.ink);
  rect(ctx, x + 3, y + 5, 85, 42, "#74867b");
  rect(ctx, x + 3, y + 5, 85, 4, "#a4b2a0");
  rect(ctx, x + 8, y + 12, 62, 28, C.ink);
  rect(
    ctx,
    x + 11,
    y + 15,
    56,
    22,
    jobRunning(job) || jobReady(job) ? "#a86a40" : "#51634e",
  );
  rect(
    ctx,
    x + 14,
    y + 17,
    50,
    18,
    jobRunning(job) || jobReady(job) ? "#d6924d" : "#71816a",
  );
  if (jobRunning(job)) {
    ctx.globalAlpha = 0.16 + (Math.sin(time / 180) + 1) * 0.05;
    rect(ctx, x + 14, y + 17, 50, 18, "#ffd581");
    ctx.globalAlpha = 1;
  }
  croissant(ctx, x + 18, y + 24, 0.8);
  croissant(ctx, x + 41, y + 24, 0.8);
  rect(ctx, x + 10, y + 13, 2, 23, "#becbbb");
  rect(ctx, x + 8, y + 10, 62, 4, C.ink);
  rect(ctx, x + 11, y + 10, 54, 2, C.steel);
  rect(ctx, x + 12, y + 37, 54, 3, C.steel);
  pixelCircle(ctx, x + 76, y + 14, 8, C.ink);
  rect(ctx, x + 79, y + 16, 2, 4, C.steel);
  pixelCircle(ctx, x + 76, y + 27, 8, C.ink);
  rect(ctx, x + 78, y + 29, 4, 2, C.steel);
  statusLight(ctx, x + 78, y + 39, job, time);
  rect(ctx, x + 6, y + 46, 10, 6, C.ink);
  rect(ctx, x + 76, y + 46, 10, 6, C.ink);
  rect(ctx, x + 14, y - 7, 20, 9, C.ivory);
  rect(ctx, x + 16, y - 5, 16, 2, C.pink);
  rect(ctx, x + 39, y - 9, 25, 11, C.ivory);
  rect(ctx, x + 42, y - 6, 19, 2, C.paleMint);
  if (jobReady(job)) sparkle(ctx, x + 42, y + 21, C.ivory, 2);
}

function face(ctx, x, y, profile, opts = {}) {
  const p = normalizeProfile(profile);
  const bob = p.hairStyle === "bob" || p.hairStyle === "long";
  const curly = p.hairStyle === "curly";
  const bun = p.hairStyle === "bun";
  const darkSkin = p.skin;
  const skinShade = p.skinShadow || "#b77f61";
  rect(ctx, x - 10, y + 4, 22, 22, C.ink);
  if (bob) rect(ctx, x - 13, y + 3, 28, 26, p.hair);
  rect(ctx, x - 9, y + 2, 21, 21, p.hair);
  rect(ctx, x - 8, y + 10, 18, 17, C.ink);
  rect(ctx, x - 7, y + 8, 17, 16, darkSkin);
  rect(ctx, x - 10, y + 13, 3, 7, darkSkin);
  rect(ctx, x + 10, y + 13, 3, 7, darkSkin);
  rect(ctx, x - 6, y + 24, 14, 3, darkSkin);
  rect(ctx, x - 1, y + 26, 5, 5, skinShade);
  rect(ctx, x - 8, y + 3, 19, 6, p.hair);
  rect(ctx, x - 9, y + 8, 4, 6, p.hair);
  if (bob) {
    rect(ctx, x - 12, y + 8, 4, 20, p.hair);
    rect(ctx, x + 10, y + 8, 4, 20, p.hair);
    rect(ctx, x - 10, y + 2, 8, 4, p.hair);
    rect(ctx, x - 10, y + 10, 2, 10, "#8b644b");
  }
  if (curly) {
    for (const [dx, dy] of [
      [-12, 3],
      [-8, -1],
      [-2, -2],
      [4, -1],
      [9, 3],
    ])
      pixelCircle(ctx, x + dx, y + dy, 7, p.hair);
    rect(ctx, x - 7, y + 1, 3, 2, "#9a7454");
  }
  if (bun) {
    pixelCircle(ctx, x - 2, y - 5, 11, C.ink);
    pixelCircle(ctx, x - 1, y - 4, 9, p.hair);
    rect(ctx, x - 7, y + 6, 16, 2, p.hair);
  }
  if (p.hairStyle === "cap" || p.hat) {
    rect(ctx, x - 10, y + 2, 24, 6, C.green);
    rect(ctx, x - 6, y - 2, 16, 6, C.green);
    rect(ctx, x + 8, y + 6, 10, 3, C.green);
  }
  if (p.hairStyle === "beanie" || p.accessory === "beanie") {
    rect(ctx, x - 11, y + 3, 25, 5, "#b67f6d");
    rect(ctx, x - 8, y - 3, 19, 7, "#b67f6d");
    rect(ctx, x - 5, y - 5, 13, 3, "#b67f6d");
    rect(ctx, x - 10, y + 5, 23, 3, C.pink);
    rect(ctx, x - 4, y - 2, 2, 5, "#dca593");
  }
  if (p.accessory === "headphones") {
    rect(ctx, x - 12, y + 8, 3, 13, C.ink);
    rect(ctx, x + 11, y + 8, 3, 13, C.ink);
    rect(ctx, x - 9, y + 2, 21, 2, C.copper);
    rect(ctx, x - 12, y + 9, 2, 10, C.copper);
    rect(ctx, x + 12, y + 9, 2, 10, C.copper);
  }
  const blink = opts.blink;
  rect(ctx, x - 4, y + 15, 2, blink ? 1 : 3, C.ink);
  rect(ctx, x + 5, y + 15, 2, blink ? 1 : 3, C.ink);
  rect(ctx, x + 1, y + 18, 2, 2, skinShade);
  rect(ctx, x - 4, y + 20, 3, 1, "#d9947e");
  rect(ctx, x + 6, y + 20, 3, 1, "#d9947e");
  rect(ctx, x, y + 23, 5, 1, C.ink);
  rect(ctx, x + 1, y + 24, 3, 1, "#f0c19b");
  if (p.glasses) {
    rect(ctx, x - 6, y + 14, 7, 6, C.ink);
    rect(ctx, x - 5, y + 15, 5, 3, darkSkin);
    rect(ctx, x + 3, y + 14, 7, 6, C.ink);
    rect(ctx, x + 4, y + 15, 5, 3, darkSkin);
    rect(ctx, x + 1, y + 16, 2, 1, C.ink);
    rect(ctx, x - 4, y + 15, 1, 1, C.ivory);
    rect(ctx, x + 5, y + 15, 1, 1, C.ivory);
  }
  if (p.beard) {
    rect(ctx, x - 6, y + 22, 14, 4, p.hair);
    rect(ctx, x - 3, y + 26, 8, 2, p.hair);
    rect(ctx, x, y + 23, 5, 1, C.peach);
  }
  if (p.accessory === "earrings") {
    rect(ctx, x - 10, y + 20, 2, 4, C.gold);
    rect(ctx, x + 11, y + 20, 2, 4, C.gold);
  }
}

function character(
  ctx,
  x,
  y,
  profile,
  { time = 0, index = 0, selected = false, patience = 1 } = {},
) {
  const p = normalizeProfile(profile);
  const breath = Math.sin(time / 650 + index * 1.7) > 0.2 ? 1 : 0;
  y += breath;
  pixelCircle(ctx, x - 19, y + 52, 39, "rgba(61,57,37,.12)");
  rect(ctx, x - 11, y + 43, 9, 19, C.ink);
  rect(ctx, x + 3, y + 43, 9, 19, C.ink);
  rect(ctx, x - 12, y + 60, 11, 4, "#535342");
  rect(ctx, x + 3, y + 60, 11, 4, "#535342");
  rect(ctx, x - 15, y + 30, 32, 19, C.ink);
  rect(ctx, x - 14, y + 29, 30, 17, p.shirt);
  rect(ctx, x - 10, y + 27, 21, 8, p.shirt);
  rect(ctx, x - 18, y + 32, 5, 14, p.shirt);
  rect(ctx, x + 16, y + 32, 5, 14, p.shirt);
  rect(ctx, x - 17, y + 44, 4, 5, p.skin);
  rect(ctx, x + 16, y + 44, 4, 5, p.skin);
  rect(ctx, x - 10, y + 32, 2, 13, "rgba(255,244,214,.25)");
  rect(ctx, x + 3, y + 34, 1, 11, C.inkLight);
  rect(ctx, x - 5, y + 30, 13, 3, C.ivory);
  if (p.accessory === "scarf") {
    rect(ctx, x - 6, y + 29, 16, 4, C.copper);
    rect(ctx, x + 7, y + 32, 4, 11, C.copper);
    rect(ctx, x + 7, y + 35, 4, 2, C.gold);
  }
  face(ctx, x, y, p, { blink: Math.floor(time / 160) % 37 === index + 1 });
  if (selected) {
    rect(ctx, x - 24, y - 11, 49, 2, C.gold);
    rect(ctx, x - 24, y - 9, 2, 19, C.gold);
    rect(ctx, x + 23, y - 9, 2, 19, C.gold);
    rect(ctx, x - 22, y - 8, 3, 3, C.ivory);
    poly(
      ctx,
      [
        [x - 4, y - 18],
        [x + 6, y - 18],
        [x + 1, y - 12],
      ],
      C.gold,
    );
  }
  rect(ctx, x - 18, y + 68, 38, 4, "#c9b394");
  rect(
    ctx,
    x - 17,
    y + 69,
    Math.max(1, Math.floor(36 * patience)),
    2,
    patience > 0.4 ? C.green : C.copper,
  );
}

function barista(ctx, x, y, time) {
  const p = {
    skin: "#ddb08b",
    hair: "#624737",
    shirt: C.ivory,
    hairStyle: "cap",
  };
  rect(ctx, x - 10, y + 40, 8, 22, C.ink);
  rect(ctx, x + 4, y + 40, 8, 22, C.ink);
  rect(ctx, x - 15, y + 29, 33, 25, C.ivory);
  rect(ctx, x - 10, y + 29, 25, 25, C.green);
  rect(ctx, x - 3, y + 31, 2, 15, C.mint);
  rect(ctx, x + 9, y + 31, 2, 15, C.mint);
  rect(ctx, x - 6, y + 43, 16, 8, "#6c8d74");
  rect(ctx, x - 17, y + 31, 4, 15, C.ivory);
  rect(ctx, x + 18, y + 30, 4, 11, C.ivory);
  rect(ctx, x - 17, y + 46, 4, 5, p.skin);
  rect(ctx, x + 19, y + 39, 4, 5, p.skin);
  face(ctx, x, y, p, { blink: Math.floor(time / 150) % 40 === 0 });
  mug(ctx, x + 20, y + 39, C.ivory, true, time);
}

function pastryDisplay(ctx, x, y) {
  rect(ctx, x, y + 19, 48, 7, C.woodDark);
  rect(ctx, x + 2, y + 21, 44, 3, C.woodLight);
  poly(
    ctx,
    [
      [x + 2, y + 4],
      [x + 9, y],
      [x + 43, y],
      [x + 47, y + 4],
      [x + 47, y + 20],
      [x + 2, y + 20],
    ],
    C.ink,
  );
  poly(
    ctx,
    [
      [x + 4, y + 5],
      [x + 10, y + 2],
      [x + 42, y + 2],
      [x + 45, y + 5],
      [x + 45, y + 18],
      [x + 4, y + 18],
    ],
    "#ced2b9",
  );
  croissant(ctx, x + 7, y + 8, 0.65);
  croissant(ctx, x + 26, y + 8, 0.65);
  rect(ctx, x + 7, y + 3, 2, 14, "#edf0d7");
  rect(ctx, x + 10, y + 3, 10, 1, "#edf0d7");
}

function stationPlaque(ctx, x, y, label, selected) {
  rect(ctx, x - 3, y - 2, 91, 16, C.woodDark);
  rect(ctx, x - 2, y - 1, 89, 14, selected ? C.gold : C.ivory);
  rect(ctx, x + 1, y + 1, 83, 10, selected ? "#f4d39b" : C.cream);
  text(ctx, label, x + 43, y + 2, C.ink, 7, "center");
  rect(ctx, x + 1, y + 4, 2, 2, C.woodDark);
  rect(ctx, x + 81, y + 4, 2, 2, C.woodDark);
}

/** Paint the complete café and return its clickable stations and guests. */
export function drawCafe(
  ctx,
  state = {},
  {
    width = ctx.canvas.width,
    height = ctx.canvas.height,
    time = 0,
    selectedStation = null,
  } = {},
) {
  width = Math.max(1, Number(width) || 1);
  height = Math.max(1, Number(height) || 1);
  const scale = Math.min(width / 640, height / 280);
  const ox = (width - 640 * scale) / 2;
  const oy = (height - 280 * scale) / 2;
  const jobs = state.jobs || {};
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  rect(ctx, 0, 0, width, height, C.cream);
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  rect(ctx, 0, 0, 640, 280, C.wall);
  rect(ctx, 0, 0, 640, 7, C.woodDark);
  rect(ctx, 0, 7, 640, 5, C.woodLight);
  rect(ctx, 0, 12, 640, 2, "#edcfa0");
  for (let x = 0; x < 640; x += 32) rect(ctx, x, 14, 1, 130, "#e2cdae");
  rect(ctx, 0, 124, 640, 44, "#b5bfa0");
  for (let x = 0; x < 640; x += 22) {
    rect(ctx, x, 128, 2, 36, "#8ea18a");
    rect(ctx, x + 3, 128, 1, 36, "#cbd0af");
  }
  rect(ctx, 0, 122, 640, 4, C.green);
  rect(ctx, 0, 164, 640, 5, C.green);

  window(ctx, 30, 28, 96, 84, time);
  window(ctx, 149, 28, 96, 84, time + 2500);
  plant(ctx, 37, 111, 0.65, "flower");
  cat(ctx, 82, 98, time);
  plant(ctx, 220, 110, 0.72);
  poly(
    ctx,
    [
      [35, 117],
      [75, 117],
      [161, 211],
      [78, 211],
    ],
    "rgba(255,239,193,.18)",
  );
  poly(
    ctx,
    [
      [154, 117],
      [181, 117],
      [264, 211],
      [207, 211],
    ],
    "rgba(255,239,193,.12)",
  );

  rect(ctx, 268, 25, 168, 70, C.woodDark);
  rect(ctx, 271, 28, 162, 64, C.woodLight);
  rect(ctx, 275, 32, 154, 56, C.green);
  rect(ctx, 278, 35, 148, 50, "#3f6256");
  text(ctx, "SECOND POUR", 352, 41, C.ivory, 15, "center");
  rect(ctx, 294, 61, 116, 1, "#94ac91");
  text(ctx, "GOOD COFFEE. GOOD COMPANY.", 352, 69, C.paleMint, 6, "center");
  sparkle(ctx, 285, 49, C.gold);
  sparkle(ctx, 418, 49, C.gold);
  rect(ctx, 275, 94, 154, 3, C.woodDark);

  rect(ctx, 461, 42, 30, 35, C.woodDark);
  rect(ctx, 464, 45, 24, 29, C.ivory);
  rect(ctx, 467, 48, 18, 20, C.pink);
  pixelCircle(ctx, 471, 52, 10, C.gold);
  rect(ctx, 469, 62, 13, 2, C.ivory);
  text(ctx, "LOCAL", 476, 69, C.ink, 4, "center");

  rect(ctx, 515, 30, 106, 5, C.woodDark);
  rect(ctx, 515, 31, 106, 2, C.woodLight);
  rect(ctx, 515, 74, 106, 5, C.woodDark);
  rect(ctx, 515, 75, 106, 2, C.woodLight);
  books(ctx, 520, 30);
  plant(ctx, 578, 17, 0.5);
  mug(ctx, 601, 19, C.pink);
  for (let i = 0; i < 4; i++) {
    const x = 524 + i * 22;
    rect(ctx, x, 51, 16, 22, C.ink);
    rect(
      ctx,
      x + 1,
      53,
      14,
      18,
      ["#ab9a6c", "#af8763", "#909a70", "#b9856b"][i],
    );
    rect(ctx, x - 1, 48, 18, 5, C.woodDark);
    rect(ctx, x + 4, 59, 7, 7, C.ivory);
    rect(ctx, x + 6, 61, 3, 3, C.coffee);
    rect(ctx, x + 2, 54, 1, 15, "#e0c69a");
  }

  lamp(ctx, 136, 22, time);
  lamp(ctx, 452, 18, time, 2);

  rect(ctx, 0, 207, 640, 73, C.tile);
  for (let row = 0; row < 4; row++) {
    for (let col = -1; col < 22; col++) {
      const x = col * 34 + (row % 2 ? 17 : 0);
      const y = 210 + row * 19;
      rect(ctx, x, y, 33, 18, (row + col) % 3 === 0 ? "#dfc9aa" : "#ecdbbf");
      rect(ctx, x, y + 17, 33, 1, C.tileShade);
      rect(ctx, x + 32, y, 1, 18, C.tileShade);
      if ((col * 13 + row * 7) % 9 === 0)
        rect(ctx, x + 4, y + 4, 3, 1, "#d6bd9a");
    }
  }

  // The oak worktop has four large stations with their own hand-painted labels.
  rect(ctx, 68, 136, 552, 70, C.woodDark);
  rect(ctx, 72, 147, 544, 57, "#bf875a");
  rect(ctx, 72, 149, 544, 2, "#e0ae77");
  for (let x = 78; x < 616; x += 45) {
    rect(ctx, x, 153, 37, 46, "#ca9363");
    rect(ctx, x + 3, 158, 30, 37, "#b78256");
    rect(ctx, x + 4, 159, 28, 2, "#dcab78");
    rect(ctx, x + 31, 160, 1, 34, "#956849");
  }
  rect(ctx, 64, 132, 560, 10, C.ink);
  rect(ctx, 64, 129, 560, 10, C.woodLight);
  rect(ctx, 64, 130, 560, 2, "#f0c08d");
  rect(ctx, 64, 137, 560, 4, "#ad754e");
  rect(ctx, 64, 204, 560, 4, C.woodDark);
  rect(ctx, 68, 208, 552, 4, "rgba(65,52,36,.13)");

  espressoMachine(ctx, 90, 78, jobs.espresso, time);
  milkStation(ctx, 227, 78, jobs.milk, time);
  kettleStation(ctx, 363, 78, jobs.kettle, time);
  ovenStation(ctx, 499, 78, jobs.oven, time);
  ["espresso", "milk", "kettle", "oven"].forEach((station, i) => {
    if (selectedStation === station) {
      rect(ctx, 83 + i * 136, 69, 107, 2, C.gold);
      rect(ctx, 83 + i * 136, 71, 2, 62, C.gold);
      rect(ctx, 188 + i * 136, 71, 2, 62, C.gold);
    }
    stationPlaque(
      ctx,
      92 + i * 136,
      158,
      ["ESPRESSO", "MILK BAR", "TEA KETTLE", "BAKE & WARM"][i],
      selectedStation === station,
    );
  });

  rect(ctx, 14, 124, 35, 8, C.woodLight);
  rect(ctx, 16, 131, 4, 57, C.woodDark);
  rect(ctx, 42, 131, 4, 57, C.woodDark);
  mug(ctx, 20, 112, C.pink, true, time);
  rect(ctx, 33, 113, 12, 3, C.ivory);
  rect(ctx, 34, 110, 10, 3, "#cba46d");
  barista(ctx, 42, 131, time);
  pastryDisplay(ctx, 573, 179);

  const queue = (state.queue || state.customers || []).slice(0, 5);
  const spots =
    queue.length > 4 ? [116, 217, 319, 421, 522] : [132, 267, 403, 535];
  const customerTargets = [];
  queue.forEach((customer, i) => {
    const x = spots[i];
    const y = 187;
    const selected = customer.id === state.selectedId;
    const p = profileFor(customer, i);
    const patience = Math.max(
      0,
      Math.min(1, (customer.patience ?? 1) / (customer.maxPatience ?? 1)),
    );
    character(ctx, x, y, p, { time, index: i, selected, patience });
    if (selected) {
      const name = customer.name || p.name || "YOUR GUEST";
      const labelWidth = Math.max(35, Math.min(86, name.length * 5 + 10));
      rect(ctx, x - labelWidth / 2, 260, labelWidth, 12, C.green);
      text(ctx, name.toUpperCase(), x, 263, C.ivory, 6, "center");
    }
    customerTargets.push({
      id: customer.id,
      x: ox + (x - 28) * scale,
      y: oy + (y - 16) * scale,
      w: 56 * scale,
      h: 83 * scale,
    });
  });

  plant(ctx, 18, 237, 1.1);
  plant(ctx, 614, 241, 1.35);
  // A scattering of the small lived-in details that make a café feel like a café.
  rect(ctx, 77, 217, 4, 22, C.woodDark);
  rect(ctx, 91, 217, 4, 22, C.woodDark);
  rect(ctx, 72, 214, 28, 7, C.ink);
  rect(ctx, 74, 213, 24, 5, C.copper);
  rect(ctx, 78, 230, 15, 2, C.woodDark);
  rect(ctx, 565, 244, 24, 14, C.woodDark);
  rect(ctx, 566, 245, 22, 11, C.ivory);
  rect(ctx, 568, 247, 8, 1, "#beaa89");
  rect(ctx, 578, 247, 8, 1, "#beaa89");
  rect(ctx, 568, 250, 8, 1, "#beaa89");
  rect(ctx, 578, 250, 8, 1, "#beaa89");
  rect(ctx, 576, 245, 1, 11, C.copper);
  ctx.restore();

  const stations = {};
  ["espresso", "milk", "kettle", "oven"].forEach((station, i) => {
    stations[station] = {
      x: ox + (82 + i * 136) * scale,
      y: oy + 66 * scale,
      w: 108 * scale,
      h: 110 * scale,
    };
  });
  return {
    stations,
    customers: customerTargets,
    scale,
    offsetX: ox,
    offsetY: oy,
  };
}

/** A bright, friendly portrait for a guest's conversation card. */
export function drawPortrait(
  ctx,
  profile = {},
  width = ctx.canvas.width,
  height = ctx.canvas.height,
) {
  if (typeof width === "object") {
    height = width.height ?? ctx.canvas.height;
    width = width.width ?? ctx.canvas.width;
  }
  width = Math.max(1, Number(width) || 1);
  height = Math.max(1, Number(height) || 1);
  const p = normalizeProfile(profile);
  const scale = Math.min(width, height) / 48;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  rect(ctx, 0, 0, width, height, p.portraitBackground || "#d9dfbb");
  ctx.translate((width - scale * 48) / 2, (height - scale * 48) / 2);
  ctx.scale(scale, scale);
  rect(ctx, 0, 37, 48, 11, "#c1ceaa");
  sparkle(ctx, 7, 9, C.ivory);
  sparkle(ctx, 40, 21, C.ivory);
  rect(ctx, 8, 37, 34, 13, C.ink);
  rect(ctx, 10, 35, 30, 13, p.shirt);
  rect(ctx, 16, 32, 19, 13, p.shirt);
  rect(ctx, 13, 39, 3, 9, "rgba(255,247,219,.26)");
  rect(ctx, 23, 32, 6, 7, p.skin);
  rect(ctx, 19, 36, 13, 3, C.ivory);
  if (p.accessory === "scarf") {
    rect(ctx, 17, 36, 15, 4, C.copper);
    rect(ctx, 29, 39, 4, 9, C.copper);
    rect(ctx, 29, 42, 4, 2, C.gold);
  }
  face(ctx, 23, 8, p);
  ctx.restore();
}

function ingredientNames(drink) {
  const list = drink?.ingredients || drink?.recipe || drink?.contents;
  if (list && !Array.isArray(list))
    return Object.keys(list || {}).filter((key) => list[key]);
  if (Array.isArray(list))
    return list
      .map((item) =>
        typeof item === "string"
          ? item
          : item?.id || item?.ingredientId || item?.name || "",
      )
      .filter(Boolean);
  return [
    "shots",
    "milk",
    "foam",
    "water",
    "tea",
    "chocolate",
    "vanilla",
    "caramel",
    "coldMilk",
  ].filter((key) => Number(drink?.[key]) > 0);
}

/** Draw the actual in-progress drink, including ice and its layered ingredients. */
export function drawDrink(ctx, drink = {}, options = {}) {
  const width = Math.max(1, options.width ?? ctx.canvas.width);
  const height = Math.max(1, options.height ?? ctx.canvas.height);
  const scale = Math.min(width / 64, height / 64);
  const ingredients = ingredientNames(drink);
  const descriptor = [
    drink.id,
    drink.drinkId,
    drink.name,
    drink.type,
    ...ingredients,
  ]
    .join(" ")
    .toLowerCase();
  const has = (...words) => words.some((word) => descriptor.includes(word));
  const iced =
    drink.cup === "iced" || drink.iced || drink.ice || has("ice", "cold");
  const tea = has("tea", "chai", "matcha");
  const milk = has("milk", "latte", "cappuccino", "flat", "chai", "mocha");
  const foam = has("foam", "cappuccino", "latte", "flat");
  const coffeeColor = has("matcha") ? "#789657" : tea ? "#bd8b4c" : "#7e4e32";
  const empty =
    !ingredients.length &&
    !drink.id &&
    !drink.drinkId &&
    !drink.name &&
    !drink.type;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.translate((width - 64 * scale) / 2, (height - 64 * scale) / 2);
  ctx.scale(scale, scale);
  pixelCircle(ctx, 8, 49, 49, "#d8c5a3");
  rect(ctx, 10, 50, 46, 8, C.ivory);
  rect(ctx, 14, 57, 38, 2, "#baa481");
  if (iced) {
    poly(
      ctx,
      [
        [17, 17],
        [46, 17],
        [43, 52],
        [20, 52],
      ],
      C.ink,
    );
    poly(
      ctx,
      [
        [19, 19],
        [44, 19],
        [41, 50],
        [22, 50],
      ],
      "#d1dfc7",
    );
    if (!empty) {
      poly(
        ctx,
        [
          [21, 32],
          [42, 32],
          [40, 48],
          [23, 48],
        ],
        milk ? "#c9a37b" : coffeeColor,
      );
      if (milk) rect(ctx, 22, 38, 19, 10, "#efd6a5");
      rect(ctx, 21, 29, 22, 5, coffeeColor);
      for (const [x, y] of [
        [22, 22],
        [33, 26],
        [25, 33],
      ]) {
        rect(ctx, x, y, 8, 7, "#eceddb");
        rect(ctx, x + 1, y + 1, 5, 4, "#c8d9c0");
        rect(ctx, x + 1, y + 1, 2, 2, C.ivory);
      }
    }
    rect(ctx, 24, 19, 2, 29, "rgba(255,248,223,.5)");
    rect(ctx, 38, 6, 3, 28, C.copper);
    rect(ctx, 40, 6, 9, 3, C.copper);
    rect(ctx, 16, 16, 31, 3, "#9fac94");
  } else {
    rect(ctx, 15, 22, 31, 28, C.ink);
    rect(ctx, 18, 26, 25, 22, options.cupColor || C.green);
    rect(ctx, 18, 48, 24, 4, C.ink);
    rect(ctx, 22, 49, 17, 2, options.cupColor || C.green);
    rect(ctx, 46, 27, 10, 16, C.ink);
    rect(ctx, 46, 30, 7, 10, options.cupColor || C.green);
    rect(ctx, 47, 32, 4, 6, C.ivory);
    rect(ctx, 18, 20, 25, 8, C.ink);
    rect(
      ctx,
      20,
      21,
      21,
      5,
      empty ? "#d6d8bf" : milk ? "#e9c68e" : coffeeColor,
    );
    rect(ctx, 19, 28, 3, 15, "#7f9c83");
    rect(ctx, 27, 33, 8, 8, "#8da68c");
    rect(ctx, 29, 35, 4, 4, C.ivory);
    if (foam && !empty) {
      rect(ctx, 23, 22, 15, 3, C.ivory);
      rect(ctx, 26, 20, 9, 5, C.ivory);
      rect(ctx, 29, 20, 2, 6, coffeeColor);
      rect(ctx, 28, 23, 4, 1, coffeeColor);
    }
    if (!empty && options.steam !== false) {
      rect(ctx, 23, 11, 2, 6, "#bfc8aa");
      rect(ctx, 25, 7, 2, 5, "#bfc8aa");
      rect(ctx, 33, 9, 2, 7, "#bfc8aa");
      rect(ctx, 31, 6, 2, 4, "#bfc8aa");
    }
  }
  if (has("syrup", "vanilla", "caramel")) sparkle(ctx, 48, 15, C.gold, 2);
  if (has("chocolate", "mocha", "cocoa")) {
    rect(ctx, 25, 22, 2, 1, C.coffee);
    rect(ctx, 30, 23, 1, 1, C.coffee);
    rect(ctx, 36, 22, 2, 1, C.coffee);
  }
  if (drink.ready || options.ready) sparkle(ctx, 11, 20, C.gold, 2);
  ctx.restore();
}

/** Small pastry art for the oven, order card, or serving tray. */
export function drawFood(ctx, foodId = "croissant", options = {}) {
  const width = Math.max(1, options.width ?? ctx.canvas.width);
  const height = Math.max(1, options.height ?? ctx.canvas.height);
  const scale = Math.min(width / 64, height / 64);
  const id = String(foodId?.id || foodId || "").toLowerCase();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.translate((width - scale * 64) / 2, (height - scale * 64) / 2);
  ctx.scale(scale, scale);
  pixelCircle(ctx, 8, 31, 48, "#dac8a7");
  rect(ctx, 7, 37, 50, 15, C.ivory);
  rect(ctx, 12, 51, 40, 2, "#c2b08e");
  if (id.includes("cookie")) {
    pixelCircle(ctx, 15, 21, 34, C.woodDark);
    pixelCircle(ctx, 17, 22, 30, "#d9a563");
    rect(ctx, 20, 26, 8, 2, "#efc184");
    for (const [x, y] of [
      [24, 28],
      [36, 29],
      [20, 38],
      [30, 40],
      [40, 38],
    ]) {
      rect(ctx, x, y, 4, 3, C.coffee);
      rect(ctx, x + 1, y - 1, 2, 1, C.coffee);
    }
  } else if (
    id.includes("sandwich") ||
    id.includes("panini") ||
    id.includes("toast")
  ) {
    poly(
      ctx,
      [
        [12, 32],
        [21, 20],
        [48, 26],
        [50, 42],
        [22, 48],
        [12, 42],
      ],
      C.woodDark,
    );
    poly(
      ctx,
      [
        [15, 33],
        [22, 23],
        [46, 28],
        [46, 34],
        [21, 40],
      ],
      "#e4af68",
    );
    rect(ctx, 15, 36, 31, 5, "#d98a68");
    rect(ctx, 14, 39, 33, 4, C.green);
    rect(ctx, 16, 41, 30, 4, "#f0c989");
    rect(ctx, 18, 34, 25, 2, "#f5d5a1");
    for (let i = 0; i < 4; i++)
      rect(ctx, 23 + i * 5, 27 + (i % 2), 2, 6, "#aa753e");
  } else if (id.includes("cinnamon")) {
    pixelCircle(ctx, 14, 20, 36, C.woodDark);
    pixelCircle(ctx, 16, 21, 32, "#daa569");
    rect(ctx, 20, 25, 22, 2, "#a36c3e");
    rect(ctx, 19, 27, 2, 15, "#a36c3e");
    rect(ctx, 21, 42, 20, 2, "#a36c3e");
    rect(ctx, 41, 27, 2, 15, "#a36c3e");
    rect(ctx, 25, 29, 12, 2, "#a36c3e");
    rect(ctx, 25, 31, 2, 8, "#a36c3e");
    rect(ctx, 27, 37, 8, 2, "#a36c3e");
    rect(ctx, 35, 31, 2, 6, "#a36c3e");
    rect(ctx, 29, 32, 6, 2, "#a36c3e");
    rect(ctx, 18, 26, 9, 2, C.ivory);
    rect(ctx, 27, 27, 12, 2, C.ivory);
    rect(ctx, 34, 29, 12, 2, C.ivory);
    rect(ctx, 22, 39, 8, 2, C.ivory);
    rect(ctx, 30, 40, 10, 2, C.ivory);
  } else if (id.includes("muffin")) {
    rect(ctx, 18, 28, 29, 18, C.woodDark);
    rect(ctx, 21, 30, 23, 15, "#c38b5b");
    for (let i = 0; i < 5; i++) rect(ctx, 22 + i * 4, 31, 1, 13, "#edd0a0");
    pixelCircle(ctx, 15, 17, 35, C.woodDark);
    pixelCircle(ctx, 17, 18, 31, "#dbaa6b");
    for (const [x, y] of [
      [22, 24],
      [37, 22],
      [29, 31],
      [42, 30],
    ])
      rect(ctx, x, y, 3, 3, "#715454");
  } else {
    croissant(ctx, 10, 23, 1.9);
  }
  if (options.warm || options.ready) {
    rect(ctx, 23, 11, 2, 6, "#bbc2a3");
    rect(ctx, 25, 7, 2, 5, "#bbc2a3");
    rect(ctx, 36, 10, 2, 6, "#bbc2a3");
    sparkle(ctx, 52, 19, C.gold, 2);
  }
  ctx.restore();
}
