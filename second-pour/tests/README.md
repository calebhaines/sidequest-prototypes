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
COFFEE_QA_URL=https://calebhaines.github.io/sidequest-prototypes/second-pour/ npm run test:e2e -- --project=chromium-desktop --project=chromium-phone --grep 'a complete order'
```

## Scope

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

## Verification record

Production version: **2.4.0**, tested on 2026-10-07.
JavaScript: `index-h58STfbW.js`; CSS: `index-B3vZEQBM.css`.
All **33 applicable scenarios passed** against that bundle. The full matrix
passed 31; its two test-driver failures were corrected and verified in targeted
reruns on the same production build. One expected the wrong desktop mode label.
The other reached the 45-second harness limit while rendering WebKit's virtual
machine-wait frames; the complete timed scenario passed in 59.1 seconds with a
90-second budget. Its ingredient, job, cancellation, and serving assertions
remain intact. The corrected click-slip/coalesced-release scenario passed in
5.0 seconds. No application failure remains unresolved.

| Browser/layout           | Engine version | Viewport | Applicable scenarios |
| ------------------------ | -------------- | -------- | -------------------: |
| Chromium desktop         | 153.0.8010.12  | 1440×900 |                    7 |
| Firefox desktop          | 155.0          | 1440×900 |                    5 |
| Chromium phone portrait  | 153.0.8010.12  | 390×844  |                    7 |
| Chromium phone landscape | 153.0.8010.12  | 844×390  |                    7 |
| WebKit phone portrait    | 26.6           | 390×844  |                    7 |

The configuration discovers 45 browser/layout combinations. Twelve are
deliberately out of scope: phone-only selection/tap checks on desktop, the
longer progression check outside its representative desktop project, and
native CDP mouse-release checks outside Chromium desktop. These skips do not
represent unresolved failures. The unit suite has 29 passing checks.
