# EventHub — Booking Management Test Scenarios

Generated: 2026-10-26
Scope: Booking Management, including creating a booking where needed to exercise its effects, viewing and searching bookings, cancellation, Clear All, refund eligibility, seat availability, FIFO limits, and ownership isolation. Registration, event browsing, and event administration are included only where they are prerequisites or affect booking records.

## Sources reviewed

- EventHub domain overview and data models; `business-rules.md`, `user-flows.md`, `api-reference.md`, and `ui-selectors.md`.
- Frontend routes under `frontend/app/`, with particular attention to `events/[id]/page.tsx`, `bookings/page.tsx`, `bookings/[id]/page.tsx`, and `admin/events/page.tsx`.
- Backend booking and event business logic in `backend/src/services/bookingService.js` and `eventService.js`; related repositories, booking validator, routes, controller, and error handler.
- Booking hooks and API client in `frontend/lib/hooks/useBookings.ts` and `frontend/lib/api/bookingsApi.js`.

**Execution note:** These are designed test cases based on the written rules and source inspection. They have not been run against a live application or database. Where source behavior conflicts with a documented rule, the expected result follows the rule and the observed discrepancy is called out for test triage.

**Test setup:** Use isolated test accounts A and B and resettable fixtures. Prefer one seeded static event and one event created by A. Avoid relying on shared demo-account state. For API cases, use authenticated requests unless the case explicitly tests missing or invalid authentication.

---

## Happy Path (TC-001–TC-099)

### TC-001: Complete a one-ticket booking
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in. A future event has at least one available seat.
**Steps**:
1. Open the event detail page.
2. Enter a valid customer name, email, and phone; leave quantity at 1.
3. Select **Confirm Booking**.
**Expected Results**:
- The request creates one confirmed booking for the selected event and user.
- The confirmation shows the booking reference, customer name, quantity 1, and total.
- The submit button shows pending state while the request is in progress.
**Business Rule**: Flow 3; booking confirmation records the requested tickets and price.
**Suggested Layer**: E2E

### TC-002: Complete a multi-ticket booking
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A is logged in. An event has at least 3 available seats.
**Steps**:
1. Open the event and increase quantity to 3.
2. Enter valid customer details and confirm the booking.
**Expected Results**: One booking is created with quantity 3, confirmed status, and total price equal to three times the per-ticket price.
**Business Rule**: Flow 3; `totalPrice = event.price × quantity`.
**Suggested Layer**: E2E

### TC-003: Continue from booking confirmation
**Category**: Happy Path
**Priority**: P2
**Preconditions**: A booking has just been confirmed.
**Steps**:
1. Select **View My Bookings**.
2. Return to the event page and make another booking; select **Browse More Events** on confirmation.
**Expected Results**: The first action navigates to `/bookings`; the second navigates to `/events`.
**Business Rule**: Flow 3 — post-confirmation navigation.
**Suggested Layer**: E2E

### TC-004: View the user's bookings
**Category**: Happy Path
**Priority**: P0
**Preconditions**: User A is logged in and has at least two bookings.
**Steps**:
1. Navigate to `/bookings`.
**Expected Results**:
- The page shows the user's booking cards with reference, status, event title, event date, quantity, city, booking date, total, and actions.
- Each card has **View Details** and, for confirmed bookings, **Cancel Booking**.
**Business Rule**: Flow 4 — users can view and manage their own bookings.
**Suggested Layer**: E2E

### TC-005: View booking details
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A owns a booking.
**Steps**:
1. Open `/bookings`.
2. Select **View Details** on the booking.
**Expected Results**: The detail page shows the booking reference/status, event details, customer details, ticket quantity, per-ticket price, total paid, booking date, and booking ID.
**Business Rule**: Flow 4 — booking details.
**Suggested Layer**: E2E

### TC-006: Find an owned booking by reference
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A owns a booking and knows its booking reference.
**Steps**:
1. Call `GET /api/bookings/ref/{ref}` with User A's token.
**Expected Results**: The API returns 200 and the matching booking, including its event details.
**Business Rule**: API Reference — GET booking by reference.
**Suggested Layer**: API

### TC-007: List bookings with pagination metadata
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A has bookings.
**Steps**:
1. Call `GET /api/bookings?page=1&limit=3`.
**Expected Results**: The response includes the current user's bookings and pagination metadata (`total`, `page`, `limit`, `totalPages`); no other user's records are included.
**Business Rule**: Flow 4; API Reference — paginated booking list.
**Suggested Layer**: API

### TC-008: Filter bookings by event and status
**Category**: Happy Path
**Priority**: P2
**Preconditions**: User A has bookings for two events.
**Steps**:
1. Request `GET /api/bookings?eventId={eventA}`.
2. Request `GET /api/bookings?status=confirmed`.
**Expected Results**: The first response contains only User A's bookings for event A. The second contains only User A's confirmed bookings.
**Business Rule**: API Reference — optional booking-list filters.
**Suggested Layer**: API

### TC-009: Cancel a booking from its card
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has a confirmed booking.
**Steps**:
1. On `/bookings`, select **Cancel Booking** on its card.
2. Confirm the cancellation.
**Expected Results**: The booking is deleted, a success toast is shown, and the updated list no longer contains it.
**Business Rule**: Flow 4; cancellation removes an individual booking.
**Suggested Layer**: E2E

### TC-010: Cancel a booking from its detail page
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A owns a confirmed booking.
**Steps**:
1. Open the booking detail page.
2. Select **Cancel Booking**, then confirm.
**Expected Results**: The booking is deleted, a success toast appears, and the user is returned to `/bookings`.
**Business Rule**: Flow 4 — cancel from booking details.
**Suggested Layer**: E2E

### TC-011: Clear all bookings
**Category**: Happy Path
**Priority**: P1
**Preconditions**: User A has multiple bookings.
**Steps**:
1. On `/bookings`, select **Clear all bookings**.
2. Accept the confirmation prompt.
**Expected Results**: All and only User A's bookings are deleted; the list becomes empty. The API reports the number of deleted records.
**Business Rule**: Flow 4; §4 — Clear All removes all of the user's bookings.
**Suggested Layer**: E2E

---

## Business Rules (TC-100–TC-199)

### TC-100: Calculate the booking total from ticket quantity
**Category**: Business Rule
**Priority**: P0
**Preconditions**: Event price and quantity are known; sufficient seats are available.
**Steps**:
1. Create a booking with quantity 4.
2. Compare the stored `totalPrice` with the event's per-ticket price.
**Expected Results**: `totalPrice` equals `event.price × 4`; the confirmation and booking detail show that total.
**Business Rule**: §9 — price calculation.
**Suggested Layer**: API

### TC-101: Generate a booking reference in the required format
**Category**: Business Rule
**Priority**: P1
**Preconditions**: An event titled `Tech Summit` has seats available.
**Steps**:
1. Create a booking for the event.
2. Inspect the returned reference.
**Expected Results**: The reference matches `T-[A-Z0-9]{6}` and its first letter is the uppercase first letter of the event title.
**Business Rule**: §1 and §7 — reference format and title prefix.
**Suggested Layer**: API

### TC-102: Booking status is confirmed on creation
**Category**: Business Rule
**Priority**: P1
**Preconditions**: A valid booking can be created.
**Steps**:
1. Create the booking.
2. Inspect it in the response, list, and detail view.
**Expected Results**: The status is `confirmed` in every representation.
**Business Rule**: Booking model — new bookings are confirmed.
**Suggested Layer**: API

### TC-103: Booking reduces the user's displayed seat availability
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has not booked the event; initial available seats are recorded.
**Steps**:
1. User A books 2 tickets.
2. Refetch the event and inspect availability for User A.
**Expected Results**: User A's available-seat count decreases by 2 after confirmation.
**Business Rule**: §1 and §6 — seat count updates after booking.
**Suggested Layer**: API

### TC-104: Seat availability is isolated by user
**Category**: Business Rule
**Priority**: P1
**Preconditions**: Users A and B can access the same static event with known initial capacity.
**Steps**:
1. User A books 2 tickets.
2. Fetch the event as User A and as User B.
**Expected Results**: User A sees their own quantity deducted; User B's personal booked quantity remains zero and their availability is not reduced by A's booking.
**Business Rule**: §2 and §6 — user sandbox isolation and per-user seat availability.
**Suggested Layer**: API

### TC-105: Book the same event more than once
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has enough personal seats remaining.
**Steps**:
1. Create one booking for the event.
2. Create a second booking for the same event.
**Expected Results**: Both bookings are allowed; both count toward User A's booked quantity and reduce that user's remaining seats.
**Business Rule**: §6 — the same user may book the same event multiple times.
**Suggested Layer**: API

### TC-106: Cancellation makes the booked quantity available again
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has a booking for 2 tickets.
**Steps**:
1. Record User A's event availability.
2. Cancel the booking and refetch the event.
**Expected Results**: The booking is removed and User A's available seats increase by 2.
**Business Rule**: §4 and §6 — cancellation frees seats; dynamic-event availability is computed from active bookings.
**Suggested Layer**: API

### TC-107: Clear All restores availability for all affected events
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has bookings on at least two events.
**Steps**:
1. Record each event's availability for User A.
2. Clear all of User A's bookings and refetch the event data.
**Expected Results**: The bookings are removed and each event's availability reflects the released quantities. Other users' bookings remain unchanged.
**Business Rule**: §4 and §6 — Clear All deletes the user's bookings and frees their seats.
**Suggested Layer**: API

### TC-108: The tenth booking replaces the oldest booking
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has 9 bookings created in a known order.
**Steps**:
1. Create a tenth valid booking.
2. Fetch User A's bookings and compare IDs/references.
**Expected Results**: The new booking exists, the oldest booking has been deleted, and the user's total remains at 9.
**Business Rule**: §4 — maximum 9 bookings with FIFO pruning.
**Suggested Layer**: API

### TC-109: FIFO pruning prefers a booking from another event
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has 9 bookings; the oldest is for event X; the new booking is for event X; another booking is for event Y.
**Steps**:
1. Create the tenth booking for event X.
2. Inspect which previous booking was removed.
**Expected Results**: The oldest booking not associated with event X is pruned before using the same-event fallback.
**Business Rule**: Discovered behavior in `bookingService.createBooking` — pruning prefers a different event.
**Suggested Layer**: API

### TC-110: Same-event FIFO fallback does not change shared event capacity
**Category**: Business Rule
**Priority**: P1
**Preconditions**: User A has 9 bookings, all for event X; User B can also access X. Record the event's persisted capacity and both users' availability.
**Steps**:
1. User A creates a tenth booking for X, triggering same-event fallback.
2. Inspect persisted capacity and availability for both users.
3. Cancel the new booking and inspect availability again.
**Expected Results**: FIFO replacement must not permanently decrement shared event capacity; User B's availability must not be changed by User A's replacement. Cancelling the new booking must restore User A's capacity.
**Business Rule**: §2, §4, and §6 — user isolation, FIFO, and seat restoration.
**Suggested Layer**: API

### TC-111: Deleting an owned event removes its bookings
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A created a dynamic event and has a booking for it.
**Steps**:
1. Delete the dynamic event using its owner account.
2. Query User A's bookings and attempt to fetch the deleted booking.
**Expected Results**: The event and associated booking are removed according to the configured cascade; the deleted booking cannot be fetched.
**Business Rule**: Flow 5 and User data-model relationship — event deletion cascades to bookings.
**Suggested Layer**: API

### TC-112: Static events are shared and cannot be edited or deleted
**Category**: Business Rule
**Priority**: P2
**Preconditions**: A seeded static event exists.
**Steps**:
1. Confirm both User A and User B can retrieve the static event.
2. Attempt to update and delete it through the event API.
**Expected Results**: Both users can access it; update/delete attempts are rejected with 403 and the static event remains unchanged.
**Business Rule**: §2 and §3 — static events are shared and immutable.
**Suggested Layer**: API

### TC-113: Booking count remains within the sandbox limit after cancellation
**Category**: Business Rule
**Priority**: P2
**Preconditions**: User A has exactly 9 bookings.
**Steps**:
1. Cancel one booking.
2. Create a valid new booking.
3. Fetch the booking list.
**Expected Results**: The cancellation immediately leaves an available booking slot; the new booking is created without pruning another booking; total count returns to 9.
**Business Rule**: §4 — maximum 9 bookings; cancellation deletes a booking.
**Suggested Layer**: API

---

## Security (TC-200–TC-299)

### TC-200: Booking endpoints require authentication
**Category**: Security
**Priority**: P0
**Preconditions**: No valid JWT is supplied.
**Steps**:
1. Call the booking list, detail, reference lookup, create, cancel, and Clear All endpoints without an Authorization token.
**Expected Results**: Each endpoint rejects the request with 401; no booking is read, created, or deleted.
**Business Rule**: API Reference — booking endpoints require authentication; `bookingRoutes.js` applies auth middleware to the router.
**Suggested Layer**: API

### TC-201: Unauthenticated user cannot access the bookings page
**Category**: Security
**Priority**: P1
**Preconditions**: User is logged out or has no token.
**Steps**:
1. Navigate directly to `/bookings`.
2. Navigate directly to `/bookings/{id}`.
**Expected Results**: The auth guard does not expose booking information and directs the user through the application's unauthenticated flow.
**Business Rule**: §2 — bookings are scoped to an authenticated user.
**Suggested Layer**: E2E

### TC-202: User B cannot read User A's booking by ID
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns a booking; User B has a valid token.
**Steps**:
1. As User B, request `GET /api/bookings/{userA_booking_id}`.
2. As User B, open `/bookings/{userA_booking_id}` in the UI.
**Expected Results**: The API denies access (documented contract: 403); the UI shows **Access Denied** and does not reveal booking or customer details.
**Business Rule**: §2 and Flow 6 — cross-user booking access is forbidden. Source inspection indicates the GET service returns 403 for an existing booking owned by another user.
**Suggested Layer**: API

### TC-203: User B cannot read User A's booking by reference
**Category**: Security
**Priority**: P1
**Preconditions**: User A owns a booking and User B knows its reference.
**Steps**:
1. As User B, call `GET /api/bookings/ref/{userA_ref}`.
**Expected Results**: The request is rejected with 403 and no booking/customer data is returned.
**Business Rule**: §2 — booking ownership applies to reference lookup.
**Suggested Layer**: API

### TC-204: Booking list is isolated to the authenticated owner
**Category**: Security
**Priority**: P0
**Preconditions**: Users A and B each have distinct bookings.
**Steps**:
1. Fetch `/api/bookings` and `/bookings` as User A.
2. Repeat as User B.
**Expected Results**: Each API response and UI list contains only the authenticated user's bookings.
**Business Rule**: §2 — each user sees only their own bookings.
**Suggested Layer**: API

### TC-205: User B cannot cancel User A's booking
**Category**: Security
**Priority**: P0
**Preconditions**: User A owns a confirmed booking; User B has its numeric ID.
**Steps**:
1. As User B, call `DELETE /api/bookings/{userA_booking_id}`.
2. Verify the booking still exists for User A.
**Expected Results**: The request is denied and User A's booking remains intact. The documented cross-user contract says 403; source inspection suggests the current cancel lookup may return 404 because it filters by both booking ID and owner.
**Business Rule**: §2 and Flow 6 — only the owner may cancel.
**Suggested Layer**: API

### TC-206: Clear All cannot delete another user's bookings
**Category**: Security
**Priority**: P0
**Preconditions**: Both users have bookings.
**Steps**:
1. As User A, call `DELETE /api/bookings`.
2. Fetch the booking list as both users.
**Expected Results**: Only User A's bookings are deleted; User B's records are unchanged.
**Business Rule**: §2 and §4 — Clear All is scoped to the caller.
**Suggested Layer**: API

### TC-207: User B cannot book User A's private event
**Category**: Security
**Priority**: P1
**Preconditions**: User A owns a dynamic event that is not shared with User B.
**Steps**:
1. As User B, request the event detail.
2. Attempt `POST /api/bookings` using User A's event ID.
**Expected Results**: The event is not accessible to User B and no booking is created.
**Business Rule**: §2 — user-created events and bookings are isolated by user.
**Suggested Layer**: API

### TC-208: Invalid or expired token does not authorize booking operations
**Category**: Security
**Priority**: P1
**Preconditions**: A malformed, tampered, or expired token is available.
**Steps**:
1. Use the token to request booking details and attempt to cancel a booking.
**Expected Results**: Requests are rejected as unauthenticated; no booking data is exposed or changed.
**Business Rule**: JWT authentication; API Reference — missing/invalid auth is rejected.
**Suggested Layer**: API

### TC-209: Booking operations do not trust a caller-supplied user ID
**Category**: Security
**Priority**: P1
**Preconditions**: User A and User B have valid tokens; User A owns a booking.
**Steps**:
1. As User B, submit a booking request containing an extra `userId` set to User A's ID.
2. Inspect ownership of the created booking.
**Expected Results**: The booking is attributed to the authenticated caller (User B), or the unsupported field is rejected; the caller cannot create a booking as User A.
**Business Rule**: §2 — ownership comes from authenticated user context.
**Suggested Layer**: API

---

## Negative (TC-300–TC-399)

### TC-300: Reject booking with missing required fields
**Category**: Negative
**Priority**: P1
**Preconditions**: User A is authenticated.
**Steps**:
1. Submit `POST /api/bookings` with one or more required fields omitted.
**Expected Results**: The API returns 400 with validation details naming invalid/missing fields; no booking is created and no seats are consumed.
**Business Rule**: API Reference — missing required fields return validation errors.
**Suggested Layer**: API

### TC-301: Reject an invalid or non-positive event ID
**Category**: Negative
**Priority**: P1
**Preconditions**: User A is authenticated.
**Steps**:
1. Submit a booking with event ID missing, zero, negative, fractional, or non-numeric.
**Expected Results**: Invalid IDs are rejected with 400; no booking is created.
**Business Rule**: `bookingValidator.js` — event ID must be a positive integer.
**Suggested Layer**: API

### TC-302: Reject customer names shorter than two characters
**Category**: Negative
**Priority**: P2
**Preconditions**: A bookable event exists.
**Steps**:
1. Submit a booking with a one-character name.
2. Repeat with a whitespace-padded one-character name.
**Expected Results**: Both inputs are rejected; the backend trims before checking minimum length and creates no booking.
**Business Rule**: Booking model and `bookingValidator.js` — minimum customer name length is 2.
**Suggested Layer**: API

### TC-303: Reject malformed customer email
**Category**: Negative
**Priority**: P1
**Preconditions**: A bookable event exists.
**Steps**:
1. Submit booking requests with missing, malformed, and whitespace-containing email values.
**Expected Results**: Each invalid address is rejected with 400; no booking is created.
**Business Rule**: Booking model and `bookingValidator.js` — customer email must be valid.
**Suggested Layer**: API

### TC-304: Reject invalid customer phone
**Category**: Negative
**Priority**: P1
**Preconditions**: A bookable event exists.
**Steps**:
1. Submit phone values shorter than 10 characters and values containing letters or punctuation outside the permitted set.
**Expected Results**: Invalid values are rejected with 400 and the error identifies the phone field.
**Business Rule**: Booking model and `bookingValidator.js` — phone requires at least 10 permitted characters.
**Suggested Layer**: API

### TC-305: Reject quantity outside the 1–10 integer range
**Category**: Negative
**Priority**: P1
**Preconditions**: A bookable event exists with sufficient seats.
**Steps**:
1. Submit quantities 0, -1, 11, and 1.5.
**Expected Results**: Each request is rejected with 400; no booking is created and event availability is unchanged.
**Business Rule**: Booking model and `bookingValidator.js` — quantity is an integer from 1 through 10.
**Suggested Layer**: API

### TC-306: Reject booking for an event that does not exist
**Category**: Negative
**Priority**: P1
**Preconditions**: User A is authenticated and has fewer than 9 bookings.
**Steps**:
1. Submit a valid booking body with an unknown event ID.
**Expected Results**: The API returns 404 and does not create a booking.
**Business Rule**: Booking must refer to an existing static event or the caller's event.
**Suggested Layer**: API

### TC-307: Reject booking when requested seats exceed availability
**Category**: Negative
**Priority**: P0
**Preconditions**: The event has 2 seats available to User A.
**Steps**:
1. Submit a booking for 3 tickets.
**Expected Results**: The API returns 400 with an insufficient-seats error; no booking is created and no seat count is reduced.
**Business Rule**: §6; API Reference — insufficient seats return 400.
**Suggested Layer**: API

### TC-308: Reject lookup of a booking that does not exist
**Category**: Negative
**Priority**: P2
**Preconditions**: User A is authenticated.
**Steps**:
1. Request a numeric booking ID that does not exist.
2. Request a reference that does not exist.
**Expected Results**: Both requests return 404 and do not reveal another user's records.
**Business Rule**: API Reference — not-found booking lookups.
**Suggested Layer**: API

### TC-309: Reject cancellation of a non-existent booking
**Category**: Negative
**Priority**: P2
**Preconditions**: User A is authenticated.
**Steps**:
1. Call `DELETE /api/bookings/{unknown_id}`.
**Expected Results**: The API returns 404; no unrelated booking is deleted.
**Business Rule**: Flow 4 — cancellation targets an existing booking owned by the caller.
**Suggested Layer**: API

### TC-310: Reject a second cancellation of the same booking
**Category**: Negative
**Priority**: P2
**Preconditions**: User A owns a booking.
**Steps**:
1. Cancel the booking.
2. Repeat the same DELETE request.
**Expected Results**: The first request succeeds; the second returns 404 and does not alter other bookings or seat counts.
**Business Rule**: Cancellation deletes the individual booking.
**Suggested Layer**: API

### TC-311: Failed tenth booking must not silently discard an existing booking
**Category**: Negative
**Priority**: P1
**Preconditions**: User A has 9 bookings; preserve the oldest booking ID. Prepare a tenth request that will fail because the event does not exist or lacks sufficient seats.
**Steps**:
1. Submit the invalid tenth booking.
2. Fetch User A's bookings and inspect the previously oldest booking.
**Expected Results**: The failed booking request must leave all 9 existing bookings unchanged. **Source discrepancy to verify:** `createBooking` currently prunes before checking event existence and seat availability, so the oldest booking may already be deleted.
**Business Rule**: §4 — FIFO replacement is for a new booking; rejected requests must not destroy an existing booking.
**Suggested Layer**: API

### TC-312: Reject separator-only phone values
**Category**: Negative
**Priority**: P2
**Preconditions**: A bookable event exists.
**Steps**:
1. Submit a phone consisting only of permitted separators, such as `----------`.
**Expected Results**: The request should be rejected because it contains no phone digits. **Source discrepancy to verify:** current backend validation checks permitted characters and string length, so a separator-only value may pass.
**Business Rule**: Booking model — phone must contain at least 10 digits (not merely 10 characters).
**Suggested Layer**: API

### TC-313: Whitespace-only customer fields are rejected
**Category**: Negative
**Priority**: P2
**Preconditions**: A bookable event exists.
**Steps**:
1. Submit a whitespace-only name, email, and phone in separate requests.
**Expected Results**: Each request is rejected and no booking is created.
**Business Rule**: Booking model and `bookingValidator.js` — required customer fields must be meaningful after trimming.
**Suggested Layer**: API

### TC-314: Handle a malformed booking ID without an internal server error
**Category**: Negative
**Priority**: P2
**Preconditions**: User A is authenticated.
**Steps**:
1. Request `GET /api/bookings/not-a-number`.
2. Request `DELETE /api/bookings/not-a-number`.
**Expected Results**: Invalid path IDs are rejected as a client error (400 or 404) and do not produce a 500. **Source discrepancy to verify:** repository methods convert IDs with `Number(id)` without an explicit route guard.
**Business Rule**: API routes accept numeric booking IDs; malformed input should not become an internal error.
**Suggested Layer**: API

---

## Edge Case (TC-400–TC-499)

### TC-400: Book the minimum quantity
**Category**: Edge Case
**Priority**: P2
**Preconditions**: At least 1 seat is available.
**Steps**:
1. Create a booking with quantity 1.
**Expected Results**: Booking succeeds; quantity is 1 and total price equals one ticket's price.
**Business Rule**: §3 — quantity range starts at 1.
**Suggested Layer**: API

### TC-401: Book the maximum quantity
**Category**: Edge Case
**Priority**: P2
**Preconditions**: At least 10 seats are available to User A.
**Steps**:
1. Create a booking with quantity 10.
**Expected Results**: Booking succeeds with quantity 10 and correct total price.
**Business Rule**: Booking model and validator — maximum quantity is 10.
**Suggested Layer**: API

### TC-402: Book exactly the remaining seats
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A has exactly 3 seats remaining for an event.
**Steps**:
1. Book exactly 3 tickets.
**Expected Results**: Booking succeeds; User A's remaining availability becomes zero.
**Business Rule**: §6 — booking is allowed when requested quantity equals available quantity.
**Suggested Layer**: API

### TC-403: Request one ticket more than the remaining seats
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A has exactly 3 seats remaining.
**Steps**:
1. Request 4 tickets.
**Expected Results**: Request fails with insufficient seats; the existing 3-seat availability is unchanged.
**Business Rule**: §6 — users cannot book more seats than are available to them.
**Suggested Layer**: API

### TC-404: Sold-out event prevents UI submission
**Category**: Edge Case
**Priority**: P1
**Preconditions**: Event availability for User A is zero.
**Steps**:
1. Open the event detail page.
2. Inspect the ticket selector and submit control.
**Expected Results**: Event is shown as sold out and the booking submit control is disabled; the API must also reject a direct booking attempt.
**Business Rule**: Flow 3 and §6 — no booking beyond available seats.
**Suggested Layer**: E2E

### TC-405: Ticket selector respects both remaining seats and the quantity cap
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Event has 4 seats available to User A.
**Steps**:
1. Open the event detail page.
2. Increase quantity repeatedly.
**Expected Results**: Quantity cannot exceed 4; the displayed maximum is the smaller of remaining seats and 10.
**Business Rule**: Flow 3 — quantity 1–10, constrained by availability.
**Suggested Layer**: Component

### TC-406: Exactly nine bookings do not trigger FIFO pruning
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has 8 bookings.
**Steps**:
1. Create the ninth valid booking.
2. Compare the set of booking IDs before and after.
**Expected Results**: The ninth booking is added and none of the first eight is pruned; total is exactly 9.
**Business Rule**: §4 — pruning begins when the limit is reached for the next booking.
**Suggested Layer**: API

### TC-407: Booking list page-size behavior at the documented limit
**Category**: Edge Case
**Priority**: P2
**Preconditions**: User A has 9 bookings.
**Steps**:
1. Open `/bookings` and inspect the request limit and visible booking cards.
**Expected Results**: All 9 bookings are visible with correct pagination. **Specification mismatch to resolve:** the UI requests `limit: 10`, while §4 says the page shows at most 9.
**Business Rule**: §4 — bookings page shows max 9 bookings at a time.
**Suggested Layer**: E2E

### TC-408: Clear All with no bookings
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has zero bookings.
**Steps**:
1. Call `DELETE /api/bookings`.
**Expected Results**: The request succeeds with a deleted count of 0; it does not affect other users.
**Business Rule**: §4 — Clear All removes the caller's bookings.
**Suggested Layer**: API

### TC-409: Booking with a free event
**Category**: Edge Case
**Priority**: P2
**Preconditions**: A future event has price 0 and available seats.
**Steps**:
1. Create a booking for 2 tickets.
**Expected Results**: Booking succeeds with total price 0 and confirmed status.
**Business Rule**: Event price may be zero; §9 — total is price multiplied by quantity.
**Suggested Layer**: API

### TC-410: Booking for a fractional ticket price
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Event price is a fractional amount such as 99.50.
**Steps**:
1. Book 2 tickets.
2. Compare stored, API, confirmation, and detail totals.
**Expected Results**: Stored/API total equals 199.00 and user-visible representations preserve the correct cents. **Source discrepancy to verify:** booking and detail pages format prices with zero maximum fraction digits.
**Business Rule**: §9 — total price is exact per-ticket price times quantity.
**Suggested Layer**: API

### TC-411: Booking reference remains valid for unusual event-title prefixes
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Create events whose titles begin with a lowercase letter, a digit, and an emoji/astral character.
**Steps**:
1. Create one booking for each event.
2. Validate the returned reference against the documented format and title-prefix rule.
**Expected Results**: Each reference is unique and has a valid prefix that does not contain a broken Unicode surrogate. Clarify the expected prefix policy for titles beginning with non-letters.
**Business Rule**: §7 — reference prefix and format.
**Suggested Layer**: Unit

### TC-412: Booking reference collision retry preserves uniqueness
**Category**: Edge Case
**Priority**: P2
**Preconditions**: Unit test can control the random reference generator/repository collision result.
**Steps**:
1. Simulate an initial generated reference that already exists.
2. Allow the next generated reference to be unused.
**Expected Results**: The service retries and creates a booking with a unique reference matching the required format.
**Business Rule**: §7 — booking references are guaranteed unique with collision retry.
**Suggested Layer**: Unit

### TC-413: Concurrent requests do not exceed booking or seat limits
**Category**: Edge Case
**Priority**: P1
**Preconditions**: User A has 8 bookings; event X has capacity for only one more requested ticket. Prepare two simultaneous valid booking requests.
**Steps**:
1. Send both requests concurrently.
2. Inspect final booking count and event availability.
**Expected Results**: At most one request succeeds where capacity permits only one; the final booking count never exceeds 9 and seats are not overbooked. **Risk to verify:** current service performs count/prune/check/create without a transaction or lock.
**Business Rule**: §4 and §6 — booking limit and seat availability remain invariant.
**Suggested Layer**: API

### TC-414: Out-of-range booking-list page is handled consistently
**Category**: Edge Case
**Priority**: P3
**Preconditions**: User A has fewer bookings than a requested later page can contain.
**Steps**:
1. Navigate to `/bookings?page=2`.
2. Compare the page state with the total booking count.
**Expected Results**: The UI must not imply that the user has no bookings when records exist on another page; it should show an explicit empty-page state or navigate to a valid page. **Source behavior to verify:** the current list renders the general "No bookings yet" empty state for an empty page.
**Business Rule**: Flow 4 — accurate booking-list state.
**Suggested Layer**: E2E

---

## UI State (TC-500–TC-599)

### TC-500: Empty bookings state
**Category**: UI State
**Priority**: P1
**Preconditions**: User A has no bookings.
**Steps**:
1. Open `/bookings`.
2. Select **Browse Events**.
**Expected Results**: The page displays **No bookings yet** and a browse-events action; the action navigates to `/events`.
**Business Rule**: Flow 4 — empty-list state.
**Suggested Layer**: E2E

### TC-501: Bookings list loading state
**Category**: UI State
**Priority**: P3
**Preconditions**: Delay the bookings-list API response.
**Steps**:
1. Open `/bookings` while the response is delayed.
**Expected Results**: Booking-card skeletons display during loading and are replaced by data when the request completes.
**Business Rule**: Discovered UI behavior in `bookings/page.tsx`.
**Suggested Layer**: E2E

### TC-502: Bookings list error state and retry
**Category**: UI State
**Priority**: P2
**Preconditions**: Mock the booking-list request to fail once and then succeed.
**Steps**:
1. Open `/bookings`.
2. Select **Retry**.
**Expected Results**: The page shows an error state with a Retry action; the successful retry renders bookings.
**Business Rule**: Discovered UI behavior in `bookings/page.tsx`.
**Suggested Layer**: E2E

### TC-503: Booking detail loading state
**Category**: UI State
**Priority**: P3
**Preconditions**: Delay `GET /api/bookings/{id}`.
**Steps**:
1. Open a booking detail route.
**Expected Results**: A loading spinner appears until the detail response resolves.
**Business Rule**: Discovered UI behavior in `bookings/[id]/page.tsx`.
**Suggested Layer**: E2E

### TC-504: Detail page distinguishes forbidden and missing bookings
**Category**: UI State
**Priority**: P1
**Preconditions**: Prepare one booking owned by User B and one nonexistent booking ID; use User A.
**Steps**:
1. Open the other user's booking detail.
2. Open the nonexistent booking detail.
**Expected Results**: The forbidden case shows **Access Denied** without disclosing details; the missing case shows **Booking not found**.
**Business Rule**: §2 and Flow 6 — cross-user access is denied.
**Suggested Layer**: E2E

### TC-505: Refund check for one ticket
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a booking with quantity 1.
**Steps**:
1. Open the booking detail page.
2. Select **Check eligibility for refund?** and observe the page for 4 seconds.
**Expected Results**: A checking spinner and explanatory text appear, then an eligible result states that single-ticket bookings qualify for a full refund.
**Business Rule**: §8 — client-side refund eligibility and 4-second delay.
**Suggested Layer**: Component

### TC-506: Refund check for a group booking
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a booking with quantity greater than 1.
**Steps**:
1. Open the detail page and start the refund check.
2. Wait for the 4-second check to complete.
**Expected Results**: The result states the group quantity and that group bookings are non-refundable.
**Business Rule**: §8 — bookings for more than one ticket are ineligible.
**Suggested Layer**: Component

### TC-507: Dismiss booking cancellation confirmation
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a confirmed booking.
**Steps**:
1. Open the cancellation confirmation from a card.
2. Dismiss it using the cancel/close action.
**Expected Results**: The dialog closes, no DELETE request is sent, the booking remains, and no seat availability changes.
**Business Rule**: Flow 4 — cancellation requires user confirmation.
**Suggested Layer**: Component

### TC-508: Cancellation pending state prevents duplicate action
**Category**: UI State
**Priority**: P2
**Preconditions**: Delay the cancellation API response.
**Steps**:
1. Confirm cancellation.
2. While the request is pending, inspect and interact with the dialog controls.
**Expected Results**: The confirm action indicates loading and cannot trigger a duplicate cancellation; dialog dismissal follows the pending-state behavior.
**Business Rule**: Discovered UI behavior in `BookingCard.jsx` and `ConfirmDialog`.
**Suggested Layer**: Component

### TC-509: Cancellation API error is visible to the user
**Category**: UI State
**Priority**: P2
**Preconditions**: Mock cancellation to return an error.
**Steps**:
1. Confirm cancellation from a booking card.
**Expected Results**: An error toast is shown, the dialog closes, and the booking remains in the list.
**Business Rule**: Discovered UI behavior in `BookingCard.jsx`.
**Suggested Layer**: E2E

### TC-510: Clear All confirmation can be dismissed safely
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has bookings.
**Steps**:
1. Select **Clear all bookings**.
2. Decline the browser confirmation.
**Expected Results**: No DELETE request is sent and all bookings remain.
**Business Rule**: Flow 4 — destructive bulk action requires confirmation.
**Suggested Layer**: E2E

### TC-511: Clear All pending state and API failure feedback
**Category**: UI State
**Priority**: P2
**Preconditions**: Delay the Clear All API response, then separately configure it to fail.
**Steps**:
1. Accept the Clear All confirmation and inspect the control while pending.
2. Repeat with the API returning an error.
**Expected Results**: The control changes to **Clearing…** and is disabled while pending. On failure, a visible error is presented and the user's bookings remain. **Source discrepancy:** current handler resets the pending state in `finally` but has no error notification/catch.
**Business Rule**: Flow 4 — user should receive an accurate result for a destructive action.
**Suggested Layer**: E2E

### TC-512: Bookings sandbox warning appears at the documented threshold
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has a booking count near the 9-booking limit, then a low booking count for comparison.
**Steps**:
1. Open `/bookings` with a near-limit count.
2. Repeat with a low count.
**Expected Results**: A conditional booking-limit warning appears near the limit and is hidden at low counts, as specified in `business-rules.md` §5. **Source discrepancy:** no such banner is present in the current `bookings/page.tsx`.
**Business Rule**: §5 — conditional sandbox warning on the bookings page.
**Suggested Layer**: E2E

### TC-513: Clear All visibility when there are no bookings
**Category**: UI State
**Priority**: P3
**Preconditions**: User A has no bookings.
**Steps**:
1. Open `/bookings`.
**Expected Results**: Follow the selector contract: hide Clear All when there are no bookings. **Source discrepancy:** the current page renders the Clear All control regardless of booking count.
**Business Rule**: `ui-selectors.md` — Clear All is visible when bookings exist.
**Suggested Layer**: E2E

### TC-514: Clear All refreshes booking and event availability views
**Category**: UI State
**Priority**: P2
**Preconditions**: User A has a booking and has already loaded event data into the client cache.
**Steps**:
1. Clear all bookings.
2. Navigate to the event list without a full page reload.
**Expected Results**: Booking list is empty and event availability reflects released seats. **Source discrepancy to verify:** Clear All refetches bookings but does not invalidate the events query, unlike the individual cancel mutation.
**Business Rule**: §4 and §6 — deleted bookings release seats and views stay consistent.
**Suggested Layer**: E2E

---

## Coverage overview

| Category | Scenario IDs | Count |
|----------|--------------|------:|
| Happy Path | TC-001–TC-011 | 11 |
| Business Rule | TC-100–TC-113 | 14 |
| Security | TC-200–TC-209 | 10 |
| Negative | TC-300–TC-314 | 15 |
| Edge Case | TC-400–TC-414 | 15 |
| UI State | TC-500–TC-514 | 15 |
| **Total** | | **80** |

> Suggested follow-up: execute API cases against a disposable database and E2E/component cases against the running application; triage each source discrepancy before treating it as an accepted contract.
