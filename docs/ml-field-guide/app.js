import { lessons, glossary } from "./content.js";
import { mountLab } from "./labs.js";

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const KEY = "pafs-field-guide-v1";
let storageAvailable = true;
let state = { completed: [], notes: {}, quizzes: {}, planner: {} };
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || "null");
  if (saved && typeof saved === "object")
    state = {
      completed: Array.isArray(saved.completed)
        ? saved.completed.filter((id) => lessons.some((l) => l.id === id))
        : [],
      notes: saved.notes && typeof saved.notes === "object" ? saved.notes : {},
      quizzes:
        saved.quizzes && typeof saved.quizzes === "object" ? saved.quizzes : {},
      planner:
        saved.planner && typeof saved.planner === "object" ? saved.planner : {},
    };
} catch {
  storageAvailable = false;
}
const main = $("#main");
let cleanupLab = () => {};
let toastTimer;
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    storageAvailable = false;
    $("#storage-status").textContent =
      "Browser storage unavailable. Export notes before leaving.";
    return false;
  }
}
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 3200);
}
function download(name, text) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function progress() {
  return Math.round((state.completed.length / lessons.length) * 100);
}
function firstUnfinished() {
  return lessons.find((l) => !state.completed.includes(l.id)) || lessons[0];
}
function progressHTML() {
  return `<div class="progress-wrap"><div class="progress-top"><span>Completion</span><span class="progress-count">${state.completed.length}/${lessons.length}</span></div><div class="progress-track" role="progressbar" aria-label="Completed lessons" aria-valuemin="0" aria-valuemax="${lessons.length}" aria-valuenow="${state.completed.length}"><div class="progress-fill" style="width:${progress()}%"></div></div></div>`;
}
const groups = [
  {
    no: "01",
    title: "Model fundamentals",
    desc: "Parameters, tokens and activations.",
    start: 0,
    end: 3,
  },
  {
    no: "02",
    title: "Probes and training",
    desc: "Readouts, ordinal labels, gradients and LoRA.",
    start: 3,
    end: 7,
  },
  {
    no: "03",
    title: "Memory and evaluation",
    desc: "Reward learning, persistent state and controls.",
    start: 7,
    end: 11,
  },
];
function rowHTML(lesson, index) {
  const done = state.completed.includes(lesson.id);
  return `<a href="#${esc(lesson.id)}" class="lesson-row${done ? " is-complete" : ""}"><span class="row-number">${done ? "✓" : String(index + 1).padStart(2, "0")}</span><span><span class="row-title">${esc(lesson.title)}</span><span class="row-summary">${esc(lesson.summary)}</span></span><span class="row-time">${esc(lesson.minutes)} MIN · LAB</span><span class="row-arrow" aria-hidden="true">→</span></a>`;
}
function architectureHTML() {
  return `<div class="hero-visual"><div class="visual-label"><span>ARCHITECTURE / CONCEPTUAL</span><span>READ → STORE → TEST</span></div>
  <svg class="architecture-svg" viewBox="0 0 450 255" role="img" aria-label="Input is processed by a frozen model. A probe reads activations; external state can condition a later decision.">
    <defs><marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="m0 0 6 3L0 6" fill="none" stroke="#8fcf9d" stroke-width="1"/></marker></defs>
    <path d="M128 70H182 M245 110V131H68V151 M125 186H177 M294 186H349" stroke="#54765c" stroke-width="1.2" fill="none" marker-end="url(#arrow)"/>
    <rect x="12" y="34" width="116" height="72" fill="#0b1510" stroke="#3a5141"/><text x="23" y="54" font-size="9" fill="#94a79c">INPUT TEXT</text><text x="23" y="76" font-size="10" fill="#d8e6dd">“The trial failed.</text><text x="23" y="92" font-size="10" fill="#d8e6dd">Results vary.”</text>
    <g transform="translate(179 14)"><rect x="0" y="20" width="134" height="78" fill="#0a120d" stroke="#314b37"/><rect x="5" y="13" width="124" height="78" fill="#0d1911" stroke="#47664e"/><rect x="10" y="6" width="114" height="78" fill="#102119" stroke="#8fcf9d"/><text x="22" y="30" font-size="9" fill="#94a79c">FROZEN MODEL</text><text x="22" y="53" font-size="16" fill="#b5efbb">Qwen</text><text x="22" y="71" font-size="8" fill="#94a79c">h₈  h₁₆  h₂₄</text></g>
    <path d="M315 63H338V84" stroke="#54765c" fill="none"/><circle cx="338" cy="88" r="3" fill="#d9b36c"/><text x="347" y="92" font-size="9" fill="#94a79c">read h</text>
    <rect x="14" y="152" width="111" height="68" fill="#102119" stroke="#8fcf9d"/><text x="25" y="172" font-size="9" fill="#94a79c">PROBE</text><text x="25" y="194" font-size="13" fill="#b5efbb">readout(h)</text><text x="25" y="210" font-size="8" fill="#94a79c">PREDICT EMOTION</text>
    <rect x="178" y="152" width="116" height="68" fill="#171a10" stroke="#8a7846"/><text x="190" y="172" font-size="9" fill="#94a79c">EXTERNAL STATE</text><text x="190" y="194" font-size="13" fill="#d9b36c">s[t] → s[t+1]</text><text x="190" y="210" font-size="8" fill="#94a79c">UPDATE / PERSIST</text>
    <rect x="350" y="152" width="87" height="68" fill="#0e1b1d" stroke="#527d88"/><text x="360" y="172" font-size="9" fill="#94a79c">LATER CALL</text><text x="360" y="194" font-size="12" fill="#82b8cb">policy(s)</text><text x="360" y="210" font-size="8" fill="#94a79c">MEASURE EFFECT</text>
  </svg><div class="arch-tabs" role="group" aria-label="Architecture components"><button data-stage="model" aria-pressed="true">Model</button><button data-stage="probe" aria-pressed="false">Probe</button><button data-stage="state" aria-pressed="false">State</button><button data-stage="decision" aria-pressed="false">Decision</button></div><p class="arch-caption" id="arch-caption" aria-live="polite">The model computes representations. Its weights remain fixed during detector training.</p></div>`;
}
function home() {
  document.title = "ML reference · PAFS-LM";
  main.innerHTML = `<div class="home"><section class="hero"><div><div class="eyebrow">PAFS-LM / ML REFERENCE</div><h1>Machine learning<br>for PAFS-LM<span class="terminal-cursor" aria-hidden="true">_</span></h1><p class="hero-description">Parameters, activation probes, emotion intensity, training, memory and experimental design.</p><div class="hero-actions"><a class="button-primary" href="#${firstUnfinished().id}">${state.completed.length ? "Resume module" : "Open module 01"} <span aria-hidden="true">→</span></a><a class="button-outline" href="#path">Module index ↓</a></div><p class="small-note">11 modules / interactive simulations / no model calls</p></div>${architectureHTML()}</section>
  <section class="intro-strip" aria-label="Reference contents"><p>MODEL INTERNALS<br>STATE & EVALUATION</p><div class="intro-stats"><div><strong>${lessons.length}</strong><span>modules</span></div><div><strong>${lessons.length}</strong><span>simulations</span></div><div><strong>${progress()}<span style="font-size:16px">%</span></strong><span>completed</span></div></div></section>
  <section class="path-section" id="learning-path"><div class="section-heading"><div><div class="eyebrow">INDEX / 01–11</div><h2>Modules</h2></div><p>Definitions, project examples and simulations. Read in order or select a topic.</p></div>${groups
    .map(
      (g) =>
        `<div class="path-group"><div class="path-group-label"><span class="phase-no">SECTION ${g.no}</span><h3>${g.title}</h3><p>${g.desc}</p></div><div>${lessons
          .slice(g.start, g.end)
          .map((l, i) => rowHTML(l, g.start + i))
          .join("")}</div></div>`,
    )
    .join("")}</section>
  <section class="home-bottom"><div><h2>Experiment planner</h2><p>Record a hypothesis, comparisons, evaluation metric and stopping rule. Export the plan as Markdown.</p><a href="#planner">Open planner →</a></div><div><h2>Glossary</h2><p>Definitions of the terms used in the lessons, code and research reports.</p><a href="#glossary">Open glossary →</a></div></section><p class="research-note">Labs use synthetic data. Project measurements link to source reports. Emotion recognition, causal control and persistent-state utility require separate evidence.</p></div>`;
  const explanations = {
    model:
      "The model turns a sentence into internal representations. Its weights stay fixed while you train a small emotion detector.",
    probe:
      "A probe learns to read the model’s activations. Accurate emotion prediction establishes recognition; it does not establish a way to control behaviour.",
    state:
      "A separate controller can store a value between model calls. Persistence comes from explicitly keeping and updating that state, not from a fresh prompt remembering by itself.",
    decision:
      "A later model call can receive the stored state as text or through activations. Controlled experiments must establish whether it improves useful decisions.",
  };
  main.querySelectorAll("[data-stage]").forEach((button) =>
    button.addEventListener("click", () => {
      main
        .querySelectorAll("[data-stage]")
        .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      $("#arch-caption").textContent = explanations[button.dataset.stage];
    }),
  );
}
function sidebar(id) {
  return `<button class="mobile-chapters" aria-expanded="false" aria-controls="lesson-sidebar">Modules / completion <span aria-hidden="true">＋</span></button><nav class="lesson-nav" id="lesson-sidebar" aria-label="Lesson navigation">${progressHTML()}<div class="nav-eyebrow">MODULES</div>${lessons.map((l, i) => `<a class="chapter-link${l.id === id ? " active" : ""}${state.completed.includes(l.id) ? " done" : ""}" href="#${l.id}" ${l.id === id ? 'aria-current="page"' : ""}><span>${state.completed.includes(l.id) ? "✓" : String(i + 1).padStart(2, "0")}</span><span>${esc(l.title)}</span></a>`).join("")}<div class="nav-divider"></div><a class="nav-tool" href="#glossary">→ Glossary</a><a class="nav-tool" href="#planner">→ Experiment planner</a><a class="nav-tool" href="#notes">→ Notes</a></nav>`;
}
const labNames = {
  training: "Linear regression",
  tokens: "Context window",
  activations: "Activation vectors",
  probes: "Linear vs nonlinear readout",
  emotion: "Emotion probability and intensity",
  optimization: "Gradient descent",
  lora: "LoRA parameter count",
  rl: "REINFORCE simulation",
  memory: "External state table",
  experiment: "Experimental controls",
  evidence: "Sampling uncertainty",
};
function sectionHTML(section) {
  return `<section class="lesson-section"><h2>${esc(section.title)}</h2>${section.body}</section>`;
}
function lessonPage(lesson) {
  const index = lessons.indexOf(lesson),
    done = state.completed.includes(lesson.id),
    next = lessons[index + 1];
  document.title = `${lesson.title} · ML reference`;
  main.innerHTML = `<div class="reader-layout fade-in"><div>${sidebar(lesson.id)}</div><article class="reader-main"><div class="lesson-breadcrumb"><a href="#home">Reference</a><span>/</span><span>Module ${String(index + 1).padStart(2, "0")}</span></div><div class="lesson-kicker"><span>${esc(lesson.eyebrow || "ML reference")}</span><span>${esc(lesson.minutes)} MIN READ + LAB</span></div><h1>${esc(lesson.title)}</h1><p class="lesson-deck">${esc(lesson.summary)}</p>${lesson.sections.slice(0, 2).map(sectionHTML).join("")}<section class="lab-shell" aria-labelledby="lab-title"><div class="lab-heading"><h2 id="lab-title">${esc(labNames[lesson.lab] || "Simulation")}</h2><span class="lab-badge">SIMULATION</span></div><div class="lab-container" id="lesson-lab"></div><p class="lab-disclaimer">Simplified teaching simulation. This does not run Qwen or reproduce PAFS-LM benchmark results.</p></section>${lesson.sections.slice(2).map(sectionHTML).join("")}<section class="quiz-card" aria-labelledby="quiz-title"><div class="quiz-kicker">KNOWLEDGE CHECK</div><h2 id="quiz-title">${esc(lesson.quiz.question)}</h2><div class="quiz-options">${lesson.quiz.options.map((o, i) => `<button class="quiz-option" data-answer="${i}"><span aria-hidden="true">${String.fromCharCode(65 + i)}</span>${esc(o)}</button>`).join("")}</div><p class="quiz-feedback" aria-live="polite"></p></section><div class="lesson-bottom"><button class="complete-button" aria-pressed="${done}">${done ? "✓ Complete" : "Mark complete"}</button><a class="button-primary" href="#${next ? next.id : "planner"}">${next ? "Next module" : "Open planner"} <span aria-hidden="true">→</span></a></div></article><aside class="lesson-aside"><section class="aside-card"><h2>Summary</h2><p>${esc(lesson.takeaway)}</p></section><section class="aside-card"><h2>Sources</h2><ul class="source-list">${(lesson.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)} →</a></li>`).join("")}</ul><p style="font-family:var(--sans);font-size:10px;color:var(--muted)">Repository links may require your GitHub login. Research sources are snapshots, not claims about the newest run.</p></section><section class="aside-card"><h2>Notes</h2><label class="sr-only" for="lesson-note">Notes for ${esc(lesson.title)}</label><textarea id="lesson-note" placeholder="Notes, questions or observations.">${esc(state.notes[lesson.id] || "")}</textarea><div class="saved-label" aria-live="polite">${storageAvailable ? "Saved locally." : "Storage unavailable. Export notes before leaving."}</div></section></aside></div>`;
  cleanupLab = mountLab($("#lesson-lab"), lesson.lab) || (() => {});
  $(".mobile-chapters").addEventListener("click", (e) => {
    const button = e.currentTarget,
      open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    $("#lesson-sidebar").classList.toggle("open", open);
    button.lastElementChild.textContent = open ? "−" : "＋";
  });
  $("#lesson-note").addEventListener("input", (e) => {
    state.notes[lesson.id] = e.target.value;
    const saved = save();
    $(".saved-label").textContent = saved
      ? "Saved locally."
      : "Storage unavailable. Export notes before leaving.";
  });
  const showAnswer = (selected) => {
    const correct = selected === lesson.quiz.correct;
    main.querySelectorAll("[data-answer]").forEach((b) => {
      const i = Number(b.dataset.answer);
      b.classList.toggle("correct", i === lesson.quiz.correct);
      b.classList.toggle("incorrect", i === selected && !correct);
      b.setAttribute("aria-pressed", String(i === selected));
    });
    $(".quiz-feedback").textContent =
      `${correct ? "Correct." : "Incorrect."} ${lesson.quiz.explanation}`;
  };
  main.querySelectorAll("[data-answer]").forEach((button) =>
    button.addEventListener("click", () => {
      const selected = Number(button.dataset.answer);
      state.quizzes[lesson.id] = selected;
      save();
      showAnswer(selected);
    }),
  );
  if (Number.isInteger(state.quizzes[lesson.id]))
    showAnswer(state.quizzes[lesson.id]);
  $(".complete-button").addEventListener("click", (e) => {
    const wasDone = state.completed.includes(lesson.id);
    state.completed = wasDone
      ? state.completed.filter((id) => id !== lesson.id)
      : [...state.completed, lesson.id];
    save();
    e.currentTarget.setAttribute("aria-pressed", String(!wasDone));
    e.currentTarget.textContent = !wasDone ? "✓ Complete" : "Mark complete";
    $(".progress-count").textContent =
      `${state.completed.length}/${lessons.length}`;
    $(".progress-fill").style.width = `${progress()}%`;
    $("[role=progressbar]").setAttribute(
      "aria-valuenow",
      state.completed.length,
    );
    const link = $(`.chapter-link[href="#${lesson.id}"]`);
    link.classList.toggle("done", !wasDone);
    link.firstElementChild.textContent = !wasDone
      ? "✓"
      : String(index + 1).padStart(2, "0");
    toast(!wasDone ? "Progress saved." : "Marked incomplete.");
  });
}
function glossaryPage() {
  document.title = "Glossary · ML reference";
  main.innerHTML = `<section class="tool-page fade-in"><div class="eyebrow">REFERENCE / TERMS</div><h1>Glossary</h1><p class="tool-deck">Definitions used in the lessons and project reports. Each term links to its module.</p><label class="sr-only" for="glossary-search">Filter glossary terms</label><input class="tool-search" id="glossary-search" type="search" placeholder="Filter terms…"><p class="glossary-count" aria-live="polite"></p><div class="glossary-grid" id="glossary-list"></div></section>`;
  const terms = [...glossary].sort((a, b) => a.term.localeCompare(b.term));
  function filter(query = "") {
    const matches = terms.filter((t) =>
      `${t.term} ${t.definition}`.toLowerCase().includes(query.toLowerCase()),
    );
    $(".glossary-count").textContent =
      `${matches.length} OF ${terms.length} TERMS`;
    $("#glossary-list").innerHTML = matches.length
      ? matches
          .map(
            (t) =>
              `<article class="glossary-item"><h2>${esc(t.term)}</h2><p>${esc(t.definition)}</p><a href="#${esc(t.lesson)}">Open module →</a></article>`,
          )
          .join("")
      : "<p>No matching terms.</p>";
  }
  filter();
  $("#glossary-search").addEventListener("input", (e) =>
    filter(e.target.value),
  );
}
const plannerFields = [
  [
    "question",
    "Research question",
    "Specify one uncertainty.",
    "Does combining layers improve intensity prediction on unfamiliar stories?",
  ],
  [
    "hypothesis",
    "Hypothesis",
    "Specify the direction and a meaningful size of improvement.",
    "A small nonlinear detector will reduce ordinal prediction error compared with a single-layer probe.",
  ],
  [
    "change",
    "Independent variable",
    "Specify the variable being tested.",
    "Activation inputs from one layer versus six fixed layers.",
  ],
  [
    "controls",
    "Comparison groups",
    "Specify information access, supervision and quality checks.",
    "Single-layer linear, multilayer linear, multilayer nonlinear, and direct Qwen classification.",
  ],
  [
    "data",
    "Data and split",
    "Choose the split unit before fitting. Keep related passages together.",
    "Held-out original stories with trustworthy person-specific intensity labels; unknown labels stay masked.",
  ],
  [
    "measure",
    "Primary measurement",
    "Name the metric, time point and meaningful threshold before opening the test set.",
    "Macro-averaged ordinal absolute error at the fixed endpoint, with a paired story-level interval.",
  ],
  [
    "failure",
    "Stopping rule",
    "Include an outcome that would favour the simpler approach.",
    "No meaningful improvement on held-out stories, poor calibration, or gains explained only by predicting absence.",
  ],
  [
    "claims",
    "Supported claim",
    "Separate recognition, causal control and useful persistence.",
    "Improved recognition of annotated emotional intensity. No claim of feeling or behavioural control.",
  ],
];
function plannerPage() {
  document.title = "Experiment planner · ML reference";
  main.innerHTML = `<section class="tool-page fade-in"><div class="eyebrow">RESEARCH / PLANNER</div><h1>Experiment planner</h1><p class="tool-deck">Define one experiment. Drafts are stored in this browser and export as Markdown.</p><div class="planner-callout"><strong>Question type:</strong> Is your question about reading information, changing behaviour, keeping state, or improving learning? Those require different evidence.</div><form class="planner-form" id="planner-form">${plannerFields.map(([key, label, hint, placeholder]) => `<div class="planner-field"><label for="plan-${key}">${esc(label)}</label><span>${esc(hint)}</span><textarea id="plan-${key}" name="${key}" placeholder="${esc(placeholder)}">${esc(state.planner[key] || "")}</textarea></div>`).join("")}</form><div class="planner-actions"><button id="export-plan" class="button-primary">Export plan <span aria-hidden="true">↓</span></button><span class="planner-status" aria-live="polite">${storageAvailable ? "Draft saves locally." : "Browser storage unavailable; export your draft before leaving."}</span></div></section>`;
  $("#planner-form").addEventListener("input", (e) => {
    if (!e.target.name) return;
    state.planner[e.target.name] = e.target.value;
    const saved = save();
    $(".planner-status").textContent = saved
      ? "Draft saved in this browser."
      : "Storage unavailable. Export your draft before leaving.";
  });
  $("#export-plan").addEventListener("click", () => {
    const text = `# PAFS-LM experiment plan\n\n${plannerFields.map(([key, label]) => `## ${label}\n\n${state.planner[key] || "[To decide]"}\n`).join("\n")}\nPrepared with PAFS-LM ML reference. This draft does not execute or preregister an experiment.\n`;
    download("pafs-experiment-plan.md", text);
    toast("Plan exported.");
  });
}
function notesPage() {
  document.title = "Notes · ML reference";
  const entries = lessons.filter((l) => String(state.notes[l.id] || "").trim());
  main.innerHTML = `<section class="tool-page fade-in"><div class="eyebrow">LOCAL / NOTES</div><h1>Notes</h1><p class="tool-deck">Notes saved beside each module. Export them as Markdown.</p>${entries.length ? `<button class="button-outline" id="export-notes">Export all notes ↓</button>${entries.map((l) => `<article class="note-entry"><h2>${esc(l.title)}</h2><div class="note-content">${esc(state.notes[l.id])}</div><a href="#${l.id}">Edit module notes →</a></article>`).join("")}` : `<div class="empty-state"><h2>No saved notes.</h2><p>Add notes in a module’s Notes box to see them here.</p><a class="button-outline" href="#${firstUnfinished().id}">Open module →</a></div>`}</section>`;
  if (entries.length)
    $("#export-notes").addEventListener("click", () =>
      download(
        "pafs-field-notes.md",
        `# PAFS-LM notes\n\n${entries.map((l) => `## ${l.title}\n\n${state.notes[l.id]}\n`).join("\n")}`,
      ),
    );
}
function render() {
  cleanupLab();
  cleanupLab = () => {};
  let route = "home";
  try {
    route = decodeURIComponent(location.hash.slice(1) || "home");
  } catch {}
  const lesson = lessons.find((l) => l.id === route);
  if (lesson) lessonPage(lesson);
  else if (route === "glossary") glossaryPage();
  else if (route === "planner") plannerPage();
  else if (route === "notes") notesPage();
  else home();
  window.scrollTo({ top: 0, behavior: "instant" });
  main.focus({ preventScroll: true });
  if (route === "path")
    requestAnimationFrame(() =>
      $("#learning-path")?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      }),
    );
}
document.querySelector(".skip-link").addEventListener("click", (e) => {
  e.preventDefault();
  main.focus();
  main.scrollIntoView({ block: "start" });
});
const dialog = $("#search-dialog");
dialog.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    dialog.close();
  }
});
function searchResults(query = "") {
  const q = query.trim().toLowerCase();
  const foundLessons = lessons
    .filter(
      (l) =>
        !q || `${l.title} ${l.summary} ${l.takeaway}`.toLowerCase().includes(q),
    )
    .slice(0, q ? 8 : 4);
  const foundTerms = q
    ? glossary
        .filter((t) => `${t.term} ${t.definition}`.toLowerCase().includes(q))
        .slice(0, 8)
    : [];
  $("#search-results").innerHTML =
    [
      ...foundLessons.map(
        (l) =>
          `<a class="search-result" href="#${l.id}">${esc(l.title)}<span>Module · ${esc(l.summary)}</span></a>`,
      ),
      ...foundTerms.map(
        (t) =>
          `<a class="search-result" href="#${t.lesson}">${esc(t.term)}<span>${esc(t.definition)}</span></a>`,
      ),
    ].join("") || '<p class="lab-note">No matching results.</p>';
  $("#search-results")
    .querySelectorAll("a")
    .forEach((a) => a.addEventListener("click", () => dialog.close()));
}
function openSearch() {
  dialog.showModal();
  searchResults($("#guide-search").value);
  setTimeout(() => $("#guide-search").focus(), 0);
}
$("#open-search").addEventListener("click", openSearch);
$("#guide-search").addEventListener("input", (e) =>
  searchResults(e.target.value),
);
window.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    !dialog.open &&
    !e.ctrlKey &&
    !e.metaKey &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    e.preventDefault();
    openSearch();
  }
});
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      dialog.close();
  }
});
$("#reset-progress").addEventListener("click", () => {
  if (
    !confirm(
      "Reset completed lessons and quiz answers? Your notes and experiment plan will be kept.",
    )
  )
    return;
  state.completed = [];
  state.quizzes = {};
  save();
  render();
  toast("Progress reset. Notes and plan retained.");
});
if (!storageAvailable)
  $("#storage-status").textContent =
    "Browser storage unavailable. Export notes before leaving.";
window.addEventListener("hashchange", render);
render();
