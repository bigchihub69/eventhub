# EventHub — Booking Management Test Scenarios

Generated: 2026-10-23
Scope: Booking Management. This covers the bookings list, the booking detail page, single cancellation (from the card and from the detail page), Clear All, refund eligibility, lookup by reference, cross-user access, and the booking-creation rules whose effects show up in management (FIFO pruning, seat restoration, booking reference, total price).

**Sources analysed**
- Domain skill: `eventhub-domain/SKILL.md`, `business-rules.md`, `user-flows.md`, `api-reference.md`, `ui-selectors.md`
- Backend: `routes/bookingRoutes.js`, `controllers/bookingController.js`, `services/bookingService.js`, `services/eventService.js` (`withPersonalSeats`, `deleteEvent`), `repositories/bookingRepository.js`, `repositories/eventRepository.js`, `validators/bookingValidator.js`, `middleware/authMiddleware.js`, `middleware/errorHandler.js`, `prisma/schema.prisma`
- Frontend: `app/bookings/page.tsx`, `app/bookings/[id]/page.tsx`, `components/bookings/BookingCard.jsx`, `components/ui/ConfirmDialog.jsx`, `components/ui/Modal.jsx`, `components/auth/AuthGuard.tsx`, `lib/hooks/useBookings.ts`, `lib/api/bookingsApi.js`, `lib/api/bookings.ts`, `lib/api/client.js`, `lib/api/client.ts`

> **Note:** These scenarios come from reading the code. The running app wasn't available when this was written (the backend couldn't connect to MySQL), so nothing below has been checked in a browser yet. Findings marked *suspected* need confirming when the tests are first run.

**Test accounts**: User A = `rahulshetty1@gmail.com`, User B = `rahulshetty1@yahoo.com` (password `Magiclife1!`)

---

## Code Findings: Suspected Defects, Spec Gaps & Risks

| # | Finding | Source | Scenario(s) |
|---|---------|--------|-------------|
| F1 | FIFO pruning runs **before** the event-exists and seat checks. A user at 9 bookings whose 10th booking fails (404 / insufficient seats) has **already lost** their oldest booking. | `bookingService.createBooking` | TC-304, TC-305 |
| F2 | In the same-event FIFO fallback, `decrementSeats` permanently lowers the event's DB `availableSeats`, which affects **every user**, including on static events. Cancelling doesn't give these seats back. | `bookingService.createBooking` | TC-109, TC-110 |
| F3 | Cancelling another user's booking returns **404**, not the documented 403. `findById(id, userId)` filters by owner, so the `ForbiddenError` branch can never run. | `bookingService.cancelBooking` | TC-203 |
| F4 | GET by ID and GET by ref return 404 for a missing booking but 403 for another user's booking, so a caller can tell which IDs/refs exist. | `getBookingById`, `getBookingByRef` | TC-206, TC-207 |
| F5 | A phone value made only of separators (e.g. `----------`) passes validation: the regex allows `+ - ( ) space` and the 10-character minimum counts any character. | `bookingValidator.js` | TC-312 |
| F6 | A non-numeric ID (`/api/bookings/abc`) becomes `Number('abc') = NaN` before reaching Prisma, which probably causes a 500, not a 400/404. The same applies to `DELETE`. | `bookingRepository.findByIdOnly` / `findById` | TC-308, TC-309 |
| F7 | `page=0` or a negative page gives a negative `skip`, which probably causes a 500. `limit` has no upper bound, although Swagger documents a max of 100. | `bookingRepository.findAll` | TC-310, TC-421 |
| F8 | The Bookings page has **no** sandbox/limit banner, but `business-rules.md §5` says one should appear conditionally. | `app/bookings/page.tsx` | TC-505 |
| F9 | The Bookings page requests `limit: 10`, but the domain doc says it shows at most 9. | `app/bookings/page.tsx` | TC-506 |
| F10 | "Clear all bookings" uses `try/finally` with no `catch`: on API failure the user sees no error, and nothing confirms success either. | `app/bookings/page.tsx` | TC-317, TC-508 |
| F11 | The "Clear all bookings" link shows even when there are no bookings. `ui-selectors.md` says it shows only "when bookings exist". | `app/bookings/page.tsx` | TC-504 |
| F12 | `normalizeEmail()` rewrites the customer email (lowercases it and, for Gmail, removes dots and `+tags`), so the detail page shows a different email from the one entered. | `bookingValidator.js` | TC-414 |
| F13 | The booking ref prefix is `title[0]`. A title that starts with an emoji or other astral character gives a broken (lone-surrogate) prefix. | `bookingService.randomRef` | TC-411 |
| F14 | Clear All imports from `lib/api/bookings.ts`, which imports `./client`. Both `client.js` (axios, attaches the JWT) and `client.ts` (fetch, **no JWT**) exist. At runtime Next.js resolves `.js` first, so it works, but TypeScript resolves to `client.ts`. Renaming or deleting `client.js` would silently break Clear All with a 401. The same file also has a dead `cancel` → `PATCH /bookings/:id/cancel` that doesn't exist. | `lib/api/bookings.ts` | TC-318 |
| F15 | There are no DB transactions or locks around count-then-prune and check-then-create, so concurrent requests can go over the 9-booking limit or overbook seats. | `bookingService.createBooking` | TC-419, TC-420 |
| F16 | `?page=2` (or any page past the data) shows the "No bookings yet" empty state even though the user has bookings. | `app/bookings/page.tsx` | TC-507 |
| F17 | Prices are formatted with `maximumFractionDigits: 0`, so a fractional price such as $99.50 shows as $100 on the card and the detail page. | `BookingCard.jsx`, `bookings/[id]/page.tsx` | TC-415 |
| F18 | The detail page shows "Booking not found" for **any** non-403 error (500, network, timeout), which hides server errors from the user. | `bookings/[id]/page.tsx` | TC-311 |

---

## Happy Path (TC-001 – TC-099)

### TC-001: View bookings list with existing bookings
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has at least 1 booking.
**Steps**:
1. Navigate to `/bookings`.
**Expected Results**:
- The heading "My Bookings" and the subtitle "View and manage all your ticket bookings" are visible.
- Each booking is shown as a `[data-testid="booking-card"]`.
- Each card shows the booking ref (`.booking-ref`), the status badge "confirmed", `#<id>` (`[data-testid="booking-id"]`), the event title, the event date, "N ticket(s)", the city, "Booked <date>", the total price, and the "View Details" and "Cancel Booking" buttons.
**Business Rule**: Flow 4 — Manage Bookings
**Suggested Layer**: E2E

### TC-002: Bookings list is ordered newest first
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A has cleared all bookings.
**Steps**:
1. Book event X, then book event Y.
2. Navigate to `/bookings`.
**Expected Results**: The first card is the booking for Y and the second is the booking for X.
**Business Rule**: Discovered behaviour — `findAll` orders by `createdAt desc`
**Suggested Layer**: API

### TC-003: View booking detail page
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has a booking.
**Steps**:
1. On `/bookings`, click "View Details" on a card.
**Expected Results**:
- The URL is `/bookings/<id>`.
- The breadcrumb shows "My Bookings / <ref>".
- The header shows the ref, the "confirmed" badge and the event title in `h1`.
- These sections are visible: "Event Details" (Event, Category, Date, Venue, City), "Customer Details" (Name, Email, Phone), "Payment Summary" (Tickets, Price per ticket, Total Paid), "Refund", and "Booking Information" (Booked on, Booking ID `#<id>`).
**Business Rule**: Flow 4 — Manage Bookings
**Suggested Layer**: E2E

### TC-004: Cancel a booking from the detail page
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has a booking.
**Steps**:
1. Open `/bookings/<id>`.
2. Click "Cancel Booking".
3. In the dialog "Cancel this booking?", click "Yes, cancel it" (`[data-testid="confirm-dialog-yes"]`).
**Expected Results**:
- The dialog text names the ref and says "will release N seat(s)".
- The toast "Booking cancelled successfully" appears.
- The app redirects to `/bookings`.
- The cancelled ref is no longer in the list.
**Business Rule**: §4 — Booking deletion (cancellation) immediately frees seats
**Suggested Layer**: E2E

### TC-005: Cancel a booking from the bookings list card
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has at least 2 bookings.
**Steps**:
1. On `/bookings`, click "Cancel Booking" (`[data-testid="cancel-booking-btn"]`) on one card.
2. Click "Yes, cancel it".
**Expected Results**: The toast "Booking cancelled successfully" appears, the card disappears without leaving the page, and the other bookings stay.
**Business Rule**: §4 — Cancellation
**Suggested Layer**: E2E

### TC-006: Clear all bookings
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has at least 2 bookings.
**Steps**:
1. On `/bookings`, click "Clear all bookings".
2. Accept the native `confirm()` dialog "Clear all your bookings? This cannot be undone.".
**Expected Results**:
- The link shows "Clearing…" while the request runs.
- The empty state "No bookings yet" appears with a "Browse Events" button.
- `GET /api/bookings` returns `total: 0`.
**Business Rule**: §4 — "Clear All Bookings" removes all bookings in one go
**Suggested Layer**: E2E

### TC-007: Refund eligibility for a single-ticket booking
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has a booking with quantity = 1.
**Steps**:
1. Open the booking detail page.
2. Click "Check eligibility for refund?" (`#check-refund-btn`).
**Expected Results**:
- `#refund-spinner` with the text "Checking your refund eligibility…" appears straight away, and the button is hidden.
- After about 4 seconds, `#refund-result` shows "Eligible for refund. Single-ticket bookings qualify for a full refund." in green.
**Business Rule**: §8 — quantity = 1 → eligible
**Suggested Layer**: E2E

### TC-008: Refund eligibility for a multi-ticket booking
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has a booking with quantity = 3.
**Steps**:
1. Open the booking detail page.
2. Click "Check eligibility for refund?".
**Expected Results**: After the spinner, `#refund-result` shows "Not eligible for refund. Group bookings (3 tickets) are non-refundable." in red.
**Business Rule**: §8 — quantity > 1 → not eligible
**Suggested Layer**: E2E

### TC-009: Navigate from booking confirmation to My Bookings
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A is logged in.
**Steps**:
1. Book an event from `/events/<id>`.
2. On the confirmation card, note the `.booking-ref`.
3. Click "View My Bookings".
**Expected Results**: The URL is `/bookings`, and the first card shows the same ref.
**Business Rule**: §1 — after booking, user can view bookings via "View My Bookings"
**Suggested Layer**: E2E

### TC-010: Back navigation from the detail page
**Category**: Happy Path
**Priority**: P3
**Preconditions**: User A has a booking.
**Steps**:
1. Open `/bookings/<id>`.
2. Click "← Back to My Bookings".
3. Open the detail page again and click the "My Bookings" breadcrumb.
**Expected Results**: Both actions go to `/bookings`.
**Business Rule**: Discovered UI behaviour
**Suggested Layer**: E2E

### TC-011: API — list bookings returns a paginated envelope
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has a valid token and 3 bookings.
**Steps**:
1. Call `GET /api/bookings?page=1&limit=10`.
**Expected Results**:
- The response is 200 with `{ success: true, data: [3 items], pagination: { total: 3, page: 1, limit: 10, totalPages: 1 } }`.
- Each item includes a nested `event` object.
**Business Rule**: api-reference — `GET /api/bookings`
**Suggested Layer**: API

### TC-012: API — look up a booking by reference
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A owns booking ref R.
**Steps**:
1. Call `GET /api/bookings/ref/R`.
**Expected Results**: The response is 200 with `data.bookingRef === R` and the `event` object included.
**Business Rule**: api-reference — `GET /api/bookings/ref/:ref`
**Suggested Layer**: API

### TC-013: API — filter bookings by eventId and status
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A has bookings for events X and Y.
**Steps**:
1. Call `GET /api/bookings?eventId=X`.
2. Call `GET /api/bookings?status=confirmed`.
3. Call `GET /api/bookings?status=cancelled`.
**Expected Results**:
1. Returns only the bookings for X.
2. Returns all the bookings.
3. Returns `data: []` and `total: 0`, because the status is always "confirmed".
**Business Rule**: api-reference query params; data model — status is always "confirmed"
**Suggested Layer**: API

### TC-014: API — clear all returns the deleted count
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has exactly 4 bookings.
**Steps**:
1. Call `DELETE /api/bookings`.
**Expected Results**:
- The response is 200 with `{ success: true, message: "4 booking(s) cleared" }`.
- Calling it again returns `"0 booking(s) cleared"`.
**Business Rule**: §4 — Clear All
**Suggested Layer**: API

### TC-015: API — cancel a single booking
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A owns booking B.
**Steps**:
1. Call `DELETE /api/bookings/B`.
2. Call `GET /api/bookings/B`.
**Expected Results**:
1. Returns 200 `{ success: true, message: "Booking cancelled" }`.
2. Returns 404.
**Business Rule**: §4 — Cancellation is a hard delete
**Suggested Layer**: API

---

## Business Rules (TC-100 – TC-199)

### TC-100: Cancelling restores seats (static event)
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has no bookings for static event S. Note S's available seats (N).
**Steps**:
1. Book 2 tickets for S. The event page shows N-2.
2. Cancel the booking from `/bookings`.
3. Reopen `/events/S`.
**Expected Results**: The seat display shows `N / total seats` again.
**Business Rule**: CLAUDE.md — seat count reduces on booking and restores on cancellation; §6 per-user seats
**Suggested Layer**: E2E

### TC-101: Cancelling restores seats (user-created event)
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has created event E with 20 seats.
**Steps**:
1. Book 5 tickets for E. Seats show 15 / 20.
2. Cancel the booking.
**Expected Results**: Seats show 20 / 20.
**Business Rule**: §6 — dynamic seats = totalSeats − sum(user's booking quantities)
**Suggested Layer**: API

### TC-102: Clear all restores seats across multiple events
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has no bookings. Note the seats for events X and Y.
**Steps**:
1. Book 2 tickets for X and 3 tickets for Y.
2. Clear all bookings.
3. Check `GET /api/events/X` and `GET /api/events/Y`.
**Expected Results**: Both events are back to their original availableSeats.
**Business Rule**: §4 — deletion frees seats
**Suggested Layer**: API

### TC-103: Booking ref first character matches the event title
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A is logged in.
**Steps**:
1. Book "Tech Conference Bangalore".
2. Check the ref on the confirmation card, on the `/bookings` card and on the detail page.
**Expected Results**: All three show the same ref matching `^T-[A-Z0-9]{6}$`.
**Business Rule**: §7 — first letter = event title's first character (uppercase)
**Suggested Layer**: E2E

### TC-104: Ref prefix is uppercased for a lowercase title
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has created an event titled "zumba night".
**Steps**:
1. Book the event.
**Expected Results**: The ref matches `^Z-[A-Z0-9]{6}$`.
**Business Rule**: §7 — uppercase prefix
**Suggested Layer**: API

### TC-105: Total price = event price × quantity
**Category**: Business Rule
**Priority**: P0
**Preconditions**: Static event "Holi Festival Delhi" costs $199.
**Steps**:
1. Book 3 tickets.
2. Open the detail page.
**Expected Results**:
- Tickets = 3, Price per ticket = $199, Total Paid = $597.
- The card total is also $597.
- The API returns `totalPrice = 597`.
**Business Rule**: §9 — totalPrice = price × quantity
**Suggested Layer**: API (calculation) + E2E (display)

### TC-106: FIFO — the 10th booking deletes the oldest
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has cleared all bookings.
**Steps**:
1. Create 9 bookings across different static events, and note the first one's ref (R1).
2. Create a 10th booking.
3. Call `GET /api/bookings`.
**Expected Results**:
- `total` is 9.
- R1 is gone.
- The 10th booking is present.
**Business Rule**: §4 — max 9 bookings, FIFO replacement
**Suggested Layer**: API

### TC-107: FIFO — the pruned booking's seats are restored
**Category**: Business Rule
**Priority**: P1
**Preconditions**: As TC-106. R1 was 2 tickets for event X. Note X's seats while R1 exists.
**Steps**:
1. Trigger FIFO with a booking for a different event.
2. Check X's seats.
**Expected Results**: X's seats go up by 2.
**Business Rule**: §4 + §6
**Suggested Layer**: API

### TC-108: FIFO prefers pruning a booking from a different event
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has 9 bookings. The oldest is for event X and the second-oldest for event Y.
**Steps**:
1. Book event X again.
**Expected Results**: The oldest booking *not* for X (the Y booking) is deleted, and the X booking stays.
**Business Rule**: Discovered behaviour — `findOldestUserBookingExcludingEvent`
**Suggested Layer**: API

### TC-109: FIFO same-event fallback — seat count still drops
**Category**: Business Rule
**Priority**: P2
**Preconditions**: All 9 of User A's bookings are for event X (1 ticket each).
**Steps**:
1. Note X's seats for User A.
2. Book 1 more ticket for X.
**Expected Results**: There are still 9 bookings, and the oldest X booking has been deleted. User A's displayed seats for X are unchanged in net terms: the delete restores 1, the new booking takes 1, and the burn takes 1 more, so check the exact value against the code.
**Business Rule**: Discovered behaviour — `sameEventFallback` → `decrementSeats`
**Suggested Layer**: API

### TC-110: FIFO same-event fallback permanently burns seats for all users *(suspected defect F2)*
**Category**: Business Rule
**Priority**: P1
**Preconditions**: As TC-109, on static event X. Note the seats User B sees for X.
**Steps**:
1. User A triggers the same-event fallback.
2. User A clears all bookings.
3. User B checks X's seats.
**Expected Results (per spec)**: User B's seats are unchanged, because sandboxes are isolated. **Likely actual result**: User B's seats are lower by the burned quantity, and it is never restored.
**Business Rule**: §2 sandbox isolation; §6 static events use a fixed DB field
**Suggested Layer**: API

### TC-111: Seat changes are isolated per user on static events
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Users A and B are both logged in (separate contexts).
**Steps**:
1. User A books 5 tickets for static event S.
2. User B opens `/events/S`.
**Expected Results**: User A sees N-5, and User B still sees N.
**Business Rule**: §2, §6 — per-user computed seats
**Suggested Layer**: API

### TC-112: Bookings list shows only the logged-in user's bookings
**Category**: Business Rule
**Priority**: P0
**Preconditions**: Users A and B each have bookings.
**Steps**:
1. User B opens `/bookings`.
**Expected Results**: None of User A's refs appear.
**Business Rule**: §2 — each user only sees their own bookings
**Suggested Layer**: API

### TC-113: Deleting a user-created event cascades to its bookings
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A created event E and booked it.
**Steps**:
1. Delete E from `/admin/events`.
2. Open `/bookings`.
3. Open the old booking's detail URL.
**Expected Results**: The booking is gone from the list, and the detail page shows "Booking not found".
**Business Rule**: Data model — Booking.eventId cascades on delete
**Suggested Layer**: API

### TC-114: FIFO event pruning cascades to bookings
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has 6 user-created events, and the oldest (E1) has a booking.
**Steps**:
1. Create a 7th event.
**Expected Results**: E1 and its booking are deleted.
**Business Rule**: §3 event FIFO + cascade
**Suggested Layer**: API

### TC-115: Same user can book the same event multiple times
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A is logged in.
**Steps**:
1. Book event X twice.
**Expected Results**: There are 2 separate cards with different refs (both starting with the same letter), and the seats are reduced by the sum of both quantities.
**Business Rule**: §6 — the same user can book the same event multiple times
**Suggested Layer**: API

### TC-116: Refund eligibility at the boundary quantity 2
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has a booking with quantity = 2.
**Steps**:
1. Check refund eligibility.
**Expected Results**: "Not eligible… Group bookings (2 tickets) are non-refundable."
**Business Rule**: §8 — >1 → not eligible
**Suggested Layer**: Component (+1 E2E)

### TC-117: Booking status is always "confirmed"
**Category**: Business Rule
**Priority**: P3
**Preconditions**: None.
**Steps**:
1. Create a booking and send `status: "cancelled"` in the body.
**Expected Results**: The response shows `status: "confirmed"`, because the body field is ignored.
**Business Rule**: Data model — status is always "confirmed"
**Suggested Layer**: API

### TC-118: Cancel dialog shows the correct ref and seat count
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has a booking with quantity 4.
**Steps**:
1. Click "Cancel Booking" on the card.
2. Close the dialog, then click "Cancel Booking" on the detail page.
**Expected Results**:
- The card dialog says "This will cancel <ref> and release 4 seat(s)…".
- The detail-page dialog says "Cancelling <ref> will release 4 seat(s)…".
**Business Rule**: §4 — cancellation frees seats
**Suggested Layer**: Component

---

## Security (TC-200 – TC-299)

### TC-200: Cross-user booking detail shows "Access Denied"
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking B.
**Steps**:
1. Log in as User B.
2. Navigate to `/bookings/B`.
**Expected Results**:
- "Access Denied" and "You are not authorized to view this booking." are shown, with a "View My Bookings" button.
- None of User A's customer data is rendered.
**Business Rule**: §2 / Flow 6 — cross-user access returns 403 "Access Denied"
**Suggested Layer**: E2E

### TC-201: API — cross-user GET by ID returns 403
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking B.
**Steps**:
1. Call `GET /api/bookings/B` with User B's token.
**Expected Results**: 403 `{ success: false, error: "You are not authorized to view this booking" }`, with no booking data in the body.
**Business Rule**: §2
**Suggested Layer**: API

### TC-202: API — cross-user GET by reference returns 403
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns ref R.
**Steps**:
1. Call `GET /api/bookings/ref/R` with User B's token.
**Expected Results**: 403 "You do not own this booking", with no data.
**Business Rule**: §2
**Suggested Layer**: API

### TC-203: API — cross-user cancel is rejected and the booking survives *(suspected defect F3)*
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking B.
**Steps**:
1. Call `DELETE /api/bookings/B` with User B's token.
2. Call `GET /api/bookings/B` with User A's token.
**Expected Results**:
- The cancel is rejected. Per spec it should be 403; the code returns **404** "Booking with id B not found".
- The booking still exists for User A, so step 2 returns 200.
**Business Rule**: §2 — cross-user access → 403
**Suggested Layer**: API

### TC-204: Clear All only deletes the caller's bookings
**Category**: Security
**Priority**: P0
**Preconditions**: Users A and B both have bookings.
**Steps**:
1. User B calls `DELETE /api/bookings`.
2. User A calls `GET /api/bookings`.
**Expected Results**: User A's bookings are untouched.
**Business Rule**: §2 sandbox isolation
**Suggested Layer**: API

### TC-205: Booking endpoints require authentication
**Category**: Security
**Priority**: P0
**Preconditions**: None.
**Steps**:
1. Call each booking endpoint (`GET /`, `GET /:id`, `GET /ref/:ref`, `POST /`, `DELETE /`, `DELETE /:id`) with no `Authorization` header.
2. Repeat with `Authorization: Bearer garbage`.
3. Repeat with `Authorization: Token <valid>` (wrong scheme).
**Expected Results**:
1. 401 "Unauthorized".
2. 401 "Invalid or expired token".
3. 401 "Unauthorized".
**Business Rule**: Auth — JWT required on all booking routes
**Suggested Layer**: API

### TC-206: Booking ID enumeration via a 404/403 difference *(suspected defect F4)*
**Category**: Security
**Priority**: P2
**Preconditions**: User B is logged in.
**Steps**:
1. Call `GET /api/bookings/<User A's id>`.
2. Call `GET /api/bookings/999999`.
**Expected Results**: Step 1 returns 403 and step 2 returns 404. Document this as an information leak, because other users' booking IDs can be discovered. Decide whether both should return 404.
**Business Rule**: §2 sandbox isolation
**Suggested Layer**: API

### TC-207: Booking ref enumeration via a 404/403 difference *(suspected defect F4)*
**Category**: Security
**Priority**: P3
**Preconditions**: User B is logged in.
**Steps**:
1. Look up User A's ref.
2. Look up a random ref that doesn't exist.
**Expected Results**: The responses are 403 and 404 respectively, which confirms which refs exist.
**Business Rule**: §2
**Suggested Layer**: API

### TC-208: Unauthenticated user visiting /bookings is redirected to login
**Category**: Security
**Priority**: P1
**Preconditions**: localStorage is cleared.
**Steps**:
1. Navigate to `/bookings`.
2. Navigate to `/bookings/1`.
**Expected Results**: Both redirect to `/login`, and no booking content flashes before the redirect.
**Business Rule**: Discovered behaviour — `AuthGuard`
**Suggested Layer**: E2E

### TC-209: Expired or tampered token in localStorage logs the user out
**Category**: Security
**Priority**: P2
**Preconditions**: User A is logged in.
**Steps**:
1. Set `localStorage.eventhub_token` to an invalid JWT.
2. Reload `/bookings`.
**Expected Results**: The token is removed and the app redirects to `/login` (the axios interceptor handles 401).
**Business Rule**: Auth — JWT 7-day expiry
**Suggested Layer**: E2E

### TC-210: Cross-user cancel from the UI is impossible
**Category**: Security
**Priority**: P2
**Preconditions**: User A owns booking B.
**Steps**:
1. As User B, open `/bookings/B`.
**Expected Results**: The "Access Denied" state renders with no "Cancel Booking" button and no refund check.
**Business Rule**: §2
**Suggested Layer**: E2E

### TC-211: User cannot book another user's private event
**Category**: Security
**Priority**: P1
**Preconditions**: User A created event E.
**Steps**:
1. User B calls `POST /api/bookings` with `eventId: E`.
**Expected Results**: 404 "Event with id E not found" (`findById` restricts to static or owned events), and no booking is created for User B.
**Business Rule**: §2 — users only see their own dynamic events
**Suggested Layer**: API

---

## Negative / Error (TC-300 – TC-399)

### TC-300: Booking detail for a non-existent ID
**Category**: Negative
**Priority**: P1
**Preconditions**: User A is logged in.
**Steps**:
1. Navigate to `/bookings/999999`.
**Expected Results**: "Booking not found" and "This booking doesn't exist or may have been cancelled.", with a "View My Bookings" button.
**Business Rule**: api-reference — 404
**Suggested Layer**: E2E

### TC-301: Detail page of a just-cancelled booking
**Category**: Negative
**Priority**: P2
**Preconditions**: User A cancelled booking B.
**Steps**:
1. Navigate to `/bookings/B`.
**Expected Results**: "Booking not found".
**Business Rule**: Cancellation is a hard delete
**Suggested Layer**: E2E

### TC-302: Cancel the same booking twice (two tabs)
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has booking B open in two tabs.
**Steps**:
1. Cancel B in tab 1.
2. Cancel B in tab 2.
**Expected Results**: Tab 2 shows an error toast "Booking with id B not found", the dialog closes, and the app doesn't crash.
**Business Rule**: Discovered behaviour — `onError` toast
**Suggested Layer**: E2E

### TC-303: Dismiss the cancel dialog
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has a booking.
**Steps**:
1. Click "Cancel Booking", then click "Cancel" in the dialog.
2. Reopen the dialog and press Escape.
3. Reopen the dialog and click the backdrop.
**Expected Results**: In each case the dialog closes, the booking remains, and no DELETE request is sent.
**Business Rule**: Discovered behaviour — `Modal`
**Suggested Layer**: Component

### TC-304: Failed 10th booking (bad event) still prunes the oldest *(suspected defect F1)*
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has 9 bookings, and the oldest is R1.
**Steps**:
1. Call `POST /api/bookings` with `eventId: 999999` and an otherwise valid body.
2. Call `GET /api/bookings`.
**Expected Results (per spec)**: 404, and all 9 bookings remain. **Likely actual result**: 404, but R1 has been deleted and `total` is 8.
**Business Rule**: §4 — FIFO only on overflow
**Suggested Layer**: API

### TC-305: Failed 10th booking (insufficient seats) still prunes the oldest *(suspected defect F1)*
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has 9 bookings. User A has an event with 2 seats left.
**Steps**:
1. Book 5 tickets for that event.
**Expected Results (per spec)**: 400 "Only 2 seat(s) available, but 5 requested", and the bookings are unchanged. **Likely actual result**: the oldest booking has been deleted.
**Business Rule**: §4
**Suggested Layer**: API

### TC-306: Cancel a non-existent booking via the API
**Category**: Negative
**Priority**: P2
**Preconditions**: None.
**Steps**:
1. Call `DELETE /api/bookings/999999`.
**Expected Results**: 404 "Booking with id 999999 not found".
**Business Rule**: api-reference — 404
**Suggested Layer**: API

### TC-307: Look up a ref that doesn't exist
**Category**: Negative
**Priority**: P2
**Preconditions**: None.
**Steps**:
1. Call `GET /api/bookings/ref/Z-ZZZZZZ`.
**Expected Results**: 404 `Booking with reference "Z-ZZZZZZ" not found`.
**Business Rule**: api-reference
**Suggested Layer**: API

### TC-308: Non-numeric booking ID on GET *(suspected defect F6)*
**Category**: Negative
**Priority**: P2
**Preconditions**: None.
**Steps**:
1. Call `GET /api/bookings/abc`.
2. Open `/bookings/abc` in the UI.
**Expected Results (expected)**: 400 or 404. **Likely actual result**: 500 with a Prisma error message leaked (when not in production). The UI shows "Booking not found".
**Business Rule**: Robust input handling
**Suggested Layer**: API

### TC-309: Non-numeric booking ID on DELETE *(suspected defect F6)*
**Category**: Negative
**Priority**: P3
**Preconditions**: None.
**Steps**:
1. Call `DELETE /api/bookings/abc`.
**Expected Results**: Expected 400 or 404; probably returns 500.
**Business Rule**: Robust input handling
**Suggested Layer**: API

### TC-310: Invalid pagination parameters *(suspected defect F7)*
**Category**: Negative
**Priority**: P3
**Preconditions**: None.
**Steps**:
1. Call `GET /api/bookings?page=0`.
2. Call `GET /api/bookings?page=-1`.
3. Call `GET /api/bookings?page=abc&limit=abc`.
**Expected Results**:
- `page=abc&limit=abc` falls back to page 1 / limit 10 → 200.
- `page=0` → `Number(0) || 1 = 1` → 200.
- `page=-1` → negative `skip` → probably 500.
**Business Rule**: Swagger — page minimum 1
**Suggested Layer**: API

### TC-311: Server error on the detail page is shown as "not found" *(F18)*
**Category**: Negative
**Priority**: P3
**Preconditions**: Mock `GET /api/bookings/:id` to return 500.
**Steps**:
1. Open `/bookings/<id>`.
**Expected Results**: Document the current behaviour, which is "Booking not found". It should ideally say that something went wrong.
**Business Rule**: Discovered behaviour
**Suggested Layer**: E2E (mocked)

### TC-312: Separator-only phone passes validation *(suspected defect F5)*
**Category**: Negative
**Priority**: P2
**Preconditions**: None.
**Steps**:
1. Call `POST /api/bookings` with `customerPhone: "----------"`.
2. Repeat with `"(((((())))))"`.
**Expected Results (per spec "min 10 digits")**: 400. **Likely actual result**: 201, and the detail page shows the junk phone value.
**Business Rule**: Data model — customerPhone min 10 digits
**Suggested Layer**: API

### TC-313: Booking validation errors
**Category**: Negative
**Priority**: P1
**Preconditions**: None.
**Steps**:
1. Call `POST /api/bookings` with each invalid value:
   - name `"A"`
   - name `"   "`
   - email `"bad"`
   - phone `"12345"`
   - phone `"98765abcde"`
   - quantity 0
   - quantity 11
   - quantity 2.5
   - eventId 0
   - missing fields
**Expected Results**: 400 `{ error: "Validation failed", details: [{ field, message }] }` with the matching message for each, and no booking is created. FIFO must **not** run (the validator runs before the service).
**Business Rule**: Data model constraints
**Suggested Layer**: API

### TC-314: Booking more seats than available
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has an event with 3 personal seats left.
**Steps**:
1. Book 4 tickets via the API.
**Expected Results**: 400 "Only 3 seat(s) available, but 4 requested".
**Business Rule**: api-reference — insufficient seats → 400
**Suggested Layer**: API

### TC-315: Sold-out event cannot be booked from the UI
**Category**: Negative
**Priority**: P2
**Preconditions**: User A's event has 0 personal seats.
**Steps**:
1. Open the event page.
**Expected Results**: "SOLD OUT" is shown and the booking form can't be submitted.
**Business Rule**: §6
**Suggested Layer**: E2E

### TC-316: Dismiss the Clear All confirm
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has bookings.
**Steps**:
1. Click "Clear all bookings".
2. Dismiss the native confirm.
**Expected Results**: No `DELETE /api/bookings` request is sent, and all bookings remain.
**Business Rule**: Discovered behaviour — `confirm()` guard
**Suggested Layer**: E2E

### TC-317: Clear All API failure gives no feedback *(suspected defect F10)*
**Category**: Negative
**Priority**: P2
**Preconditions**: Mock `DELETE /api/bookings` to return 500.
**Steps**:
1. Click "Clear all bookings" and accept.
**Expected Results (expected)**: An error toast appears. **Likely actual result**: the link goes back to "Clear all bookings", the bookings remain, no message is shown, and there is an unhandled promise rejection in the console.
**Business Rule**: Usability
**Suggested Layer**: E2E (mocked)

### TC-318: Clear All sends the Authorization header *(risk F14)*
**Category**: Negative
**Priority**: P2
**Preconditions**: User A is logged in with bookings.
**Steps**:
1. Click "Clear all bookings" and accept, while capturing the request.
**Expected Results**: The `DELETE /api/bookings` request carries `Authorization: Bearer <token>` and returns 200. This acts as a regression guard, because the import path can resolve to the token-less `client.ts`.
**Business Rule**: Auth required on booking routes
**Suggested Layer**: E2E

### TC-319: Cancel API failure shows an error toast
**Category**: Negative
**Priority**: P2
**Preconditions**: Mock `DELETE /api/bookings/:id` to return 500 `{ error: "Boom" }`.
**Steps**:
1. Cancel from the card, then cancel from the detail page.
**Expected Results**: The toast "Boom" appears, the dialog closes, and the booking remains. The detail page doesn't redirect.
**Business Rule**: Discovered behaviour — `onError` toast
**Suggested Layer**: E2E (mocked)

### TC-320: Booking for a deleted user's token
**Category**: Negative
**Priority**: P3
**Preconditions**: You have a JWT for a user that has since been deleted.
**Steps**:
1. Call `POST /api/bookings` with a valid body.
**Expected Results**: 400 "Related record does not exist" (Prisma P2003), not a 500.
**Business Rule**: Data model — User cascade
**Suggested Layer**: API

---

## Edge Cases (TC-400 – TC-499)

### TC-400: Exactly 9 bookings — no pruning
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A has cleared all bookings.
**Steps**:
1. Create 9 bookings.
**Expected Results**: `total` is 9, all refs are present, and none is pruned.
**Business Rule**: §4 — max 9
**Suggested Layer**: API

### TC-401: All 9 bookings fit on one page in the UI
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has 9 bookings.
**Steps**:
1. Open `/bookings`.
**Expected Results**: There are 9 cards. Pagination shows a single page or is hidden.
**Business Rule**: §4 — bookings page shows max 9
**Suggested Layer**: E2E

### TC-402: Quantity 1 (minimum) booking
**Category**: Edge Case
**Priority**: P1
**Preconditions**: None.
**Steps**:
1. Book 1 ticket.
**Expected Results**: The card reads "1 ticket" (singular), and the refund check says eligible.
**Business Rule**: Quantity 1–10; §8
**Suggested Layer**: E2E

### TC-403: Quantity 10 (maximum) booking
**Category**: Edge Case
**Priority**: P1
**Preconditions**: The event has ≥ 10 seats.
**Steps**:
1. Book 10 tickets.
2. Check the card and the refund result.
**Expected Results**: The card reads "10 tickets". The refund result says "Group bookings (10 tickets) are non-refundable".
**Business Rule**: Quantity max 10
**Suggested Layer**: API

### TC-404: Book exactly the remaining seats
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has an event with 3 personal seats left.
**Steps**:
1. Book 3 tickets.
2. Cancel the booking.
**Expected Results**:
1. Succeeds, and the event shows SOLD OUT.
2. The event shows 3 seats again.
**Business Rule**: §6
**Suggested Layer**: API

### TC-405: Event with fewer than 10 seats caps the quantity selector
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A's event has 4 seats.
**Steps**:
1. Press "+" repeatedly.
**Expected Results**: `#ticket-count` stops at 4 (`maxQty = min(10, availableSeats)`).
**Business Rule**: Discovered behaviour
**Suggested Layer**: Component

### TC-406: FIFO with a quantity-10 oldest booking
**Category**: Edge Case
**Priority**: P3
**Preconditions**: The oldest of User A's 9 bookings is 10 tickets for event X.
**Steps**:
1. Create a 10th booking on event Y.
**Expected Results**: X's seats go up by 10.
**Business Rule**: §4 + §6
**Suggested Layer**: API

### TC-407: Clear All with zero bookings
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has no bookings.
**Steps**:
1. Click "Clear all bookings" and accept.
**Expected Results**: The request returns "0 booking(s) cleared", the empty state remains, and nothing breaks.
**Business Rule**: §4
**Suggested Layer**: E2E

### TC-408: Cancel the last remaining booking from the card
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has exactly 1 booking.
**Steps**:
1. Cancel it from the card.
**Expected Results**: The list switches to the "No bookings yet" empty state.
**Business Rule**: UI state
**Suggested Layer**: E2E

### TC-409: Refund spinner timing
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has a booking.
**Steps**:
1. Click the check button and watch the spinner.
**Expected Results**: The spinner is visible for about 4 seconds; the result isn't visible at 3 seconds and is visible by about 5 seconds. Use a clock or `toBeVisible({ timeout })`, never `waitForTimeout`.
**Business Rule**: §8 — 4-second spinner
**Suggested Layer**: Component (fake timers)

### TC-410: Leaving the detail page mid-refund-check
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has a booking.
**Steps**:
1. Click the check button.
2. Navigate away within 4 seconds.
**Expected Results**: There are no React "state update on unmounted component" errors in the console.
**Business Rule**: Discovered behaviour — `setTimeout` without cleanup
**Suggested Layer**: Component

### TC-411: Ref prefix for an emoji/astral-character title *(suspected defect F13)*
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has created an event titled "🎉 Party".
**Steps**:
1. Book the event.
**Expected Results**: Document the actual ref. It is probably a lone surrogate followed by "-XXXXXX", which may render as "�" or fail to save.
**Business Rule**: §7
**Suggested Layer**: Unit

### TC-412: Ref prefix for a digit-first title
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has created an event titled "2026 Expo".
**Steps**:
1. Book the event.
**Expected Results**: The ref matches `^2-[A-Z0-9]{6}$`.
**Business Rule**: §7
**Suggested Layer**: Unit

### TC-413: Ref lookup is case-insensitive?
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A owns ref `T-AB12CD`.
**Steps**:
1. Call `GET /api/bookings/ref/t-ab12cd`.
**Expected Results**: Document the behaviour. With MySQL's default case-insensitive collation it probably returns the booking.
**Business Rule**: §7 — refs are unique
**Suggested Layer**: API

### TC-414: Customer email is rewritten by normalisation *(suspected defect F12)*
**Category**: Edge Case
**Priority**: P2
**Preconditions**: None.
**Steps**:
1. Book with the email `John.Doe+tix@Gmail.com`.
2. Open the detail page.
**Expected Results (expected)**: The email appears as entered. **Likely actual result**: `johndoe@gmail.com`.
**Business Rule**: Data model — valid email format
**Suggested Layer**: API

### TC-415: Fractional price is rounded in the display *(F17)*
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has created an event priced 99.50.
**Steps**:
1. Book 1 ticket.
2. Check the card, the detail page and the API.
**Expected Results**: The API returns `totalPrice` 99.5, but the UI shows $100. Decide whether this display is acceptable.
**Business Rule**: §9
**Suggested Layer**: Component

### TC-416: Free event (price 0)
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has created an event priced 0.
**Steps**:
1. Book 3 tickets.
**Expected Results**: Total Paid is $0, and the booking succeeds.
**Business Rule**: Data model — price ≥ 0
**Suggested Layer**: API

### TC-417: Whitespace in customer fields is trimmed
**Category**: Edge Case
**Priority**: P3
**Preconditions**: None.
**Steps**:
1. Book with the name `"  Priya  "`.
**Expected Results**: The detail page shows "Priya".
**Business Rule**: Validator trims input
**Suggested Layer**: API

### TC-418: Long customer name and event title render without breaking the layout
**Category**: Edge Case
**Priority**: P3
**Preconditions**: A booking with a 200-character name and a long event title.
**Steps**:
1. View the card and the detail page.
**Expected Results**: The card title is truncated (`truncate`), the detail page wraps, and there is no horizontal overflow.
**Business Rule**: UI robustness
**Suggested Layer**: E2E

### TC-419: Concurrent bookings exceed the 9 limit *(suspected defect F15)*
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has 8 bookings.
**Steps**:
1. Fire 3 `POST /api/bookings` requests in parallel.
**Expected Results (per spec)**: The final `total` is ≤ 9. **Likely actual result**: it can reach 10 or 11.
**Business Rule**: §4 — max 9
**Suggested Layer**: API

### TC-420: Concurrent bookings overbook seats *(suspected defect F15)*
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A's event has 2 seats left.
**Steps**:
1. Fire 2 parallel bookings of 2 tickets each.
**Expected Results (per spec)**: One succeeds and one gets 400. **Possible actual result**: both succeed.
**Business Rule**: §6
**Suggested Layer**: API

### TC-421: Very large `limit` *(F7)*
**Category**: Edge Case
**Priority**: P3
**Preconditions**: None.
**Steps**:
1. Call `GET /api/bookings?limit=100000`.
**Expected Results**: Per Swagger, the limit should be capped at 100 or rejected. Actually it's accepted as given.
**Business Rule**: Swagger — limit max 100
**Suggested Layer**: API

---

## UI State (TC-500 – TC-599)

### TC-500: Empty state when the user has no bookings
**Category**: UI State
**Priority**: P1
**Preconditions**: User A has no bookings.
**Steps**:
1. Open `/bookings`.
2. Click "Browse Events".
**Expected Results**:
- "No bookings yet" and "You haven't booked any events yet…" are visible, with a "Browse Events" button.
- Clicking the button goes to `/events`.
**Business Rule**: UI state
**Suggested Layer**: E2E

### TC-501: Loading skeletons on the bookings list
**Category**: UI State
**Priority**: P3
**Preconditions**: Delay `GET /api/bookings` (route mock).
**Steps**:
1. Open `/bookings`.
**Expected Results**: Five pulsing skeleton cards appear, then they are replaced by the real cards.
**Business Rule**: UI state
**Suggested Layer**: E2E (mocked)

### TC-502: Error state with Retry on the bookings list
**Category**: UI State
**Priority**: P2
**Preconditions**: Mock `GET /api/bookings` to return 500 once, then succeed.
**Steps**:
1. Open `/bookings`.
2. Click "Retry".
**Expected Results**: "Couldn't load bookings" and "Failed to connect to the server. Please try again." are shown. After Retry, the bookings render.
**Business Rule**: UI state
**Suggested Layer**: E2E (mocked)

### TC-503: Loading spinner on the detail page
**Category**: UI State
**Priority**: P3
**Preconditions**: Delay `GET /api/bookings/:id`.
**Steps**:
1. Open the detail page.
**Expected Results**: A centred large spinner shows, then the content.
**Business Rule**: UI state
**Suggested Layer**: E2E (mocked)

### TC-504: Clear All link visibility *(spec gap F11)*
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has no bookings.
**Steps**:
1. Open `/bookings`.
**Expected Results (per ui-selectors.md)**: The link is hidden. **Actual (code)**: "Clear all bookings" and "Do this often for clean test data." are always shown.
**Business Rule**: ui-selectors — "visible at top when bookings exist"
**Suggested Layer**: E2E

### TC-505: Sandbox limit banner on the bookings page *(spec gap F8)*
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has 8–9 bookings.
**Steps**:
1. Open `/bookings`.
**Expected Results (per spec)**: A banner warns about the 9-booking sandbox limit. **Actual (code)**: no banner exists.
**Business Rule**: §5 — the bookings page shows a conditional banner
**Suggested Layer**: E2E

### TC-506: Page size 10 vs documented 9 *(spec gap F9)*
**Category**: UI State
**Priority**: P3
**Preconditions**: None.
**Steps**:
1. Capture the `GET /api/bookings` request made by `/bookings`.
**Expected Results**: The request uses `limit=10`. Confirm whether the spec (max 9 displayed) or the code is the source of truth.
**Business Rule**: §4 — bookings page shows max 9
**Suggested Layer**: E2E

### TC-507: Out-of-range page shows a misleading empty state *(F16)*
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has 3 bookings.
**Steps**:
1. Navigate to `/bookings?page=2`.
**Expected Results**: "No bookings yet" appears even though the user has bookings. Ideally it would fall back to page 1 or show pagination.
**Business Rule**: Discovered behaviour
**Suggested Layer**: E2E

### TC-508: Clear All shows the "Clearing…" state and no success toast *(F10)*
**Category**: UI State
**Priority**: P3
**Preconditions**: Delay `DELETE /api/bookings`.
**Steps**:
1. Click "Clear all bookings" and accept.
**Expected Results**: The link reads "Clearing…" and is disabled while pending. When it finishes, the list empties. Note that no toast confirms success, unlike a single cancel.
**Business Rule**: UI state
**Suggested Layer**: E2E (mocked)

### TC-509: Cancel dialog loading state
**Category**: UI State
**Priority**: P3
**Preconditions**: Delay `DELETE /api/bookings/:id`.
**Steps**:
1. Click "Yes, cancel it".
2. While the request is pending, press Escape and click the backdrop.
**Expected Results**: The confirm button shows a loading state, and the dialog **can't** be closed while pending (`onClose` is undefined when `isLoading`).
**Business Rule**: Discovered behaviour — `ConfirmDialog`
**Suggested Layer**: Component

### TC-510: Refund button disappears after the check
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has a booking.
**Steps**:
1. Run the refund check to completion.
**Expected Results**: `#check-refund-btn` is no longer in the DOM, and only `#refund-result` shows. Reloading the page resets it to idle.
**Business Rule**: §8 — client-side only
**Suggested Layer**: Component

### TC-511: Lists refresh after cancelling a booking
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a booking for event X, and `/events` has already been visited.
**Steps**:
1. Cancel the booking from the card.
2. Go to `/events` without reloading.
**Expected Results**: X's seat count already shows the restored value, because the React Query `events` cache is invalidated.
**Business Rule**: Seat count restores on cancellation
**Suggested Layer**: E2E

### TC-512: Bookings list after Clear All shows a stale events cache?
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has bookings, and `/events` has already been visited.
**Steps**:
1. Clear all bookings.
2. Navigate to `/events` client-side.
**Expected Results**: Document whether the seats are restored straight away. Clear All only calls `refetch()` on the bookings query and doesn't invalidate `events`, so the seats may be stale until the next refetch.
**Business Rule**: Seat count restores on cancellation
**Suggested Layer**: E2E

---

## Summary

| Category | Count | P0 | P1 | P2 | P3 |
|----------|-------|----|----|----|----|
| Happy Path | 15 | 6 | 6 | 2 | 1 |
| Business Rule | 19 | 5 | 8 | 5 | 1 |
| Security | 12 | 6 | 2 | 3 | 1 |
| Negative | 21 | 0 | 7 | 10 | 4 |
| Edge Case | 22 | 0 | 3 | 6 | 13 |
| UI State | 13 | 0 | 1 | 3 | 9 |
| **Total** | **102** | **17** | **27** | **29** | **29** |

> Next step: run `/test-strategy docs/test-scenarios.md` to assign the final pyramid layers.
