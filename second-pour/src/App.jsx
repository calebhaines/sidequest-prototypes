import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Coffee,
  Flame,
  Heart,
  Leaf,
  MessageCircle,
  Milk,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Snowflake,
  Sparkles,
  Star,
  Sun,
  Timer,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import {
  createInitialState,
  evaluateOrder,
  formatMoney,
  gameReducer,
  getSelectedCustomer,
  recipeProgress,
  SHIFT_SECONDS,
} from "./lib/game.js";
import { customers, foods, recipeList, recipes, foodList } from "./lib/data.js";
import { drawCafe, drawDrink, drawFood, drawPortrait } from "./lib/art.js";

const BEST_KEY = "second-pour-best";
const ingredientNames = {
  shots: "espresso",
  milk: "steamed milk",
  foam: "milk foam",
  water: "hot water",
  tea: "tea",
  chocolate: "chocolate",
  vanilla: "vanilla",
  caramel: "caramel",
  coldMilk: "cold milk",
};
const machineInfo = {
  espresso: {
    name: "Espresso machine",
    short: "Espresso",
    icon: Coffee,
    color: "green",
    idle: "One small shot. A world of possibility.",
    running: "Pulling your shot…",
    ready: "A fresh shot is ready.",
    collect: "Pour espresso",
  },
  milk: {
    name: "Milk station",
    short: "Milk & foam",
    icon: Milk,
    color: "pink",
    idle: "A little silky. A little fluffy.",
    running: "The steam wand is working…",
    ready: "Milk is ready for your cup.",
    collect: "Add to cup",
  },
  kettle: {
    name: "The kettle",
    short: "Hot water & tea",
    icon: Waves,
    color: "blue",
    idle: "For the slow-sippers and tea people.",
    running: "A little heat, a little patience…",
    ready: "Your pour is ready.",
    collect: "Pour into cup",
  },
  oven: {
    name: "The little oven",
    short: "Pastries & toasties",
    icon: Flame,
    color: "yellow",
    idle: "Good things come warm and crumbly.",
    running: "Getting warm and golden…",
    ready: "Warm food, ready to go.",
    collect: "Place on tray",
  },
};
const timeLabel = (seconds) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function readBest() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || {};
  } catch {
    return {};
  }
}

function PixelArt({
  kind,
  value,
  className = "",
  state,
  onSelect,
  selectedStation,
}) {
  const ref = useRef(null);
  const stateRef = useRef(state);
  const hitboxes = useRef(null);
  stateRef.current = state;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0,
      previous = 0;
    const render = (timestamp = 0) => {
      if (kind === "cafe" && timestamp - previous < 70) {
        frame = requestAnimationFrame(render);
        return;
      }
      previous = timestamp;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        if (kind === "cafe")
          hitboxes.current = drawCafe(ctx, stateRef.current, {
            width,
            height,
            time: timestamp,
            selectedStation,
          });
        else if (kind === "portrait") drawPortrait(ctx, value, width, height);
        else if (kind === "drink") drawDrink(ctx, value, { width, height });
        else if (kind === "food") drawFood(ctx, value, { width, height });
      }
      if (kind === "cafe") frame = requestAnimationFrame(render);
    };
    render();
    const observer = new ResizeObserver(() => {
      if (kind !== "cafe") render();
    });
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [kind, value, selectedStation]);
  const handleClick = (event) => {
    if (!onSelect || !hitboxes.current) return;
    const canvas = ref.current,
      rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const inside = (box) =>
      x >= box.x &&
      x <= box.x + (box.w ?? box.width) &&
      y >= box.y &&
      y <= box.y + (box.h ?? box.height);
    const person = hitboxes.current.customers?.find(inside);
    if (person) return onSelect("customer", person.id);
    for (const [id, box] of Object.entries(hitboxes.current.stations || {}))
      if (inside(box)) return onSelect("station", id);
  };
  return (
    <canvas
      ref={ref}
      className={`pixel-art ${className}`}
      onClick={handleClick}
      aria-label={
        kind === "cafe"
          ? "The Second Pour coffee shop. Click a customer or a machine."
          : kind === "portrait"
            ? `${value?.name || "Customer"} portrait`
            : kind === "drink"
              ? "Your drink in progress"
              : `${foods[value]?.name || "Food"} on the tray`
      }
    />
  );
}

function IconButton({ icon: Icon, label, onClick, className = "", ...props }) {
  return (
    <button
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      {...props}
    >
      <Icon size={17} strokeWidth={1.7} />
    </button>
  );
}

function RecipeSteps({ customer, state, compact = false }) {
  const recipe = recipes[customer?.drinkId];
  if (!recipe) return null;
  const progress = recipeProgress(state.drink, recipe);
  return (
    <div className={`recipe-steps ${compact ? "compact" : ""}`}>
      {progress.steps.map((step, i) => (
        <div
          key={step.ingredient}
          className={`${step.complete ? "complete" : ""} ${step.excess ? "excess" : ""}`}
        >
          <span className="step-check">
            {step.complete ? (
              <Check size={10} strokeWidth={3} />
            ) : step.excess ? (
              <X size={10} />
            ) : (
              i + 1
            )}
          </span>
          <span>
            {step.ingredient === "cup"
              ? step.label
              : `${step.expected || 0} × ${step.label}`}
          </span>
          {step.excess && <small>extra</small>}
        </div>
      ))}
      {customer.foodId && (
        <div
          className={
            state.food?.id === customer.foodId && state.food?.warm
              ? "complete"
              : ""
          }
        >
          <span className="step-check">
            {state.food?.id === customer.foodId && state.food?.warm ? (
              <Check size={10} strokeWidth={3} />
            ) : (
              progress.steps.length + 1
            )}
          </span>
          <span>Warm {foods[customer.foodId].shortName.toLowerCase()}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialState(readBest()),
  );
  const [milkMode, setMilkMode] = useState("milk");
  const [kettleMode, setKettleMode] = useState("water");
  const [ovenFood, setOvenFood] = useState("croissant");
  const [selectedStation, setSelectedStation] = useState(null);
  const [modal, setModal] = useState(null);
  const [recipeFilter, setRecipeFilter] = useState("all");
  const [sound, setSound] = useState(true);
  const audioRef = useRef(null);
  const resumeAfterModal = useRef(false);
  const stationRefs = useRef({});
  const selected = getSelectedCustomer(state);
  const profile = customers[selected?.profileId];
  const recipe = recipes[selected?.drinkId];
  const evaluation = evaluateOrder(state, selected);
  const isPractice = state.phase === "practice";
  const canWork = isPractice || state.phase === "playing";
  const ingredients = Object.keys(ingredientNames).filter(
    (key) => state.drink[key] > 0,
  );
  const goal = 6;
  const nextDay = (state.best.day || 0) + 1;

  const playSound = useCallback(
    (type = "tap") => {
      if (!sound) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = (audioRef.current ||= new AudioContext());
        if (ctx.state === "suspended") ctx.resume().catch(() => {});
        const notes =
          type === "success"
            ? [523, 659, 784]
            : type === "error"
              ? [220, 174]
              : type === "chat"
                ? [440, 554]
                : [660];
        notes.forEach((frequency, i) => {
          const oscillator = ctx.createOscillator(),
            gain = ctx.createGain();
          const t = ctx.currentTime + i * 0.085;
          oscillator.type = "sine";
          oscillator.frequency.value = frequency;
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.035, t + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
          oscillator.connect(gain);
          gain.connect(ctx.destination);
          oscillator.start(t);
          oscillator.stop(t + 0.18);
        });
      } catch {}
    },
    [sound],
  );
  const act = useCallback(
    (action) => {
      playSound(action.type === "CHAT" ? "chat" : "tap");
      dispatch(action);
    },
    [playSound],
  );

  useEffect(() => {
    if (state.phase !== "playing") return;
    const timer = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);
  useEffect(() => {
    try {
      localStorage.setItem(BEST_KEY, JSON.stringify(state.best));
    } catch {}
  }, [state.best]);
  useEffect(() => {
    if (selected?.foodId) setOvenFood(selected.foodId);
    if (selected?.drinkId === "tea") setKettleMode("tea");
  }, [selected?.id]);
  useEffect(() => {
    if (!state.notice) return;
    if (state.notice.type === "success" || state.notice.type === "error")
      playSound(state.notice.type);
    const timer = setTimeout(
      () => dispatch({ type: "DISMISS_NOTICE" }),
      state.notice.type === "error" ? 6500 : 5500,
    );
    return () => clearTimeout(timer);
  }, [state.notice?.id]);

  const openModal = (id) => {
    resumeAfterModal.current = state.phase === "playing";
    if (resumeAfterModal.current) dispatch({ type: "PAUSE" });
    setModal(id);
  };
  const closeModal = () => {
    setModal(null);
    if (resumeAfterModal.current) dispatch({ type: "RESUME" });
    resumeAfterModal.current = false;
  };
  useEffect(() => {
    if (!modal && state.phase !== "summary") return;
    const previousFocus = document.activeElement;
    const dialog = document.querySelector(".modal-backdrop");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [
      ...dialog.querySelectorAll(
        "button:not(:disabled), a[href], select:not(:disabled)",
      ),
    ];
    focusable()[0]?.focus();
    const trapFocus = (e) => {
      if (e.key !== "Tab") return;
      const elements = focusable(),
        first = elements[0],
        last = elements.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [modal, state.phase === "summary"]);
  useEffect(() => {
    const handler = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "Escape" && modal) {
        e.preventDefault();
        closeModal();
        return;
      }
      if (modal || state.phase === "summary") return;
      const interactive = ["BUTTON", "A"].includes(e.target.tagName);
      if (e.key.toLowerCase() === "p" || (e.code === "Space" && !interactive)) {
        e.preventDefault();
        if (state.phase === "playing") dispatch({ type: "PAUSE" });
        else if (state.phase === "paused") dispatch({ type: "RESUME" });
      }
      if (e.key.toLowerCase() === "r") openModal("recipes");
      if (e.key === "?") openModal("help");
      if (e.key.toLowerCase() === "m") setSound((s) => !s);
      if (e.key === "Enter" && canWork && !interactive) {
        e.preventDefault();
        act({ type: "SERVE" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.phase, modal, canWork, act]);

  function focusStation(type, id) {
    if (type === "customer") {
      act({ type: "SELECT_CUSTOMER", id });
      return;
    }
    setSelectedStation(id);
    stationRefs.current[id]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }
  function stationAction(id) {
    const job = state.jobs[id];
    if (job?.ready) return act({ type: "COLLECT_JOB", station: id });
    if (id === "milk" && milkMode === "cold")
      return act({ type: "ADD_INGREDIENT", ingredient: "coldMilk" });
    act({
      type: "START_JOB",
      station: id,
      mode: id === "milk" ? milkMode : id === "kettle" ? kettleMode : undefined,
      foodId: id === "oven" ? ovenFood : undefined,
    });
  }
  const startDay = () => act({ type: "START_SHIFT", day: nextDay });

  return (
    <div className="game-app">
      <header className="site-header">
        <a
          className="brand"
          href="#"
          aria-label="Second Pour home"
          onClick={(e) => e.preventDefault()}
        >
          <span className="brand-icon">
            <Coffee size={25} strokeWidth={1.55} />
          </span>
          <span>
            <strong>
              Second Pour<span>.</span>
            </strong>
            <small>A LITTLE COFFEE. A LOT OF COMPANY.</small>
          </span>
        </a>
        <div
          className={`shift-pill ${state.phase === "paused" ? "paused" : ""}`}
        >
          <Sun size={14} />
          <span>
            {isPractice
              ? "THE WARM-UP"
              : `DAY ${String(state.day).padStart(2, "0")} · MORNING SHIFT`}
          </span>
          <i />
        </div>
        <div className="header-actions">
          <button
            className="recipe-button"
            onClick={() => openModal("recipes")}
          >
            <BookOpen size={15} />
            Recipe book<kbd>R</kbd>
          </button>
          <IconButton
            icon={sound ? Volume2 : VolumeX}
            label={sound ? "Mute sound" : "Turn on sound"}
            onClick={() => setSound((s) => !s)}
          />
          <IconButton
            icon={CircleHelp}
            label="How to play"
            onClick={() => openModal("help")}
          />
          <a
            className="back-link"
            href="https://calebhaines.github.io/sidequest-prototypes/"
          >
            Sidequest
            <ArrowUpRight size={13} />
          </a>
        </div>
      </header>

      <main className="game-body">
        <aside className="orders-column">
          <div className="order-heading">
            <div>
              <span className="eyebrow">A GOOD KIND OF BUSY</span>
              <h2>At the counter</h2>
            </div>
            <span className="queue-count">{state.queue.length}</span>
          </div>
          <div className="queue-description">
            <Users size={13} />
            <span>
              {isPractice
                ? "A familiar face to get you started."
                : state.queue.length
                  ? `${state.queue.length} ${state.queue.length === 1 ? "customer" : "customers"} waiting for a little joy.`
                  : "A new regular will be along soon."}
            </span>
          </div>
          <div className="tickets">
            {state.queue.map((customer, i) => {
              const person = customers[customer.profileId],
                item = recipes[customer.drinkId],
                active = selected?.id === customer.id;
              return (
                <button
                  key={customer.id}
                  className={`order-ticket ${active ? "selected" : ""}`}
                  onClick={() =>
                    act({ type: "SELECT_CUSTOMER", id: customer.id })
                  }
                  aria-label={`Select ${person.name}'s order`}
                >
                  <div className="ticket-top">
                    <span>
                      ORDER {String(customer.arrivalIndex + 1).padStart(2, "0")}
                    </span>
                    {active ? (
                      <span className="ticket-active">MAKING NOW</span>
                    ) : (
                      <span>
                        <Clock3 size={10} />
                        {timeLabel(customer.patience)}
                      </span>
                    )}
                  </div>
                  <div className="ticket-person">
                    <PixelArt
                      kind="portrait"
                      value={person}
                      className="ticket-portrait"
                    />
                    <div>
                      <h3>
                        {person.name}
                        {customer.chatted && (
                          <Heart size={10} fill="currentColor" />
                        )}
                      </h3>
                      <span>{person.role}</span>
                    </div>
                  </div>
                  <div className="ticket-items">
                    <span>
                      <Coffee size={14} />
                      {item.shortName}
                    </span>
                    {customer.foodId && (
                      <span>
                        <Flame size={13} />
                        Warm {foods[customer.foodId].shortName.toLowerCase()}
                      </span>
                    )}
                  </div>
                  <div className="patience-heading">
                    <span>
                      {isPractice
                        ? "No rush. You’ve got this."
                        : customer.patience < 35
                          ? "They’re watching the clock…"
                          : "Happy to wait a little."}
                    </span>
                    {!isPractice && <span>{timeLabel(customer.patience)}</span>}
                  </div>
                  <div
                    className={`patience-track ${customer.patience < 35 ? "low" : ""}`}
                  >
                    <span
                      style={{
                        width: `${isPractice ? 100 : (customer.patience / customer.maxPatience) * 100}%`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
            {state.queue.length === 0 && (
              <div className="empty-counter">
                <Coffee size={28} />
                <strong>
                  {isPractice
                    ? "First coffee, first smile."
                    : "A quiet little moment."}
                </strong>
                <p>
                  {isPractice
                    ? "You’ve got the hang of it. Open the café when you’re ready."
                    : "Clear your cup and enjoy the calm. Someone’s on their way."}
                </p>
                {isPractice && (
                  <button onClick={startDay}>
                    Open the café
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="shift-ledger">
            <div className="ledger-heading">
              <span>YOUR SHIFT, SO FAR</span>
              <Sparkles size={14} />
            </div>
            <div className="ledger-numbers">
              <div>
                <span>Served</span>
                <strong>
                  {String(state.served).padStart(2, "0")}
                  <small>/{goal}</small>
                </strong>
              </div>
              <div>
                <span>Good streak</span>
                <strong>
                  {state.streak}
                  <small>
                    <Flame size={12} />
                  </small>
                </strong>
              </div>
            </div>
            <div className="tips-total">
              <span>
                <Heart size={15} />
                The tip jar
              </span>
              <strong>{formatMoney(state.tips)}</strong>
            </div>
            <div className="goal-track">
              <span
                style={{
                  width: `${Math.min(100, (state.served / goal) * 100)}%`,
                }}
              />
            </div>
            <p>
              {state.served >= goal
                ? "Six little moments made brighter. Nice work!"
                : `Make ${goal} customers happy for a golden shift.`}
            </p>
          </div>
          <div className="little-note">
            <Leaf size={17} />
            <p>
              Some people need coffee.
              <br />
              Some just need a little company.
            </p>
          </div>
          <div className="best-shift">
            <Award size={13} />
            Best shift<span>{formatMoney(state.best.tips)}</span>
          </div>
        </aside>

        <div className="cafe-column">
          <div className="cafe-heading">
            <div>
              <span className="eyebrow">
                <span />
                GOOD MORNING, BARISTA
              </span>
              <h1>Your corner of the morning.</h1>
              <p>Pull shots. Warm pastries. Make somebody’s day.</p>
            </div>
            {isPractice ? (
              <button className="primary-button open-cafe" onClick={startDay}>
                <Play size={14} />
                {nextDay > 1 ? `Open day ${nextDay}` : "Open the café"}
                <ArrowRight size={14} />
              </button>
            ) : (
              <div
                className={`shift-clock ${state.timeLeft < 30 ? "running-low" : ""}`}
              >
                <Timer size={15} />
                <strong>{timeLabel(state.timeLeft)}</strong>
                <IconButton
                  icon={state.phase === "paused" ? Play : Pause}
                  label={
                    state.phase === "paused" ? "Resume shift" : "Pause shift"
                  }
                  onClick={() =>
                    dispatch({
                      type: state.phase === "paused" ? "RESUME" : "PAUSE",
                    })
                  }
                  disabled={state.phase === "summary"}
                />
              </div>
            )}
          </div>

          <section className="cafe-scene">
            <div className="scene-header">
              <span>
                <span />
                {isPractice
                  ? "The doors open when you’re ready."
                  : state.phase === "paused"
                    ? "A little breather. Time is paused."
                    : "The doors are open. Come on in."}
              </span>
              <span>
                <Sun size={12} />
                {
                  ["A fresh start", "A familiar rhythm", "The morning rush"][
                    Math.min(state.day - 1, 2)
                  ]
                }
              </span>
            </div>
            <PixelArt
              kind="cafe"
              state={state}
              selectedStation={selectedStation}
              className="cafe-canvas"
              onSelect={focusStation}
            />
            {state.phase === "paused" && (
              <div className="paused-scene">
                <span>
                  <Coffee size={25} />
                  <h2>Take a little breather.</h2>
                  <p>Your coffee, customers, and clock can wait.</p>
                  <button
                    className="primary-button"
                    onClick={() => dispatch({ type: "RESUME" })}
                  >
                    <Play size={14} />
                    Back to the counter
                  </button>
                </span>
              </div>
            )}
            <div className="scene-footer">
              <span>
                <MouseHint />
                Click a machine or a customer in the café.
              </span>
              <span>
                Small moments, freshly brewed <Sparkles size={10} />
              </span>
            </div>
          </section>

          <div className="mobile-order-bar">
            <div className="mobile-customers" aria-label="Choose a customer">
              {state.queue.map((customer) => (
                <button
                  className={customer.id === selected?.id ? "selected" : ""}
                  key={customer.id}
                  onClick={() =>
                    act({ type: "SELECT_CUSTOMER", id: customer.id })
                  }
                >
                  <Users size={12} />
                  {customers[customer.profileId].name}
                  {!isPractice && <small>{timeLabel(customer.patience)}</small>}
                </button>
              ))}
            </div>
            {selected ? (
              <>
                <div className="mobile-recipe-heading">
                  <Coffee size={16} />
                  <strong>{recipe.name}</strong>
                  <span>{profile.name}’s order</span>
                </div>
                <RecipeSteps customer={selected} state={state} compact />
              </>
            ) : (
              <p>
                {isPractice
                  ? "Perfect first order! Open the café when you’re ready."
                  : "A new regular will be along soon."}
              </p>
            )}
          </div>
          <div className="workbench-heading">
            <span>MAKE A LITTLE MAGIC</span>
            <span>
              {isPractice
                ? "Practice machines finish instantly. No waiting, no pressure."
                : "Machines can work at the same time. Collect when ready."}
            </span>
          </div>
          <section
            className="machines"
            aria-label="Coffee preparation stations"
          >
            {Object.entries(machineInfo).map(([id, info], index) => {
              const job = state.jobs[id],
                Icon = info.icon;
              const running = job && !job.ready;
              const label = job?.ready
                ? id === "milk"
                  ? `Add ${job.mode === "foam" ? "foam" : "milk"}`
                  : id === "kettle"
                    ? `Pour ${job.mode === "tea" ? "tea" : "water"}`
                    : info.collect
                : id === "espresso"
                  ? "Pull espresso"
                  : id === "milk"
                    ? milkMode === "cold"
                      ? "Pour cold milk"
                      : milkMode === "foam"
                        ? "Make milk foam"
                        : "Steam milk"
                    : id === "kettle"
                      ? kettleMode === "tea"
                        ? "Brew tea"
                        : "Heat water"
                      : "Warm food";
              return (
                <article
                  key={id}
                  ref={(el) => {
                    stationRefs.current[id] = el;
                  }}
                  className={`machine-card ${info.color} ${selectedStation === id ? "focused" : ""} ${running ? "working" : ""} ${job?.ready ? "ready" : ""}`}
                >
                  <div className="machine-title">
                    <span className="machine-icon">
                      <Icon size={20} strokeWidth={1.65} />
                    </span>
                    <div>
                      <span>STATION {String(index + 1).padStart(2, "0")}</span>
                      <h3>{info.short}</h3>
                    </div>
                    {job?.ready && <span className="ready-dot" />}
                  </div>
                  <div className="machine-options">
                    {id === "espresso" ? (
                      <span className="machine-description">
                        Freshly ground.
                        <br />A little boost of possibility.
                      </span>
                    ) : id === "milk" ? (
                      <div
                        className="mode-switch"
                        role="group"
                        aria-label="Milk preparation"
                      >
                        {[
                          ["milk", "Milk"],
                          ["foam", "Foam"],
                          ["cold", "Cold"],
                        ].map(([value, name]) => (
                          <button
                            key={value}
                            disabled={!!job || !canWork}
                            onClick={() => setMilkMode(value)}
                            className={milkMode === value ? "selected" : ""}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : id === "kettle" ? (
                      <div
                        className="mode-switch"
                        role="group"
                        aria-label="Kettle preparation"
                      >
                        {[
                          ["water", "Water"],
                          ["tea", "Tea"],
                        ].map(([value, name]) => (
                          <button
                            key={value}
                            disabled={!!job || !canWork}
                            onClick={() => setKettleMode(value)}
                            className={kettleMode === value ? "selected" : ""}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="food-select">
                        <select
                          aria-label="Food to warm"
                          value={ovenFood}
                          disabled={!!job || !canWork}
                          onChange={(e) => setOvenFood(e.target.value)}
                        >
                          {foodList.map((food) => (
                            <option key={food.id} value={food.id}>
                              {food.shortName}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} />
                      </div>
                    )}
                  </div>
                  {running ? (
                    <div className="job-progress">
                      <div>
                        <span>
                          {id === "oven"
                            ? "Warming…"
                            : id === "espresso"
                              ? "Pulling…"
                              : id === "milk"
                                ? "Steaming…"
                                : "Brewing…"}
                        </span>
                        <strong>{job.remaining}s</strong>
                      </div>
                      <span>
                        <i
                          style={{
                            width: `${((job.duration - job.remaining) / job.duration) * 100}%`,
                          }}
                        />
                      </span>
                    </div>
                  ) : (
                    <div className="machine-duration">
                      {job?.ready ? (
                        <>
                          <Check size={10} />
                          {id === "oven"
                            ? "Warm & ready for the tray"
                            : "Ready for your cup"}
                        </>
                      ) : (
                        <>
                          <Clock3 size={10} />
                          {id === "milk" && milkMode === "cold"
                            ? "Fresh milk · instant pour"
                            : isPractice
                              ? "Instant in practice"
                              : `${id === "espresso" ? 4 : id === "milk" ? 5 : id === "kettle" ? (kettleMode === "tea" ? 6 : 5) : foods[ovenFood].duration} seconds`}
                        </>
                      )}
                    </div>
                  )}
                  <button
                    className={`brew-button ${job?.ready ? "collect" : ""}`}
                    disabled={!canWork || !!running}
                    onClick={() => {
                      setSelectedStation(id);
                      stationAction(id);
                    }}
                  >
                    {job?.ready ? (
                      <Plus size={13} />
                    ) : running ? (
                      <Waves size={13} />
                    ) : (
                      <Play size={12} />
                    )}
                    {running ? "Working its magic…" : label}
                    {!running && <ArrowRight size={12} />}
                  </button>
                </article>
              );
            })}
          </section>

          <div className="extras-bar">
            <span>
              <Sparkles size={12} />A little extra
            </span>
            {[
              ["chocolate", "Chocolate", 2],
              ["vanilla", "Vanilla", 2],
              ["caramel", "Caramel", 3],
            ].map(([id, name, day]) => (
              <button
                key={id}
                disabled={!canWork || state.day < day}
                title={
                  state.day < day
                    ? `Unlocks on day ${day}`
                    : `Add ${name.toLowerCase()} to the cup`
                }
                onClick={() => act({ type: "ADD_INGREDIENT", ingredient: id })}
              >
                <Plus size={10} />
                {name}
                {state.day < day && <small>DAY {day}</small>}
              </button>
            ))}
            <span className="extras-hint">New flavors, familiar faces.</span>
          </div>

          <section
            className={`serving-tray ${evaluation.correct ? "order-ready" : ""}`}
            aria-label="Serving tray"
          >
            <div className="tray-cup">
              <PixelArt
                kind="drink"
                value={state.drink}
                className="drink-art"
              />
              <div>
                <span className="tray-label">YOUR CUP</span>
                <div className="cup-switch">
                  <button
                    className={state.drink.cup === "hot" ? "selected" : ""}
                    disabled={!canWork}
                    onClick={() => act({ type: "SET_CUP", cup: "hot" })}
                  >
                    <Coffee size={11} />
                    Hot
                  </button>
                  <button
                    className={state.drink.cup === "iced" ? "selected" : ""}
                    disabled={!canWork}
                    onClick={() => act({ type: "SET_CUP", cup: "iced" })}
                  >
                    <Snowflake size={11} />
                    Iced
                  </button>
                </div>
                <span className="cup-contents">
                  {ingredients.length
                    ? ingredients
                        .map(
                          (key) =>
                            `${state.drink[key]} ${ingredientNames[key]}`,
                        )
                        .join(" · ")
                    : "A fresh cup. A fresh start."}
                </span>
              </div>
              <IconButton
                icon={RotateCcw}
                label="Remake drink with a fresh cup"
                onClick={() => act({ type: "CLEAR_DRINK" })}
                disabled={!canWork || !ingredients.length}
              />
            </div>
            <span className="tray-divider" />
            <div className="tray-food">
              {state.food ? (
                <>
                  <PixelArt
                    kind="food"
                    value={state.food.id}
                    className="food-art"
                  />
                  <span>
                    <strong>{foods[state.food.id].shortName}</strong>
                    <small>
                      <Flame size={10} />
                      Warm & ready
                    </small>
                  </span>
                  <IconButton
                    icon={X}
                    label="Clear food from tray"
                    onClick={() => act({ type: "CLEAR_FOOD" })}
                    disabled={!canWork}
                  />
                </>
              ) : (
                <>
                  <span className="empty-plate">
                    <Flame size={15} />
                  </span>
                  <span>
                    <strong>A spot for something warm</strong>
                    <small>Food from the oven goes here.</small>
                  </span>
                </>
              )}
            </div>
            <button
              className={`serve-button ${evaluation.correct ? "ready" : ""}`}
              disabled={!canWork || !selected}
              onClick={() => act({ type: "SERVE" })}
            >
              {evaluation.correct ? <Check size={15} /> : <Coffee size={15} />}
              Serve {profile?.name || "order"}
              <ArrowRight size={15} />
            </button>
          </section>
          {isPractice && (
            <div className="practice-hint">
              <Leaf size={12} />
              <span>
                Start with Mina’s latte and croissant. Your recipe is on the
                right. Make yourself at home.
              </span>
              <button onClick={() => openModal("help")}>
                Show me how
                <ArrowUpRight size={11} />
              </button>
            </div>
          )}
        </div>

        <aside className="company-column">
          <section className="conversation-card">
            <div className="card-heading">
              <span>
                <MessageCircle size={15} />A little conversation
              </span>
              <Heart size={13} />
            </div>
            {selected ? (
              <>
                <div className="conversation-person">
                  <PixelArt
                    kind="portrait"
                    value={profile}
                    className="conversation-portrait"
                  />
                  <div>
                    <h2>
                      {profile.name}
                      <span>
                        {selected.chatted ? "GOOD COMPANY" : "YOUR REGULAR"}
                      </span>
                    </h2>
                    <p>{profile.role}</p>
                  </div>
                </div>
                <p className="customer-greeting">“{profile.greeting}”</p>
                <div className="speech-bubble">
                  {selected.chatted ? selected.chatReply : selected.chatTopic}
                </div>
                {selected.chatted ? (
                  <div className="chat-complete">
                    <Heart size={12} fill="currentColor" />
                    <span>A little listening. A happier customer.</span>
                  </div>
                ) : (
                  <>
                    <span className="your-reply-label">
                      A PENNY FOR YOUR THOUGHTS?
                    </span>
                    <div className="reply-options">
                      {selected.chatOptions.map((choice, i) => (
                        <button
                          key={choice.label}
                          disabled={!canWork}
                          onClick={() => act({ type: "CHAT", choice: i })}
                        >
                          {choice.label}
                          <ArrowUpRight size={12} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="conversation-empty">
                <MessageCircle size={26} />
                <h3>
                  {state.lastServed
                    ? `A smile from ${state.lastServed.name}.`
                    : "Come for the coffee."}
                </h3>
                <p>
                  {state.lastServed
                    ? `“${state.lastServed.reply}”`
                    : "Stay for the company."}
                </p>
              </div>
            )}
            <div className="conversation-footnote">
              <Heart size={11} />
              Good conversation earns a little extra patience—and tips.
            </div>
          </section>

          <section className="current-recipe-card">
            <div className="card-heading">
              <span>
                <BookOpen size={14} />
                The house recipe
              </span>
              <button onClick={() => openModal("recipes")}>
                All recipes
                <ArrowUpRight size={11} />
              </button>
            </div>
            {recipe ? (
              <>
                <div className="recipe-name">
                  <span>
                    {recipe.cup === "iced" ? (
                      <Snowflake size={21} />
                    ) : (
                      <Coffee size={21} />
                    )}
                  </span>
                  <div>
                    <h3>{recipe.name}</h3>
                    <p>{recipe.description}</p>
                  </div>
                </div>
                <RecipeSteps customer={selected} state={state} />
                <div
                  className={`recipe-status ${evaluation.correct ? "complete" : ""}`}
                >
                  {evaluation.correct ? (
                    <>
                      <Check size={12} />A perfect match. Ready to serve!
                    </>
                  ) : (
                    <>
                      <Leaf size={12} />
                      One little step at a time.
                    </>
                  )}
                </div>
              </>
            ) : (
              <div className="recipe-empty">
                <Coffee size={24} />
                <p>
                  The next order will bring
                  <br />a fresh little recipe.
                </p>
              </div>
            )}
          </section>
          <div className="company-note">
            <Sparkles size={15} />
            <p>
              The best ingredient?
              <br />
              <strong>A little care.</strong>
            </p>
            <span>✦</span>
          </div>
        </aside>
      </main>
      <footer className="game-footer">
        <span>
          <span />
          Fresh coffee. Fresh starts.
        </span>
        <span>
          Made for the little moments <Heart size={9} />
        </span>
        <button onClick={() => openModal("help")}>
          How to play<kbd>?</kbd>
        </button>
      </footer>

      {state.notice && (
        <div className={`notice ${state.notice.type}`} role="status">
          {state.notice.type === "error" ? (
            <Coffee size={18} />
          ) : state.notice.type === "success" ? (
            <Check size={18} />
          ) : (
            <MessageCircle size={18} />
          )}
          <span>{state.notice.text}</span>
          <IconButton
            icon={X}
            label="Dismiss message"
            onClick={() => dispatch({ type: "DISMISS_NOTICE" })}
          />
        </div>
      )}

      {modal && (
        <div className="modal-backdrop" onClick={closeModal}>
          <section
            className={`modal ${modal === "recipes" ? "recipe-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={X}
              label="Close dialog"
              className="modal-close"
              onClick={closeModal}
            />
            {modal === "recipes" ? (
              <>
                <span className="modal-icon">
                  <BookOpen size={25} />
                </span>
                <span className="eyebrow">
                  THE SECOND POUR LITTLE BLACK BOOK
                </span>
                <h2 id="modal-title">Something for every morning.</h2>
                <p>
                  Everything starts with the right cup. Every ingredient is one
                  serving.
                </p>
                <div className="recipe-filters">
                  {[
                    ["all", "All recipes"],
                    ["available", "Today’s menu"],
                  ].map(([id, name]) => (
                    <button
                      key={id}
                      className={recipeFilter === id ? "selected" : ""}
                      onClick={() => setRecipeFilter(id)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <div className="recipe-book-grid">
                  {recipeList
                    .filter(
                      (r) => recipeFilter === "all" || r.unlockDay <= state.day,
                    )
                    .map((r) => (
                      <article
                        className={
                          r.unlockDay > state.day ? "locked-recipe" : ""
                        }
                        key={r.id}
                      >
                        <div>
                          <span>
                            {r.cup === "iced" ? (
                              <Snowflake size={19} />
                            ) : (
                              <Coffee size={19} />
                            )}
                          </span>
                          <div>
                            <h3>{r.name}</h3>
                            <span>
                              {r.unlockDay > state.day
                                ? `UNLOCKS DAY ${r.unlockDay}`
                                : "ON TODAY’S MENU"}
                            </span>
                          </div>
                          <strong>{formatMoney(r.price)}</strong>
                        </div>
                        <p>{r.description}</p>
                        <ol>
                          {r.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                      </article>
                    ))}
                </div>
                <div className="oven-recipes">
                  <h3>Something warm on the side</h3>
                  <div>
                    {foodList.map((f) => (
                      <span key={f.id}>
                        <Flame size={13} />
                        <strong>{f.name}</strong>
                        <small>{f.duration}s in the oven</small>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <span className="modal-icon">
                  <Coffee size={26} />
                </span>
                <span className="eyebrow">
                  WELCOME TO YOUR LITTLE COFFEE SHOP
                </span>
                <h2 id="modal-title">A shift worth smiling about.</h2>
                <p>
                  Make the right drink, warm the right food, and get to know the
                  people on the other side of the counter.
                </p>
                <div className="how-to-steps">
                  {[
                    [
                      Coffee,
                      "Read the order",
                      "Select a customer. Their drink and warm food appear on the ticket and recipe card.",
                    ],
                    [
                      Waves,
                      "Work your machines",
                      "Start espresso, milk, kettle, and oven jobs. They run together. When a machine is ready, collect it into your cup or tray.",
                    ],
                    [
                      Check,
                      "Make it just right",
                      "Check every recipe step. Extra ingredients mean you’ll need a fresh cup. Hot and iced cups matter, too.",
                    ],
                    [
                      MessageCircle,
                      "A little small talk",
                      "Reply to a customer’s story. They’ll wait a little longer and leave a little extra in the tip jar.",
                    ],
                    [
                      Sun,
                      "Open the café",
                      "Practice is relaxed and instant. Real shifts last three minutes. Serve six customers for a golden shift; later days bring new flavors and stories.",
                    ],
                  ].map(([Icon, title, text], i) => (
                    <div key={title}>
                      <span>
                        <Icon size={19} />
                      </span>
                      <div>
                        <strong>
                          {i + 1}. {title}
                        </strong>
                        <p>{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="keyboard-help">
                  <span>
                    <kbd>P</kbd> / <kbd>Space</kbd> pause
                  </span>
                  <span>
                    <kbd>R</kbd> recipes
                  </span>
                  <span>
                    <kbd>Enter</kbd> serve
                  </span>
                  <span>
                    <kbd>M</kbd> sound
                  </span>
                </div>
                <button
                  className="primary-button modal-action"
                  onClick={closeModal}
                >
                  Back to the counter
                  <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {state.phase === "summary" && !modal && (
        <div className="modal-backdrop summary-backdrop">
          <section
            className="modal summary-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="summary-title"
          >
            <span className="summary-emblem">
              <Coffee size={35} />
            </span>
            <span className="eyebrow">
              DAY {String(state.day).padStart(2, "0")} · THE LAST CUP IS WASHED
            </span>
            <h2 id="summary-title">
              {state.served >= goal
                ? "A golden little shift."
                : state.served >= 3
                  ? "You made a few days brighter."
                  : "Every barista starts somewhere."}
            </h2>
            <div className="shift-stars">
              {[0, 1, 2].map((i) => (
                <Star
                  key={i}
                  size={26}
                  fill={
                    i <
                    (state.served >= goal
                      ? 3
                      : state.served >= 3
                        ? 2
                        : state.served
                          ? 1
                          : 0)
                      ? "currentColor"
                      : "none"
                  }
                />
              ))}
            </div>
            <p>
              {state.served >= goal
                ? "The coffee was good. The company was even better."
                : "There’s always a fresh pot and another morning."}
            </p>
            <div className="summary-stats">
              <div>
                <Users size={19} />
                <strong>{state.served}</strong>
                <span>happy customers</span>
              </div>
              <div>
                <Heart size={19} />
                <strong>{formatMoney(state.tips)}</strong>
                <span>in the tip jar</span>
              </div>
              <div>
                <Award size={19} />
                <strong>{state.score}</strong>
                <span>little joy points</span>
              </div>
            </div>
            <div className="summary-note">
              <Sparkles size={16} />
              <p>
                {state.day === 1
                  ? "Tomorrow brings chocolate and vanilla, and a few familiar stories."
                  : state.day === 2
                    ? "Tomorrow brings iced lattes and caramel. The regulars are ready."
                    : "The menu is yours. Another morning, another little story."}
              </p>
            </div>
            <button
              className="primary-button modal-action"
              onClick={() => act({ type: "NEXT_SHIFT" })}
            >
              <Sun size={15} />
              Open day {state.day + 1}
              <ArrowRight size={15} />
            </button>
            <button
              className="replay-button"
              onClick={() => act({ type: "RETRY_SHIFT" })}
            >
              <RotateCcw size={13} />
              One more go at this shift
            </button>
            <span className="saved-best-note">
              Your best shifts are saved in this browser.
            </span>
          </section>
        </div>
      )}
    </div>
  );
}

function MouseHint() {
  return (
    <span className="mouse-hint">
      <span />
    </span>
  );
}
