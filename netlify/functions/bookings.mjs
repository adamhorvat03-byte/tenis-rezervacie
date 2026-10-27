import { randomUUID } from 'node:crypto';
import { COURTS, ALL_SLOTS, PRICE_PER_HOUR } from '../lib/config.mjs';
import { getStorage } from '../lib/storage.mjs';
import { sendBookingEmails } from '../lib/email.mjs';

const ADMIN_USER = 'Tenis';
const ADMIN_PASS = 'Tenis1';

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

function isValidAdmin(user, pass) {
  return String(user ?? '') === ADMIN_USER && String(pass ?? '') === ADMIN_PASS;
}

async function listAllBookings(store) {
  const keys = await store.list('booking:');
  const items = await Promise.all(keys.map((k) => store.get(k)));
  return items
    .filter((b) => b && b.bookingId && b.date && b.courtId)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const sa = (a.timeSlots && a.timeSlots[0]) || '';
      const sb = (b.timeSlots && b.timeSlots[0]) || '';
      if (sa !== sb) return sa.localeCompare(sb);
      return String(a.courtId).localeCompare(String(b.courtId));
    });
}

async function handleGet(req, url) {
  // Ak správca žiada zoznam všetkých rezervácií a blokácií cez GET ?all=1
  if (url.searchParams.get('all') === '1') {
    const adminUser = req.headers.get('x-admin-user') || url.searchParams.get('adminUser');
    const adminPass = req.headers.get('x-admin-password') || url.searchParams.get('adminPassword');
    if (!isValidAdmin(adminUser, adminPass)) {
      return json({ error: 'Neplatné prihlasovacie údaje správcu.' }, 401);
    }
    const store = await getStorage();
    const bookings = await listAllBookings(store);
    return json({ bookings });
  }

  const date = url.searchParams.get('date');
  const courtId = url.searchParams.get('courtId');
  if (!validDate(date || '')) return json({ error: 'Neplatný dátum (očakávaný formát YYYY-MM-DD).' }, 400);
  if (!COURTS[courtId]) return json({ error: 'Neznámy kurt.' }, 400);

  const store = await getStorage();
  const prefix = `slot:${date}:${courtId}:`;
  const keys = await store.list(prefix);
  const validKeys = keys
    .map((k) => ({ key: k, slot: k.slice(prefix.length) }))
    .filter((x) => ALL_SLOTS.includes(x.slot))
    .sort((a, b) => a.slot.localeCompare(b.slot));

  const booked = validKeys.map((x) => x.slot);
  const slotDetails = {};

  await Promise.all(
    validKeys.map(async ({ key, slot }) => {
      const val = await store.get(key);
      if (val && typeof val === 'object' && val.isAdminBlock) {
        slotDetails[slot] = {
          isAdminBlock: true,
          reason: val.blockReason || 'Blokované',
        };
      } else {
        slotDetails[slot] = { isAdminBlock: false };
      }
    })
  );

  return json({ date, courtId, bookedSlots: booked, slotDetails });
}

async function handleDelete(req, url) {
  let body = {};
  try { body = await req.json(); } catch {}

  const adminUser = body.adminUser ?? req.headers.get('x-admin-user');
  const adminPass = body.adminPassword ?? req.headers.get('x-admin-password');

  if (!isValidAdmin(adminUser, adminPass)) {
    return json({ error: 'Neplatné prihlasovacie údaje správcu.' }, 401);
  }

  const bookingId = String(body.bookingId || url.searchParams.get('bookingId') || '').trim();
  if (!bookingId) {
    return json({ error: 'Chýba identifikátor rezervácie (bookingId).' }, 400);
  }

  const store = await getStorage();
  const booking = await store.get(`booking:${bookingId}`);

  if (!booking) {
    if (body.date && body.courtId && Array.isArray(body.timeSlots)) {
      await Promise.all(
        body.timeSlots.map((slot) => store.delete(slotKey(body.date, body.courtId, slot)))
      );
      return json({ ok: true, deletedBookingId: bookingId }, 200);
    }
    return json({ error: 'Rezervácia alebo blokácia sa nenašla.' }, 404);
  }

  // Odstránime všetky uzamknuté časové sloty tejto rezervácie/blokácie
  const slots = Array.isArray(booking.timeSlots) ? booking.timeSlots : [];
  await Promise.all(
    slots.map((slot) => store.delete(slotKey(booking.date, booking.courtId, slot)))
  );

  // Odstránime samotný záznam rezervácie
  await store.delete(`booking:${bookingId}`);

  return json({ ok: true, deletedBookingId: bookingId }, 200);
}

async function handlePost(req) {
  let data;
  try { data = await req.json(); } catch { return json({ error: 'Neplatné dáta požiadavky.' }, 400); }

  // Overenie prihlásenia správcu (Admin Login)
  if (data?.action === 'admin_login') {
    if (!isValidAdmin(data.username, data.password)) {
      return json({ error: 'Nesprávne prihlasovacie meno alebo heslo.' }, 401);
    }
    return json({ ok: true }, 200);
  }

  const isAdminBlock = Boolean(data?.isAdminBlock);
  const { courtId, date, timeSlots } = data || {};

  if (!COURTS[courtId]) return json({ error: 'Neznámy kurt.' }, 400);
  if (!validDate(date || '')) return json({ error: 'Neplatný dátum.' }, 400);
  if (date < todayLocal()) return json({ error: 'Nie je možné rezervovať termín v minulosti.' }, 400);
  if (!Array.isArray(timeSlots) || timeSlots.length === 0) return json({ error: 'Vyberte aspoň jeden časový blok.' }, 400);
  if (new Set(timeSlots).size !== timeSlots.length || !timeSlots.every((s) => ALL_SLOTS.includes(s)))
    return json({ error: 'Časové bloky musia byť v rozsahu 08:00 – 21:00.' }, 400);

  const idx = timeSlots.map((s) => ALL_SLOTS.indexOf(s)).sort((a, b) => a - b);
  const slots = idx.map((i) => ALL_SLOTS[i]);

  // Admin blokácia kurtu
  if (isAdminBlock) {
    if (!isValidAdmin(data.adminUser, data.adminPassword)) {
      return json({ error: 'Neplatné prihlasovacie údaje správcu.' }, 401);
    }
    const blockReason = String(data.blockReason || '').trim().slice(0, 120);
    if (!blockReason) {
      return json({ error: 'Zadajte dôvod blokácie (napr. Turnaj).' }, 400);
    }

    const store = await getStorage();
    const bookingId = randomUUID();
    const slotValue = { bookingId, isAdminBlock: true, blockReason };

    const locked = [];
    for (const slot of slots) {
      const ok = await store.setIfNew(slotKey(date, courtId, slot), slotValue);
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
      pricePerHour: 0,
      totalPrice: 0,
      isAdminBlock: true,
      blockReason,
      customer: { name: 'Správca', email: '', phone: '', note: blockReason },
      status: 'blocked',
      paymentStatus: 'none',
      paymentMethod: 'admin_block',
      createdAt: new Date().toISOString(),
    };

    try {
      await store.set(`booking:${bookingId}`, booking);
    } catch (e) {
      await Promise.all(slots.map((s) => store.delete(slotKey(date, courtId, s))));
      console.error('[bookings] zápis admin blokácie zlyhal', e);
      return json({ error: 'Blokáciu sa nepodarilo uložiť. Skúste to znova.' }, 500);
    }

    // E-mailové notifikácie sa pri isAdminBlock: true úplne preskočia
    return json({
      booking: {
        bookingId,
        courtName: booking.courtName,
        date,
        timeSlots: slots,
        isAdminBlock: true,
        blockReason,
      },
    }, 201);
  }

  // Štandardná klientska rezervácia
  if (idx.some((v, i) => i > 0 && v !== idx[i - 1] + 1))
    return json({ error: 'Vyberte po sebe idúce hodinové bloky.' }, 400);

  const customer = data?.customer || {};
  const name = String(customer.name || '').trim();
  const email = String(customer.email || '').trim();
  const phone = String(customer.phone || '').trim();
  const note = String(customer.note || '').trim().slice(0, 500);

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
    isAdminBlock: false,
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

  if (!booking.isAdminBlock) {
    try {
      await sendBookingEmails(booking);
    } catch (emailErr) {
      console.error('[bookings] chyba pri odosielaní e-mailov:', emailErr);
    }
  }

  // Klientovi vraciame iba nevyhnutné údaje
  return json({ booking: {
    bookingId, courtName: booking.courtName, date, timeSlots: slots,
    totalPrice: booking.totalPrice, customer: { name, email },
  } }, 201);
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    if (req.method === 'GET') return await handleGet(req, url);
    if (req.method === 'POST') return await handlePost(req);
    if (req.method === 'DELETE') return await handleDelete(req, url);
    return json({ error: 'Metóda nie je povolená.' }, 405);
  } catch (e) {
    console.error('[bookings] chyba', e);
    return json({ error: 'Interná chyba servera.' }, 500);
  }
};
