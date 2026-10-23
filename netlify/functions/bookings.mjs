import { randomUUID } from 'node:crypto';
import { COURTS, ALL_SLOTS, PRICE_PER_HOUR } from '../lib/config.mjs';
import { getStorage } from '../lib/storage.mjs';
import { sendBookingEmails } from '../lib/email.mjs';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()\-]{7,20}$/;
const slotKey = (date, courtId, slot) => `slot:${date}:${courtId}:${slot}`;

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

function todayLocal() {
  // Slovenský čas, aby sa "dnes" určilo správne aj na serveri v UTC
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bratislava' }).format(new Date());
}

async function handleGet(url) {
  const date = url.searchParams.get('date');
  const courtId = url.searchParams.get('courtId');
  if (!validDate(date || '')) return json({ error: 'Neplatný dátum (očakávaný formát YYYY-MM-DD).' }, 400);
  if (!COURTS[courtId]) return json({ error: 'Neznámy kurt.' }, 400);

  const store = await getStorage();
  const prefix = `slot:${date}:${courtId}:`;
  const keys = await store.list(prefix);
  const booked = keys.map((k) => k.slice(prefix.length)).filter((s) => ALL_SLOTS.includes(s)).sort();
  return json({ date, courtId, bookedSlots: booked });
}

async function handlePost(req) {
  let data;
  try { data = await req.json(); } catch { return json({ error: 'Neplatné dáta požiadavky.' }, 400); }

  const { courtId, date, timeSlots, customer = {} } = data || {};
  const name = String(customer.name || '').trim();
  const email = String(customer.email || '').trim();
  const phone = String(customer.phone || '').trim();
  const note = String(customer.note || '').trim().slice(0, 500);

  if (!COURTS[courtId]) return json({ error: 'Neznámy kurt.' }, 400);
  if (!validDate(date || '')) return json({ error: 'Neplatný dátum.' }, 400);
  if (date < todayLocal()) return json({ error: 'Nie je možné rezervovať termín v minulosti.' }, 400);
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) return json({ error: 'Vyberte aspoň jeden časový blok.' }, 400);
  if (new Set(timeSlots).size !== timeSlots.length || !timeSlots.every((s) => ALL_SLOTS.includes(s)))
    return json({ error: 'Časové bloky musia byť v rozsahu 08:00 – 21:00.' }, 400);

  const idx = timeSlots.map((s) => ALL_SLOTS.indexOf(s)).sort((a, b) => a - b);
  if (idx.some((v, i) => i > 0 && v !== idx[i - 1] + 1))
    return json({ error: 'Vyberte po sebe idúce hodinové bloky.' }, 400);
  const slots = idx.map((i) => ALL_SLOTS[i]);

  if (name.length < 3 || name.length > 100) return json({ error: 'Zadajte meno a priezvisko.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Zadajte platný e-mail.' }, 400);
  if (!PHONE_RE.test(phone)) return json({ error: 'Zadajte platné telefónne číslo.' }, 400);

  const store = await getStorage();
  const bookingId = randomUUID();

  // Atómické zamknutie každého slotu (onlyIfNew). Pri kolízii vrátime už zamknuté sloty späť.
  const locked = [];
  for (const slot of slots) {
    const ok = await store.setIfNew(slotKey(date, courtId, slot), bookingId);
    if (!ok) {
      await Promise.all(locked.map((s) => store.delete(slotKey(date, courtId, s))));
      return json({ error: `Termín ${slot} je už obsadený. Vyberte prosím iný čas.` }, 409);
    }
    locked.push(slot);
  }

  const booking = {
    bookingId,
    courtId,
    courtName: COURTS[courtId],
    date,
    timeSlots: slots,
    pricePerHour: PRICE_PER_HOUR,
    totalPrice: slots.length * PRICE_PER_HOUR,
    customer: { name, email, phone, note },
    status: 'confirmed',
    paymentStatus: 'on_site',
    paymentMethod: 'cash_or_card_on_site',
    createdAt: new Date().toISOString(),
  };

  try {
    await store.set(`booking:${bookingId}`, booking);
  } catch (e) {
    await Promise.all(slots.map((s) => store.delete(slotKey(date, courtId, s))));
    console.error('[bookings] zápis zlyhal', e);
    return json({ error: 'Rezerváciu sa nepodarilo uložiť. Skúste to znova.' }, 500);
  }

  await sendBookingEmails(booking);

  // Klientovi vraciame iba nevyhnutné údaje
  return json({ booking: {
    bookingId, courtName: booking.courtName, date, timeSlots: slots,
    totalPrice: booking.totalPrice, customer: { name, email },
  } }, 201);
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    if (req.method === 'GET') return await handleGet(url);
    if (req.method === 'POST') return await handlePost(req);
    return json({ error: 'Metóda nie je povolená.' }, 405);
  } catch (e) {
    console.error('[bookings] chyba', e);
    return json({ error: 'Interná chyba servera.' }, 500);
  }
};
