// E2E test API: node scripts/e2e.mjs (server musí bežať na :8888)
const B = 'http://localhost:8888';
const t = new Date(Date.now() + 864e5); // zajtra
const date = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
const post = (body) => fetch(`${B}/api/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const customer = { name: 'Ján Testovací', email: 'jan@test.sk', phone: '+421900000000', note: 'Test' };
const check = (n, ok) => { console.log(ok ? 'OK  ' : 'FAIL', n); if (!ok) process.exitCode = 1; };

let r = await fetch(`${B}/api/bookings?date=${date}&courtId=court_1`);
check('GET prázdne', (await r.json()).bookedSlots.length === 0);
r = await post({ courtId: 'court_1', date, timeSlots: ['17:00-18:00', '18:00-19:00'], customer });
let j = await r.json();
check('POST 201, cena 16 €', r.status === 201 && j.booking.totalPrice === 16);
r = await fetch(`${B}/api/bookings?date=${date}&courtId=court_1`);
check('GET obsadené 2 sloty', JSON.stringify((await r.json()).bookedSlots) === '["17:00-18:00","18:00-19:00"]');
r = await post({ courtId: 'court_1', date, timeSlots: ['18:00-19:00'], customer });
check('Duplicitná rezervácia -> 409', r.status === 409);
r = await post({ courtId: 'court_2', date, timeSlots: ['21:00-22:00'], customer });
check('Mimo rozsahu -> 400', r.status === 400);
r = await post({ courtId: 'court_2', date, timeSlots: ['09:00-10:00', '11:00-12:00'], customer });
check('Nesúvislé sloty -> 400', r.status === 400);
const [a, b] = await Promise.all([1, 2].map(() => post({ courtId: 'court_3', date, timeSlots: ['08:00-09:00'], customer })));
check('Súbežné požiadavky: jedna 201, druhá 409', [a.status, b.status].sort().join() === '201,409');
