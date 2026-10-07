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
import { planDrop } from "./lib/drag-rules.js";
import {
  machineDragProgress,
  machineDragCommitted,
} from "./lib/machine-controls.js";

const BEST_KEY = "second-pour-best";
const initialUI = {
  modal: null,
  recipeFilter: "all",
  overlayScroll: 0,
  milkMode: "milk",
  kettleMode: "water",
  ovenFood: "croissant",
  sound: true,
  cupDock: null,
  mobileStation: "espresso",
  mobileExtras: false,
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
function inside(point, box) {
  return (
    box &&
    point.x >= box.x &&
    point.x <= box.x + box.w &&
    point.y >= box.y &&
    point.y <= box.y + box.h
  );
}
function itemAt(canvas, point) {
  return [...(canvas.__draggables || [])]
    .reverse()
    .find((item) => inside(point, item));
}
function dropAt(canvas, point, carried = null) {
  const zones = [...(canvas.__dropZones || [])].reverse();
  const direct = zones.find((zone) => inside(point, zone));
  if (direct || carried?.pointerType !== "touch") return direct;
  return zones
    .filter((zone) => zone.accepts?.includes(carried.kind))
    .map((zone) => ({
      zone,
      distance: Math.hypot(
        Math.max(zone.x - point.x, 0, point.x - zone.x - zone.w),
        Math.max(zone.y - point.y, 0, point.y - zone.y - zone.h),
      ),
    }))
    .filter((candidate) => candidate.distance <= 18)
    .sort((a, b) => a.distance - b.distance)[0]?.zone;
}
function controlAt(canvas, point) {
  return [...(canvas.__machineControls || [])]
    .reverse()
    .find((control) => inside(point, control));
}
function viewportChanged(canvas, gesture) {
  const rect = canvas.getBoundingClientRect();
  return (
    gesture.viewport.width !== window.innerWidth ||
    Math.abs(gesture.viewport.canvasWidth - rect.width) > 1
  );
}
const center = (box) =>
  box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : null;

export default function App() {
  const [touchScreen] = useState(
    () =>
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches,
  );
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
    carryRef = useRef(null),
    pickedRef = useRef(null),
    machineGestureRef = useRef(null),
    motionRef = useRef({
      feedback: null,
      pour: null,
      snap: null,
      machinePulse: null,
    }),
    lifecycleRef = useRef({
      phase: state.phase,
      day: state.day,
      served: state.served,
    }),
    modalFocusRef = useRef(null);
  stateRef.current = state;
  uiRef.current = ui;
  const feedback = useCallback((text, tone = "success", point = null) => {
    const canvas = canvasRef.current;
    motionRef.current.feedback = {
      text,
      tone,
      x: point?.x ?? (canvas?.__view?.width || 500) / 2,
      y: point?.y ?? 200,
      until: performance.now() + 2900,
    };
    setAnnouncement(text);
  }, []);
  const cancelGesture = useCallback(
    (message = null) => {
      const carry = carryRef.current;
      const pointerId = dragRef.current?.pointerId;
      if (machineGestureRef.current && message)
        feedback(
          "Control released.",
          "success",
          center(dragRef.current?.control),
        );
      if (carry) {
        const source = canvasRef.current?.__draggables?.find(
          (item) => item.id === carry.id,
        );
        motionRef.current.snap = {
          kind: carry.kind,
          foodId: carry.foodId,
          drink: carry.drink,
          from: {
            x: carry.x,
            y: carry.y - (carry.pointerType === "touch" ? 48 : 0),
          },
          to: center(source) || carry.origin,
          startedAt: performance.now(),
          duration: 260,
        };
        if (message) feedback(message, "error", carry.origin);
      }
      carryRef.current = null;
      pickedRef.current = null;
      machineGestureRef.current = null;
      dragRef.current = null;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.style.cursor = "default";
        if (pointerId !== undefined && canvas.hasPointerCapture(pointerId))
          canvas.releasePointerCapture(pointerId);
      }
    },
    [feedback],
  );
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
              : kind === "pickup"
                ? [330, 440]
                : kind === "drop"
                  ? [440, 659]
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
  const applyDrop = useCallback(
    (dragged, zone, point = null) => {
      const current = stateRef.current,
        settings = uiRef.current;
      const result = planDrop(current, settings, dragged, zone);
      const canvas = canvasRef.current,
        now = performance.now();
      const source = canvas?.__draggables?.find(
        (item) => item.id === dragged.id,
      );
      const from = point
        ? {
            x: point.x,
            y: point.y - (dragged.pointerType === "touch" ? 48 : 0),
          }
        : center(source) || dragged.origin || { x: 0, y: 0 };
      if (!result.accepted) {
        motionRef.current.snap = {
          kind: dragged.kind,
          foodId: dragged.foodId,
          drink: dragged.drink,
          from,
          to: center(source) || dragged.origin || from,
          startedAt: now,
          duration: 260,
        };
        feedback(result.reason, "error", from);
        sound("error");
        return false;
      }
      result.actions.forEach(dispatch);
      pickedRef.current = null;
      const nextUI = {};
      if (Object.hasOwn(result, "cupDock")) nextUI.cupDock = result.cupDock;
      if (dragged.kind === "pastry") nextUI.ovenFood = dragged.foodId;
      if (Object.keys(nextUI).length)
        setUI((previous) => ({ ...previous, ...nextUI }));
      let to = result.served
        ? center(zone)
        : dragged.kind === "cup"
          ? center(zone?.cupRect || canvas?.__view?.objects?.cup)
          : center(canvas?.__view?.objects?.foodSlot);
      if (dragged.kind === "pastry") to = center(zone);
      motionRef.current.snap = {
        kind: dragged.kind,
        foodId: dragged.foodId,
        drink: dragged.drink || current.drink,
        from,
        to: to || from,
        startedAt: now,
        duration: 270,
      };
      const station =
        result.pourStation ||
        (dragged.kind === "cup" && zone?.kind === "station"
          ? zone.station
          : null);
      if (station)
        motionRef.current.pour = {
          station,
          startedAt: now + 270,
          duration: result.pourStation
            ? 850
            : current.phase === "practice"
              ? 850
              : station === "espresso"
                ? 4000
                : station === "kettle" && settings.kettleMode === "tea"
                  ? 6000
                  : 5000,
        };
      const message = result.served
        ? "A lovely little delivery!"
        : dragged.kind === "pastry"
          ? `${foods[dragged.foodId].shortName} in the warmer.`
          : dragged.kind === "warmFood"
            ? "Warm and on the tray."
            : dragged.kind === "trayFood"
              ? "Back on the tray."
              : zone?.kind === "tray"
                ? "Cup back on the tray."
                : result.pourStation
                  ? "A fresh pour for your cup."
                  : "Cup in place. Let it pour.";
      feedback(message, "success", to || from);
      sound("drop");
      return true;
    },
    [feedback, sound],
  );
  const pickItem = useCallback(
    (source) => {
      const current = pickedRef.current;
      if (
        current?.id === source.id ||
        (current?.kind === "cup" && source.kind === "cup")
      ) {
        pickedRef.current = null;
        feedback("Item put down.", "success", center(source));
        return;
      }
      pickedRef.current = { ...source, origin: center(source) };
      motionRef.current.snap = null;
      feedback(
        source.kind === "cup"
          ? "Cup picked. Tap a machine to place it."
          : source.kind === "trayFood"
            ? "Order picked. Tap your guest to serve."
            : "Food picked. Tap the warmer to heat it.",
        "success",
        center(source),
      );
      sound("pickup");
    },
    [feedback, sound],
  );
  useEffect(() => {
    if (state.phase !== "playing") return;
    const timer = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);
  useEffect(() => {
    const job = state.jobs[ui.cupDock];
    if (!job?.ready || !["practice", "playing"].includes(state.phase)) return;
    dispatch({ type: "COLLECT_JOB", station: ui.cupDock });
    motionRef.current.pour = {
      station: ui.cupDock,
      startedAt: performance.now(),
      duration: 850,
    };
  }, [state.jobs, state.phase, ui.cupDock]);
  useEffect(() => {
    const previous = lifecycleRef.current;
    const freshShift =
      state.day !== previous.day ||
      state.served < previous.served ||
      (previous.phase === "practice" && state.phase === "playing") ||
      (previous.phase === "summary" && state.phase === "playing");
    if (
      freshShift ||
      state.served > previous.served ||
      state.phase === "summary"
    ) {
      setUI((current) => ({
        ...current,
        cupDock: null,
        ...(freshShift
          ? { mobileStation: "espresso", mobileExtras: false }
          : {}),
      }));
      motionRef.current.pour = null;
      pickedRef.current = null;
    }
    if (!["practice", "playing"].includes(state.phase) || ui.modal)
      cancelGesture();
    lifecycleRef.current = {
      phase: state.phase,
      day: state.day,
      served: state.served,
    };
  }, [state.phase, state.day, state.served, ui.modal, cancelGesture]);
  useEffect(() => {
    let width = window.innerWidth;
    const resize = () => {
      if (window.innerWidth !== width) cancelGesture();
      width = window.innerWidth;
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [cancelGesture]);
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

  const openModal = useCallback(
    (modal) => {
      cancelGesture();
      resumeRef.current = stateRef.current.phase === "playing";
      modalFocusRef.current = focusRef.current;
      if (resumeRef.current) dispatch({ type: "PAUSE" });
      hoverRef.current = null;
      focusRef.current = "overlay-close";
      setUI((current) => ({ ...current, modal, overlayScroll: 0 }));
    },
    [cancelGesture],
  );
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
      if (
        !target ||
        target.disabled ||
        carryRef.current ||
        machineGestureRef.current
      )
        return;
      focusRef.current = target.id;
      setAnnouncement(target.label);
      const action = target.action;
      if (action.type === "mobileStation") {
        setUI((current) => ({
          ...current,
          mobileStation: action.station,
          mobileExtras: false,
        }));
        hoverRef.current = null;
        return;
      }
      if (action.type === "mobileExtras") {
        setUI((current) => ({
          ...current,
          mobileExtras: !current.mobileExtras,
        }));
        return;
      }
      if (action.type === "pickItem") {
        const source = canvasRef.current.__draggables.find(
          (item) => item.id === action.id,
        );
        if (source && !source.disabled) pickItem(source);
        return;
      }
      sound(
        action.type === "game" && action.value.type === "CHAT" ? "chat" : "tap",
      );
      if (action.type === "game") {
        const dockedJob = stateRef.current.jobs[uiRef.current.cupDock];
        if (
          dockedJob &&
          !dockedJob.ready &&
          ["SERVE", "SET_CUP", "CLEAR_DRINK"].includes(action.value.type)
        ) {
          feedback("Let this pour finish first.", "error");
          return;
        }
        if (
          action.value.type === "CHAT" &&
          stateRef.current.phase === "paused" &&
          uiRef.current.modal === "chat"
        ) {
          dispatch({ type: "RESUME" });
          dispatch(action.value);
          dispatch({ type: "PAUSE" });
        } else {
          if (
            ["SERVE", "SET_CUP", "CLEAR_DRINK", "CLEAR_FOOD"].includes(
              action.value.type,
            )
          )
            pickedRef.current = null;
          dispatch(action.value);
        }
        return;
      }
      if (action.type === "pastry") {
        const source = canvasRef.current.__draggables?.find(
          (item) => item.kind === "pastry" && item.foodId === action.foodId,
        );
        if (canvasRef.current.__view.mobile && source) {
          pickItem(source);
          return;
        }
        applyDrop(
          source || { kind: "pastry", foodId: action.foodId },
          canvasRef.current.__dropZones?.find(
            (zone) => zone.station === "oven",
          ),
        );
        return;
      }
      if (action.type === "station") {
        const station = action.value,
          current = stateRef.current,
          mode = uiRef.current,
          job = current.jobs[station];
        if (pickedRef.current && canvasRef.current.__view.mobile) {
          applyDrop(
            pickedRef.current,
            canvasRef.current.__dropZones.find(
              (zone) => zone.station === station,
            ),
          );
          return;
        }
        if (
          !["practice", "playing"].includes(current.phase) ||
          (job && !job.ready)
        ) {
          feedback(
            "This machine is still working. Give it a moment.",
            "error",
            center(target),
          );
          return;
        }
        motionRef.current.machinePulse = {
          station,
          startedAt: performance.now(),
          duration: 650,
        };
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
    [sound, openModal, closeModal, applyDrop, feedback, pickItem],
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
      const gesture = dragRef.current,
        carry = carryRef.current;
      if (carry && gesture) {
        const edge = Math.min(60, window.innerHeight / 5);
        const delta =
          gesture.clientY < edge
            ? -Math.min(12, (edge - gesture.clientY) / 4)
            : gesture.clientY > window.innerHeight - edge
              ? Math.min(12, (gesture.clientY - window.innerHeight + edge) / 4)
              : 0;
        if (delta) window.scrollBy(0, delta);
        const point = locationInCanvas(canvas, {
          clientX: gesture.clientX,
          clientY: gesture.clientY,
        });
        const tab =
          canvas.__view?.mobile &&
          canvas.__targets.find(
            (target) =>
              target.action?.type === "mobileStation" && inside(point, target),
          );
        if (tab && tab.action.station !== uiRef.current.mobileStation) {
          if (gesture.hoverStation !== tab.action.station) {
            gesture.hoverStation = tab.action.station;
            gesture.hoverSince = performance.now();
          } else if (performance.now() - gesture.hoverSince > 450) {
            setUI((current) => ({
              ...current,
              mobileStation: tab.action.station,
              mobileExtras: false,
            }));
            gesture.hoverStation = null;
          }
          hoverRef.current = tab.id;
        } else gesture.hoverStation = null;
        const zone = dropAt(canvas, point, carry);
        const valid =
          zone &&
          planDrop(stateRef.current, uiRef.current, carry, zone).accepted;
        Object.assign(carry, {
          x: point.x,
          y: point.y,
          validDropId: valid ? zone.id : null,
          invalidDropId: zone && !valid ? zone.id : null,
        });
      }
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
        const now = performance.now();
        for (const key of ["snap", "pour", "machinePulse"]) {
          const motion = motionRef.current[key];
          if (motion && now > motion.startedAt + motion.duration)
            motionRef.current[key] = null;
        }
        if (motionRef.current.feedback?.until < now)
          motionRef.current.feedback = null;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.imageSmoothingEnabled = true;
        const view = drawGame(
          ctx,
          stateRef.current,
          {
            ...uiRef.current,
            ...motionRef.current,
            drag: carryRef.current,
            machineGesture: machineGestureRef.current,
            pickedItem: pickedRef.current,
            hoverId: hoverRef.current,
            focusId: focusRef.current,
          },
          {
            width: W,
            height: H,
            time: reduced.matches ? 0 : timestamp / 1000,
            touch: touchScreen,
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
        canvas.__draggables = view.draggables || [];
        canvas.__dropZones = view.dropZones || [];
        canvas.__machineControls = view.machineControls || [];
        canvas.__view = { width: W, height: H, ...view };
        canvas.dataset.phase = stateRef.current.phase;
        canvas.dataset.day = stateRef.current.day;
        canvas.dataset.served = stateRef.current.served;
        canvas.dataset.clock = stateRef.current.timeLeft;
        canvas.dataset.tips = stateRef.current.tips;
        canvas.dataset.modal = uiRef.current.modal || "";
        canvas.dataset.drink = JSON.stringify(stateRef.current.drink);
        canvas.dataset.food = JSON.stringify(stateRef.current.food);
        canvas.dataset.jobs = JSON.stringify(stateRef.current.jobs);
        canvas.dataset.cupDock = uiRef.current.cupDock || "";
        canvas.dataset.drag = carryRef.current?.kind || "";
        canvas.dataset.machineGesture = JSON.stringify(
          machineGestureRef.current,
        );
        canvas.dataset.ovenReady = String(!!stateRef.current.jobs.oven?.ready);
        canvas.dataset.selectedItem = JSON.stringify(pickedRef.current);
        canvas.dataset.mobileStation = uiRef.current.mobileStation;
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
        if (dragRef.current || carryRef.current) {
          cancelGesture("Back where it belongs.");
          return;
        }
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
  }, [activate, closeModal, openModal, cancelGesture]);

  const pointerDown = (e) => {
    const canvas = canvasRef.current;
    if (
      !canvas.__view ||
      dragRef.current ||
      e.button !== 0 ||
      e.isPrimary === false
    )
      return;
    canvas.focus({ preventScroll: true });
    const point = locationInCanvas(canvas, e);
    const control = controlAt(canvas, point);
    const source = control ? null : itemAt(canvas, point);
    dragRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      clientX: e.clientX,
      clientY: e.clientY,
      lastY: e.clientY,
      scroll: uiRef.current.overlayScroll,
      target: hitAt(canvas, point),
      pointerType: e.pointerType,
      moved: false,
      control,
      startPoint: point,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        canvasWidth: canvas.getBoundingClientRect().width,
        canvasHeight: canvas.getBoundingClientRect().height,
      },
      source: source
        ? {
            ...source,
            drink:
              source.kind === "cup" ? { ...stateRef.current.drink } : undefined,
          }
        : null,
      origin: center(source),
      blocked: !!(source?.disabled || control?.disabled),
    };
    if (control && !control.disabled) {
      machineGestureRef.current = { station: control.station, progress: 0 };
      focusRef.current = control.id;
      setAnnouncement(control.label);
    }
    if (source?.disabled || control?.disabled)
      feedback(
        control
          ? "This machine is working. Give it a moment."
          : source?.kind === "cup"
            ? "Let this pour finish first."
            : stateRef.current.jobs.oven?.ready
              ? "Collect the warm food first."
              : "The warmer is busy. Let it finish.",
        "error",
        point,
      );
    canvas.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas.__view) return;
    const drag = dragRef.current;
    if (drag && drag.pointerId !== e.pointerId) return;
    if (drag && viewportChanged(canvas, drag)) {
      cancelGesture();
      return;
    }
    if (drag) {
      drag.clientX = e.clientX;
      drag.clientY = e.clientY;
    }
    const point = locationInCanvas(canvas, e);
    const distance = drag
      ? Math.hypot(e.clientX - drag.x, e.clientY - drag.y)
      : 0;
    if (drag?.blocked) {
      if (distance > (e.pointerType === "touch" ? 18 : 6)) drag.moved = true;
      return;
    }
    if (drag?.control) {
      if (distance > (e.pointerType === "touch" ? 18 : 6) || drag.moved) {
        drag.moved = true;
        machineGestureRef.current = {
          station: drag.control.station,
          progress: machineDragProgress(drag.control, drag.startPoint, {
            x: drag.startPoint.x + e.clientX - drag.x,
            y: drag.startPoint.y + e.clientY - drag.y,
          }),
        };
        canvas.style.cursor = "grabbing";
      }
      return;
    }
    if (
      drag?.source &&
      !uiRef.current.modal &&
      ["practice", "playing"].includes(stateRef.current.phase)
    ) {
      if (distance > (e.pointerType === "touch" ? 18 : 6) || carryRef.current) {
        drag.moved = true;
        if (!carryRef.current) {
          motionRef.current.snap = null;
          motionRef.current.feedback = null;
          carryRef.current = {
            ...drag.source,
            origin: drag.origin,
            x: point.x,
            y: point.y,
            pointerType: e.pointerType,
          };
          pickedRef.current = null;
          sound("pickup");
        }
        const zone = dropAt(canvas, point, carryRef.current);
        const valid =
          zone &&
          planDrop(stateRef.current, uiRef.current, carryRef.current, zone)
            .accepted;
        Object.assign(carryRef.current, {
          x: point.x,
          y: point.y,
          validDropId: valid ? zone.id : null,
          invalidDropId: zone && !valid ? zone.id : null,
        });
        hoverRef.current = null;
        canvas.style.cursor = "grabbing";
      }
      return;
    }
    if (
      drag &&
      (uiRef.current.modal || stateRef.current.phase === "summary") &&
      canvas.__view.overlay?.maxScroll > 0 &&
      e.pointerType === "touch"
    ) {
      const delta = drag.y - e.clientY;
      if (Math.abs(delta) > 18 || drag.moved) {
        drag.moved = true;
        const max = canvas.__view.overlay.maxScroll;
        setUI((current) => ({
          ...current,
          overlayScroll: Math.max(0, Math.min(max, drag.scroll + delta)),
        }));
        return;
      }
    }
    if (
      drag &&
      (distance > (e.pointerType === "touch" ? 18 : 8) || drag.moved)
    ) {
      drag.moved = true;
      if (e.pointerType === "touch") window.scrollBy(0, drag.lastY - e.clientY);
      drag.lastY = e.clientY;
      return;
    }
    const target = hitAt(canvas, point),
      item = itemAt(canvas, point),
      control = controlAt(canvas, point);
    hoverRef.current = target?.id || null;
    canvas.style.cursor =
      (control && !control.disabled) || (item && !item.disabled)
        ? "grab"
        : target
          ? "pointer"
          : "default";
  };
  const pointerUp = (e) => {
    const canvas = canvasRef.current;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (viewportChanged(canvas, drag)) {
      cancelGesture();
      return;
    }
    const carry = carryRef.current;
    const machineGesture = machineGestureRef.current;
    const point = locationInCanvas(canvas, e);
    carryRef.current = null;
    machineGestureRef.current = null;
    dragRef.current = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "default";
    if (drag.control) {
      if (drag.blocked) return;
      if (!drag.moved || machineDragCommitted(machineGesture?.progress)) {
        activate(
          canvas.__machineControls.find(
            (control) => control.id === drag.control.id,
          ) || drag.control,
        );
      } else
        feedback(
          drag.control.kind === "dial"
            ? "Turn clockwise or drag upward, then release."
            : "Pull down, then release to start.",
          "success",
          center(drag.control),
        );
      return;
    }
    if (carry) {
      applyDrop(carry, dropAt(canvas, point, carry), point);
      return;
    }
    if (drag.moved || drag.blocked) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (
        !drag.blocked &&
        canvas.__view.mobile &&
        !uiRef.current.modal &&
        !drag.source &&
        inside(drag.startPoint, canvas.__view.objects.workspace) &&
        Math.abs(dx) > 55 &&
        Math.abs(dx) > Math.abs(dy) * 1.4
      ) {
        const stations = ["espresso", "milk", "kettle", "oven"];
        setUI((current) => ({
          ...current,
          mobileStation:
            stations[
              (stations.indexOf(current.mobileStation) + (dx < 0 ? 1 : 3)) % 4
            ],
          mobileExtras: false,
        }));
      }
      return;
    }
    if (
      canvas.__view.mobile &&
      drag.source &&
      ["cup", "pastry", "trayFood"].includes(drag.source.kind)
    ) {
      pickItem(drag.source);
      return;
    }
    if (drag.source?.kind === "pastry") {
      applyDrop(
        drag.source,
        canvas.__dropZones.find((zone) => zone.station === "oven"),
      );
    } else if (drag.source?.kind === "warmFood") {
      applyDrop(
        drag.source,
        canvas.__dropZones.find((zone) => zone.kind === "tray"),
      );
    } else if (drag.source) {
      feedback(
        drag.source.kind === "cup"
          ? "Pick me up! Drag to a machine or your guest."
          : "Slide the finished order over to your guest.",
        "success",
        point,
      );
    } else {
      const zone = dropAt(canvas, point);
      if (
        canvas.__view.mobile &&
        pickedRef.current &&
        zone &&
        drag.target?.action?.type !== "mobileStation"
      ) {
        applyDrop(pickedRef.current, zone, point);
        return;
      }
      const target =
        drag.target &&
        canvas.__targets.find((target) => target.id === drag.target.id);
      const slop = e.pointerType === "touch" ? 14 : 0;
      if (
        target &&
        inside(point, {
          x: target.x - slop,
          y: target.y - slop,
          w: target.w + 2 * slop,
          h: target.h + 2 * slop,
        })
      )
        activate(target);
    }
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
    <main className={`game-stage${touchScreen ? " touch-stage" : ""}`}>
      <canvas
        ref={canvasRef}
        className="cafe-game"
        tabIndex={0}
        role="application"
        aria-label={ariaSummary}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) cancelGesture();
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) cancelGesture();
        }}
        onPointerLeave={() => {
          hoverRef.current = null;
        }}
        style={{ touchAction: "none" }}
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
