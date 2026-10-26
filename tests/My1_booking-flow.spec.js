import { test, expect } from '@playwright/test';

const BASE_URL      = 'https://eventhub.rahulshettyacademy.com';
const USER_EMAIL    = 'rahulshetty1@gmail.com';
const USER_PASSWORD = 'Magiclife1!';

// Customer data entered on the booking form
const CUSTOMER_EMAIL = 'booking.flow@example.com';
const CUSTOMER_PHONE = '9876543210';
const TICKET_COUNT   = 2;

// ── Helpers ────────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByPlaceholder('you@email.com').fill(USER_EMAIL);
  await page.getByLabel('Password').fill(USER_PASSWORD);
  await page.locator('#login-btn').click();
  // Home page "Browse Events" link confirms successful auth
  await expect(page.getByRole('link', { name: /Browse Events/i }).first()).toBeVisible();
}

/**
 * Removes all bookings for the logged-in user so each test starts clean.
 * Waits for the list to settle (cards OR empty state) before deciding.
 */
async function clearBookings(page) {
  await page.goto(`${BASE_URL}/bookings`);

  const emptyState = page.getByText('No bookings yet');
  const firstCard  = page.getByTestId('booking-card').first();
  await expect(emptyState.or(firstCard)).toBeVisible();
  if (await emptyState.isVisible()) return;

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear all bookings' }).click();
  await expect(emptyState).toBeVisible();
}

/**
 * Books TICKET_COUNT tickets for the first bookable event.
 * Returns { bookingRef, eventTitle, customerName } from the confirmation card.
 * Precondition: user is logged in.
 */
async function bookEvent(page) {
  const customerName = `Flow Tester ${Date.now()}`;

  await page.goto(`${BASE_URL}/events`);

  // First card whose button reads "Book Now" (skips sold-out events)
  const bookableCard = page.getByTestId('event-card').filter({
    has: page.getByTestId('book-now-btn').filter({ hasText: 'Book Now' }),
  }).first();
  await expect(bookableCard).toBeVisible();

  const eventTitle = (await bookableCard.locator('h3').textContent())?.trim() ?? '';
  console.log(`Booking event: "${eventTitle}"`);

  await bookableCard.getByTestId('book-now-btn').click();
  await expect(page).toHaveURL(/\/events\/\d+/);

  // Raise quantity from the default of 1
  for (let i = 1; i < TICKET_COUNT; i++) {
    await page.getByRole('button', { name: '+' }).click();
  }
  await expect(page.locator('#ticket-count')).toHaveText(String(TICKET_COUNT));

  await page.getByLabel('Full Name').fill(customerName);
  await page.locator('#customer-email').fill(CUSTOMER_EMAIL);
  await page.getByPlaceholder('+91 98765 43210').fill(CUSTOMER_PHONE);
  await page.locator('.confirm-booking-btn').click();

  const refEl = page.locator('.booking-ref').first();
  await expect(refEl).toBeVisible();
  const bookingRef = (await refEl.textContent())?.trim() ?? '';
  console.log(`Booking confirmed. Ref: ${bookingRef}`);

  return { bookingRef, eventTitle, customerName };
}

/** Opens the detail page for a booking via its card's "View Details" link. */
async function openBookingDetail(page, bookingRef) {
  await page.goto(`${BASE_URL}/bookings`);
  const card = page.getByTestId('booking-card').filter({ hasText: bookingRef });
  await card.getByRole('link', { name: 'View Details' }).click();
  await expect(page).toHaveURL(/\/bookings\/\d+$/);
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('Booking Flow — Critical E2E Journeys', () => {

  // TC-001 ───────────────────────────────────────────────────────────────────
  test('TC-001: bookings list shows card with ref, event, tickets and actions', async ({ page }) => {
    // -- Step 1: Login, reset state, create a booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef, eventTitle } = await bookEvent(page);

    // -- Step 2: Navigate to My Bookings --
    await page.goto(`${BASE_URL}/bookings`);
    await expect(page.getByRole('heading', { name: 'My Bookings' })).toBeVisible();

    // -- Step 3: Assert exactly one card with the expected content --
    const cards = page.getByTestId('booking-card');
    await expect(cards).toHaveCount(1);

    const card = cards.filter({ hasText: bookingRef });
    await expect(card.locator('.booking-ref')).toHaveText(bookingRef);
    await expect(card).toContainText(eventTitle);
    await expect(card).toContainText('confirmed');
    await expect(card).toContainText(`${TICKET_COUNT} tickets`);
    await expect(card.getByTestId('booking-id')).toHaveText(/^#\d+$/);

    // -- Step 4: Assert card actions are available --
    await expect(card.getByRole('link', { name: 'View Details' })).toBeVisible();
    await expect(card.getByTestId('cancel-booking-btn')).toBeVisible();
  });

  // TC-002 ───────────────────────────────────────────────────────────────────
  test('TC-002: booking detail page shows ref, event, customer and payment sections', async ({ page }) => {
    // -- Step 1: Login, reset state, create a booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef, eventTitle, customerName } = await bookEvent(page);

    // -- Step 2: Open the detail page via View Details --
    await openBookingDetail(page, bookingRef);

    // -- Step 3: Verify header — ref badge, status and event title --
    await expect(page.locator('span.font-mono.font-bold')).toHaveText(bookingRef);
    await expect(page.getByRole('main').getByText('confirmed', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(eventTitle);

    // -- Step 4: Verify breadcrumb links back and shows the ref --
    // Scoped to <main> — the top navbar also has a "My Bookings" link
    const breadcrumb = page.getByRole('main').getByRole('navigation');
    await expect(breadcrumb.getByRole('link', { name: 'My Bookings' })).toBeVisible();
    await expect(breadcrumb).toContainText(bookingRef);

    // -- Step 5: Verify every section heading is rendered --
    for (const section of ['Event Details', 'Customer Details', 'Payment Summary', 'Refund', 'Booking Information']) {
      await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
    }

    // -- Step 6: Verify customer details match what was entered --
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();
    await expect(page.getByText(CUSTOMER_EMAIL, { exact: true })).toBeVisible();
    await expect(page.getByText(CUSTOMER_PHONE, { exact: true })).toBeVisible();

    // -- Step 7: Verify payment summary and refund entry point --
    await expect(page.getByText('Total Paid')).toBeVisible();
    await expect(page.locator('#check-refund-btn')).toBeVisible();
  });

  // TC-003 ───────────────────────────────────────────────────────────────────
  test('TC-003: cancelling from detail page shows toast, redirects and removes booking', async ({ page }) => {
    // -- Step 1: Login, reset state, create a booking --
    await login(page);
    await clearBookings(page);
    const { bookingRef } = await bookEvent(page);

    // -- Step 2: Open the detail page --
    await openBookingDetail(page, bookingRef);

    // -- Step 3: Open the cancel confirmation dialog --
    await page.getByRole('button', { name: 'Cancel Booking' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this booking?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Cancelling ${bookingRef} will release ${TICKET_COUNT} seat(s)`);

    // -- Step 4: Confirm cancellation --
    await dialog.getByTestId('confirm-dialog-yes').click();

    // -- Step 5: Assert success toast and redirect to list --
    await expect(page.getByText('Booking cancelled successfully')).toBeVisible();
    await expect(page).toHaveURL(`${BASE_URL}/bookings`);

    // -- Step 6: Assert the booking is gone --
    await expect(page.getByTestId('booking-card').filter({ hasText: bookingRef })).toHaveCount(0);
    await expect(page.getByText('No bookings yet')).toBeVisible();
  });

});
