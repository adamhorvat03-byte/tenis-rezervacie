const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function formatDateSk(iso) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

/** "17:00-18:00","18:00-19:00" -> "17:00 – 19:00" (zlúčené po sebe idúce bloky) */
export function formatTimeRange(slots) {
  const sorted = [...slots].sort();
  return `${sorted[0].split('-')[0]} – ${sorted[sorted.length - 1].split('-')[1]}`;
}

function rows(pairs) {
  const text = pairs.map(([k, v]) => `${k}: ${v}`).join('\n');
  const html = `<table style="font-family:Arial,sans-serif;font-size:16px;border-collapse:collapse">${pairs
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`)
    .join('')}</table>`;
  return { text, html };
}

export function buildEmails(b) {
  const date = formatDateSk(b.date);
  const time = formatTimeRange(b.timeSlots);
  const price = `${b.totalPrice} € – platba na mieste`;

  const admin = rows([
    ['Kurt', b.courtName],
    ['Dátum', date],
    ['Čas', time],
    ['Cena', price],
    ['Meno', b.customer.name],
    ['Telefón', b.customer.phone],
    ['E-mail', b.customer.email],
    ['Poznámka', b.customer.note || '–'],
  ]);

  const client = rows([
    ['Kurt', b.courtName],
    ['Dátum', date],
    ['Čas', time],
    ['Na úhradu na mieste', `${b.totalPrice} €`],
  ]);

  const adminMail = {
    subject: `Nová rezervácia: ${b.courtName} - ${date} o ${time}`,
    text: admin.text,
    html: admin.html,
  };
  const clientMail = {
    subject: `Potvrdenie rezervácie: ${b.courtName}, ${date} ${time}`,
    text: `Dobrý deň ${b.customer.name},\n\nvaša rezervácia tenisového kurtu je potvrdená.\n\n${client.text}\n\nSumu uhradíte na mieste v hotovosti alebo kartou. Tešíme sa na vás!`,
    html: `<div style="font-family:Arial,sans-serif;font-size:16px"><p>Dobrý deň ${esc(b.customer.name)},</p><p>vaša rezervácia tenisového kurtu je <b>potvrdená</b>.</p>${client.html}<p>Sumu uhradíte na mieste v hotovosti alebo kartou. Tešíme sa na vás!</p></div>`,
  };
  return { adminMail, clientMail };
}

async function send(mail, to, from, apiKey) {
  if (!apiKey) {
    console.log(`\n[EMAIL – RESEND_API_KEY nie je nastavený, len výpis]\nKomu: ${[].concat(to).join(', ')}\nOd: ${from}\nPredmet: ${mail.subject}\n${mail.text}\n`);
    return { ok: true, simulated: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [].concat(to), subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return { ok: true };
}

export const DEFAULT_ADMIN_EMAIL = 'adam.horvat03@gmail.com';

/** Nikdy nevyhodí chybu – zlyhanie e-mailu nesmie zrušiť rezerváciu. */
export async function sendBookingEmails(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'Tenisové kurty <onboarding@resend.dev>';
  const managerEmail = process.env.MANAGER_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const admins = [...new Set([managerEmail, adminEmail].filter(Boolean))];
  const { adminMail, clientMail } = buildEmails(booking);

  const jobs = [];
  if (admins.length) jobs.push(send(adminMail, admins, from, apiKey));
  jobs.push(send(clientMail, booking.customer.email, from, apiKey));

  const results = await Promise.allSettled(jobs);
  results.forEach((r) => r.status === 'rejected' && console.error('[email] chyba:', r.reason?.message || r.reason));
}
