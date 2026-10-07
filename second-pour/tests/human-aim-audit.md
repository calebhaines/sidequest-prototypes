# Human-aim interaction audit

On 2026-10-07, an independent audit reproduced nine interaction failures in
Second Pour 2.3.0. The repaired interface passed **36 scenarios**. These checks
aimed at visible artwork and controls, rather than relying only on hidden drop
zone centers.

Testing used Chromium with native CDP mouse and touch input, including final
release coordinates and `touchCancel`. Phone/tablet layouts were emulated;
**physical devices were not tested**. Timers were controlled to check job
completion and pause behavior without waiting through entire shifts.

## Nine baseline failures and their repairs

Start in practice mode. For serving checks, make Mina's latte with one espresso
shot and steamed milk, then warm a croissant and move it to the food tray.
“Preview aim” means positioning the floating item over the destination while
the finger remains below it.

| Reproduction | Baseline failure | Repaired result |
| --- | --- | --- |
| Drag the cup so its preview overlaps the lower front/base of the espresso machine. | The visible cup was inside the machine outline, but release rejected it because the finger was below the hit area. | Preview and finger aiming both use the same destination resolution as the highlight. |
| Drop the cup onto the visible **Pull shot** button, using finger aim and preview aim separately. | Both approaches rejected the drop; the button was outside the machine drop area. | Both approaches start one espresso pour. |
| On the Warmer tab, drag the croissant preview over the warmer's lower front/base. | A visibly overlapping pastry bounced back. | The warmer accepts the visible pastry. |
| Drop a croissant onto the visible **Warm food** button, using finger aim and preview aim separately. | Neither approach started the warmer. | The actual dragged food starts warming. |
| Drag a ready cup onto **Serve**. | The clickable button accepted no drops. | The complete order is served once and the drink/food clear. |
| Drag a ready cup onto the small **Mina** customer selector above the detailed order card. | Only the detailed order card accepted drops. | Both customer displays serve the matching completed order. |
| Position the cup preview over the **Milk** station tab, then release. | The lifted preview could not activate the tab; the old hover behavior tested the finger instead. | Dropping on the tab selects Milk and starts its pour, with no hidden hold gesture required. |
| On desktop, drag the cup onto **Pull espresso**. | The visible button accepted clicks but rejected cup drops. | The same button accepts a cup drop. |
| Make a fast cup-to-machine flick. The automated reproduction presses the cup, moves only 2 px, then releases at the machine. | No drag started because intermediate movement never crossed the threshold. | Final release displacement starts and resolves the drag correctly. |

Two additional failures surfaced during the repair and were fixed before the
final run: in landscape, finger aiming at **Warm food** incorrectly counted as
returning to the rack because the lifted preview overlapped a pastry choice;
and the top customer selector still lacked its own drop destination. Explicit
button intent now wins that preview collision, while returning the finger to
the rack remains a harmless cancellation. These retests are included in the
36 scenarios, rather than counted again.

## Passing coverage

| Group | Scenarios | Viewports and checks |
| --- | ---: | --- |
| Human-aim regressions | 20 | 390×700, 320×568, 844×390 touch; 1440×900 desktop. Finger/preview button aims, lower machine artwork, source return, Serve, customer selector, station tabs, ready-order destination ambiguity, fast release. |
| Lifecycle safety | 5 | 390×700. Locked cups, exactly one timed fill, pause during a drag, native cancellation recovery, rotation without ingredient loss, and retaining a ready warmer job when its tray is occupied. |
| Secondary interactions | 9 | 390×700. Preview aiming at station tabs, rejecting incompatible destinations without mutation, cup returns, food-to-Serve, and fast gestures on all four machine controls. |
| Day 3 and modal checks | 2 | 320×568 and 844×390. A picked cup survives milk-mode changes and chocolate/vanilla/caramel taps without an accidental pour; recipe touch scrolling works; opening the recipe book freezes jobs and closing it resumes exactly one pour. |

No page errors occurred in the final runs. Rejected or interrupted interactions
preserved prepared ingredients, food, and jobs. A ready cup dropped onto a
station tab activated that station rather than accidentally serving through
the customer card behind its lifted preview.

The maintained automated browser suite is documented in
[browser/README.md](browser/README.md). This audit is a record of the independent
human-aim checks; raw screenshots, traces, and large result files are omitted.
