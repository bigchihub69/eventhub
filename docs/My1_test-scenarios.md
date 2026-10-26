# EventHub — Booking Management Test Scenarios

Generated: 2026-10-22
Scope: Booking Management — view list, view detail, cancel, clear all, refund eligibility, lookup by reference, plus the booking-creation rules whose effects show up in management (FIFO pruning, seat restoration, booking reference, price).

**Sources analysed**
- Domain skill: `SKILL.md`, `business-rules.md`, `user-flows.md`, `api-reference.md`, `ui-selectors.md`
- Frontend: `app/bookings/page.tsx`, `app/bookings/[id]/page.tsx`, `components/bookings/BookingCard.jsx`, `components/ui/ConfirmDialog.jsx`, `lib/hooks/useBookings.ts`, `lib/api/bookingsApi.js`, `lib/api/bookings.ts`, `lib/api/client.js`
- Backend: `routes/bookingRoutes.js`, `controllers/bookingController.js`, `services/bookingService.js`, `repositories/bookingRepository.js`, `validators/bookingValidator.js`, `middleware/authMiddleware.js`, `middleware/errorHandler.js`

**Test accounts**: User A = `rahulshetty1@gmail.com`, User B = `rahulshetty1@yahoo.com` (password `Magiclife1!`)

---

## Code Findings: Suspected Defects & Spec Gaps

Code review turned these up. Each one has a scenario below that checks it.

| # | Finding | Source | Scenario |
|---|---------|--------|----------|
| F1 | FIFO pruning runs **before** the event-exists and seat checks. If a booking fails with 404 or "insufficient seats" while the user is at 9 bookings, the oldest booking has already been deleted. | `bookingService.createBooking` | TC-303, TC-304 |
| F2 | Same-event FIFO fallback calls `decrementSeats` and permanently lowers the event's DB `availableSeats`, for **all users**. Cancelling doesn't give these seats back. | `bookingService.createBooking` | TC-108, TC-109 |
| F3 | Cancelling another user's booking returns **404**, not the documented 403, because `findById(id, userId)` filters by owner. The `ForbiddenError` branch can never run. | `bookingService.cancelBooking` | TC-203 |
| F4 | GET by ID and GET by ref return 404 for a missing booking but 403 for another user's booking, so a caller can tell which IDs/refs exist. | `getBookingById`, `getBookingByRef` | TC-206, TC-207 |
| F5 | A phone value with no digits (e.g. `----------`) passes validation: the regex allows `+ - ( ) space` and the length check counts any characters. | `bookingValidator.js` | TC-311 |
| F6 | A non-numeric booking ID (`/api/bookings/abc`) becomes `Number('abc') = NaN` before reaching Prisma, which probably causes a 500, not a 400/404. | `bookingRepository.findByIdOnly` | TC-318 |
| F7 | `page=0` or a negative page gives a negative `skip`, which probably causes a 500. `limit` has no upper bound, although Swagger documents a max of 100. | `bookingRepository.findAll` | TC-319, TC-420 |
| F8 | The Bookings page has **no** sandbox/limit banner, but `business-rules.md §5` says one should appear conditionally. | `app/bookings/page.tsx` | TC-505 |
| F9 | The Bookings page requests `limit: 10`, but the domain doc says it shows at most 9. | `app/bookings/page.tsx` | TC-506 |
| F10 | If "Clear all bookings" fails, the user sees nothing: there is `try/finally` with no `catch` and no error toast. | `app/bookings/page.tsx` | TC-322 |
| F11 | The "Clear all bookings" link shows even when there are no bookings. `ui-selectors.md` says it shows only "when bookings exist". | `app/bookings/page.tsx` | TC-504 |
| F12 | `normalizeEmail()` rewrites the customer email: Gmail dots are removed and the address is lowercased, so the detail page shows a different email from the one entered. | `bookingValidator.js` | TC-414 |
| F13 | The booking ref prefix uses `title[0]`. A title that starts with an emoji gives a broken (lone surrogate) prefix. | `bookingService.randomRef` | TC-410 |
| F14 | The unused `lib/api/bookings.ts` has `cancel` → `PATCH /bookings/:id/cancel`, an endpoint that doesn't exist. It's dead code now, but it will break if someone wires it up. | `lib/api/bookings.ts` | TC-323 |
| F15 | There are no DB transactions or locks around the count-then-prune and check-then-create steps, so concurrent requests can go over the 9-booking limit or overbook seats. | `bookingService.createBooking` | TC-418, TC-419 |

---

## Happy Path (TC-001 – TC-099)

### TC-001: View bookings list with existing bookings
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has at least 2 confirmed bookings
**Steps**:
1. Navigate to `/bookings`
2. Wait for the booking cards (`#booking-card`) to render
**Expected Results**: Heading "My Bookings" is visible. Each card shows the booking ref (`.booking-ref`), a "confirmed" badge, `#<id>`, the event title, event date, "N ticket(s)", city, "Booked <date>", the total price, a "View Details" link and a "Cancel Booking" button
**Business Rule**: Flow 4 — Manage Bookings; Booking model fields
**Suggested Layer**: E2E

---

### TC-002: Bookings list is ordered newest first
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A is logged in, with no bookings to start
**Steps**:
1. Book event X, then event Y, then event Z (in that order)
2. Navigate to `/bookings`
**Expected Results**: The cards appear in the order Z, Y, X (`orderBy createdAt desc`)
**Business Rule**: Discovered code behavior — `bookingRepository.findAll` orders by `createdAt desc`
**Suggested Layer**: API

---

### TC-003: View booking detail page
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has a confirmed booking
**Steps**:
1. Navigate to `/bookings`
2. Click "View Details" on a booking card
**Expected Results**: The URL is `/bookings/:id`. The breadcrumb shows "My Bookings / <ref>". The header shows the ref (`span.font-mono.font-bold`), a "confirmed" badge, and the event title in `h1`. These sections are visible: Event Details (Event, Category, Date, Venue, City), Customer Details (Name, Email, Phone), Payment Summary (Tickets, Price per ticket, Total Paid), Refund, and Booking Information (Booked on, Booking ID `#<id>`)
**Business Rule**: Flow 4 step 3–4
**Suggested Layer**: E2E

---

### TC-004: Cancel a booking from the detail page
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has a confirmed booking
**Steps**:
1. Open `/bookings/:id`
2. Click "Cancel Booking"
3. In the dialog, click "Yes, cancel it" (`#confirm-dialog-yes`)
**Expected Results**: The toast "Booking cancelled successfully" appears. The user is redirected to `/bookings`. The cancelled booking ref is no longer in the list
**Business Rule**: Flow 4 step 6 — cancel (delete) booking
**Suggested Layer**: E2E

---

### TC-005: Cancel a booking from the bookings list card
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has 2 or more bookings
**Steps**:
1. Navigate to `/bookings`
2. On a specific card, click `#cancel-booking-btn`
3. Click "Yes, cancel it"
**Expected Results**: The toast "Booking cancelled successfully" appears. The user stays on `/bookings`. That card disappears, the other cards stay, and the list refetches without a page reload
**Business Rule**: Flow 4 step 6; React Query invalidates `['bookings']`
**Suggested Layer**: E2E

---

### TC-006: Clear all bookings
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has 3 or more bookings
**Steps**:
1. Navigate to `/bookings`
2. Click "Clear all bookings"
3. Accept the browser confirm "Clear all your bookings? This cannot be undone."
**Expected Results**: All booking cards disappear and the empty state "No bookings yet" with a "Browse Events" button is shown
**Business Rule**: business-rules §4 — "Clear All Bookings" removes all bookings in one go
**Suggested Layer**: E2E

---

### TC-007: Check refund eligibility for a single-ticket booking
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has a booking with quantity = 1
**Steps**:
1. Open `/bookings/:id`
2. Click `#check-refund-btn` ("Check eligibility for refund?")
3. Wait for `#refund-result`
**Expected Results**: `#refund-spinner` with "Checking your refund eligibility…" appears first. Then `#refund-result` shows "Eligible for refund. Single-ticket bookings qualify for a full refund." in green
**Business Rule**: business-rules §8 — quantity = 1 → eligible
**Suggested Layer**: E2E

---

### TC-008: Check refund eligibility for a multi-ticket booking
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A has a booking with quantity = 3
**Steps**:
1. Open `/bookings/:id`
2. Click `#check-refund-btn`
3. Wait for `#refund-result`
**Expected Results**: The spinner shows, then `#refund-result` shows "Not eligible for refund. Group bookings (3 tickets) are non-refundable." in red
**Business Rule**: business-rules §8 — quantity > 1 → not eligible
**Suggested Layer**: E2E

---

### TC-009: Navigate from booking confirmation to My Bookings
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A is logged in
**Steps**:
1. Book any event from `/events/:id`
2. On the confirmation card, note the `.booking-ref`
3. Click "View My Bookings"
**Expected Results**: `/bookings` loads and the first card (newest) has the same booking ref
**Business Rule**: business-rules §1 — after booking, the user can view bookings via "View My Bookings"
**Suggested Layer**: E2E

---

### TC-010: Back navigation from the detail page
**Category**: Happy Path
**Priority**: P3
**Preconditions**: User A is on `/bookings/:id`
**Steps**:
1. Click "← Back to My Bookings"
2. Go back to the detail page, then click the "My Bookings" breadcrumb
**Expected Results**: Both actions go to `/bookings`
**Business Rule**: Discovered UI behavior — booking detail page navigation
**Suggested Layer**: E2E

---

### TC-011: API — list bookings returns paginated envelope
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has a valid token and 3 bookings
**Steps**:
1. `GET /api/bookings` with `Authorization: Bearer <token>`
**Expected Results**: 200 with `{ success: true, data: [3 bookings, each including event], pagination: { total: 3, page: 1, limit: 10, totalPages: 1 } }`
**Business Rule**: api-reference — GET /api/bookings
**Suggested Layer**: API

---

### TC-012: API — look up a booking by reference
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A owns a booking with ref `T-ABC123`
**Steps**:
1. `GET /api/bookings/ref/T-ABC123` with User A's token
**Expected Results**: 200 with `data.bookingRef = "T-ABC123"` and the `event` object included
**Business Rule**: api-reference — GET /api/bookings/ref/:ref
**Suggested Layer**: API

---

### TC-013: API — filter bookings by eventId
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A has 2 bookings for event X and 1 for event Y
**Steps**:
1. `GET /api/bookings?eventId=<X>`
**Expected Results**: 200, `data` has exactly the 2 bookings for event X, and `pagination.total = 2`
**Business Rule**: api-reference — eventId query filter
**Suggested Layer**: API

---

### TC-014: API — clear all returns deleted count
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has 4 bookings
**Steps**:
1. `DELETE /api/bookings`
2. `GET /api/bookings`
**Expected Results**: Step 1 returns 200 `{ success: true, message: "4 booking(s) cleared" }`. Step 2 returns `data: []` and `total: 0`
**Business Rule**: business-rules §4; discovered controller message format
**Suggested Layer**: API

---

## Business Rules (TC-100 – TC-199)

### TC-100: Cancelling restores seats (static event)
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A is logged in and has no bookings for static event "Photography Workshop"
**Steps**:
1. Open the event and note the available seats (S)
2. Book 3 tickets
3. Re-open the event and check that it shows S − 3
4. Cancel the booking from `/bookings`
5. Re-open the event
**Expected Results**: Available seats show S again
**Business Rule**: CLAUDE.md — "Seat count reduces on booking, restores on cancellation"; business-rules §4
**Suggested Layer**: E2E

---

### TC-101: Cancelling restores seats (user-created event)
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A created an event with 20 total seats
**Steps**:
1. Book 5 tickets for it and check that it shows 15 / 20
2. Cancel the booking
3. Re-open the event
**Expected Results**: Available seats are back to 20 / 20
**Business Rule**: business-rules §6 — dynamic seats = totalSeats − sum(user bookings)
**Suggested Layer**: API

---

### TC-102: Clear all restores seats across multiple events
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has bookings on events X (2 tickets) and Y (4 tickets)
**Steps**:
1. Note the available seats for X and Y
2. Click "Clear all bookings" and confirm
3. Re-check X and Y
**Expected Results**: X goes up by 2 and Y goes up by 4
**Business Rule**: business-rules §4 — deletion frees seats; §6 per-user computation
**Suggested Layer**: API

---

### TC-103: Booking ref first character matches event title (list and detail)
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has bookings for "Tech Conference Bangalore" and "Holi Festival Delhi"
**Steps**:
1. Navigate to `/bookings`
2. Read each card's `.booking-ref` next to its event title
3. Open one detail page and read the header ref
**Expected Results**: The refs match `^T-[A-Z0-9]{6}$` and `^H-[A-Z0-9]{6}$` respectively. The detail-page ref is the same as the card ref
**Business Rule**: business-rules §7 — ref format `[FIRST_LETTER]-[6_RANDOM]`
**Suggested Layer**: E2E

---

### TC-104: Total price = event price × quantity on detail page
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A books 4 tickets for "Digital Marketing Workshop" ($299)
**Steps**:
1. Open the booking detail page
**Expected Results**: Tickets = 4, Price per ticket = $299, Total Paid = $1,196. The list card total also reads $1,196
**Business Rule**: business-rules §9 — totalPrice = price × quantity
**Suggested Layer**: API

---

### TC-105: FIFO — 10th booking deletes the oldest
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has cleared all bookings
**Steps**:
1. Create 9 bookings on several different events and note the ref of the first (oldest)
2. Create a 10th booking on yet another event
3. `GET /api/bookings`
**Expected Results**: `total = 9`. The oldest booking ref is gone and the 10th booking is present
**Business Rule**: business-rules §4 — max 9 bookings, oldest auto-deleted
**Suggested Layer**: API

---

### TC-106: FIFO — pruned booking's seats are restored
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has 9 bookings. The oldest is for event X with 3 tickets, and no other booking is for X
**Steps**:
1. Note X's available seats (S)
2. Create a 10th booking on event Y (≠ X)
3. Re-check X's available seats
**Expected Results**: X shows S + 3
**Business Rule**: business-rules §4, §6
**Suggested Layer**: API

---

### TC-107: FIFO — prefers pruning a booking from a different event
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has 9 bookings. The oldest is for event X, the second-oldest is for event Y
**Steps**:
1. Create a new booking for event X
2. `GET /api/bookings`
**Expected Results**: The second-oldest booking (event Y) is deleted. The oldest booking (event X) is kept
**Business Rule**: Discovered code behavior — `findOldestUserBookingExcludingEvent` is tried first
**Suggested Layer**: API

---

### TC-108: FIFO same-event fallback — seat count still drops
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has 9 bookings, all for user-created event X (100 seats, 1 ticket each)
**Steps**:
1. Note X's available seats (should be 91)
2. Book 1 more ticket for X
3. Re-check X's available seats and the booking count
**Expected Results**: The count stays at 9 and the oldest X booking is deleted. Available seats still drop by 1 (the code burns one seat permanently)
**Business Rule**: Discovered code behavior — `sameEventFallback` → `decrementSeats`
**Suggested Layer**: API

---

### TC-109: FIFO same-event fallback — burned seats never come back (suspected defect F2)
**Category**: Business Rule
**Priority**: P1
**Preconditions**: TC-108 has run on event X
**Steps**:
1. Clear all bookings for User A
2. Re-check X's available seats
3. As User B (if X is static), check the same event's available seats
**Expected Results**: Per the rule, seats should go back to 100 and User B should be unaffected. **Expected defect**: the DB `availableSeats` stays lower and, for a static event, every user sees the reduction. Report it as a sandbox-isolation breach
**Business Rule**: CLAUDE.md — seats restore on cancellation; business-rules §2 sandbox isolation
**Suggested Layer**: API

---

### TC-110: Seat changes are isolated per user on static events
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A and User B have no bookings for "Marathon Chennai"
**Steps**:
1. As User A, book 5 tickets for Marathon Chennai
2. As User B, open Marathon Chennai
**Expected Results**: User B sees the full original seat count. User A sees 5 fewer
**Business Rule**: business-rules §2, §6 — per-user seat availability
**Suggested Layer**: API

---

### TC-111: Bookings list shows only the logged-in user's bookings
**Category**: Business Rule
**Priority**: P0
**Preconditions**: User A has 2 bookings and User B has 1 booking
**Steps**:
1. Log in as User A and open `/bookings`
2. Log out, log in as User B and open `/bookings`
**Expected Results**: User A sees only their 2 refs. User B sees only their 1 ref
**Business Rule**: business-rules §2 — sandbox isolation
**Suggested Layer**: API

---

### TC-112: Deleting a user-created event cascades to its bookings
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A created event X and has 2 bookings on it, plus 1 booking on a static event
**Steps**:
1. Delete event X from `/admin/events`
2. Open `/bookings`
**Expected Results**: Only the static-event booking remains. Opening a deleted booking's `/bookings/:id` shows "Booking not found"
**Business Rule**: Booking model — cascade delete with Event; Flow 5 step 6
**Suggested Layer**: API

---

### TC-113: FIFO event pruning cascades to bookings
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has 6 user-created events. The oldest (E1) has 1 booking
**Steps**:
1. Create a 7th event
2. Open `/bookings`
**Expected Results**: E1 is pruned and its booking is gone from the list
**Business Rule**: business-rules §3 — event FIFO; Booking cascade delete
**Suggested Layer**: API

---

### TC-114: Same user can book the same event multiple times
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A is logged in
**Steps**:
1. Book event X twice (2 tickets, then 3 tickets)
2. Open `/bookings`
**Expected Results**: There are 2 separate cards with different refs, both starting with X's first letter. X's available seats dropped by 5 in total
**Business Rule**: business-rules §6 — "allows the same user to book the same event multiple times"
**Suggested Layer**: API

---

### TC-115: Refund eligibility at quantity boundary 2
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has a booking with quantity = 2
**Steps**:
1. Open the detail page and click `#check-refund-btn`
**Expected Results**: "Not eligible for refund. Group bookings (2 tickets) are non-refundable."
**Business Rule**: business-rules §8 — boundary between eligible (1) and not eligible (>1)
**Suggested Layer**: Component

---

### TC-116: Booking status is always "confirmed"
**Category**: Business Rule
**Priority**: P3
**Preconditions**: User A has bookings
**Steps**:
1. `GET /api/bookings`
2. Check `status` on every booking
**Expected Results**: Every booking has `status = "confirmed"` and the badge shows green "confirmed"
**Business Rule**: Booking model — status always "confirmed"
**Suggested Layer**: API

---

## Security (TC-200 – TC-299)

### TC-200: Cross-user booking detail shows "Access Denied"
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking ID N
**Steps**:
1. Log in as User A, create a booking and capture its ID from `#booking-id`
2. Clear localStorage and log in as User B
3. Navigate to `/bookings/N`
**Expected Results**: The page shows "Access Denied" and "You are not authorized to view this booking." with a "View My Bookings" button. None of the booking data is rendered
**Business Rule**: Flow 6 — Cross-User Security; CLAUDE.md "Cross-user booking access returns Access Denied"
**Suggested Layer**: E2E

---

### TC-201: API — cross-user GET by ID returns 403
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking ID N
**Steps**:
1. `GET /api/bookings/N` with User B's token
**Expected Results**: 403 `{ success: false, error: "You are not authorized to view this booking" }` with no booking data in the body
**Business Rule**: business-rules §2 — cross-user access → 403
**Suggested Layer**: API

---

### TC-202: API — cross-user GET by reference returns 403
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns ref R
**Steps**:
1. `GET /api/bookings/ref/R` with User B's token
**Expected Results**: 403 `{ error: "You do not own this booking" }` with no booking data
**Business Rule**: business-rules §2
**Suggested Layer**: API

---

### TC-203: API — cross-user cancel is rejected and the booking survives (suspected defect F3)
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns booking ID N
**Steps**:
1. `DELETE /api/bookings/N` with User B's token
2. `GET /api/bookings/N` with User A's token
**Expected Results**: Step 2 returns 200 and the booking still exists. Step 1 should be 403 per api-reference. **Expected defect**: it returns 404 "Booking with id N not found" because of the owner-filtered lookup. Record the status-code mismatch
**Business Rule**: api-reference — cross-user access 403; business-rules §2
**Suggested Layer**: API

---

### TC-204: API — clear all affects only the caller's bookings
**Category**: Security
**Priority**: P0
**Preconditions**: User A has 3 bookings and User B has 2 bookings
**Steps**:
1. `DELETE /api/bookings` with User B's token
2. `GET /api/bookings` with User A's token
**Expected Results**: User B's response says "2 booking(s) cleared". User A still has all 3 bookings
**Business Rule**: business-rules §2 — sandbox isolation
**Suggested Layer**: API

---

### TC-205: All booking endpoints require authentication
**Category**: Security
**Priority**: P0
**Preconditions**: None
**Steps**:
1. Call each of `GET /api/bookings`, `GET /api/bookings/1`, `GET /api/bookings/ref/X-123456`, `POST /api/bookings`, `DELETE /api/bookings`, `DELETE /api/bookings/1` with no `Authorization` header
**Expected Results**: Every call returns 401 `{ error: "Unauthorized" }` and no data changes
**Business Rule**: api-reference — missing auth token → 401
**Suggested Layer**: API

---

### TC-206: Booking ID enumeration — 403 vs 404 reveals which IDs exist (suspected defect F4)
**Category**: Security
**Priority**: P2
**Preconditions**: User A owns booking N. ID 999999 does not exist
**Steps**:
1. `GET /api/bookings/N` with User B's token
2. `GET /api/bookings/999999` with User B's token
**Expected Results**: The two responses differ (403 vs 404), which tells an attacker that ID N exists. Record this as an information-disclosure finding and decide whether both should return 404
**Business Rule**: Discovered code behavior — `getBookingById` checks existence before ownership
**Suggested Layer**: API

---

### TC-207: Booking ref enumeration — 403 vs 404
**Category**: Security
**Priority**: P3
**Preconditions**: User A owns ref R
**Steps**:
1. `GET /api/bookings/ref/R` with User B's token
2. `GET /api/bookings/ref/Z-ZZZZZZ` with User B's token
**Expected Results**: 403 vs 404, so a ref's existence can be probed. Record as an information-disclosure finding
**Business Rule**: Discovered code behavior — `getBookingByRef`
**Suggested Layer**: API

---

### TC-208: Tampered or expired JWT is rejected
**Category**: Security
**Priority**: P1
**Preconditions**: User A has a valid token
**Steps**:
1. Change one character of the token's signature and call `GET /api/bookings`
2. Call it with a token signed by a different secret
3. Call it with a token whose `exp` is in the past
**Expected Results**: All three return 401 `{ error: "Invalid or expired token" }`
**Business Rule**: Auth — JWT 7-day expiry; authMiddleware
**Suggested Layer**: API

---

### TC-209: UI redirects to login when the token is invalid on /bookings
**Category**: Security
**Priority**: P1
**Preconditions**: User A is logged in
**Steps**:
1. Set `localStorage.eventhub_token` to a garbage value
2. Navigate to `/bookings`
**Expected Results**: The 401 response clears the token and the user is redirected to `/login`. No booking data is shown
**Business Rule**: Discovered code behavior — `client.js` 401 interceptor
**Suggested Layer**: E2E

---

### TC-210: Unauthenticated visit to /bookings/:id
**Category**: Security
**Priority**: P1
**Preconditions**: Not logged in (no token in localStorage)
**Steps**:
1. Navigate directly to `/bookings/1`
**Expected Results**: The user is redirected to `/login` (AuthGuard or 401 interceptor) and no booking content is shown
**Business Rule**: Auth required on all booking routes
**Suggested Layer**: E2E

---

### TC-211: Mass assignment — client-controlled fields are ignored on create
**Category**: Security
**Priority**: P1
**Preconditions**: User A and User B have valid tokens
**Steps**:
1. As User A, `POST /api/bookings` with valid fields plus `userId: <UserB.id>`, `totalPrice: 1`, `status: "cancelled"`, `bookingRef: "HACK-1"`
2. Fetch the created booking
**Expected Results**: The booking belongs to User A, `totalPrice = price × quantity`, `status = "confirmed"`, and the ref is server-generated in `[A-Z]-[A-Z0-9]{6}` format. It doesn't appear in User B's list
**Business Rule**: business-rules §7, §9; sandbox isolation
**Suggested Layer**: API

---

### TC-212: Cannot book another user's private event
**Category**: Security
**Priority**: P1
**Preconditions**: User B created event X (ID E)
**Steps**:
1. As User A, `POST /api/bookings` with `eventId: E`
**Expected Results**: 404 "Event with id E not found" and no booking is created
**Business Rule**: business-rules §2 — users only see their own dynamic events
**Suggested Layer**: API

---

### TC-213: XSS payload in customer name is rendered as text
**Category**: Security
**Priority**: P2
**Preconditions**: User A is logged in
**Steps**:
1. Create a booking with customerName `<img src=x onerror=alert(1)>`
2. Open its detail page
**Expected Results**: The name shows as literal text in Customer Details and no script runs (no dialog event fires)
**Business Rule**: Discovered UI behavior — React escapes output; general security hygiene
**Suggested Layer**: E2E

---

## Negative (TC-300 – TC-399)

### TC-300: Detail page for a non-existent booking
**Category**: Negative
**Priority**: P1
**Preconditions**: User A is logged in
**Steps**:
1. Navigate to `/bookings/99999999`
**Expected Results**: "Booking not found" and "This booking doesn't exist or may have been cancelled." are shown with a "View My Bookings" button
**Business Rule**: Discovered UI behavior — 404 branch of the booking detail page
**Suggested Layer**: E2E

---

### TC-301: Revisiting a cancelled booking's URL
**Category**: Negative
**Priority**: P1
**Preconditions**: User A cancelled booking N
**Steps**:
1. Navigate to `/bookings/N`
**Expected Results**: The "Booking not found" empty state is shown (not "Access Denied")
**Business Rule**: Cancellation permanently deletes the booking
**Suggested Layer**: E2E

---

### TC-302: Dismissing the cancel dialog keeps the booking
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has a confirmed booking
**Steps**:
1. Click "Cancel Booking" (card or detail page)
2. In the dialog, click "Cancel"
**Expected Results**: The dialog closes, no DELETE request is sent, and the booking is still listed
**Business Rule**: Discovered UI behavior — ConfirmDialog
**Suggested Layer**: Component

---

### TC-303: Failed booking (event not found) at limit must not prune (suspected defect F1)
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has exactly 9 bookings
**Steps**:
1. `POST /api/bookings` with `eventId: 99999999` and otherwise valid data
2. `GET /api/bookings`
**Expected Results**: Step 1 returns 404. The user should still have all 9 bookings. **Expected defect**: the oldest booking is deleted even though the booking failed
**Business Rule**: business-rules §4 — pruning happens only when a new booking is added
**Suggested Layer**: API

---

### TC-304: Failed booking (insufficient seats) at limit must not prune (suspected defect F1)
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has 9 bookings. A user-created event X has 2 available seats
**Steps**:
1. `POST /api/bookings` for X with `quantity: 5`
2. `GET /api/bookings`
**Expected Results**: Step 1 returns 400 "Only 2 seat(s) available, but 5 requested". The 9 bookings should be unchanged. **Expected defect**: the oldest booking is deleted
**Business Rule**: business-rules §4; api-reference — insufficient seats 400
**Suggested Layer**: API

---

### TC-305: Cancel a non-existent booking via API
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `DELETE /api/bookings/99999999`
**Expected Results**: 404 `{ error: "Booking with id 99999999 not found" }`
**Business Rule**: Discovered code behavior — `cancelBooking` NotFoundError
**Suggested Layer**: API

---

### TC-306: Cancel the same booking twice
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has booking N
**Steps**:
1. `DELETE /api/bookings/N` (200)
2. `DELETE /api/bookings/N` again
**Expected Results**: The second call returns 404 and nothing else changes
**Business Rule**: Cancellation is a permanent delete
**Suggested Layer**: API

---

### TC-307: Look up a ref that doesn't exist
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `GET /api/bookings/ref/Q-000000`
**Expected Results**: 404 `{ error: 'Booking with reference "Q-000000" not found' }`
**Business Rule**: api-reference — GET by ref 404
**Suggested Layer**: API

---

### TC-308: Clear all with zero bookings
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has no bookings
**Steps**:
1. `DELETE /api/bookings`
**Expected Results**: 200 `{ message: "0 booking(s) cleared" }` with no error
**Business Rule**: Discovered controller behavior
**Suggested Layer**: API

---

### TC-309: Dismissing the clear-all browser confirm keeps bookings
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has 2 or more bookings
**Steps**:
1. Click "Clear all bookings"
2. Dismiss the native confirm dialog (`page.once('dialog', d => d.dismiss())`)
**Expected Results**: No DELETE request is sent and all bookings are still shown
**Business Rule**: Discovered UI behavior — `confirm()` guard in `handleClearAll`
**Suggested Layer**: E2E

---

### TC-310: Create booking — missing required fields
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has a valid token
**Steps**:
1. `POST /api/bookings` with `{}`
**Expected Results**: 400 `{ error: "Validation failed", details: [...] }`. The details include eventId, customerName, customerEmail, customerPhone and quantity, each with its own message
**Business Rule**: api-reference — missing required fields → 400
**Suggested Layer**: API

---

### TC-311: Create booking — phone with no digits passes validation (suspected defect F5)
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `POST /api/bookings` with `customerPhone: "----------"` (10 hyphens)
2. Repeat with `"(((   )))+"`
**Expected Results**: Both should return 400 because the Booking model requires a min of 10 digits. **Expected defect**: both return 201
**Business Rule**: Booking model — customerPhone min 10 digits
**Suggested Layer**: Unit

---

### TC-312: Create booking — phone with letters
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `POST /api/bookings` with `customerPhone: "98765abcde"`
**Expected Results**: 400 with "Customer phone must contain only digits and +, -, spaces, or parentheses"
**Business Rule**: bookingValidator — phone regex
**Suggested Layer**: Unit

---

### TC-313: Create booking — invalid email
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `POST /api/bookings` with `customerEmail: "not-an-email"`
**Expected Results**: 400 with "Customer email must be a valid email address"
**Business Rule**: Booking model — valid email format
**Suggested Layer**: Unit

---

### TC-314: Create booking — name too short or whitespace only
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `POST` with `customerName: "A"`
2. `POST` with `customerName: "   "`
**Expected Results**: (1) returns 400 "at least 2 characters". (2) returns 400 "Customer name is required", because the value is trimmed to empty
**Business Rule**: Booking model — customerName min 2 chars
**Suggested Layer**: Unit

---

### TC-315: Create booking — quantity out of range
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has a valid token
**Steps**:
1. `POST` with `quantity: 0`, then `11`, then `-1`, then `2.5`, then `"abc"`
**Expected Results**: Every request returns 400 "Quantity must be an integer between 1 and 10"
**Business Rule**: Booking model — quantity 1–10
**Suggested Layer**: Unit

---

### TC-316: Create booking — invalid eventId
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `POST` with `eventId: 0`, then `-5`, then `"abc"`
**Expected Results**: 400 "Event ID must be a positive integer"
**Business Rule**: bookingValidator — eventId
**Suggested Layer**: Unit

---

### TC-317: Booking more tickets than the user's remaining seats
**Category**: Negative
**Priority**: P1
**Preconditions**: User A created event X with 5 seats and booked 4 of them
**Steps**:
1. `POST /api/bookings` for X with `quantity: 2`
**Expected Results**: 400 "Only 1 seat(s) available, but 2 requested" and no booking is created
**Business Rule**: api-reference — insufficient seats 400; business-rules §6
**Suggested Layer**: API

---

### TC-318: Non-numeric booking ID (suspected defect F6)
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has a valid token
**Steps**:
1. `GET /api/bookings/abc`
2. `DELETE /api/bookings/abc`
3. Navigate to `/bookings/abc` in the UI
**Expected Results**: The API should return 400 or 404, not 500. The UI should show "Booking not found". Record a defect if the API returns 500 or leaks a Prisma error message
**Business Rule**: Discovered code behavior — `Number(id)` → NaN
**Suggested Layer**: API

---

### TC-319: Invalid pagination parameters (suspected defect F7)
**Category**: Negative
**Priority**: P3
**Preconditions**: User A has a valid token
**Steps**:
1. `GET /api/bookings?page=0`
2. `GET /api/bookings?page=-1`
3. `GET /api/bookings?page=abc&limit=abc`
**Expected Results**: (3) falls back to page=1, limit=10. (1) and (2) should return 400 or default to page 1. Record a defect if they return 500 from a negative `skip`
**Business Rule**: Swagger — page minimum 1
**Suggested Layer**: API

---

### TC-320: Cancel fails with server error — toast shown, dialog closes
**Category**: Negative
**Priority**: P2
**Preconditions**: User A is on `/bookings` with bookings
**Steps**:
1. Mock `DELETE /api/bookings/*` to return 500 `{ error: "Boom" }` (`page.route`)
2. Click "Cancel Booking", then "Yes, cancel it"
**Expected Results**: An error toast "Boom" is shown, the dialog closes and the booking stays in the list
**Business Rule**: Discovered UI behavior — `onError` handler in BookingCard
**Suggested Layer**: E2E

---

### TC-321: Bookings list fails to load — error state with retry
**Category**: Negative
**Priority**: P2
**Preconditions**: User A is logged in
**Steps**:
1. Mock `GET /api/bookings*` to return 500
2. Navigate to `/bookings`
3. Remove the mock and click "Retry"
**Expected Results**: "Couldn't load bookings" / "Failed to connect to the server. Please try again." with a Retry button. After Retry, the bookings render
**Business Rule**: Discovered UI behavior — `isError` branch
**Suggested Layer**: E2E

---

### TC-322: Clear all fails — no feedback to user (suspected defect F10)
**Category**: Negative
**Priority**: P2
**Preconditions**: User A has bookings
**Steps**:
1. Mock `DELETE /api/bookings` to return 500
2. Click "Clear all bookings" and accept the confirm
**Expected Results**: An error message or toast should appear and the bookings should stay listed. **Expected defect**: the button text goes back from "Clearing…" with no error shown, and there may be an unhandled promise rejection in the console
**Business Rule**: Discovered code behavior — `try/finally` with no `catch`
**Suggested Layer**: E2E

---

### TC-323: Unused `bookings.ts` cancel calls an endpoint that doesn't exist (suspected defect F14)
**Category**: Negative
**Priority**: P3
**Preconditions**: User A has booking N
**Steps**:
1. `PATCH /api/bookings/N/cancel` with a valid token
**Expected Results**: 404 (no such route). Confirms that `lib/api/bookings.ts → cancel` is broken, so it should be removed or fixed so nobody wires it up
**Business Rule**: Discovered code behavior — two parallel API clients
**Suggested Layer**: Unit

---

## Edge Cases (TC-400 – TC-499)

### TC-400: Refund eligibility at maximum quantity (10)
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has a booking with quantity = 10
**Steps**:
1. Open the detail page and click `#check-refund-btn`
**Expected Results**: "Group bookings (10 tickets) are non-refundable."
**Business Rule**: business-rules §8; Booking model quantity max 10
**Suggested Layer**: Component

---

### TC-401: Quantity boundaries accepted (1 and 10)
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A has a valid token. The event has 10 or more seats available
**Steps**:
1. `POST /api/bookings` with `quantity: 1`
2. `POST /api/bookings` with `quantity: 10`
**Expected Results**: Both return 201 with the correct `totalPrice`
**Business Rule**: Booking model — quantity 1–10
**Suggested Layer**: API

---

### TC-402: String quantity is coerced
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has a valid token
**Steps**:
1. `POST /api/bookings` with `quantity: "3"`, `eventId: "1"`
**Expected Results**: 201, with `quantity` stored as integer 3 and `totalPrice = price × 3`
**Business Rule**: bookingValidator `.toInt()`
**Suggested Layer**: Unit

---

### TC-403: Booking exactly the remaining seats
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A created event X with 3 seats
**Steps**:
1. Book 3 tickets for X
2. Open X's detail page
3. Cancel the booking and re-open X
**Expected Results**: Step 1 returns 201. Step 2 shows "SOLD OUT" and the Confirm button reads "Sold Out" and is disabled. Step 3 shows 3 / 3 seats and booking is possible again
**Business Rule**: business-rules §6; seats restore on cancellation
**Suggested Layer**: E2E

---

### TC-404: Exactly 9 bookings — no pruning
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A has cleared all bookings
**Steps**:
1. Create 9 bookings
2. `GET /api/bookings`
**Expected Results**: `total = 9` and all 9 refs are present, including the first one
**Business Rule**: business-rules §4 — limit is 9 (inclusive)
**Suggested Layer**: API

---

### TC-405: Consecutive overflow keeps a rolling window of 9
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has 9 bookings (B1…B9, oldest first) on different events
**Steps**:
1. Create B10, B11 and B12 on new events
2. `GET /api/bookings`
**Expected Results**: `total = 9`, B1–B3 are gone, and B4–B12 are present
**Business Rule**: business-rules §4 — FIFO
**Suggested Layer**: API

---

### TC-406: Cancelling a booking below the limit makes room
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has 9 bookings
**Steps**:
1. Cancel the newest booking (count goes to 8)
2. Create a new booking
3. `GET /api/bookings`
**Expected Results**: `total = 9` and the oldest booking is still there (nothing was pruned)
**Business Rule**: business-rules §4
**Suggested Layer**: API

---

### TC-407: Booking ref for a lowercase-title event
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A created event "yoga retreat"
**Steps**:
1. Book the event
**Expected Results**: The ref matches `^Y-[A-Z0-9]{6}$` (uppercase)
**Business Rule**: business-rules §7 — first letter uppercase
**Suggested Layer**: Unit

---

### TC-408: Booking ref for a title starting with a digit
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A created event "2026 Tech Expo"
**Steps**:
1. Book the event
**Expected Results**: The ref matches `^2-[A-Z0-9]{6}$`. Record whether a digit prefix is acceptable to the business
**Business Rule**: business-rules §7
**Suggested Layer**: Unit

---

### TC-409: Booking ref for a title starting with a non-ASCII letter
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A created event "école Festival"
**Steps**:
1. Book the event
**Expected Results**: The ref starts with "É-", is unique, and shows correctly on the card and detail page
**Business Rule**: business-rules §7
**Suggested Layer**: Unit

---

### TC-410: Booking ref for a title starting with an emoji (suspected defect F13)
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A created event "🎉 Party Night"
**Steps**:
1. Book the event
2. View the ref on `/bookings` and look it up with `GET /api/bookings/ref/<ref>`
**Expected Results**: The ref should be a valid, displayable string. **Expected defect**: the prefix is a lone surrogate, which shows as "�" and may break the ref lookup
**Business Rule**: business-rules §7
**Suggested Layer**: Unit

---

### TC-411: Ref lookup is case-sensitive or not
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A owns ref `T-AB12CD`
**Steps**:
1. `GET /api/bookings/ref/t-ab12cd`
**Expected Results**: Record the behavior: with MySQL's default case-insensitive collation it probably returns 200. Agree on the intended behavior with the product owner
**Business Rule**: Discovered code behavior — `findUnique({ bookingRef })`
**Suggested Layer**: API

---

### TC-412: Ref uniqueness across many bookings
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has a valid token
**Steps**:
1. Create and clear bookings in a loop (e.g. 50 bookings on the same event, clearing every 9)
2. Collect all returned refs
**Expected Results**: All refs are unique and every one matches `^[A-Z0-9]-[A-Z0-9]{6,8}$` (8 chars only when the timestamp fallback is used)
**Business Rule**: business-rules §7 — guaranteed unique via collision retry
**Suggested Layer**: Unit

---

### TC-413: Decimal price rounding in display
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A created an event priced $99.50
**Steps**:
1. Book 3 tickets (total $298.50)
2. Check the list card and detail page
**Expected Results**: The API returns `totalPrice = "298.5"` / `298.50`. The UI shows "$299" because `maximumFractionDigits: 0`. Record whether whole-dollar rounding is intended
**Business Rule**: business-rules §9; discovered `fmt_price` behavior
**Suggested Layer**: Component

---

### TC-414: Customer email is normalized on save (suspected defect F12)
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A is logged in
**Steps**:
1. Book with customerEmail `John.Doe+test@Gmail.com`
2. Open the booking detail page
**Expected Results**: Record what's shown. `normalizeEmail()` will probably store `johndoe@gmail.com` (dots and `+tag` removed, lowercased), which isn't what the user typed
**Business Rule**: Discovered code behavior — `normalizeEmail()` in bookingValidator
**Suggested Layer**: API

---

### TC-415: Very long customer name
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has a valid token
**Steps**:
1. `POST /api/bookings` with a customerName of 500 characters
**Expected Results**: The request should return 400 with a clear message, or store the name and show it truncated on the card. Record a defect if it returns 500 (Prisma `String` → VARCHAR(191) overflow)
**Business Rule**: Booking model — customerName (no max defined)
**Suggested Layer**: API

---

### TC-416: Long event title is truncated on the booking card
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A booked a user-created event with a 150-character title
**Steps**:
1. Open `/bookings`
**Expected Results**: The title on the card is truncated with an ellipsis (`truncate` class) and the layout doesn't break. The detail page `h1` shows the full title
**Business Rule**: Discovered UI behavior — BookingCard `truncate`
**Suggested Layer**: Component

---

### TC-417: Cancel from two tabs
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has booking N open in two tabs
**Steps**:
1. In tab 1, cancel booking N
2. In tab 2 (stale), click "Cancel Booking", then "Yes, cancel it"
**Expected Results**: Tab 2 shows the error toast "Booking with id N not found", the dialog closes, and nothing else is affected
**Business Rule**: Discovered UI behavior — cancel `onError`
**Suggested Layer**: E2E

---

### TC-418: Concurrent bookings at the limit (suspected defect F15)
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has 8 bookings
**Steps**:
1. Fire 3 `POST /api/bookings` requests in parallel (`Promise.all`)
2. `GET /api/bookings`
**Expected Results**: `total` should be 9. Record a defect if the total is over 9 (count-then-prune isn't atomic)
**Business Rule**: business-rules §4 — max 9 bookings
**Suggested Layer**: API

---

### TC-419: Concurrent bookings for the last seats (suspected defect F15)
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A created event X with 2 seats
**Steps**:
1. Fire 2 parallel `POST /api/bookings` requests for X with `quantity: 2`
**Expected Results**: Exactly one should succeed and the other should return 400. Record a defect if both succeed (overbooking)
**Business Rule**: business-rules §6 — seat availability
**Suggested Layer**: API

---

### TC-420: Unbounded limit parameter (suspected defect F7)
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has a valid token
**Steps**:
1. `GET /api/bookings?limit=100000`
**Expected Results**: Per Swagger (max 100), the API should reject or clamp the value. Record what happens; currently it's probably accepted as-is
**Business Rule**: Swagger — limit maximum 100
**Suggested Layer**: API

---

### TC-421: Page beyond range returns empty data
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has 3 bookings
**Steps**:
1. `GET /api/bookings?page=5`
**Expected Results**: 200 with `data: []`, `total: 3`, `page: 5`, `totalPages: 1`
**Business Rule**: Discovered code behavior — pagination
**Suggested Layer**: API

---

### TC-422: Unknown status filter
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has bookings
**Steps**:
1. `GET /api/bookings?status=cancelled`
2. `GET /api/bookings?status=garbage`
**Expected Results**: Both return 200 with empty `data`, because every booking is "confirmed" and the filter isn't validated
**Business Rule**: Booking model — status always "confirmed"
**Suggested Layer**: API

---

### TC-423: Booking on a deleted event via stale page
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has `/events/:id` for their own event X open in tab 1
**Steps**:
1. In tab 2, delete event X
2. In tab 1, fill in the form and click Confirm Booking
**Expected Results**: An error toast "Event with id … not found" appears and no booking shows up in `/bookings`
**Business Rule**: Event cascade; discovered `createBooking` NotFoundError
**Suggested Layer**: E2E

---

## UI State (TC-500 – TC-599)

### TC-500: Empty state when there are no bookings
**Category**: UI State
**Priority**: P1
**Preconditions**: User A has no bookings
**Steps**:
1. Navigate to `/bookings`
2. Click "Browse Events"
**Expected Results**: "No bookings yet" and "You haven't booked any events yet…" are shown with no booking cards. The button goes to `/events`
**Business Rule**: Discovered UI behavior — EmptyState
**Suggested Layer**: E2E

---

### TC-501: Loading skeletons while bookings load
**Category**: UI State
**Priority**: P3
**Preconditions**: User A is logged in
**Steps**:
1. Delay `GET /api/bookings*` by 2s with `page.route`
2. Navigate to `/bookings`
**Expected Results**: 5 pulse skeleton cards show during loading and are replaced by the real cards when the response arrives
**Business Rule**: Discovered UI behavior — `BookingCardSkeleton`
**Suggested Layer**: Component

---

### TC-502: Refund check UI state transitions and 4-second delay
**Category**: UI State
**Priority**: P1
**Preconditions**: User A has a booking (any quantity)
**Steps**:
1. Open the detail page
2. Click `#check-refund-btn`
3. Check the state right away, then wait for the result
**Expected Results**: Right after the click, `#check-refund-btn` is hidden and `#refund-spinner` is visible. After about 4 seconds, the spinner is hidden and `#refund-result` is visible. The button doesn't come back. Use `expect(...).toBeVisible({ timeout: 6000 })`, not `waitForTimeout`
**Business Rule**: business-rules §8 — 4-second spinner
**Suggested Layer**: Component

---

### TC-503: Refund state resets on reload
**Category**: UI State
**Priority**: P3
**Preconditions**: TC-502 completed
**Steps**:
1. Reload the detail page
**Expected Results**: `#check-refund-btn` is visible again and no result is shown (state is client-side only)
**Business Rule**: business-rules §8 — frontend-only logic
**Suggested Layer**: Component

---

### TC-504: "Clear all bookings" visibility with zero bookings (suspected defect F11)
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has no bookings
**Steps**:
1. Navigate to `/bookings`
**Expected Results**: Per `ui-selectors.md`, the link should show only when bookings exist. **Expected defect**: "Clear all bookings" and the hint "Do this often for clean test data." are always shown
**Business Rule**: ui-selectors — "Clear all link: visible at top when bookings exist"
**Suggested Layer**: Component

---

### TC-505: Sandbox warning banner on the Bookings page (suspected defect F8)
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has 9 bookings, then 2 bookings
**Steps**:
1. With 9 bookings, open `/bookings` and look for `getByText(/sandbox holds up to/i)`
2. With 2 bookings, open `/bookings`
**Expected Results**: Per business-rules §5, the banner should show near the limit and be hidden when the count is low. **Expected defect**: the banner never shows on `/bookings`. It's only implemented on `/events`
**Business Rule**: business-rules §5 — Bookings page conditional banner
**Suggested Layer**: E2E

---

### TC-506: Bookings page shows all bookings on one page at the limit (spec gap F9)
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has 9 bookings
**Steps**:
1. Open `/bookings`
**Expected Results**: All 9 cards are on page 1 and no next page is offered. Note that the UI requests `limit=10` while the doc says "max 9 at a time". Behavior is the same now, but the doc and code disagree
**Business Rule**: business-rules §4 — Bookings page shows max 9
**Suggested Layer**: Component

---

### TC-507: Clear-all button shows "Clearing…" while in progress
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has bookings
**Steps**:
1. Delay `DELETE /api/bookings` by 2s
2. Click "Clear all bookings" and accept the confirm
**Expected Results**: While the request runs, the button reads "Clearing…" and is disabled. When it finishes, it goes back to "Clear all bookings" and the empty state shows
**Business Rule**: Discovered UI behavior — `clearing` state
**Suggested Layer**: Component

---

### TC-508: Cancel confirmation dialog content
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a booking with ref R and quantity 3
**Steps**:
1. Click "Cancel Booking" on the list card
2. Close the dialog, open the detail page, and click "Cancel Booking"
**Expected Results**: Both dialogs are titled "Cancel this booking?" and have "Cancel" and "Yes, cancel it" buttons. The card dialog text says "This will cancel R and release 3 seat(s) back to the event. This action cannot be undone." The detail dialog text says "Cancelling R will release 3 seat(s) back to the event. This cannot be undone."
**Business Rule**: Discovered UI behavior — ConfirmDialog descriptions
**Suggested Layer**: Component

---

### TC-509: Cancel dialog loading state blocks dismissal and double-submit
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a booking
**Steps**:
1. Delay `DELETE /api/bookings/*` by 2s
2. Click "Cancel Booking", then "Yes, cancel it", then try "Cancel", the overlay, and "Yes, cancel it" again
**Expected Results**: While the request runs, "Yes, cancel it" shows a loading state, "Cancel" is disabled, the modal can't be dismissed, and only one DELETE request is sent
**Business Rule**: Discovered UI behavior — ConfirmDialog `isLoading`
**Suggested Layer**: Component

---

### TC-510: Ticket pluralization on booking card
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has bookings with quantity 1 and 2
**Steps**:
1. Open `/bookings`
**Expected Results**: The cards show "🎫 1 ticket" and "🎫 2 tickets" respectively
**Business Rule**: Discovered UI behavior — BookingCard pluralization
**Suggested Layer**: Component

---

### TC-511: Detail page loading spinner
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has booking N
**Steps**:
1. Delay `GET /api/bookings/N` by 2s
2. Navigate to `/bookings/N`
**Expected Results**: A centered large spinner shows until the data arrives, then the detail content renders
**Business Rule**: Discovered UI behavior — `isLoading` branch
**Suggested Layer**: Component

---

### TC-512: List refreshes after cancel without manual reload
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has 3 bookings and is on `/bookings`
**Steps**:
1. Cancel one booking from its card
**Expected Results**: Exactly 2 cards remain (`expect(page.locator('#booking-card')).toHaveCount(2)`) with no `page.reload()`. The events list cache is also invalidated, so seat counts are fresh when the user goes to `/events`
**Business Rule**: Discovered code behavior — `useCancelBooking` invalidates `['bookings']` and `['events']`
**Suggested Layer**: E2E

---

## Summary

| Category | Range | Count |
|----------|-------|-------|
| Happy Path | TC-001 – TC-014 | 14 |
| Business Rule | TC-100 – TC-116 | 17 |
| Security | TC-200 – TC-213 | 14 |
| Negative | TC-300 – TC-323 | 24 |
| Edge Case | TC-400 – TC-423 | 24 |
| UI State | TC-500 – TC-512 | 13 |
| **Total** | | **106** |

**Priority split**: P0 = 19 · P1 = 29 · P2 = 30 · P3 = 28

**Next step**: Run `/test-strategy docs/test-scenarios.md` to assign each scenario to its pyramid layer.
