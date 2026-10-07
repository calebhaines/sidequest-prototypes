import { foods } from "./data.js";
import { evaluateOrder, gameReducer } from "./game.js";

const DRINK_STATIONS = ["espresso", "milk", "kettle"];
const validFood = (foodId) => Object.hasOwn(foods, foodId);
const reject = (reason) => ({ accepted: false, reason, actions: [] });
const accept = (actions = [], effects = {}) => ({
  accepted: true,
  actions,
  ...effects,
});

// A drop is planned against the latest state, then applied by the canvas UI.
// Rejected and cancelled drags never dispatch actions or consume ingredients.
export function planDrop(state, ui = {}, dragged, zone) {
  if (!["practice", "playing"].includes(state?.phase))
    return reject("Resume the café before moving anything.");
  if (!dragged || !zone)
    return reject("Drop it on a highlighted spot, or put it back.");

  if (dragged.kind === "cup") {
    if (!state.drink?.cup) return reject("Choose a cup first.");
    const dockJob = state.jobs?.[ui.cupDock];
    if (dockJob && !dockJob.ready)
      return reject("Keep the cup under the machine until it finishes.");

    if (zone.kind === "tray") return accept([], { cupDock: null });
    if (zone.kind === "customer") return planServing(state, ui, zone);
    if (zone.kind !== "station" || !DRINK_STATIONS.includes(zone.station))
      return reject(
        "Move the cup to a drink machine, the tray, or a customer.",
      );

    const station = zone.station;
    const job = state.jobs?.[station];
    if (job && !job.ready)
      return reject("That machine is still working. Give it a moment.");
    if (job?.ready)
      return accept([{ type: "COLLECT_JOB", station }], {
        cupDock: station,
        pourStation: station,
      });
    // Placing a cup and operating the espresso machine are separate actions.
    // A drop on its explicit start button is the deliberate one-step shortcut.
    if (station === "espresso" && !zone.activate)
      return accept([], { cupDock: station, placed: true });
    if (station === "milk" && ui.milkMode === "cold")
      return accept([{ type: "ADD_INGREDIENT", ingredient: "coldMilk" }], {
        cupDock: station,
        pourStation: station,
      });

    const mode =
      station === "milk"
        ? ui.milkMode || "milk"
        : station === "kettle"
          ? ui.kettleMode || "water"
          : "shot";
    return accept([{ type: "START_JOB", station, mode }], {
      cupDock: station,
    });
  }

  if (dragged.kind === "pastry") {
    if (zone.kind !== "station" || zone.station !== "oven")
      return reject("Slide fresh food into the warmer first.");
    if (!validFood(dragged.foodId))
      return reject("Choose a pastry or toastie.");
    if (state.jobs?.oven)
      return reject(
        state.jobs.oven.ready
          ? "Move the warmed food to the tray before warming more."
          : "The warmer is busy. Let this food finish first.",
      );
    return accept([
      { type: "START_JOB", station: "oven", foodId: dragged.foodId },
    ]);
  }

  if (dragged.kind === "warmFood") {
    if (zone.kind !== "tray")
      return reject("Put the warmed food on the serving tray.");
    const job = state.jobs?.oven;
    if (!job || !validFood(dragged.foodId) || job.foodId !== dragged.foodId)
      return reject("That food is no longer in the warmer.");
    if (!job.ready) return reject("The food needs a little more warming.");
    if (state.food)
      return reject("The tray already has food. Serve it or clear it first.");
    return accept([{ type: "COLLECT_JOB", station: "oven" }]);
  }

  if (dragged.kind === "trayFood") {
    if (
      !state.food?.warm ||
      !validFood(dragged.foodId) ||
      state.food.id !== dragged.foodId
    )
      return reject("That food is no longer on the tray.");
    if (zone.kind === "tray") return accept();
    if (zone.kind === "customer") return planServing(state, ui, zone);
    return reject("Keep warmed food on the tray, or serve it to a customer.");
  }

  return reject("That item cannot be moved here.");
}

function planServing(state, ui, zone) {
  const dockJob = state.jobs?.[ui.cupDock];
  if (dockJob && !dockJob.ready)
    return reject("Let the machine finish before serving this cup.");
  const customer = state.queue.find((item) => item.id === zone.customerId);
  if (!customer) return reject("That customer has already left the counter.");
  const select = { type: "SELECT_CUSTOMER", id: customer.id };
  const selected = gameReducer(state, select);
  const result = evaluateOrder(selected, customer);
  if (!result.correct) return reject(result.message);
  return accept([select, { type: "SERVE" }], {
    cupDock: null,
    served: true,
  });
}
