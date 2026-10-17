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
      "Browser storage is unavailable. You can still learn and export your notes.";
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
  return `<div class="progress-wrap"><div class="progress-top"><span>Your learning path</span><span class="progress-count">${state.completed.length}/${lessons.length}</span></div><div class="progress-track" role="progressbar" aria-label="Completed lessons" aria-valuemin="0" aria-valuemax="${lessons.length}" aria-valuenow="${state.completed.length}"><div class="progress-fill" style="width:${progress()}%"></div></div></div>`;
}
const groups = [
  {
    no: "01",
    title: "Understand the model",
    desc: "Build intuition for what is happening inside.",
    start: 0,
    end: 3,
  },
  {
    no: "02",
    title: "Read it. Train it.",
    desc: "Learn the tools behind your perception network.",
    start: 3,
    end: 7,
  },
  {
    no: "03",
    title: "Make the research count",
    desc: "Connect memory, rewards and convincing evidence.",
    start: 7,
    end: 11,
  },
];
function rowHTML(lesson, index) {
  const done = state.completed.includes(lesson.id);
  return `<a href="#${esc(lesson.id)}" class="lesson-row${done ? " is-complete" : ""}"><span class="row-number">${done ? "✓" : String(index + 1).padStart(2, "0")}</span><span><span class="row-title">${esc(lesson.title)}</span><span class="row-summary">${esc(lesson.summary)}</span></span><span class="row-time">${esc(lesson.minutes)} MIN · LAB</span><span class="row-arrow" aria-hidden="true">→</span></a>`;
}
function architectureHTML() {
  return `<div class="hero-visual"><div class="visual-label"><span>A MAP OF YOUR PROJECT</span><span><i class="live-dot"></i> EXPLORE THE PARTS</span></div>
  <svg class="architecture-svg" viewBox="0 0 450 255" role="img" aria-label="An input passes through a language model. A probe reads its activations; a separate state can carry information into a later decision.">
    <defs><pattern id="layer-grid" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#a9bda9"/></pattern><marker id="arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="m0 0 5 2.5L0 5" fill="none" stroke="#738a74" stroke-width="1"/></marker></defs>
    <path d="M 66 88 H 245 V 158 H 350 M 122 192 H 176 M 348 192 H 401 V 222 H 122" stroke="#7e967d" stroke-width="1.3" fill="none" stroke-dasharray="3 4" marker-end="url(#arrow)"/>
    <rect x="12" y="35" width="119" height="75" rx="7" fill="#faf9f1" stroke="#c1cfb8"/><text x="25" y="56" font-size="9" fill="#6c7c6c">A SENTENCE</text><text x="25" y="76" font-size="11" fill="#36514c">“We failed, but</text><text x="25" y="93" font-size="11" fill="#36514c">we can try again.”</text>
    <g transform="translate(179 13)"><rect x="0" y="21" width="133" height="78" rx="7" fill="#bdcebc" stroke="#94ac96"/><rect x="5" y="14" width="123" height="78" rx="7" fill="#d1ddc9" stroke="#94ac96"/><rect x="10" y="7" width="113" height="78" rx="7" fill="#173b3f"/><text x="26" y="33" font-size="9" fill="#b6d0c1">LANGUAGE MODEL</text><text x="26" y="55" font-size="17" fill="#f4f1e9" font-weight="500">Qwen</text><g fill="#9ebaab"><circle cx="29" cy="69" r="2"/><circle cx="42" cy="69" r="2"/><circle cx="55" cy="69" r="2"/><circle cx="68" cy="69" r="2"/><circle cx="81" cy="69" r="2"/><circle cx="94" cy="69" r="2"/></g></g>
    <path d="M 315 62 H 341 V 80" fill="none" stroke="#9aafa0" stroke-width="1.2"/><circle cx="341" cy="86" r="5" fill="#dfaa7d"/><text x="352" y="89" font-size="9" fill="#58715b">activations</text>
    <rect x="14" y="151" width="109" height="69" rx="7" fill="#eac49f" stroke="#c99e75"/><text x="27" y="173" font-size="9" fill="#79543b">THE SMALL MODEL</text><text x="27" y="195" font-size="13" fill="#553d2d">Emotion probe</text><text x="27" y="210" font-size="8" fill="#79543b">READS · DOES NOT STEER</text>
    <path d="M245 125H68V146" fill="none" stroke="#8ba084" stroke-width="1.2" marker-end="url(#arrow)"/>
    <rect x="177" y="151" width="116" height="69" rx="7" fill="#f4f1e9" stroke="#b4c5a9"/><text x="190" y="173" font-size="9" fill="#6a7c64">EXTERNAL STATE</text><text x="190" y="195" font-size="12" fill="#38513e">Carry it forward</text><path d="M190 207h12l8-7 10 4 10-6 11 5 11-2 12 4 15-2" stroke="#73926a" stroke-width="1.4" fill="none"/>
    <rect x="348" y="151" width="88" height="69" rx="7" fill="#d1ddc9" stroke="#a7b99b"/><text x="360" y="174" font-size="9" fill="#5e7556">LATER</text><text x="360" y="194" font-size="15" fill="#344e3a">Decision</text><text x="360" y="209" font-size="8" fill="#5e7556">TEST THE EFFECT</text>
    <path d="M297 184h42" stroke="#8ba084" stroke-width="1.2" marker-end="url(#arrow)"/>
  </svg><div class="arch-tabs" role="group" aria-label="Explore architecture"><button data-stage="model" aria-pressed="true">Model</button><button data-stage="probe" aria-pressed="false">Probe</button><button data-stage="state" aria-pressed="false">State</button><button data-stage="decision" aria-pressed="false">Decision</button></div><p class="arch-caption" id="arch-caption" aria-live="polite">The model turns a sentence into internal representations. Its weights stay fixed while you train a small emotion detector.</p></div>`;
}
function home() {
  document.title = "The ML Field Guide · PAFS-LM";
  main.innerHTML = `<div class="home fade-in"><section class="hero"><div><div class="eyebrow">A field guide for a curious researcher</div><h1>Make sense of<br>what’s <em>inside.</em></h1><p class="hero-description">Understand the model, build a better probe, and know what your results actually mean. Machine learning, explained through your PAFS-LM project.</p><div class="hero-actions"><a class="button-primary" href="#${firstUnfinished().id}">${state.completed.length ? "Continue learning" : "Start the first lesson"} <span aria-hidden="true">→</span></a><a class="button-outline" href="#path">Explore the path ↓</a></div><p class="small-note">No advanced maths needed. Read, change a variable, see what happens.</p></div>${architectureHTML()}</section>
  <section class="intro-strip" aria-label="About the guide"><p>From “what is a weight?”<br>to “what does this result prove?”</p><div class="intro-stats"><div><strong>${lessons.length}</strong><span>focused<br>lessons</span></div><div><strong>${lessons.length}</strong><span>interactive<br>labs</span></div><div><strong>${progress()}<span style="font-family:var(--sans);font-size:16px">%</span></strong><span>of your path<br>completed</span></div></div></section>
  <section class="path-section" id="learning-path"><div class="section-heading"><div><div class="eyebrow">Your learning path</div><h2>One idea at a time.</h2></div><p>Follow the sequence, or jump to the question you are working on today. Every lesson connects back to the research.</p></div>${groups
    .map(
      (g) =>
        `<div class="path-group"><div class="path-group-label"><span class="phase-no">PART ${g.no}</span><h3>${g.title}</h3><p>${g.desc}</p></div><div>${lessons
          .slice(g.start, g.end)
          .map((l, i) => rowHTML(l, g.start + i))
          .join("")}</div></div>`,
    )
    .join("")}</section>
  <section class="home-bottom"><div><h2>Turn understanding<br>into a better study.</h2><p>Write your hypothesis, choose a meaningful comparison, and decide what would change your mind.</p><a href="#planner">Open the experiment planner →</a></div><div><h2>A word you don’t<br>quite understand?</h2><p>Plain-language definitions for the terms you encounter in the code, papers and experiment reports.</p><a href="#glossary">Explore the glossary →</a></div></section><p class="research-note">This guide distinguishes established ML ideas, simplified teaching simulations and specific PAFS-LM findings. Emotion recognition, causal control and useful persistence are separate research questions. No lesson claims that a model has subjective feelings.</p></div>`;
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
  return `<button class="mobile-chapters" aria-expanded="false" aria-controls="lesson-sidebar">Chapters & your progress <span aria-hidden="true">＋</span></button><nav class="lesson-nav" id="lesson-sidebar" aria-label="Lesson navigation">${progressHTML()}<div class="nav-eyebrow">THE FIELD GUIDE</div>${lessons.map((l, i) => `<a class="chapter-link${l.id === id ? " active" : ""}${state.completed.includes(l.id) ? " done" : ""}" href="#${l.id}" ${l.id === id ? 'aria-current="page"' : ""}><span>${state.completed.includes(l.id) ? "✓" : String(i + 1).padStart(2, "0")}</span><span>${esc(l.title)}</span></a>`).join("")}<div class="nav-divider"></div><a class="nav-tool" href="#glossary">→ Glossary</a><a class="nav-tool" href="#planner">→ Experiment planner</a><a class="nav-tool" href="#notes">→ Your notes</a></nav>`;
}
const labNames = {
  training: "Fit a model yourself",
  tokens: "A context-window workbench",
  activations: "Look inside a representation",
  probes: "When a straight line is not enough",
  emotion: "Separate confidence from intensity",
  optimization: "Find a useful learning rate",
  lora: "How small is a low-rank update?",
  rl: "A tiny reward-learning experiment",
  memory: "Build and update an external memory",
  experiment: "What does your comparison establish?",
  evidence: "Explore uncertainty, not just a score",
};
function sectionHTML(section) {
  return `<section class="lesson-section"><h2>${esc(section.title)}</h2>${section.body}</section>`;
}
function lessonPage(lesson) {
  const index = lessons.indexOf(lesson),
    done = state.completed.includes(lesson.id),
    next = lessons[index + 1];
  document.title = `${lesson.title} · The ML Field Guide`;
  main.innerHTML = `<div class="reader-layout fade-in"><div>${sidebar(lesson.id)}</div><article class="reader-main"><div class="lesson-breadcrumb"><a href="#home">Field guide</a><span>/</span><span>Lesson ${String(index + 1).padStart(2, "0")}</span></div><div class="lesson-kicker"><span>${esc(lesson.eyebrow || "Understand the research")}</span><span>${esc(lesson.minutes)} MIN READ + LAB</span></div><h1>${esc(lesson.title)}</h1><p class="lesson-deck">${esc(lesson.summary)}</p>${lesson.sections.slice(0, 2).map(sectionHTML).join("")}<section class="lab-shell" aria-labelledby="lab-title"><div class="lab-heading"><h2 id="lab-title">${esc(labNames[lesson.lab] || "Try the idea")}</h2><span class="lab-badge">INTERACTIVE SANDBOX</span></div><div class="lab-container" id="lesson-lab"></div><p class="lab-disclaimer">Simplified teaching simulation. This does not run Qwen or reproduce PAFS-LM benchmark results.</p></section>${lesson.sections.slice(2).map(sectionHTML).join("")}<section class="quiz-card" aria-labelledby="quiz-title"><div class="quiz-kicker">A QUICK CHECK</div><h2 id="quiz-title">${esc(lesson.quiz.question)}</h2><div class="quiz-options">${lesson.quiz.options.map((o, i) => `<button class="quiz-option" data-answer="${i}"><span aria-hidden="true">${String.fromCharCode(65 + i)}</span>${esc(o)}</button>`).join("")}</div><p class="quiz-feedback" aria-live="polite"></p></section><div class="lesson-bottom"><button class="complete-button" aria-pressed="${done}">${done ? "✓ Understood — marked complete" : "Mark as understood"}</button><a class="button-primary" href="#${next ? next.id : "planner"}">${next ? "Next lesson" : "Plan your experiment"} <span aria-hidden="true">→</span></a></div></article><aside class="lesson-aside"><section class="aside-card"><h2>The idea to keep</h2><p>${esc(lesson.takeaway)}</p></section><section class="aside-card"><h2>Connect to the research</h2><ul class="source-list">${(lesson.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.label)} →</a></li>`).join("")}</ul><p style="font-family:var(--sans);font-size:10px;color:var(--muted)">Repository links may require your GitHub login. Research sources are snapshots, not claims about the newest run.</p></section><section class="aside-card"><h2>Your field notes</h2><label class="sr-only" for="lesson-note">Notes for ${esc(lesson.title)}</label><textarea id="lesson-note" placeholder="What clicked? What would you ask the researchers?">${esc(state.notes[lesson.id] || "")}</textarea><div class="saved-label" aria-live="polite">${storageAvailable ? "Saved in this browser as you type." : "Storage unavailable. Export notes before leaving."}</div></section></aside></div>`;
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
      ? "Saved in this browser."
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
      `${correct ? "That’s right." : "Keep this distinction in mind."} ${lesson.quiz.explanation}`;
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
    e.currentTarget.textContent = !wasDone
      ? "✓ Understood — marked complete"
      : "Mark as understood";
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
    toast(
      !wasDone
        ? "One more idea understood. Progress saved."
        : "Lesson marked as still in progress.",
    );
  });
}
function glossaryPage() {
  document.title = "Glossary · The ML Field Guide";
  main.innerHTML = `<section class="tool-page fade-in"><div class="eyebrow">Keep the language clear</div><h1>Words, made useful.</h1><p class="tool-deck">A working vocabulary for reading the code and questioning the results. Each definition links back to a lesson where you can try the idea.</p><label class="sr-only" for="glossary-search">Filter glossary terms</label><input class="tool-search" id="glossary-search" type="search" placeholder="Find a term, such as activation or confidence…"><p class="glossary-count" aria-live="polite"></p><div class="glossary-grid" id="glossary-list"></div></section>`;
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
              `<article class="glossary-item"><h2>${esc(t.term)}</h2><p>${esc(t.definition)}</p><a href="#${esc(t.lesson)}">Explore in the lesson →</a></article>`,
          )
          .join("")
      : "<p>No matching terms. Try a broader search.</p>";
  }
  filter();
  $("#glossary-search").addEventListener("input", (e) =>
    filter(e.target.value),
  );
}
const plannerFields = [
  [
    "question",
    "What question are you answering?",
    "Name one uncertainty, not the whole project.",
    "Does combining layers improve intensity prediction on unfamiliar stories?",
  ],
  [
    "hypothesis",
    "What do you predict?",
    "Specify the direction and a meaningful size of improvement.",
    "A small nonlinear detector will reduce ordinal prediction error compared with a single-layer probe.",
  ],
  [
    "change",
    "What exactly changes?",
    "Make the variable you are testing explicit.",
    "Activation inputs from one layer versus six fixed layers.",
  ],
  [
    "controls",
    "What are the comparisons?",
    "Keep information, training access and quality checks in view.",
    "Single-layer linear, multilayer linear, multilayer nonlinear, and direct Qwen classification.",
  ],
  [
    "data",
    "What data will test it fairly?",
    "Choose the split unit before fitting. Keep related passages together.",
    "Held-out original stories with trustworthy person-specific intensity labels; unknown labels stay masked.",
  ],
  [
    "measure",
    "What is the primary measurement?",
    "Name the metric, time point and meaningful threshold before opening the test set.",
    "Macro-averaged ordinal absolute error at the fixed endpoint, with a paired story-level interval.",
  ],
  [
    "failure",
    "What would change your mind?",
    "Include an outcome that would favour the simpler approach.",
    "No meaningful improvement on held-out stories, poor calibration, or gains explained only by predicting absence.",
  ],
  [
    "claims",
    "What could you conclude?",
    "Separate recognition, causal control and useful persistence.",
    "Improved recognition of annotated emotional intensity. No claim of feeling or behavioural control.",
  ],
];
function plannerPage() {
  document.title = "Experiment planner · The ML Field Guide";
  main.innerHTML = `<section class="tool-page fade-in"><div class="eyebrow">From curiosity to evidence</div><h1>Make a question<br>testable.</h1><p class="tool-deck">A small plan for one decisive experiment. Your answers stay in this browser; export them when you are ready to share a concrete proposal.</p><div class="planner-callout"><strong>Start here:</strong> Is your question about reading information, changing behaviour, keeping state, or improving learning? Those require different evidence.</div><form class="planner-form" id="planner-form">${plannerFields.map(([key, label, hint, placeholder]) => `<div class="planner-field"><label for="plan-${key}">${esc(label)}</label><span>${esc(hint)}</span><textarea id="plan-${key}" name="${key}" placeholder="${esc(placeholder)}">${esc(state.planner[key] || "")}</textarea></div>`).join("")}</form><div class="planner-actions"><button id="export-plan" class="button-primary">Export your plan <span aria-hidden="true">↓</span></button><span class="planner-status" aria-live="polite">${storageAvailable ? "Your draft saves automatically in this browser." : "Browser storage unavailable; export your draft before leaving."}</span></div></section>`;
  $("#planner-form").addEventListener("input", (e) => {
    if (!e.target.name) return;
    state.planner[e.target.name] = e.target.value;
    const saved = save();
    $(".planner-status").textContent = saved
      ? "Draft saved in this browser."
      : "Storage unavailable. Export your draft before leaving.";
  });
  $("#export-plan").addEventListener("click", () => {
    const text = `# PAFS-LM experiment plan\n\n${plannerFields.map(([key, label]) => `## ${label}\n\n${state.planner[key] || "[To decide]"}\n`).join("\n")}\nPrepared with The ML Field Guide. This draft does not execute or preregister an experiment.\n`;
    download("pafs-experiment-plan.md", text);
    toast("Your experiment plan has been exported.");
  });
}
function notesPage() {
  document.title = "Your field notes · The ML Field Guide";
  const entries = lessons.filter((l) => String(state.notes[l.id] || "").trim());
  main.innerHTML = `<section class="tool-page fade-in"><div class="eyebrow">Keep what you discover</div><h1>Your field notes.</h1><p class="tool-deck">Ideas, questions and connections from your learning path. Add notes beside any lesson, then bring them into your next research discussion.</p>${entries.length ? `<button class="button-outline" id="export-notes">Export all notes ↓</button>${entries.map((l) => `<article class="note-entry"><h2>${esc(l.title)}</h2><div class="note-content">${esc(state.notes[l.id])}</div><a href="#${l.id}">Return to lesson and edit →</a></article>`).join("")}` : `<div class="empty-state"><h2>A place for your next question.</h2><p>Your notebook is empty. Open a lesson and write in its “Your field notes” box. Your notes will appear here.</p><a class="button-outline" href="#${firstUnfinished().id}">Open a lesson →</a></div>`}</section>`;
  if (entries.length)
    $("#export-notes").addEventListener("click", () =>
      download(
        "pafs-field-notes.md",
        `# My PAFS-LM field notes\n\n${entries.map((l) => `## ${l.title}\n\n${state.notes[l.id]}\n`).join("\n")}`,
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
          `<a class="search-result" href="#${l.id}">${esc(l.title)}<span>Lesson · ${esc(l.summary)}</span></a>`,
      ),
      ...foundTerms.map(
        (t) =>
          `<a class="search-result" href="#${t.lesson}">${esc(t.term)}<span>${esc(t.definition)}</span></a>`,
      ),
    ].join("") ||
    '<p class="lab-note">No matches yet. Try a different term.</p>';
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
  toast("Learning progress reset. Your notes are still here.");
});
if (!storageAvailable)
  $("#storage-status").textContent =
    "Browser storage is unavailable. You can still learn and export your notes.";
window.addEventListener("hashchange", render);
render();
