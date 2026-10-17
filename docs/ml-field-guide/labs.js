/** Interactive, local-only teaching simulations. No model calls or network access. */
const C = {
  ink: "#d8e6dd",
  muted: "#94a79c",
  accent: "#d9b36c",
  green: "#8fcf9d",
  blue: "#82b8cb",
  pale: "#1a2821",
  gold: "#d9b36c",
  dark: "#102119",
  onBright: "#07110b",
};
let serial = 0;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sigmoid = (x) => 1 / (1 + Math.exp(-clamp(x, -40, 40)));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const pct = (v) => `${(100 * v).toFixed(1)}%`;
const fmt = (v, n = 2) => Number(v).toFixed(n);
function random(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(r) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(r(), 1e-10))) * Math.cos(2 * Math.PI * r())
  );
}
function svg(title, body, width = 620, height = 280) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
}
function text(x, y, value, extra = "") {
  return `<text x="${x}" y="${y}" fill="${C.ink}" font-family="inherit" font-size="12" ${extra}>${value}</text>`;
}
function line(x1, y1, x2, y2, color = C.pale, extra = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" ${extra}/>`;
}
function circle(x, y, r, color, extra = "") {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" ${extra}/>`;
}
function rect(x, y, w, h, color, extra = "") {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${color}" ${extra}/>`;
}
function metric(label, value) {
  return `<div class="metric"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`;
}
function frame(container, id, note) {
  container.innerHTML = `<div class="lab-note">Interactive illustration · ${note} No Qwen model is running.</div><div class="lab-controls"></div><div class="lab-chart" tabindex="0" role="region" aria-label="Interactive chart; scroll sideways on narrow screens"></div><p class="chart-hint">Scroll horizontally to view the full chart.</p><div class="lab-result" aria-live="polite" aria-atomic="true"></div><div class="lab-explainer"></div>`;
  const controls = container.querySelector(".lab-controls");
  return {
    controls,
    chart: container.querySelector(".lab-chart"),
    result: container.querySelector(".lab-result"),
    explain: container.querySelector(".lab-explainer"),
    range(name, label, min, max, step, value, unit = "") {
      const el = document.createElement("div");
      el.className = "control";
      const uid = `${id}-${name}`;
      el.innerHTML = `<label for="${uid}">${label} <output for="${uid}">${value}${unit}</output></label><input id="${uid}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
      controls.append(el);
      const input = el.querySelector("input");
      input.addEventListener("input", () => {
        el.querySelector("output").textContent = input.value + unit;
      });
      return input;
    },
    select(name, label, options, value) {
      const el = document.createElement("div");
      el.className = "control";
      const uid = `${id}-${name}`;
      el.innerHTML = `<label for="${uid}">${label}</label><select id="${uid}" class="lab-select">${options.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>`;
      controls.append(el);
      const input = el.querySelector("select");
      input.value = value;
      return input;
    },
    check(name, label, checked = false) {
      const el = document.createElement("div");
      el.className = "control";
      const uid = `${id}-${name}`;
      el.innerHTML = `<label for="${uid}"><input id="${uid}" type="checkbox" ${checked ? "checked" : ""}> ${label}</label>`;
      controls.append(el);
      return el.querySelector("input");
    },
    button(label, secondary = false) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `lab-button${secondary ? " secondary" : ""}`;
      b.textContent = label;
      controls.append(b);
      return b;
    },
  };
}
function training(container, id, signal) {
  const f = frame(container, id, "Fit a synthetic dataset.");
  const slope = f.range("slope", "Slope", -1, 4, 0.05, 0.6);
  const intercept = f.range("intercept", "Intercept", -3, 4, 0.05, 0);
  const fit = f.button("Fit the best line");
  const points = [
    [0, 0.9],
    [0.7, 1.6],
    [1.5, 3.4],
    [2.4, 4.3],
    [3.1, 5.9],
    [4, 7],
  ];
  function update() {
    const a = +slope.value,
      b = +intercept.value;
    const loss = mean(points.map(([x, y]) => (a * x + b - y) ** 2));
    const sx = (x) => 65 + x * 120,
      sy = (y) => 220 - y * 22;
    let body =
      `<defs><clipPath id="${id}-plot"><rect x="60" y="10" width="510" height="211"/></clipPath></defs>` +
      line(65, 20, 65, 220, C.muted) +
      line(65, 220, 560, 220, C.muted);
    for (let n = 0; n < 5; n++)
      body += text(sx(n), 240, n, 'text-anchor="middle"');
    points.forEach(([x, y]) => {
      body +=
        line(
          sx(x),
          sy(y),
          sx(x),
          sy(a * x + b),
          C.accent,
          `stroke-dasharray="4 4" clip-path="url(#${id}-plot)"`,
        ) + circle(sx(x), sy(y), 5, C.ink);
    });
    body += `<path d="M ${sx(0)} ${sy(b)} L ${sx(4)} ${sy(a * 4 + b)}" stroke="${C.green}" stroke-width="3" fill="none" clip-path="url(#${id}-plot)"/>`;
    body +=
      text(300, 268, "Input x", 'text-anchor="middle"') + text(16, 24, "y");
    f.chart.innerHTML = svg(
      "Training points, predicted line, and prediction errors",
      body,
    );
    f.result.innerHTML =
      metric("Mean squared error", fmt(loss, 3)) +
      metric("Prediction rule", `ŷ = ${fmt(a)}x + ${fmt(b)}`);
    f.explain.innerHTML =
      "<p>The dots are examples with known answers. The line makes predictions. Each dashed gap is an error; the loss averages the squared gaps. Training means changing parameters to reduce that loss. A lower training loss alone says nothing about unfamiliar examples.</p>";
  }
  [slope, intercept].forEach((e) =>
    e.addEventListener("input", update, { signal }),
  );
  fit.addEventListener(
    "click",
    () => {
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]),
        mx = mean(xs),
        my = mean(ys);
      const a =
        points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) /
        points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
      slope.value = a;
      intercept.value = my - a * mx;
      [slope, intercept].forEach((e) => e.dispatchEvent(new Event("input")));
    },
    { signal },
  );
  update();
}
function tokens(container, id, signal) {
  const f = frame(
    container,
    id,
    "These are hand-written token pieces, not Qwen tokenization.",
  );
  const context = f.range(
    "context",
    "Visible context window",
    4,
    24,
    1,
    12,
    " pieces",
  );
  const position = f.range("position", "Read through piece", 4, 24, 1, 19);
  const pieces = [
    "The",
    " agent",
    " felt",
    " un",
    "certain",
    " after",
    " a",
    " set",
    "back",
    ".",
    " It",
    " kept",
    " a",
    " small",
    " memory",
    " of",
    " that",
    " event",
    " and",
    " checked",
    " its",
    " next",
    " decision",
    ".",
  ];
  function update() {
    const end = +position.value,
      start = Math.max(0, end - +context.value);
    let body = "";
    pieces.forEach((p, i) => {
      let x = 22 + (i % 6) * 98,
        y = 20 + Math.floor(i / 6) * 49;
      const active = i >= start && i < end;
      body +=
        rect(x, y, 91, 34, active ? C.green : C.pale) +
        text(
          x + 45,
          y + 22,
          p.replaceAll(" ", "·"),
          `text-anchor="middle" style="fill:${active ? C.onBright : C.muted}"`,
        );
    });
    body += text(
      310,
      252,
      "Highlighted pieces are available to the next prediction.",
      'text-anchor="middle"',
    );
    f.chart.innerHTML = svg(
      "Illustrative token pieces and limited context window",
      body,
    );
    f.result.innerHTML =
      metric("Pieces in view", end - start) +
      metric("Earlier pieces outside view", start);
    f.explain.innerHTML =
      "<p>Language models read token IDs, not whole ideas. A token may be a word, word fragment, or punctuation. A context window limits what can be supplied at once. Older text outside it is unavailable unless a system supplies a summary, retrieval, or another memory channel. Changing the window here does not retrain a model.</p>";
  }
  [context, position].forEach((e) =>
    e.addEventListener("input", update, { signal }),
  );
  update();
}
function activations(container, id, signal) {
  const f = frame(
    container,
    id,
    "All activation values below are generated for teaching.",
  );
  const layer = f.range("layer", "Recording layer", 0, 35, 1, 16);
  const sentence = f.select(
    "sentence",
    "Input example",
    [
      ["sad", "“I miss my friend.”"],
      ["mixed", "“I miss my friend, but I am glad they are safe.”"],
      ["neutral", "“The parcel is on the table.”"],
    ],
    "sad",
  );
  function update() {
    const l = +layer.value,
      t = sentence.value === "sad" ? 1 : sentence.value === "mixed" ? 0.35 : 0;
    const values = Array.from({ length: 24 }, (_, i) =>
      Math.tanh(
        Math.sin(i * 1.7 + l * 0.23) + (t * Math.cos(i * 0.8) * (l + 1)) / 20,
      ),
    );
    let body = "";
    values.forEach((v, i) => {
      const x = 30 + (i % 12) * 47,
        y = 30 + Math.floor(i / 12) * 78;
      body +=
        rect(
          x,
          y,
          40,
          40,
          v >= 0 ? C.green : C.accent,
          `opacity="${0.2 + 0.8 * Math.abs(v)}"`,
        ) + text(x + 20, y + 59, fmt(v, 1), 'text-anchor="middle"');
    });
    body += text(
      310,
      220,
      `24 illustrative coordinates of layer ${l}'s residual vector`,
      'text-anchor="middle"',
    );
    body += text(
      310,
      248,
      "Green: positive · Amber: negative · Fade: near zero",
      'text-anchor="middle"',
    );
    f.chart.innerHTML = svg("Synthetic hidden activation vector", body);
    f.result.innerHTML =
      metric("Recording position", `Layer ${l}`) +
      metric("Displayed coordinates", 24);
    f.explain.innerHTML =
      "<p>An activation vector is a list of numbers computed while processing input. Different layers transform the representation. A recording point observes those numbers; it does not add a new sensor inside the model. Real Qwen vectors have thousands of coordinates. A coordinate is not automatically an emotion, and this synthetic view cannot reveal where an actual model stores sadness.</p>";
  }
  layer.addEventListener("input", update, { signal });
  sentence.addEventListener("change", update, { signal });
  update();
}
function probes(container, id, signal) {
  const f = frame(
    container,
    id,
    "Fit a classifier to synthetic two-dimensional data.",
  );
  const kind = f.select(
    "kind",
    "Readout model",
    [
      ["linear", "Linear: one straight boundary"],
      ["nonlinear", "Nonlinear: includes x × y"],
    ],
    "linear",
  );
  const noise = f.range("noise", "Overlap between groups", 0.1, 1.5, 0.1, 0.3);
  function update() {
    const r = random(882),
      make = (n) =>
        Array.from({ length: n }, () => {
          const a = r() < 0.5 ? -1 : 1,
            b = r() < 0.5 ? -1 : 1;
          return {
            x: a + normal(r) * +noise.value,
            y: b + normal(r) * +noise.value,
            label: a * b > 0 ? 1 : 0,
          };
        });
    const train = make(96),
      test = make(192),
      nonlinear = kind.value === "nonlinear";
    const features = (p) =>
      nonlinear ? [1, p.x, p.y, p.x * p.y] : [1, p.x, p.y];
    const w = Array(nonlinear ? 4 : 3).fill(0);
    for (let step = 0; step < 260; step++) {
      const g = w.map(() => 0);
      train.forEach((p) => {
        const z = features(p),
          e = sigmoid(z.reduce((s, v, i) => s + w[i] * v, 0)) - p.label;
        z.forEach((v, i) => (g[i] += (e * v) / train.length));
      });
      w.forEach((_, i) => (w[i] -= 0.15 * (g[i] + 0.002 * w[i])));
    }
    const predict = (p) =>
      sigmoid(features(p).reduce((s, v, i) => s + w[i] * v, 0));
    const accuracy = (rows) =>
      mean(rows.map((p) => ((predict(p) >= 0.5 ? 1 : 0) === p.label ? 1 : 0)));
    const sx = (x) => 310 + x * 67,
      sy = (y) => 140 - y * 35;
    let body = "";
    for (let i = 0; i < 24; i++)
      for (let j = 0; j < 16; j++) {
        let x = -4 + i / 3,
          y = -3 + j * 0.4;
        const p = predict({ x, y });
        body += rect(
          sx(x),
          sy(y),
          23,
          15,
          p > 0.5 ? C.green : C.accent,
          `opacity="${0.12 + 0.25 * Math.abs(p - 0.5)}"`,
        );
      }
    body += line(35, 140, 585, 140, C.muted) + line(310, 15, 310, 250, C.muted);
    test
      .slice(0, 90)
      .forEach(
        (p) =>
          (body += circle(
            clamp(sx(p.x), 35, 585),
            clamp(sy(p.y), 15, 250),
            3.6,
            p.label ? C.green : C.accent,
            `stroke="${C.dark}" stroke-width="1"`,
          )),
      );
    body += text(
      310,
      275,
      "Dots: held-out examples. Background: classifier prediction.",
      'text-anchor="middle"',
    );
    f.chart.innerHTML = svg("XOR pattern and learned decision boundary", body);
    f.result.innerHTML =
      metric("Training accuracy", pct(accuracy(train))) +
      metric("Held-out accuracy", pct(accuracy(test)));
    f.explain.innerHTML =
      "<p>The two classes occupy opposite corners: one straight line cannot separate them reliably. A nonlinear readout can use the interaction between coordinates. Increasing overlap makes the labels harder to infer. Better detection means the information is readable; it does not establish that changing these coordinates will control behaviour.</p>";
  }
  kind.addEventListener("change", update, { signal });
  noise.addEventListener("input", update, { signal });
  update();
}
function emotion(container, id, signal) {
  const f = frame(
    container,
    id,
    "Build hypothetical predictions; these are not readings of a real passage.",
  );
  const options = [
    ["0", "Absent"],
    ["1", "Low"],
    ["2", "Medium"],
    ["3", "High"],
  ];
  const sad = f.select("sad", "Sadness: predicted level", options, "1"),
    sc = f.range(
      "sad-confidence",
      "Probability of chosen sadness level",
      0.4,
      0.99,
      0.01,
      0.95,
    );
  const relief = f.select("relief", "Relief: predicted level", options, "3"),
    rc = f.range(
      "relief-confidence",
      "Probability of chosen relief level",
      0.4,
      0.99,
      0.01,
      0.8,
    );
  const known = f.check("known", "Sadness has an intensity annotation", true);
  function distribution(level, p) {
    const weights = [0, 1, 2, 3].map((i) =>
        i === level ? 0 : 1 / (1 + Math.abs(i - level)),
      ),
      total = weights.reduce((a, b) => a + b, 0);
    return weights.map((v, i) => (i === level ? p : ((1 - p) * v) / total));
  }
  function update() {
    const rows = [
      ["Sadness", distribution(+sad.value, +sc.value)],
      ["Relief", distribution(+relief.value, +rc.value)],
    ];
    let body = "";
    rows.forEach(([label, ps], j) => {
      let y = 30 + j * 108;
      body += text(20, y + 20, label);
      ps.forEach((p, i) => {
        const x = 115 + i * 119;
        body +=
          rect(x, y, 100, 54, C.pale) +
          rect(x, y + 54 - p * 54, 100, p * 54, j ? C.green : C.accent) +
          text(x + 50, y + 74, options[i][1], 'text-anchor="middle"') +
          text(x + 50, y + 95, pct(p), 'text-anchor="middle"');
      });
    });
    f.chart.innerHTML = svg(
      "Separate probability distributions over intensity for two emotions",
      body,
      620,
      265,
    );
    const ps = rows[0][1],
      pr = rows[1][1];
    const loss =
      (-(known.checked ? Math.log(Math.max(ps[3], 1e-10)) : 0) -
        Math.log(Math.max(pr[1], 1e-10))) /
      (known.checked ? 2 : 1);
    f.result.innerHTML =
      metric("P(sadness present)", pct(1 - ps[0])) +
      metric("Labelled emotions in loss", known.checked ? 2 : 1) +
      metric("Illustrative categorical loss", fmt(loss, 3));
    f.explain.innerHTML = `<p>Each emotion gets its own distribution, so emotions can coexist. “95% probability of low sadness” describes confidence in a mild intensity. For the supervision example only, imagine a human marked sadness <strong>high</strong> and relief <strong>low</strong>. ${known.checked ? "Both annotations contribute to the displayed loss." : "The sadness rating is unknown, so it contributes no loss. Unknown does not mean absent."} Training would use an ordinal loss to respect the order of levels; the simple categorical loss here only demonstrates masking.</p>`;
  }
  [sad, sc, relief, rc, known].forEach((e) =>
    e.addEventListener(e.type === "range" ? "input" : "change", update, {
      signal,
    }),
  );
  update();
}
function optimization(container, id, signal) {
  const f = frame(container, id, "Gradient descent on the toy loss (w − 3)².");
  const rate = f.range("rate", "Learning rate", 0.01, 1.3, 0.01, 0.15);
  const step = f.button("Take one step"),
    ten = f.button("Take 10 steps", true),
    reset = f.button("Restart", true);
  let w = -3,
    losses = [36],
    stopped = false;
  function update() {
    let logs = losses.map((v) => Math.log1p(v)),
      max = Math.max(...logs, 1);
    let body =
      line(55, 220, 580, 220, C.muted) + line(55, 20, 55, 220, C.muted);
    body += `<polyline points="${logs.map((v, i) => `${55 + (i / Math.max(10, logs.length - 1)) * 520},${220 - (v / max) * 190}`).join(" ")}" fill="none" stroke="${C.accent}" stroke-width="3"/>`;
    body +=
      text(310, 260, "Training steps", 'text-anchor="middle"') +
      text(58, 15, "log(1 + loss)") +
      text(55, 240, "0") +
      text(575, 240, Math.max(10, logs.length - 1), 'text-anchor="end"');
    f.chart.innerHTML = svg(
      "Loss trajectory during toy gradient descent",
      body,
    );
    f.result.innerHTML =
      metric("Steps", losses.length - 1) +
      metric(
        "Current parameter w",
        Math.abs(w) > 1e4 ? w.toExponential(2) : fmt(w, 3),
      ) +
      metric(
        "Current loss",
        losses.at(-1) > 1e6
          ? losses.at(-1).toExponential(2)
          : fmt(losses.at(-1), 4),
      );
    f.explain.innerHTML = `<p>Each update is w ← w − learning rate × 2(w − 3). Small updates approach 3 slowly; overly large updates overshoot and can diverge. This simple loss is stable only for rates between 0 and 1. Those numbers do not transfer to Qwen. ${stopped ? "<strong>Stopped at this illustration’s step or numerical limit. Restart to compare another rate.</strong>" : "Changing the slider affects the next update; restart to compare from the same initial point."}</p>`;
    step.disabled = ten.disabled = stopped;
  }
  function take(n) {
    for (let i = 0; i < n && !stopped; i++) {
      w -= +rate.value * 2 * (w - 3);
      losses.push((w - 3) ** 2);
      if (Math.abs(w) > 1e6 || losses.length >= 101) stopped = true;
    }
    update();
  }
  step.addEventListener("click", () => take(1), { signal });
  ten.addEventListener("click", () => take(10), { signal });
  reset.addEventListener(
    "click",
    () => {
      w = -3;
      losses = [36];
      stopped = false;
      update();
    },
    { signal },
  );
  rate.addEventListener("input", update, { signal });
  update();
}
function lora(container, id, signal) {
  const f = frame(
    container,
    id,
    "Parameter arithmetic for one hypothetical weight matrix.",
  );
  const options = [128, 256, 512, 1024, 2560].map((n) => [
    String(n),
    String(n),
  ]);
  const din = f.select("input", "Input width", options, "512"),
    dout = f.select("output", "Output width", options, "512"),
    rank = f.range("rank", "Adapter rank", 1, 64, 1, 8);
  function update() {
    const a = +din.value,
      b = +dout.value,
      r = +rank.value,
      full = a * b,
      small = r * (a + b);
    let body =
      rect(30, 50, 180, 120, C.dark, `stroke="${C.muted}"`) +
      text(120, 92, "Frozen W", 'text-anchor="middle"') +
      text(120, 123, `${b} × ${a}`, 'text-anchor="middle"');
    body += text(235, 120, "+", 'font-size="30" text-anchor="middle"');
    body +=
      rect(267, 50, 110, 120, C.green) +
      text(
        322,
        96,
        "Train B",
        `text-anchor="middle" style="fill:${C.onBright}"`,
      ) +
      text(
        322,
        123,
        `${b} × ${r}`,
        `text-anchor="middle" style="fill:${C.onBright}"`,
      );
    body +=
      text(400, 120, "×", 'font-size="30" text-anchor="middle"') +
      rect(425, 85, 165, 50, C.accent) +
      text(
        507,
        105,
        "Train A",
        `text-anchor="middle" style="fill:${C.onBright}"`,
      ) +
      text(
        507,
        124,
        `${r} × ${a}`,
        `text-anchor="middle" style="fill:${C.onBright}"`,
      );
    body +=
      text(
        310,
        215,
        "Effective weight: W + (scale × B A)",
        'text-anchor="middle"',
      ) +
      text(
        310,
        246,
        "Diagram sizes are illustrative, not proportional.",
        'text-anchor="middle"',
      );
    f.chart.innerHTML = svg(
      "Frozen matrix plus a trainable low-rank update",
      body,
    );
    f.result.innerHTML =
      metric("Frozen weights", full.toLocaleString()) +
      metric("Trainable adapter weights", small.toLocaleString()) +
      metric("Adapter / full matrix", pct(small / full));
    f.explain.innerHTML =
      "<p>For this one matrix, LoRA trains r × (input width + output width) parameters. The product B A has rank at most r. Applying adapters to many attention and feed-forward matrices adds their counts together. More rank increases available capacity; it does not guarantee that an optimizer will find a useful solution or preserve other skills. The scaling factor is omitted from the parameter count.</p>";
  }
  [din, dout, rank].forEach((e) =>
    e.addEventListener(e.type === "range" ? "input" : "change", update, {
      signal,
    }),
  );
  update();
}
function rl(container, id, signal) {
  const f = frame(
    container,
    id,
    "A two-action policy with synthetic rewards. Results do not reproduce the project’s experiments.",
  );
  const delivery = f.select(
    "delivery",
    "What the toy learner receives",
    [
      ["text", "Bit as text (represented as a feature)"],
      ["internal", "Bit through an internal feature"],
      ["none", "No bit information"],
    ],
    "internal",
  );
  const lr = f.range("rate", "Update size", 0.05, 1, 0.05, 0.3),
    ent = f.range("entropy", "Exploration encouragement", 0, 0.2, 0.01, 0.03);
  const one = f.button("Sample action → reward → update"),
    ten = f.button("Run 20 trials", true),
    reset = f.button("Restart", true);
  let rng = random(421),
    b = 0,
    w = 0,
    n = 0,
    wins = 0,
    history = [];
  function update() {
    const has = delivery.value !== "none",
      p0 = sigmoid(b + w * (has ? -1 : 0)),
      p1 = sigmoid(b + w * (has ? 1 : 0));
    let body = "";
    [
      [0, p0],
      [1, p1],
    ].forEach(([bit, p], i) => {
      const y = 50 + i * 82;
      body +=
        text(20, y + 20, `Bit ${bit}`) +
        rect(110, y, 440 * (1 - p), 36, C.accent) +
        rect(110 + 440 * (1 - p), y, 440 * p, 36, C.green) +
        text(
          110,
          y + 57,
          `P(A) ${pct(1 - p)} · P(B) ${pct(p)} · correct: ${bit ? "B" : "A"}`,
        );
    });
    body += text(
      310,
      250,
      "Actions are sampled from these probabilities before reward.",
      'text-anchor="middle"',
    );
    f.chart.innerHTML = svg(
      "Toy action probabilities for each input bit",
      body,
    );
    f.result.innerHTML =
      metric("Training trials", n) +
      metric("Observed rewards", n ? pct(wins / n) : "—") +
      metric("Balanced expected reward", pct((1 - p0 + p1) / 2));
    f.explain.innerHTML = `<p>Chronology: sample a bit → sample A or B → receive reward 1 if correct, otherwise 0 → update the policy. The update uses the sampled action and reward with a fixed 0.5 baseline; an entropy term encourages exploration. “Text” and “internal” expose exactly the same feature in this toy. It cannot test which delivery works better in Qwen. With no bit, a policy cannot exceed 50% expected reward on balanced cases.</p>${history.length ? `<p class="lab-note">Latest trial: ${history.at(-1)}</p>` : ""}`;
  }
  function take(count) {
    for (let i = 0; i < count; i++) {
      const bit = rng() < 0.5 ? 0 : 1,
        x = delivery.value === "none" ? 0 : bit ? 1 : -1,
        p = sigmoid(b + w * x),
        action = rng() < p ? 1 : 0,
        reward = action === bit ? 1 : 0;
      const policy = (reward - 0.5) * (action - p),
        entropy =
          Math.log((1 - clamp(p, 1e-8, 1 - 1e-8)) / clamp(p, 1e-8, 1 - 1e-8)) *
          p *
          (1 - p),
        gradient = policy + +ent.value * entropy;
      b = clamp(b + +lr.value * gradient, -15, 15);
      w = clamp(w + +lr.value * gradient * x, -15, 15);
      n++;
      wins += reward;
      history.push(
        `bit ${bit}; sampled ${action ? "B" : "A"}; reward ${reward}; then updated.`,
      );
    }
    update();
  }
  function restart() {
    rng = random(421);
    b = 0;
    w = 0;
    n = 0;
    wins = 0;
    history = [];
    update();
  }
  one.addEventListener("click", () => take(1), { signal });
  ten.addEventListener("click", () => take(20), { signal });
  reset.addEventListener("click", restart, { signal });
  delivery.addEventListener("change", restart, { signal });
  [lr, ent].forEach((e) => e.addEventListener("input", update, { signal }));
  update();
}
function memory(container, id, signal) {
  const f = frame(
    container,
    id,
    "You are the external bookkeeping program in this pointer-memory exercise.",
  );
  const nodes = ["A", "B", "C", "D"],
    options = nodes.map((n) => [n, n]);
  const from = f.select("from", "Change connection from", options, "A"),
    to = f.select("to", "New destination", options, "B");
  const write = f.button("Record update"),
    show = f.check("show", "Show current-state table", true),
    start = f.select("start", "Question: follow two hops from", options, "A"),
    query = f.button("Reveal answer", true),
    reset = f.button("Start a new episode", true);
  let state = { A: "A", B: "B", C: "C", D: "D" },
    history = [],
    answer = "";
  function update() {
    const pos = { A: [160, 65], B: [460, 65], C: [460, 205], D: [160, 205] },
      marker = `${id}-arrow`;
    let body = `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill="${C.muted}"/></marker></defs>`;
    nodes.forEach((k) => {
      const [x, y] = pos[k],
        [tx, ty] = pos[state[k]];
      if (k === state[k])
        body += `<path d="M ${x - 21} ${y - 21} C ${x - 65} ${y - 78}, ${x + 65} ${y - 78}, ${x + 21} ${y - 21}" fill="none" stroke="${C.muted}" stroke-width="2" marker-end="url(#${marker})"/>`;
      else {
        const length = Math.hypot(tx - x, ty - y),
          ux = (tx - x) / length,
          uy = (ty - y) / length,
          offset = state[state[k]] === k ? 7 : 0,
          ox = -uy * offset,
          oy = ux * offset;
        body += line(
          x + ux * 26 + ox,
          y + uy * 26 + oy,
          tx - ux * 30 + ox,
          ty - uy * 30 + oy,
          C.muted,
          `stroke-width="2" stroke-dasharray="5 4" marker-end="url(#${marker})"`,
        );
      }
    });
    nodes.forEach((k) => {
      let [x, y] = pos[k];
      body +=
        circle(x, y, 24, C.dark, `stroke="${C.green}" stroke-width="1.5"`) +
        text(x, y + 5, k, 'text-anchor="middle" style="font-size:16px"');
    });
    body += text(
      310,
      267,
      show.checked
        ? "Table and graph show the current state."
        : "Graph hidden with the table. Use the written history.",
      'text-anchor="middle"',
    );
    f.chart.innerHTML = show.checked
      ? svg("Current pointer state with directed arrows", body)
      : '<p class="lab-note">Current state hidden. Reconstruct it from the history below.</p>';
    f.result.innerHTML = `<div class="lab-grid"><div><strong>History</strong><p>Initial state: each letter points to itself.</p><ol>${history.map((h) => `<li>${h}</li>`).join("") || "<li>No changes yet.</li>"}</ol></div>${show.checked ? `<div><strong>Current table</strong><p>${nodes.map((k) => `${k} → ${state[k]}`).join("<br>")}</p></div>` : ""}</div><p><strong>${answer || "The two-hop answer stays hidden until you request it."}</strong></p>`;
    f.explain.innerHTML =
      "<p>History preserves every update, including superseded instructions. The table preserves only the latest destination for each letter. Both contain the same underlying facts; the table saves reconstruction work. In the project a fixed external program maintains the table. This memory lasts until overwritten or reset and has no emotional decay. A new episode clears the state.</p>";
  }
  write.addEventListener(
    "click",
    () => {
      state[from.value] = to.value;
      history.push(`${from.value} now points to ${to.value}.`);
      answer = "";
      update();
    },
    { signal },
  );
  query.addEventListener(
    "click",
    () => {
      const a = start.value,
        b = state[a],
        c = state[b];
      answer = `Two hops: ${a} → ${b} → ${c}. Answer: ${c}.`;
      update();
    },
    { signal },
  );
  reset.addEventListener(
    "click",
    () => {
      state = { A: "A", B: "B", C: "C", D: "D" };
      history = [];
      answer = "";
      update();
    },
    { signal },
  );
  show.addEventListener("change", update, { signal });
  start.addEventListener(
    "change",
    () => {
      answer = "";
      update();
    },
    { signal },
  );
  update();
}
function experiment(container, id, signal) {
  const f = frame(
    container,
    id,
    "Design checklist: selecting a control produces no experimental evidence.",
  );
  const info = f.check(
      "information",
      "Compare against ordinary text memory with equivalent information",
      true,
    ),
    reset = f.check(
      "reset",
      "Compare persistent state with state reset between decisions",
      false,
    ),
    random = f.check(
      "random",
      "Include a matched random-signal control",
      false,
    ),
    quality = f.check(
      "quality",
      "Check unrelated skills and unrestricted output validity",
      false,
    ),
    seeds = f.check(
      "seeds",
      "Repeat independent training runs on held-out episodes",
      false,
    );
  function update() {
    const items = [
      ["Equal information", info.checked],
      ["Persistence", reset.checked],
      ["Specific signal", random.checked],
      ["Preservation", quality.checked],
      ["Reliability", seeds.checked],
    ];
    let body = "";
    items.forEach(([label, on], i) => {
      let x = 15 + i * 121;
      body +=
        rect(x, 40, 110, 95, on ? C.green : C.pale) +
        text(
          x + 55,
          78,
          on ? "Included" : "Missing",
          `text-anchor="middle" style="fill:${on ? C.onBright : C.muted}"`,
        ) +
        text(x + 55, 155, label, 'text-anchor="middle"');
    });
    body += text(
      310,
      210,
      "A control makes an explanation testable; it does not ensure success.",
      'text-anchor="middle"',
    );
    f.chart.innerHTML = svg(
      "Coverage of five experimental design questions",
      body,
      620,
      245,
    );
    const gaps = [];
    if (!info.checked)
      gaps.push(
        "A benefit could come simply from receiving additional information.",
      );
    if (!reset.checked)
      gaps.push(
        "You cannot isolate the value of carrying state across decisions.",
      );
    if (!random.checked)
      gaps.push("A general perturbation could explain the effect.");
    if (!quality.checked)
      gaps.push(
        "Task success could conceal skill loss or invalid ordinary outputs.",
      );
    if (!seeds.checked) gaps.push("One fortunate run may not reproduce.");
    f.result.innerHTML = `<p><strong>${gaps.length ? "Alternative explanations still open:" : "The core comparisons are covered."}</strong></p>${gaps.length ? `<ul>${gaps.map((g) => `<li>${g}</li>`).join("")}</ul>` : "<p>You can now test an incremental benefit from persistent, structured feedback. You still need favourable results, uncertainty estimates, and a predefined success criterion.</p>"}`;
    f.explain.innerHTML =
      "<p>To claim an emotional structure adds value, compare it against a strong ordinary-memory system with equivalent information and training budget. To claim persistence helps, change persistence while keeping the other conditions matched. A detector score cannot substitute for these behavioural comparisons.</p>";
  }
  [info, reset, random, quality, seeds].forEach((e) =>
    e.addEventListener("change", update, { signal }),
  );
  update();
}
function evidence(container, id, signal) {
  const f = frame(
    container,
    id,
    "Synthetic paired outcomes with a hierarchical bootstrap, not project measurements.",
  );
  const effect = f.range(
      "effect",
      "Underlying average benefit",
      -20,
      20,
      1,
      5,
      " percentage points",
    ),
    episodes = f.range(
      "episodes",
      "Paired episodes per training run",
      12,
      180,
      4,
      40,
    ),
    runs = f.range("runs", "Independent training runs", 1, 5, 1, 1);
  const redraw = f.button("Generate another synthetic study", true);
  let study = 1;
  function update() {
    const n = +episodes.value,
      s = +runs.value,
      r = random(412 + study),
      groups = Array.from({ length: s }, () => {
        const runShift = normal(r) * 0.08;
        return Array.from({ length: n }, () =>
          clamp(+effect.value / 100 + runShift + normal(r) * 0.22, -1, 1),
        );
      });
    const estimate = mean(groups.map(mean)),
      bootR = random(441 + study),
      boot = [];
    for (let b = 0; b < 650; b++) {
      let total = 0;
      for (let j = 0; j < s; j++) {
        const group = groups[Math.floor(bootR() * s)];
        let sub = 0;
        for (let k = 0; k < n; k++) sub += group[Math.floor(bootR() * n)];
        total += sub / n;
      }
      boot.push(total / s);
    }
    boot.sort((a, b) => a - b);
    const low = boot[16],
      high = boot[633],
      sx = (v) => 310 + v * 410;
    let body =
      line(65, 210, 555, 210, C.muted) +
      line(sx(0), 20, sx(0), 220, C.muted, 'stroke-dasharray="5 5"');
    [-0.6, -0.3, 0, 0.3, 0.6].forEach(
      (v) =>
        (body += text(
          sx(v),
          234,
          `${Math.round(v * 100)} pp`,
          'text-anchor="middle"',
        )),
    );
    groups.forEach(
      (g, i) =>
        (body +=
          circle(sx(mean(g)), 37 + i * 25, 5, C.blue) +
          text(25, 41 + i * 25, `Run ${i + 1}`)),
    );
    body +=
      line(
        clamp(sx(low), 65, 555),
        183,
        clamp(sx(high), 65, 555),
        183,
        C.accent,
        'stroke-width="5"',
      ) +
      circle(clamp(sx(estimate), 65, 555), 183, 7, C.accent) +
      text(
        310,
        265,
        "Paired difference: treatment minus comparison",
        'text-anchor="middle"',
      );
    f.chart.innerHTML = svg(
      "Synthetic run means and a 95 percent bootstrap interval",
      body,
    );
    f.result.innerHTML =
      metric("Observed mean difference", `${fmt(estimate * 100, 1)} pp`) +
      metric(
        "Approx. 95% interval",
        `[${fmt(low * 100, 1)}, ${fmt(high * 100, 1)}] pp`,
      );
    f.explain.innerHTML = `<p>Each episode supplies a paired difference. The bootstrap resamples training runs, then episodes within each selected run. ${s === 1 ? "<strong>With one training run, the interval describes episode variation only. It cannot estimate how much another training run might differ.</strong>" : "Independent runs expose variation that more episodes in one run cannot capture. With only a few runs, uncertainty estimates are still fragile."} An interval crossing zero leaves the direction uncertain. A tiny interval above zero can still describe a practically unimportant effect. The “underlying benefit” is known here only because the data are simulated.</p>`;
  }
  [effect, episodes, runs].forEach((e) =>
    e.addEventListener("input", update, { signal }),
  );
  redraw.addEventListener(
    "click",
    () => {
      study++;
      update();
    },
    { signal },
  );
  update();
}
const labs = {
  training,
  tokens,
  activations,
  probes,
  emotion,
  optimization,
  lora,
  rl,
  memory,
  experiment,
  evidence,
};
export function mountLab(container, kind) {
  const abort = new AbortController(),
    id = `lab-${kind}-${++serial}`;
  if (!container || !labs[kind]) {
    if (container)
      container.textContent = "This interactive illustration is unavailable.";
    return () => {};
  }
  labs[kind](container, id, abort.signal);
  return () => {
    abort.abort();
    container.replaceChildren();
  };
}
