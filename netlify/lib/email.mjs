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
    ['Meno klienta', b.customer.name],
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
  const recipients = [].concat(to).filter(Boolean);
  if (!recipients.length) return { ok: true, skipped: true };

  if (!apiKey) {
    console.warn(`[EMAIL] ⚠️ RESEND_API_KEY nie je nastavený. Pre skutočné doručenie e-mailov do schránky nastavte RESEND_API_KEY.`);
    console.log(`[EMAIL SIMULÁCIA]\nKomu: ${recipients.join(', ')}\nOd: ${from}\nPredmet: ${mail.subject}\n${mail.text}\n`);
    return { ok: true, simulated: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data?.message || (typeof data === 'string' ? data : JSON.stringify(data));
      throw new Error(`Resend API HTTP ${res.status}: ${errMsg}`);
    }

    console.log(`[EMAIL] ✅ Úspešne odoslané na: ${recipients.join(', ')} (Resend ID: ${data?.id})`);
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error(`[EMAIL] ❌ Zlyhalo odoslanie na: ${recipients.join(', ')}:`, err.message);
    throw err;
  }
}

export const DEFAULT_ADMIN_EMAIL = 'adam.horvat03@gmail.com';

/** Nikdy nevyhodí chybu – zlyhanie e-mailu nesmie zrušiť rezerváciu. */
export async function sendBookingEmails(booking) {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  // Ak je FROM_EMAIL nevyplnený alebo obsahuje neoverenú vzorovú doménu, použijeme oficiálnu Resend doménu onboarding@resend.dev
  let from = process.env.FROM_EMAIL?.trim();
  if (!from || from.includes('example.sk') || from.includes('example.com') || from.includes('test.com')) {
    from = 'Tenisové kurty <onboarding@resend.dev>';
  }

  const managerEmail = process.env.MANAGER_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const admins = [...new Set([managerEmail, adminEmail, DEFAULT_ADMIN_EMAIL].filter(Boolean))];

  const { adminMail, clientMail } = buildEmails(booking);

  const jobs = [];

  // 1. Notifikácia o novej rezervácii pre správcu/administrátora (adam.horvat03@gmail.com)
  if (admins.length) {
    jobs.push(send(adminMail, admins, from, apiKey));
  }

  // 2. Potvrdenie rezervácie odoslané priamo na adam.horvat03@gmail.com
  jobs.push(send(clientMail, DEFAULT_ADMIN_EMAIL, from, apiKey));

  // 3. Ak klient v rezervácii zadal inú e-mailovú adresu, pokúsime sa odoslať potvrdenie aj tam
  const customerEmail = booking.customer?.email?.trim();
  if (customerEmail && customerEmail.toLowerCase() !== DEFAULT_ADMIN_EMAIL.toLowerCase()) {
    jobs.push(send(clientMail, customerEmail, from, apiKey));
  }

  const results = await Promise.allSettled(jobs);
  results.forEach((r) => {
    if (r.status === 'rejected') {
      console.error('[EMAIL] Chyba úlohy:', r.reason?.message || r.reason);
    }
  });
}
