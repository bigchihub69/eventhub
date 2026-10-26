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
  await expect(page.getByRole('link', { name: 'Browse Events →' })).toBeVisible();
}

/**
 * Removes all bookings for the logged-in user so the test starts clean.
 * Waits for the list to settle (cards OR empty state) before deciding.
 */
async function clearBookings(page) {
  await page.goto(`${BASE_URL}/bookings`);

  const emptyState = page.getByRole('heading', { name: 'No bookings yet' });
  const firstCard  = page.getByTestId('booking-card').first();
  await expect(emptyState.or(firstCard)).toBeVisible();
  if (await emptyState.isVisible()) return;

  // "Clear all bookings" uses a native confirm() dialog
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear all bookings' }).click();
  await expect(emptyState).toBeVisible();
}

/** Parses a USD display string such as "$1,499" into a number. */
const parsePrice = (text) => Number(text.replace(/[^0-9.]/g, ''));

/**
 * Books TICKET_COUNT tickets for the first bookable event.
 * Returns { bookingRef, eventTitle, pricePerTicket } for later assertions.
 * Precondition: user is logged in.
 */
async function bookFirstAvailableEvent(page) {
  await page.goto(`${BASE_URL}/events`);

  // First card whose button reads "Book Now" (skips sold-out events)
  const eventCard = page.getByTestId('event-card').filter({
    has: page.getByTestId('book-now-btn').filter({ hasText: 'Book Now' }),
  }).first();
  await expect(eventCard).toBeVisible();

  const eventTitle     = (await eventCard.getByRole('heading', { level: 3 }).textContent()).trim();
  const pricePerTicket = parsePrice(await eventCard.getByText(/^\$[\d,.]+$/).textContent());
  console.log(`Booking event: "${eventTitle}" at $${pricePerTicket}/ticket`);

  await eventCard.getByTestId('book-now-btn').click();
  await expect(page).toHaveURL(/\/events\/\d+$/);

  // Raise quantity from the default of 1
  for (let i = 1; i < TICKET_COUNT; i++) {
    await page.getByRole('button', { name: '+' }).click();
  }
  await expect(page.locator('#ticket-count')).toHaveText(String(TICKET_COUNT));

  await page.getByLabel('Full Name').fill(`Flow Tester ${Date.now()}`);
  await page.getByTestId('customer-email').fill(CUSTOMER_EMAIL);
  await page.getByPlaceholder('+91 98765 43210').fill(CUSTOMER_PHONE);
  await page.locator('.confirm-booking-btn').click();

  await expect(page.getByRole('heading', { name: /Booking Confirmed/ })).toBeVisible();
  const bookingRef = (await page.locator('.booking-ref').first().textContent()).trim();
  console.log(`Booking confirmed. Ref: ${bookingRef}`);

  return { bookingRef, eventTitle, pricePerTicket };
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

test.describe('Booking Flow — Bookings List', () => {

  // TC-001 (docs/test-strategy.md — first E2E critical happy path)
  test('TC-001: bookings list shows the new booking card with ref, event, tickets, price and actions', async ({ page }) => {
    // -- Step 1: Log in and start from an empty bookings list --
    await login(page);
    await clearBookings(page);

    // -- Step 2: Create a booking through the UI --
    const { bookingRef, eventTitle, pricePerTicket } = await bookFirstAvailableEvent(page);

    // -- Step 3: Open My Bookings --
    await page.goto(`${BASE_URL}/bookings`);
    await expect(page.getByRole('heading', { name: 'My Bookings', level: 1 })).toBeVisible();

    // -- Step 4: Exactly one card, matching the booking just made --
    const cards = page.getByTestId('booking-card');
    await expect(cards).toHaveCount(1);
    const card = cards.filter({ has: page.locator('.booking-ref', { hasText: bookingRef }) });
    await expect(card).toBeVisible();

    // -- Step 5: Ref format and first-letter rule --
    // Business rule: ref first character = event title first character (uppercase)
    await expect(card.locator('.booking-ref')).toHaveText(/^[A-Z0-9]-[A-Z0-9]{6}$/);
    expect(bookingRef[0]).toBe(eventTitle[0].toUpperCase());

    // -- Step 6: Card details --
    await expect(card.getByRole('heading', { level: 3 })).toHaveText(eventTitle);
    await expect(card.getByText('confirmed', { exact: true })).toBeVisible();
    await expect(card.getByTestId('booking-id')).toHaveText(/^#\d+$/);
    await expect(card).toContainText(`${TICKET_COUNT} tickets`);

    // Business rule: totalPrice = price × quantity
    const expectedTotal = `$${(pricePerTicket * TICKET_COUNT).toLocaleString('en-US')}`;
    await expect(card.getByText(expectedTotal, { exact: true })).toBeVisible();

    // -- Step 7: Card actions are available --
    // "View Details" renders as a <button> nested inside an unnamed <a>
    await expect(card.getByRole('button', { name: 'View Details' })).toBeVisible();
    await expect(card.getByTestId('cancel-booking-btn')).toBeVisible();
  });

});
