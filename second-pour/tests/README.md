# Second Pour interaction QA

From `second-pour`, run:

```sh
npm test
npx playwright install chromium firefox webkit
npm run test:e2e
```

Linux hosts need the browser system libraries too (`npx playwright install-deps`).
The browser suite builds the app and tests a production preview on port 5181.
It records screenshots and traces on failure and fails on browser exceptions,
console errors, failed requests, and missing assets. See
[browser/README.md](browser/README.md) for the test-driver details.

To smoke-test the deployed page:

```sh
COFFEE_QA_URL=https://calebhaines.github.io/sidequest-prototypes/second-pour/ npm run test:e2e -- --project=chromium-desktop --project=chromium-phone --grep 'physical espresso journey|a complete order'
```

## Scope

The espresso journey tests exercise the sequence a player sees: put the cup
under the nozzle, pull the lever, wait for exactly one shot, pick up the cup
from the machine, and finish an order. Placement must not secretly start a
shot. The cup must move to the nozzle in the painted canvas, stay there during
and after brewing, and be draggable from that location. The journey suite
uses real elapsed time and native Chromium mouse or CDP touch input, records
screenshots at each step, and checks canvas pixels as well as reducer state.
It also tests curved and hesitant paths, cup-handle pickups, an iced straw
pickup beside the lever, scrolling, short landscape layouts, and placing the
cup on the machine body instead of a hidden target center.
Dropping on the labeled Pull Shot action button remains an explicit shortcut
that places the cup and starts one shot; the separate button-order tests
verify that path as well.

The maintained suite checks visible machine buttons, controls, station tabs,
food slots, customer selectors, and Serve. It includes pickups 5 px from an
item's edge, direct pointer aiming, aiming with the lifted item preview,
returning to the rack, native touch cancellation, failed destinations,
parallel timed machines, locked cups, incorrect guests, modal/pause/resize
cancellation, phone tap fallback, and machine lever/dial gestures. Day-three
coverage makes an iced latte, warms its croissant, serves it, expires the shift,
and verifies the clean next-day reset.

Independent review also covered three regressions now maintained in the suite:
changing a mode or navigating Extras with a picked cup, a 6 px button slip, and
a background swipe while paused. The independent
[human-aim audit](human-aim-audit.md) records 36 additional scenarios and the nine
failures reproduced in version 2.3.0.

Chromium touch drags use native CDP input. Firefox desktop uses native mouse
input. WebKit taps use native Playwright touchscreen input; its drags use
synthetic touch PointerEvents, with an intercepted active native pointer to
exercise pointer capture. Playwright offers no WebKit touch-move input API.
These are emulated browser/device layouts; physical phones were not tested.

## Verified release

Version **2.5.0**, verified on **2026-10-07** against the frozen production
preview. JavaScript: `index-fRpOeuhu.js`; CSS: `index-B3vZEQBM.css`.
JavaScript SHA256:
`76633dc36e98231853abdb930552ff49b619816b0f49fc0f65b28b1148d1cb6f`.
The unit suite passed **34 checks**.

The general suite ran across all five projects with two workers: **36 passed,
14 scoped skips, zero failures**, in 3m24s. The real-time native journey suite
ran across the three Chromium projects with one worker: **8 passed, 4 scoped
skips, zero failures**, in 2m04s. Both reports
contain no flaky results or browser/asset errors. The native run was completed
before the general run to keep browser load predictable.

| Browser/layout | Engine version | Usable viewport | General runs passed | Native runs passed |
| --- | --- | --- | ---: | ---: |
| Chromium desktop | 153.0.8010.12 | 1440×900; native 1440×700 with scrolling | 7 | 2 |
| Firefox desktop | 155.0 | 1440×900 | 5 | — |
| Chromium phone portrait | 153.0.8010.12 | 390×664 | 8 | 2 |
| Chromium phone landscape | 153.0.8010.12 | 750×342; native also 568×320 | 8 | 4 |
| WebKit phone portrait | 26.6 | 390×664 | 8 | — |

These two actual commands exercised **14 distinct cases** in **62 project
combinations**: **44 applicable scenario/project runs passed**, and 18 were
deliberately skipped. Skips cover phone-specific checks on desktop,
representative progression/CDP checks outside their supported projects, and
the two compact native cases outside the landscape project. The native suite
recorded 44 screenshots with matching state snapshots; every app annotation
identified `index-fRpOeuhu.js`. Those captures were reviewed for actual cup
placement, visible dark espresso, retrieval, the complete latte/croissant,
and a successful Serve.

On this execution host, WebKit loaded its extracted browser libraries through
`LD_LIBRARY_PATH`. Its system-cache-only host dependency check was bypassed;
the browser launched and executed all eight applicable general checks.

Exact commands, run from `second-pour` with the frozen preview already
running on port 5181, in this order:

```sh
COFFEE_QA_URL=http://127.0.0.1:5181 \
PLAYWRIGHT_JSON_OUTPUT_FILE=/workspace/espresso-native-fRpOeuhu-report.json \
npx playwright test tests/browser/espresso-journey.spec.js \
  --project=chromium-desktop --project=chromium-phone \
  --project=chromium-landscape --workers=1 \
  --output=/workspace/espresso-native-fRpOeuhu-results --reporter=list,json

COFFEE_QA_URL=http://127.0.0.1:5181 \
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 \
LD_LIBRARY_PATH=/workspace/browser-test-libs/extracted/usr/lib/x86_64-linux-gnu \
PLAYWRIGHT_JSON_OUTPUT_FILE=/workspace/espresso-existing-fRpOeuhu-report.json \
npx playwright test tests/browser/interactions.spec.js \
  --output=/workspace/espresso-existing-fRpOeuhu-results --workers=2
```

## Why the previous checks missed espresso

Version 2.4.0 (`index-h58STfbW.js`) passed 33 applicable scenario/project runs.
Those tests primarily dropped a cup on the explicit action button and tested
the lever separately. They missed dropping the cup under the nozzle and then
pulling the lever. Placement automatically added the first shot, left the
actual cup on the tray, and the lever added a second shot. The passing counts
did not establish that this visible workflow worked. The real-time journeys
and the combined placement/lever/retrieval regression now cover that sequence.

The first 2.5.0 candidate (`index-BoQyyb-r.js`) exposed another application
failure: in a 750×342 landscape viewport, the lifted cup was visibly centered
in the espresso well while the finger landed on the wide tray beneath it.
The broad tray won the drop calculation and the cup returned there. The
painted well now has its own target, with priority above the broad tray and
below explicit buttons. The maintained landscape lever test preserves this
exact aiming case.

The next candidate (`index-DagE6ZrZ.js`) was rejected for a desktop startup
exception: the new well target lacked the exclusion list required by the
desktop renderer. The corrected `index-DgzTG2QT.js` passed all 36 general
scenario/project runs, but the separate native 568×320 journey reproduced
reverse retrieval sticking in the machine. A finger on the tray must win
over a lifted preview still touching the cup's old well when retrieving a
docked cup. Both rejected runs and their failure traces were preserved;
the native compact journey maintains the reverse retrieval regression.

The following candidate (`index-Cd__Emvz.js`) passed five native runs but
failed three 750×342 retrievals: aiming the visible cup at the tray put the
finger on the large Serve button below it. The compact Serve button is now
narrower and aligned to the right, leaving room for that return gesture.
The final verification record refers to the subsequent production
bundle, with these placement and retrieval cases exercised together.

The Playwright phone descriptors use a **390×664 portrait** and **750×342
landscape** viewport; their advertised screen size is 390×844. The earlier
record confused screen dimensions with usable browser dimensions. The new
real-time journeys retain the smaller usable viewports, including the short
landscape cup-handle and iced-straw pickups next to the lever.
