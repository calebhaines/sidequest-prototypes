import React, {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  createInitialState,
  gameReducer,
  getSelectedCustomer,
  formatMoney,
} from "./lib/game.js";
import { customers, foods, recipes } from "./lib/data.js";
import { drawGame } from "./lib/canvas-game.js";

const BEST_KEY = "second-pour-best";
const initialUI = {
  modal: null,
  recipeFilter: "all",
  overlayScroll: 0,
  milkMode: "milk",
  kettleMode: "water",
  ovenFood: "croissant",
  sound: true,
};
function best() {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY)) || {};
  } catch {
    return {};
  }
}
function locationInCanvas(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) * canvas.__view.width) / rect.width,
    y: ((event.clientY - rect.top) * canvas.__view.height) / rect.height,
  };
}
function hitAt(canvas, point) {
  return [...(canvas.__targets || [])]
    .reverse()
    .find(
      (target) =>
        !target.disabled &&
        point.x >= target.x &&
        point.x <= target.x + target.w &&
        point.y >= target.y &&
        point.y <= target.y + target.h,
    );
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () =>
    createInitialState(best()),
  );
  const [ui, setUI] = useState(initialUI);
  const [announcement, setAnnouncement] = useState(
    "Welcome to Second Pour. All game controls are in the café. Use Tab to choose a control and Enter to use it.",
  );
  const canvasRef = useRef(null),
    stateRef = useRef(state),
    uiRef = useRef(ui),
    audioRef = useRef(null),
    hoverRef = useRef(null),
    focusRef = useRef(null),
    resumeRef = useRef(false),
    dragRef = useRef(null),
    modalFocusRef = useRef(null);
  stateRef.current = state;
  uiRef.current = ui;
  const sound = useCallback((kind = "tap") => {
    if (!uiRef.current.sound) return;
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      const ctx = (audioRef.current ||= new Context());
      if (ctx.state === "suspended") ctx.resume();
      const notes =
        kind === "success"
          ? [523, 659, 784]
          : kind === "error"
            ? [247, 220]
            : kind === "chat"
              ? [440, 554]
              : [392];
      notes.forEach((frequency, i) => {
        const oscillator = ctx.createOscillator(),
          gain = ctx.createGain(),
          at = ctx.currentTime + i * 0.09;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.035, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.15);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.17);
      });
    } catch {}
  }, []);
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
  const selected = getSelectedCustomer(state);
  useEffect(() => {
    if (!selected) return;
    setUI((current) => ({
      ...current,
      ovenFood: selected.foodId || current.ovenFood,
      kettleMode: selected.drinkId === "tea" ? "tea" : current.kettleMode,
    }));
    setAnnouncement(
      `${customers[selected.profileId].name} orders ${recipes[selected.drinkId].name}${selected.foodId ? ` and warm ${foods[selected.foodId].name}` : ""}.`,
    );
  }, [selected?.id]);
  useEffect(() => {
    if (!state.notice) return;
    setAnnouncement(state.notice.text);
    if (["success", "error"].includes(state.notice.type))
      sound(state.notice.type);
    const timer = setTimeout(
      () => dispatch({ type: "DISMISS_NOTICE" }),
      state.notice.type === "error" ? 6500 : 5000,
    );
    return () => clearTimeout(timer);
  }, [state.notice?.id, sound]);
  useEffect(() => {
    const hidden = () => {
      if (document.hidden && stateRef.current.phase === "playing")
        dispatch({ type: "PAUSE" });
    };
    document.addEventListener("visibilitychange", hidden);
    return () => document.removeEventListener("visibilitychange", hidden);
  }, []);

  const openModal = useCallback((modal) => {
    resumeRef.current = stateRef.current.phase === "playing";
    modalFocusRef.current = focusRef.current;
    if (resumeRef.current) dispatch({ type: "PAUSE" });
    hoverRef.current = null;
    focusRef.current = "overlay-close";
    setUI((current) => ({ ...current, modal, overlayScroll: 0 }));
  }, []);
  const closeModal = useCallback(() => {
    setUI((current) => ({ ...current, modal: null, overlayScroll: 0 }));
    if (resumeRef.current && stateRef.current.phase === "paused")
      dispatch({ type: "RESUME" });
    resumeRef.current = false;
    focusRef.current = modalFocusRef.current;
    modalFocusRef.current = null;
    hoverRef.current = null;
  }, []);
  const activate = useCallback(
    (target) => {
      if (!target || target.disabled) return;
      focusRef.current = target.id;
      setAnnouncement(target.label);
      const action = target.action;
      sound(
        action.type === "game" && action.value.type === "CHAT" ? "chat" : "tap",
      );
      if (action.type === "game") {
        if (
          action.value.type === "CHAT" &&
          stateRef.current.phase === "paused" &&
          uiRef.current.modal === "chat"
        ) {
          dispatch({ type: "RESUME" });
          dispatch(action.value);
          dispatch({ type: "PAUSE" });
        } else dispatch(action.value);
        return;
      }
      if (action.type === "station") {
        const station = action.value,
          current = stateRef.current,
          mode = uiRef.current,
          job = current.jobs[station];
        if (job?.ready) dispatch({ type: "COLLECT_JOB", station });
        else if (station === "milk" && mode.milkMode === "cold")
          dispatch({ type: "ADD_INGREDIENT", ingredient: "coldMilk" });
        else
          dispatch({
            type: "START_JOB",
            station,
            mode:
              station === "milk"
                ? mode.milkMode
                : station === "kettle"
                  ? mode.kettleMode
                  : undefined,
            foodId: station === "oven" ? mode.ovenFood : undefined,
          });
        return;
      }
      if (action.type === "mode") {
        const key = {
            milk: "milkMode",
            kettle: "kettleMode",
            oven: "ovenFood",
          }[action.station],
          options = {
            milk: ["milk", "foam", "cold"],
            kettle: ["water", "tea"],
            oven: ["croissant", "toastie", "cinnamonroll"],
          }[action.station];
        setUI((current) => ({
          ...current,
          [key]: options[(options.indexOf(current[key]) + 1) % options.length],
        }));
        return;
      }
      if (action.type === "ui") {
        if (action.value === "openRecipes") openModal("recipes");
        else if (action.value === "openHelp") openModal("help");
        else if (action.value === "openChat") openModal("chat");
        else if (action.value === "close") closeModal();
        else if (action.value === "sound")
          setUI((current) => ({ ...current, sound: !current.sound }));
        else if (action.value === "start")
          dispatch({
            type: "START_SHIFT",
            day: (stateRef.current.best.day || 0) + 1,
          });
        else if (
          action.value === "recipesAll" ||
          action.value === "recipesAvailable"
        )
          setUI((current) => ({
            ...current,
            recipeFilter: action.value === "recipesAll" ? "all" : "available",
            overlayScroll: 0,
          }));
        else if (action.value === "home")
          window.location.href =
            "https://calebhaines.github.io/sidequest-prototypes/";
      }
    },
    [sound, openModal, closeModal],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0,
      previous = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const render = (timestamp = 0) => {
      if (timestamp - previous < 33) {
        frame = requestAnimationFrame(render);
        return;
      }
      previous = timestamp;
      const rect = canvas.getBoundingClientRect(),
        W = rect.width,
        H = rect.height,
        ratio = Math.min(window.devicePixelRatio || 1, 2);
      if (W > 0 && H > 0) {
        const width = Math.max(1, Math.round(W * ratio)),
          height = Math.max(1, Math.round(H * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.imageSmoothingEnabled = true;
        const view = drawGame(
          ctx,
          stateRef.current,
          {
            ...uiRef.current,
            hoverId: hoverRef.current,
            focusId: focusRef.current,
          },
          {
            width: W,
            height: H,
            time: reduced.matches ? 0 : timestamp / 1000,
            viewport: {
              y: Math.max(0, -rect.top),
              height: Math.max(
                1,
                Math.min(
                  H - Math.max(0, -rect.top),
                  window.innerHeight - Math.max(0, rect.top),
                ),
              ),
            },
          },
        );
        canvas.__targets = view.targets;
        canvas.__view = { width: W, height: H, ...view };
        canvas.dataset.phase = stateRef.current.phase;
        canvas.dataset.day = stateRef.current.day;
        canvas.dataset.served = stateRef.current.served;
        canvas.dataset.clock = stateRef.current.timeLeft;
        canvas.dataset.tips = stateRef.current.tips;
        canvas.dataset.modal = uiRef.current.modal || "";
        canvas.dataset.ready = view.targets
          .find((t) => t.id === "serve")
          ?.label.includes("ready")
          ? "true"
          : "false";
        if (
          view.overlay &&
          uiRef.current.overlayScroll > view.overlay.maxScroll
        )
          setUI((current) => ({
            ...current,
            overlayScroll: Math.max(0, view.overlay.maxScroll),
          }));
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const keydown = (e) => {
      const appFocused = document.activeElement === canvas;
      if (!appFocused) return;
      const current = stateRef.current,
        mode = uiRef.current;
      if (e.key === "Tab") {
        e.preventDefault();
        const enabled = (canvas.__targets || []).filter(
          (target) => !target.disabled,
        );
        if (!enabled.length) return;
        let index = enabled.findIndex(
          (target) => target.id === focusRef.current,
        );
        index =
          (index + (e.shiftKey ? -1 : 1) + enabled.length) % enabled.length;
        focusRef.current = enabled[index].id;
        setAnnouncement(enabled[index].label);
        return;
      }
      if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        const target = canvas.__targets?.find(
          (target) => target.id === focusRef.current,
        );
        if (target) activate(target);
        else if (e.code === "Space" && !mode.modal)
          dispatch({ type: current.phase === "paused" ? "RESUME" : "PAUSE" });
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        if (mode.modal) closeModal();
        else if (current.phase === "paused") dispatch({ type: "RESUME" });
        else if (current.phase === "playing") dispatch({ type: "PAUSE" });
        return;
      }
      if (e.key.toLowerCase() === "m") {
        setUI((value) => ({ ...value, sound: !value.sound }));
        return;
      }
      if (mode.modal) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const max = canvas.__view?.overlay?.maxScroll || 0;
          setUI((value) => ({
            ...value,
            overlayScroll: Math.max(
              0,
              Math.min(
                max,
                value.overlayScroll + (e.key === "ArrowDown" ? 65 : -65),
              ),
            ),
          }));
        }
        return;
      }
      if (current.phase === "summary") return;
      if (e.key.toLowerCase() === "p")
        dispatch({ type: current.phase === "playing" ? "PAUSE" : "RESUME" });
      if (e.key.toLowerCase() === "r") openModal("recipes");
      if (e.key === "?") openModal("help");
      if (e.key.toLowerCase() === "c" && getSelectedCustomer(current))
        openModal("chat");
    };
    canvas.addEventListener("keydown", keydown);
    return () => canvas.removeEventListener("keydown", keydown);
  }, [activate, closeModal, openModal]);

  const pointerDown = (e) => {
    const canvas = canvasRef.current;
    canvas.focus({ preventScroll: true });
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      scroll: uiRef.current.overlayScroll,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas.__view) return;
    const drag = dragRef.current;
    if (
      drag &&
      (uiRef.current.modal || stateRef.current.phase === "summary") &&
      canvas.__view.overlay?.maxScroll > 0 &&
      e.pointerType === "touch"
    ) {
      const delta = drag.y - e.clientY;
      if (Math.abs(delta) > 7 || drag.moved) {
        drag.moved = true;
        const max = canvas.__view.overlay.maxScroll;
        setUI((current) => ({
          ...current,
          overlayScroll: Math.max(0, Math.min(max, drag.scroll + delta)),
        }));
        return;
      }
    }
    const target = hitAt(canvas, locationInCanvas(canvas, e));
    hoverRef.current = target?.id || null;
    canvas.style.cursor = target ? "pointer" : "default";
  };
  const pointerUp = (e) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.moved) return;
    if (canvas.__view) activate(hitAt(canvas, locationInCanvas(canvas, e)));
  };
  const wheel = (e) => {
    const canvas = canvasRef.current,
      max = canvas.__view?.overlay?.maxScroll || 0;
    if ((!uiRef.current.modal && stateRef.current.phase !== "summary") || !max)
      return;
    const rect = canvas.__view.overlay.scrollRect,
      point = locationInCanvas(canvas, e);
    if (
      rect &&
      point.x >= rect.x &&
      point.x <= rect.x + rect.w &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.h
    ) {
      e.preventDefault();
      setUI((current) => ({
        ...current,
        overlayScroll: Math.max(
          0,
          Math.min(max, current.overlayScroll + e.deltaY),
        ),
      }));
    }
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => canvas.removeEventListener("wheel", wheel);
  }, []);
  const ariaSummary = `Second Pour café game. ${state.phase === "practice" ? "Relaxed practice" : `Day ${state.day}, ${state.timeLeft} seconds remaining`}. ${state.served} guests served. ${formatMoney(state.tips)} in tips. ${selected ? `${customers[selected.profileId].name} is waiting for ${recipes[selected.drinkId].name}${selected.foodId ? ` and a warm ${foods[selected.foodId].name}` : ""}.` : ""} Use Tab and Enter for game controls; P pauses, R opens recipes, C chats, M controls sound, and question mark opens help.`;
  return (
    <main className="game-stage">
      <canvas
        ref={canvasRef}
        className="cafe-game"
        tabIndex={0}
        role="application"
        aria-label={ariaSummary}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          hoverRef.current = null;
        }}
        style={{
          touchAction:
            ui.modal || ["summary", "paused"].includes(state.phase)
              ? "none"
              : "pan-y",
        }}
      />
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </p>
    </main>
  );
}
