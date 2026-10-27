import nodemailer from 'nodemailer';

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

export const DEFAULT_MANAGER_EMAIL = 'adam.horvat03@gmail.com';

/**
 * Odošle dva samostatné e-maily cez Gmail SMTP (nodemailer):
 *  1. Notifikáciu správcovi (MANAGER_EMAIL, fallback na adam.horvat03@gmail.com)
 *  2. Potvrdenie klientovi (booking.customer.email)
 * Zlyhanie odoslania e-mailov je zachytené v try/catch a nikdy nezruší rezerváciu.
 */
export async function sendBookingEmails(booking) {
  if (booking?.isAdminBlock) {
    return;
  }
  try {
    const gmailUser = process.env.GMAIL_USER?.trim();
    const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
    const managerEmail = process.env.MANAGER_EMAIL?.trim() || DEFAULT_MANAGER_EMAIL;
    const clientEmail = booking?.customer?.email?.trim();

    const { adminMail, clientMail } = buildEmails(booking);

    if (!gmailUser || !gmailPass) {
      console.warn('[EMAIL] ⚠️ GMAIL_USER alebo GMAIL_APP_PASSWORD nie sú nastavené. E-maily sa iba vypisujú do konzoly:');
      console.log(`[EMAIL 1 – SPRÁVCA]\nKomu: ${managerEmail}\nPredmet: ${adminMail.subject}\n${adminMail.text}\n`);
      console.log(`[EMAIL 2 – KLIENT]\nKomu: ${clientEmail}\nPredmet: ${clientMail.subject}\n${clientMail.text}\n`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const from = `Tenisové kurty <${gmailUser}>`;

    // 1. Prvý samostatný e-mail: správcovi (MANAGER_EMAIL)
    try {
      const infoManager = await transporter.sendMail({
        from,
        to: managerEmail,
        replyTo: clientEmail || undefined,
        subject: adminMail.subject,
        text: adminMail.text,
        html: adminMail.html,
      });
      console.log(`[EMAIL] ✅ E-mail správcovi (${managerEmail}) odoslaný: ${infoManager.messageId}`);
    } catch (errManager) {
      console.error(`[EMAIL] ❌ Chyba pri odosielaní e-mailu správcovi (${managerEmail}):`, errManager);
    }

    // 2. Druhý samostatný e-mail: klientovi (customer.email)
    if (clientEmail) {
      try {
        const infoClient = await transporter.sendMail({
          from,
          to: clientEmail,
          subject: clientMail.subject,
          text: clientMail.text,
          html: clientMail.html,
        });
        console.log(`[EMAIL] ✅ Potvrdzovací e-mail klientovi (${clientEmail}) odoslaný: ${infoClient.messageId}`);
      } catch (errClient) {
        console.error(`[EMAIL] ❌ Chyba pri odosielaní e-mailu klientovi (${clientEmail}):`, errClient);
      }
    }
  } catch (err) {
    console.error('[EMAIL] ❌ Neočakávaná chyba v sendBookingEmails:', err);
  }
}
