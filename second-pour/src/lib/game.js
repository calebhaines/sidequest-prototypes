import { recipes, foods, customers, customerList } from "./data.js";

// Pure, deterministic game state. The UI owns animation, sound, and persistence.
export const INGREDIENT_KEYS = [
  "shots",
  "milk",
  "foam",
  "water",
  "tea",
  "chocolate",
  "vanilla",
  "caramel",
  "coldMilk",
];
export const SHIFT_SECONDS = 180;

const LABELS = {
  shots: "espresso shot",
  milk: "steamed milk",
  foam: "milk foam",
  water: "hot water",
  tea: "brewed tea",
  chocolate: "chocolate",
  vanilla: "vanilla",
  caramel: "caramel",
  coldMilk: "cold milk",
};
const STATIONS = ["espresso", "milk", "kettle", "oven"];
const blankDrink = (cup = "hot") =>
  Object.fromEntries([["cup", cup], ...INGREDIENT_KEYS.map((key) => [key, 0])]);
const blankJobs = () => ({
  espresso: null,
  milk: null,
  kettle: null,
  oven: null,
});
const roundMoney = (value) => Math.round(value * 100) / 100;
export const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;

function withNotice(state, type, text) {
  const noticeCounter = (state.noticeCounter || 0) + 1;
  return { ...state, noticeCounter, notice: { id: noticeCounter, type, text } };
}

function nextRandom(seed) {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { seed: next, value: next / 4294967296 };
}

function customerStory(profile, day) {
  const story = profile?.stories?.[(day - 1) % profile.stories.length];
  return {
    topic:
      story?.topic ||
      profile?.topic ||
      profile?.greeting ||
      profile?.opener ||
      "How has your morning been?",
    choices: story?.choices || profile?.choices || profile?.chatChoices || [],
  };
}

function makeCustomer(
  profileId,
  drinkId,
  foodId,
  day,
  arrivalIndex,
  patience = 140,
) {
  const profile = customers[profileId] || customerList[0];
  const story = customerStory(profile, day);
  return {
    id: `day-${day}-customer-${arrivalIndex}`,
    profileId: profile.id || profileId,
    drinkId,
    foodId,
    patience,
    maxPatience: patience,
    chatted: false,
    chatChoice: null,
    chatReply: null,
    chatTopic: story.topic,
    chatOptions: story.choices,
    arrivalIndex,
  };
}

function bestRecord(best = {}) {
  return {
    ...best,
    score: Math.max(0, Number(best.score) || 0),
    served: Math.max(0, Number(best.served) || 0),
    tips: Math.max(0, Number(best.tips) || 0),
    day: Math.max(0, Number(best.day) || 0),
  };
}

export function createInitialState(best = {}) {
  const mina = customers.mina ? "mina" : customerList[0].id;
  const practiceCustomer = makeCustomer(mina, "latte", "croissant", 1, 0, 180);
  return {
    phase: "practice",
    day: 1,
    timeLeft: SHIFT_SECONDS,
    elapsed: 0,
    queue: [practiceCustomer],
    selectedId: practiceCustomer.id,
    drink: blankDrink(),
    food: null,
    jobs: blankJobs(),
    tips: 0,
    score: 0,
    served: 0,
    missed: 0,
    streak: 0,
    best: bestRecord(best),
    notice: null,
    noticeCounter: 0,
    lastServed: null,
    arrivalIndex: 1,
    nextArrival: 24,
    rngSeed: 17419,
    tutorialComplete: false,
  };
}

export function getSelectedCustomer(state) {
  return (
    state.queue.find((customer) => customer.id === state.selectedId) ||
    state.queue[0] ||
    null
  );
}

// Each required component is a step; unexpected ingredients also invalidate a drink.
export function recipeProgress(drink, recipe) {
  if (typeof recipe === "string") recipe = recipes[recipe];
  if (!recipe)
    return {
      correct: false,
      complete: false,
      matched: 0,
      total: 0,
      progress: 0,
      steps: [],
      issues: ["Choose a recipe."],
    };
  const ingredients = recipe.ingredients || {};
  const expectedCup = recipe.cup || "hot";
  const steps = [
    {
      ingredient: "cup",
      label: `${expectedCup === "iced" ? "Iced" : "Hot"} cup`,
      expected: expectedCup,
      actual: drink?.cup,
      complete: drink?.cup === expectedCup,
      excess: false,
    },
  ];
  const issues = [];
  if (drink?.cup !== expectedCup)
    issues.push(`Use an ${expectedCup === "iced" ? "iced" : "hot"} cup`);
  for (const ingredient of INGREDIENT_KEYS) {
    const expected = Number(ingredients[ingredient]) || 0;
    const actual = Number(drink?.[ingredient]) || 0;
    if (expected > 0 || actual > 0) {
      steps.push({
        ingredient,
        label: LABELS[ingredient],
        expected,
        actual,
        complete: actual === expected,
        excess: actual > expected,
      });
    }
    if (actual < expected)
      issues.push(
        `Add ${expected - actual} ${LABELS[ingredient]}${ingredient === "shots" && expected - actual > 1 ? "s" : ""}`,
      );
    if (actual > expected)
      issues.push(
        `${LABELS[ingredient][0].toUpperCase() + LABELS[ingredient].slice(1)} is extra; remake the drink`,
      );
  }
  const matched = steps.filter((step) => step.complete).length;
  return {
    correct: issues.length === 0,
    complete: issues.length === 0,
    matched,
    total: steps.length,
    progress: matched / steps.length,
    steps,
    issues,
  };
}

export function evaluateOrder(state, customer = getSelectedCustomer(state)) {
  if (!customer)
    return {
      correct: false,
      drinkCorrect: false,
      foodCorrect: false,
      issues: ["Select a customer first."],
      message: "Select a customer first.",
    };
  const progress = recipeProgress(state.drink, recipes[customer.drinkId]);
  const issues = [...progress.issues];
  let foodCorrect = true;
  if (customer.foodId) {
    const foodName = foods[customer.foodId]?.name || customer.foodId;
    if (!state.food || state.food.id !== customer.foodId) {
      foodCorrect = false;
      issues.push(`Add a warmed ${foodName.toLowerCase()}`);
    } else if (!state.food.warm) {
      foodCorrect = false;
      issues.push(`Warm the ${foodName.toLowerCase()} in the oven`);
    }
  } else if (state.food) {
    foodCorrect = false;
    issues.push("This customer only ordered a drink; clear the food");
  }
  return {
    correct: progress.correct && foodCorrect,
    drinkCorrect: progress.correct,
    foodCorrect,
    issues,
    message: issues.length
      ? `${issues.join(". ")}.`
      : "Everything is ready to serve!",
  };
}

function startShift(state, day = 1) {
  const base = createInitialState(state.best);
  const mina = customers.mina ? "mina" : customerList[0].id;
  const secondProfile =
    customerList.find((profile) => profile.id !== mina)?.id || mina;
  const firstDrink = day > 1 ? (day === 2 ? "mocha" : "icedlatte") : "latte";
  const first = makeCustomer(mina, firstDrink, "croissant", day, 0, 150);
  const second = makeCustomer(secondProfile, "americano", null, day, 1, 145);
  return withNotice(
    {
      ...base,
      phase: "playing",
      day,
      queue: [first, second],
      selectedId: first.id,
      arrivalIndex: 2,
      rngSeed: (17419 + day * 7919) >>> 0,
      tutorialComplete: true,
      noticeCounter: state.noticeCounter || 0,
    },
    "info",
    day === 1
      ? "Doors are open! Three minutes, fresh coffee, good company."
      : `Day ${day}: the regulars are back, and the menu has grown.`,
  );
}

function addArrival(state) {
  if (state.queue.length >= 3 || state.timeLeft < 12) return state;
  let random = nextRandom(state.rngSeed);
  const available = customerList.filter(
    (profile) =>
      !state.queue.some((customer) => customer.profileId === profile.id),
  );
  const profiles = available.length ? available : customerList;
  const profile = profiles[Math.floor(random.value * profiles.length)];
  random = nextRandom(random.seed);
  const pool = Object.values(recipes).filter(
    (recipe) =>
      Number(recipe.unlockDay || recipe.day || 1) <= Math.min(state.day, 3),
  );
  const recipe = pool[Math.floor(random.value * pool.length)];
  random = nextRandom(random.seed);
  const foodList = Object.values(foods);
  const foodId =
    random.value < 0.6
      ? foodList[Math.floor((random.value / 0.6) * foodList.length)].id
      : null;
  random = nextRandom(random.seed);
  const patience = 115 + Math.floor(random.value * 36);
  const customer = makeCustomer(
    profile.id,
    recipe.id,
    foodId,
    state.day,
    state.arrivalIndex,
    patience,
  );
  return {
    ...state,
    queue: [...state.queue, customer],
    selectedId: state.selectedId || customer.id,
    arrivalIndex: state.arrivalIndex + 1,
    rngSeed: random.seed,
  };
}

function finishShift(state) {
  return withNotice(
    {
      ...state,
      phase: "summary",
      timeLeft: 0,
      queue: [],
      selectedId: null,
      missed: state.missed + state.queue.length,
      jobs: blankJobs(),
      best: {
        ...state.best,
        score: Math.max(state.best.score || 0, state.score),
        served: Math.max(state.best.served || 0, state.served),
        tips: Math.max(state.best.tips || 0, state.tips),
        day: Math.max(state.best.day || 0, state.day),
      },
    },
    "info",
    "The shop is closed. Time to count the tips and put your feet up.",
  );
}

function tick(state, seconds) {
  if (state.phase !== "playing") return state;
  let next = state;
  for (let index = 0; index < seconds; index += 1) {
    const elapsed = next.elapsed + 1;
    const queue = next.queue.map((customer) => ({
      ...customer,
      patience: Math.max(0, customer.patience - 1),
    }));
    const departed = queue.filter((customer) => customer.patience <= 0);
    const waiting = queue.filter((customer) => customer.patience > 0);
    const jobs = Object.fromEntries(
      STATIONS.map((station) => {
        const job = next.jobs[station];
        if (!job || job.ready) return [station, job];
        const remaining = Math.max(0, job.remaining - 1);
        return [station, { ...job, remaining, ready: remaining === 0 }];
      }),
    );
    next = {
      ...next,
      elapsed,
      timeLeft: Math.max(0, next.timeLeft - 1),
      queue: waiting,
      jobs,
      selectedId: waiting.some((customer) => customer.id === next.selectedId)
        ? next.selectedId
        : waiting[0]?.id || null,
      missed: next.missed + departed.length,
      streak: departed.length ? 0 : next.streak,
    };
    if (departed.length)
      next = withNotice(
        next,
        "info",
        `${customers[departed[0].profileId]?.name || "A customer"} had to head out. A fresh start for the next order.`,
      );
    if (!next.timeLeft) return finishShift(next);
    if (elapsed >= next.nextArrival) {
      next = addArrival(next);
      next = {
        ...next,
        nextArrival: elapsed + Math.max(18, 25 - Math.min(next.day, 3) * 2),
      };
    }
  }
  return next;
}

function startJob(state, action) {
  const { station } = action;
  if (!STATIONS.includes(station)) return state;
  if (state.jobs[station])
    return withNotice(
      state,
      "info",
      state.jobs[station].ready
        ? "Collect the finished item before starting another."
        : "This machine is already working.",
    );
  let mode = action.mode;
  let ingredient = null;
  let duration = 0;
  let amount = 1;
  let foodId = null;
  if (station === "espresso") {
    mode ||= "shot";
    ingredient = "shots";
    amount = mode === "double" ? 2 : 1;
    duration = 4;
  } else if (station === "milk") {
    mode ||= "milk";
    ingredient = ["foam", "froth"].includes(mode) ? "foam" : "milk";
    duration = 5;
  } else if (station === "kettle") {
    mode ||= "water";
    ingredient = mode === "tea" ? "tea" : "water";
    duration = ingredient === "tea" ? 6 : 5;
  } else {
    foodId = action.foodId || mode || "croissant";
    if (!foods[foodId])
      return withNotice(state, "error", "Choose a pastry or toastie to warm.");
    mode = foodId;
    duration =
      Number(foods[foodId].duration) ||
      { croissant: 7, toastie: 10, cinnamonroll: 8 }[foodId] ||
      7;
  }
  const immediate = state.phase === "practice";
  const job = {
    station,
    mode,
    ingredient,
    amount,
    foodId,
    duration,
    remaining: immediate ? 0 : duration,
    ready: immediate,
    milkType: action.milkType || null,
  };
  return { ...state, jobs: { ...state.jobs, [station]: job } };
}

function collectJob(state, station) {
  const job = state.jobs[station];
  if (!job) return state;
  if (!job.ready)
    return withNotice(
      state,
      "info",
      "A little more time — the machine is still working.",
    );
  if (station === "oven") {
    if (state.food)
      return withNotice(
        state,
        "info",
        "Your tray already has food. Serve it or clear it first.",
      );
    return withNotice(
      {
        ...state,
        food: { id: job.foodId, warm: true },
        jobs: { ...state.jobs, [station]: null },
      },
      "success",
      `${foods[job.foodId]?.name || "Food"} is warm and on the tray.`,
    );
  }
  if (!state.drink?.cup)
    return withNotice(
      state,
      "info",
      "Choose a cup before collecting your drink ingredient.",
    );
  return {
    ...state,
    drink: {
      ...state.drink,
      [job.ingredient]: (Number(state.drink[job.ingredient]) || 0) + job.amount,
    },
    jobs: { ...state.jobs, [station]: null },
  };
}

function serve(state) {
  const customer = getSelectedCustomer(state);
  const result = evaluateOrder(state, customer);
  if (!customer)
    return withNotice(
      state,
      "info",
      "Your tray is ready for the next customer.",
    );
  if (!result.correct) {
    const queue =
      state.phase === "practice"
        ? state.queue
        : state.queue.map((item) =>
            item.id === customer.id
              ? { ...item, patience: Math.max(1, item.patience - 4) }
              : item,
          );
    return withNotice({ ...state, queue, streak: 0 }, "error", result.message);
  }
  const profile = customers[customer.profileId];
  const streak = state.streak + 1;
  const patienceRatio = customer.patience / customer.maxPatience;
  const tip = roundMoney(
    0.55 +
      patienceRatio * 1.2 +
      (customer.chatted ? 0.65 : 0) +
      Math.min(streak - 1, 6) * 0.15,
  );
  const scoreDelta =
    100 +
    Math.round(patienceRatio * 60) +
    (customer.chatted ? 35 : 0) +
    Math.min(streak - 1, 6) * 15;
  const queue = state.queue.filter((item) => item.id !== customer.id);
  const thanks = Array.isArray(profile?.thanks)
    ? profile.thanks[(streak - 1) % profile.thanks.length]
    : profile?.thanks;
  const reply =
    thanks || profile?.goodbye || "That is just what I needed. Thank you!";
  let next = {
    ...state,
    queue,
    selectedId: queue[0]?.id || null,
    drink: blankDrink(),
    food: null,
    served: state.served + 1,
    tips: roundMoney(state.tips + tip),
    score: state.score + scoreDelta,
    streak,
    lastServed: {
      id: customer.id,
      customerId: customer.id,
      profileId: customer.profileId,
      name: profile?.name,
      drinkId: customer.drinkId,
      foodId: customer.foodId,
      tip,
      scoreDelta,
      reply,
      chatBonus: customer.chatted,
      streak,
    },
    tutorialComplete: state.tutorialComplete || state.phase === "practice",
  };
  if (state.phase === "playing" && !queue.length && state.timeLeft > 12) {
    next = addArrival(next);
    next = { ...next, nextArrival: next.elapsed + 23 };
  }
  const text =
    state.phase === "practice"
      ? `Perfect! ${profile?.name || "Mina"} loves it. You’re ready to open the shop.`
      : `${profile?.name || "Your customer"}: “${reply}” +${formatMoney(tip)} tip${customer.chatted ? " · conversation bonus" : ""}`;
  return withNotice(next, "success", text);
}

function chat(state, choice) {
  const customer = getSelectedCustomer(state);
  if (!customer || customer.chatted) return state;
  const options = customer.chatOptions || [];
  const optionIndex =
    typeof choice === "number"
      ? choice
      : options.findIndex(
          (option) => option.id === choice || option.label === choice,
        );
  const option = options[optionIndex >= 0 ? optionIndex : 0];
  if (!option) return state;
  const chatReply =
    option.response ||
    option.reply ||
    "Thanks for listening. It makes a difference.";
  const queue = state.queue.map((item) =>
    item.id === customer.id
      ? {
          ...item,
          chatted: true,
          chatChoice: optionIndex >= 0 ? optionIndex : 0,
          chatReply,
          patience: Math.min(item.maxPatience, item.patience + 20),
        }
      : item,
  );
  return withNotice(
    { ...state, queue },
    "info",
    `${customers[customer.profileId]?.name || "Your customer"}: “${chatReply}”`,
  );
}

export function gameReducer(state, action) {
  if (!state) state = createInitialState();
  switch (action.type) {
    case "START_SHIFT":
    case "SHIFT_START":
      return startShift(
        state,
        Number.isFinite(Number(action.day))
          ? Math.max(1, Math.min(365, Math.floor(Number(action.day)) || 1))
          : 1,
      );
    case "NEXT_SHIFT":
      return startShift(state, state.day + 1);
    case "RETRY_SHIFT":
      return startShift(state, state.day);
    case "PRACTICE":
      return createInitialState(state.best);
    case "PAUSE":
      return state.phase === "playing" ? { ...state, phase: "paused" } : state;
    case "RESUME":
      return state.phase === "paused" ? { ...state, phase: "playing" } : state;
    case "HYDRATE_BEST":
      return { ...state, best: bestRecord(action.best) };
    case "DISMISS_NOTICE":
      return { ...state, notice: null };
    case "TICK": {
      const seconds = Number(action.seconds ?? action.delta ?? 1);
      return tick(
        state,
        Number.isFinite(seconds)
          ? Math.max(0, Math.min(600, Math.floor(seconds)))
          : 1,
      );
    }
    default:
      break;
  }
  if (!["practice", "playing"].includes(state.phase)) return state;
  switch (action.type) {
    case "SELECT_CUSTOMER": {
      const id = action.id || action.customerId;
      return state.queue.some((customer) => customer.id === id)
        ? { ...state, selectedId: id }
        : state;
    }
    case "SET_CUP": {
      const cup = action.cup || action.value;
      if (!["hot", "iced"].includes(cup) || cup === state.drink?.cup)
        return state;
      return withNotice(
        { ...state, drink: blankDrink(cup) },
        "info",
        `${cup === "iced" ? "Iced" : "Hot"} cup selected. Start this drink fresh.`,
      );
    }
    case "ADD_INGREDIENT": {
      const ingredient = action.ingredient;
      if (!INGREDIENT_KEYS.includes(ingredient)) return state;
      if (!state.drink?.cup)
        return withNotice(state, "info", "Choose a cup first.");
      return {
        ...state,
        drink: {
          ...state.drink,
          [ingredient]: (Number(state.drink[ingredient]) || 0) + 1,
        },
      };
    }
    case "CLEAR_DRINK":
      return withNotice(
        { ...state, drink: blankDrink(state.drink?.cup || "hot") },
        "info",
        "Fresh cup. Ready for another try.",
      );
    case "CLEAR_FOOD":
      return { ...state, food: null };
    case "START_JOB":
      return startJob(state, action);
    case "COLLECT_JOB":
      return collectJob(state, action.station);
    case "SERVE":
    case "SERVE_ORDER":
      return serve(state);
    case "CHAT":
      return chat(state, action.choice ?? action.choiceIndex ?? 0);
    default:
      return state;
  }
}
