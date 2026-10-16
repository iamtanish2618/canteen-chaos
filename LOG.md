# Debugging log

AI-assisted implementation with the candidate's stated permission from the society. The observations below were produced locally; review them and be ready to explain every change. No live walkthrough or independent authorship is claimed.

## Baseline and method

Forked `bytemait/canteen-chaos` to `iamtanish2618/canteen-chaos`, cloned the fork, ran `npm ci` in `backend`, and started the unchanged application with `AUTO_COOK=false TZ=Asia/Kolkata npm start`. All ten reports were reproduced before source edits. Browser probes used Chrome at 1280, 800, 600, and 390 CSS pixels. Pure-rule probes used an explicit 15 October 2026, 18:00 local clock and controlled fixtures, independent of opening hours. The first test commit intentionally fails on the original implementation (six failed test groups).

## CC-01 — Suggestions behind category tabs

**Reproduction:** At 1280px, type `pa`. Hit-testing the first suggestion returned `#catTabs`, not the suggestion; the other five were clickable. The exact observed obstruction was the category bar, rather than every suggestion being hidden.

**Cause:** `.search-wrap` creates a stacking context at z-index 1; its child's z-index 100 cannot escape it. The sibling category tabs sit at 40.

**Fix:** Put the search stacking context at 41, within the filters' existing context. No global modal layering changes.

**Check:** All six suggestion centres now hit their own buttons/children; clicking opens the dish.

## CC-02 — Dark dish text

**Reproduction:** Set `data-theme=dark`; dish-body text was rgb(43,33,24) on a rgb(32,25,19) card.

**Cause:** A hard-coded light-theme text colour on `.dish-body` overrode the theme token inherited by dish names and prices. Metadata had its own token, explaining the report.

**Fix:** Use `var(--ink)` there.

**Check:** Dark text becomes rgb(242,232,223); light theme keeps its original token.

## CC-03 — Mobile menu overflow

**Reproduction:** At 600px, document width was 623px. Mobile rules forced names to max-content width and images to intrinsic width; grid tracks also had automatic minimums.

**Fix:** Use `minmax(0,1fr)` grid tracks, allow name wrapping, and constrain mobile images to the card width. Fix sizing instead of hiding overflow.

**Check:** At 600px document width is 600px, and both columns fit. Checked 360/390px single-column and tablet layouts as well.

## CC-04 — Tablet controls ignore taps

**Reproduction:** At 800px, hit-testing the favourite centre returned `.img-wrap`. The 761–900px media query added transparent pseudo-elements over the favourite and cart controls.

**Fix:** `pointer-events:none` on those decorative pseudo-elements. Retain the visual blocked-card treatment.

**Check:** Favourite and cart controls receive clicks at tablet width; disabled dish buttons remain disabled.

## CC-05 — Filters stop sticking

**Reproduction:** At 390px after scrolling 450px, filter top was -357.5px. `.view` had `overflow-x:hidden`, causing computed vertical overflow `auto` and creating an unintended scroll container.

**Fix:** Use `overflow-x:clip`, which does not establish that scrolling ancestor. Observe header height so the sticky filters sit below the real header, including expanded navigation.

**Check:** The filter top stays at the header bottom (92.5px in the measured layout), with parent overflow-y visible.

## CC-06 — Overselling stock

**Reproduction:** Fixture stock 2, request quantity 5: validation said valid; reservation returned stock -3.

**Cause:** Validation checked only for sold-out dishes. Reservation subtracted unconditionally despite its comment promising a recheck.

**Fix:** Validate requested quantity against stock, and defensively recheck integer quantity and available stock while reserving a cloned menu. Any error returns the untouched original. The existing synchronous route has no await between read/reserve/write, so requests in this single Node process cannot interleave there.

**Check:** Excess, invalid and aggregated duplicate quantities fail without mutation; exact stock succeeds. The HTTP test sends two concurrent requests for the final plate: only one succeeds.

## CC-07 — Cancellation removes stock

**Reproduction:** Releasing one unit against stock 2 returned stock 1.

**Cause/Fix:** `releaseStock` subtracted instead of adding. Corrected the shared inventory helper, used by cancellation.

**Check:** Reserve/release is a round trip. HTTP cancellation restores inventory once; repeat cancellation returns 409 without changes.

## CC-08 — Expired coupon accepted

**Reproduction:** `FRESHERS24` with a qualifying Rs.150 bill on 15 October 2026 returned a Rs.30 discount.

**Cause:** `applyCoupon` accepted `now` but never compared it to `expiresAt`.

**Fix:** Reject non-finite expiry dates and `now >= expiry` in shared pricing, covering quotes and orders.

**Check:** Expired fixture fails, one millisecond before expiry succeeds, exact expiry and malformed expiry fail. The API refuses an invalid coupon before reserving stock.

## CC-09 — Pagination returns everything

**Reproduction:** Page 1 with limit 5 returned all 37 dishes.

**Cause/Fix:** `paginate` computed the slice but returned `items:list`. Return the slice.

**Check:** Disjoint pages, final partial page, beyond-end empty page and hasMore metadata. Infinite scroll can legitimately append another page when its sentinel enters view.

## CC-10 — Price sort reversed

**Reproduction:** Ascending on prices 10 and 50 returned 50 then 10.

**Fix:** Correct the comparator signs for both price options in the shared sorting logic.

**Check:** Tests include 9/20/100 to verify numeric order, both directions and input immutability.

## Extra EX-01 — Ready orders cannot be collected

**Noticed:** While tracing cancellation rules, the documented ready → picked flow disagreed with `TERMINAL`.

**Reproduction:** `canTransition('ready','picked')` returned false; picked → refunded was also unreachable.

**Fix:** Separate immutable statuses (cancelled/refunded) from statuses terminal for the kitchen queue. Preserve the original queue/stall semantics while permitting collection and refunds.

**Check:** Both intended transitions work; backward/skipped transitions and cancellation after cooking remain rejected.

## Extra EX-02 — Coupon usage never decreases

**Noticed:** Following coupon cancellation accounting revealed `usesLeft: c.usesLeft` in the order path.

**Reproduction:** The original expression retained the use count after accepting an order; cancellation then added a use. The new HTTP regression covers a one-use coupon through acceptance, rejection of a second use, idempotent retry, and cancellation.

**Fix:** Decrement the coupon exactly once when the order is placed. Existing replay detection precedes writes; cancellation restores exactly one use.

**Check:** HTTP regression verifies counts 1 → 0 → 1, replay invariance and repeat-cancellation rejection.

## Honest engineering note / remaining scope

This inherited app has no real authentication: member headers are caller-controlled and staff APIs are public. JSON-file writes are atomic individually, but an order spans several files; a crash between writes or multiple server processes can leave inconsistent data. The stock fix is correct for the provided single synchronous server, not a claim of cross-process transactions. Production hardening needs authentication, authorization and one database transaction for inventory/orders/coupons/points. I did not redesign that architecture during a focused debugging task. The legacy member-order filter also compares `memberId` to `userId`; it deserves a separate scoped fix with ownership tests rather than pretending the app has secure identities.

## Run verification

`cd backend && npm ci && npm test` runs isolated rule and HTTP tests without touching real JSON data. Browser verification is documented above; it is not part of the Node test suite. Original opening hours still apply for manual testing. Start with `AUTO_COOK=false npm start` to keep order states predictable.

## Submission verification — 16 October 2026

Reran `npm ci && npm test` from a fresh checkout of this public fork: all **7 test groups passed**. The HTTP regression again accepted only one of two concurrent requests for the final plate, kept inventory non-negative, preserved idempotent retries and restored stock/coupon use once on cancellation. The tests replace the store with isolated fixtures; application JSON data was unchanged. Added GitHub Actions to repeat these checks on pushes and pull requests. Original before/after reproduction observations above remain historical; the fresh browser checks below are a separate verification.

Browser follow-up on 16 October: verified all six search suggestions receive pointer hits, dark text uses the intended light ink, no horizontal overflow at 360/390/600/800/1280px, a tablet favourite click changes its state, and mobile filters remain aligned below the header after scrolling. No browser exceptions occurred. Added `backend/tests/browser/visual.mjs` and a CI browser step so these checks are reproducible. No application JSON data was modified.

The first new CI browser run caught a test-timing issue: debounced search and automatic pagination replaced the card during a manual scroll-to assertion. The browser check now waits for the cleared-search response/render and uses a retrying pointer action before hit-testing. The application rules were unchanged; this corrects the test's synchronization.


## Modular cleanup and repeatable verification — 16 October 2026

Split the large stylesheet into feature files while preserving cascade order. Extracted menu card/rendering helpers into `frontend/js/menu-render.js`, keeping the upstream plain-script architecture and load order. Moved rule/HTTP tests into `backend/tests/unit/` and the browser suite into `backend/tests/browser/`; assertions remain visible in the tests. Added a 350-line module-size check and `npm run test:all`.

The original debugging fixes, reproduction records and upstream commit history are retained. The follow-up is a structural refactor; it does not claim to fix the remaining authentication or multi-file transaction limitations above. Verification includes eight Node test groups and the suggestion-hit, dark-theme, responsive-layout, tablet-favourite and mobile-sticky browser checks. No application JSON dataset was changed.
