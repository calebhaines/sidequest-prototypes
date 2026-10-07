Run `npm run test:e2e` from `second-pour`. Install browsers first with
`npx playwright install chromium firefox webkit`; Linux hosts also need
Playwright's browser system libraries (`npx playwright install-deps`).

The suite builds the application and starts a production preview on port 5181.
Set `COFFEE_QA_URL` to test another deployment using the same suite.
The URL may include the GitHub Pages page path; navigation retains that path.

Coverage includes Chromium and Firefox desktop, Chromium phone portrait and
landscape, and WebKit phone portrait. Chromium mobile dragging uses native CDP
touch input, including touch cancellation. WebKit taps use native Playwright
touchscreen input; its drag gestures use synthetic touch PointerEvents because
Playwright exposes no WebKit touch-move input API. This is browser emulation,
not testing on physical phones.

Tests pick up objects near an edge and aim at the visible machine start button,
control, station tab, tray food slot, or Serve button. Canvas metadata supplies
the bounds of painted elements and state assertions; the tests do not release
at hidden drop-zone centers. Both direct pointer aiming and positioning the
lifted preview over a destination are covered. Fixed virtual time verifies real machine jobs,
parallel warming, pause, and cancellation without waiting through real shifts.

`espresso-journey.spec.js` adds a separate real-time driver for the physical
espresso workflow. Its destinations come from the painted machine illustration,
not drop-zone bounds. It checks placement before activating the lever, sees the
actual cup under the nozzle, waits for one shot, retrieves it from the machine,
and completes a latte order. Screenshots document those steps. It uses native
Chromium mouse and CDP touch gestures; its Chromium-only scope is explicit.
The shared driver also rejects multiple cup sources and sources outside the
viewport instead of silently scrolling or substituting coordinates.

Browser exceptions, console errors, and failed asset requests fail each test.
Failure screenshots and Playwright traces are saved in `test-results`; an HTML
report is saved in `playwright-report`.
A machine-readable run record is saved in `test-results/results.json`.

The current verification record is in [../README.md](../README.md).
