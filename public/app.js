(() => {
  'use strict';
  const PRICE = 8;
  const SLOTS = Array.from({ length: 13 }, (_, i) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(8 + i)}:00-${p(9 + i)}:00`;
  });
  const COURTS = [
    { id: 'court_1', name: 'Kurt 1 – Antuka', surface: 'Antuka', clay: true },
    { id: 'court_2', name: 'Kurt 2 – Antuka', surface: 'Antuka', clay: true },
    { id: 'court_3', name: 'Kurt 3 – Antuka', surface: 'Antuka', clay: true },
  ];
  const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${+d}. ${+m}. ${y}`; };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const state = {
    court: COURTS[0], month: new Date(today.getFullYear(), today.getMonth(), 1),
    date: null, booked: [], slotDetails: {}, selected: [], loadId: 0,
  };

  // ---------- Kurty ----------
  function renderCourts() {
    $('courts').innerHTML = '';
    COURTS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.court = c.id;
      b.className = 'court-btn' + (c.clay ? ' clay' : '');
      b.setAttribute('aria-selected', c.id === state.court.id);
      b.innerHTML = `<strong>${c.name}</strong><small>${PRICE} € / hodina</small>`;
      b.onclick = () => { state.court = c; state.selected = []; renderCourts(); loadSlots(); updateForm(); };
      $('courts').appendChild(b);
    });
  }

  // ---------- Kalendár ----------
  function renderCalendar() {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    $('month-label').textContent = `${MONTHS[m]} ${y}`;
    $('prev-month').disabled = y === today.getFullYear() && m === today.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // pondelok = 0
    const days = new Date(y, m + 1, 0).getDate();
    const cal = $('calendar'); cal.innerHTML = '';
    for (let i = 0; i < offset; i++) cal.insertAdjacentHTML('beforeend', '<span class="day empty"></span>');
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), s = iso(date);
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = d; b.dataset.date = s;
      b.className = 'day' + (date.getTime() === today.getTime() ? ' today' : '') + (s === state.date ? ' selected' : '');
      b.disabled = date < today;
      b.onclick = () => { state.date = s; state.selected = []; renderCalendar(); loadSlots(); updateForm(); };
      cal.appendChild(b);
    }
  }
  $('prev-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1); renderCalendar(); };
  $('next-month').onclick = () => { state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1); renderCalendar(); };

  // ---------- Sloty ----------
  async function loadSlots() {
    if (!state.date) return;
    const id = ++state.loadId;
    $('step-time').hidden = false;
    $('time-sub').textContent = `${state.court.name} · ${fmtDate(state.date)}`;
    $('slots').innerHTML = '<p class="muted">Načítavam…</p>';
    try {
      const r = await fetch(`/api/bookings?date=${state.date}&courtId=${state.court.id}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (id !== state.loadId) return;
      state.booked = data.bookedSlots || [];
      state.slotDetails = data.slotDetails || {};
      renderSlots();
    } catch {
      if (id === state.loadId) $('slots').innerHTML = '<p class="error">Nepodarilo sa načítať termíny. Skúste to znova.</p>';
    }
  }

  function isPastSlot(slot) {
    if (state.date !== iso(new Date())) return false;
    return parseInt(slot.slice(0, 2), 10) < new Date().getHours();
  }

  function renderSlots() {
    const box = $('slots'); box.innerHTML = '';
    SLOTS.forEach((s) => {
      const taken = state.booked.includes(s), past = isPastSlot(s);
      const detail = state.slotDetails?.[s];
      const isAdminBlock = Boolean(taken && detail?.isAdminBlock);
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.slot = s;
      b.className = 'slot'
        + (state.selected.includes(s) ? ' selected' : '')
        + (isAdminBlock ? ' admin-blocked' : '');
      b.disabled = taken || past;

      const timeSpan = document.createElement('span');
      timeSpan.textContent = s.replace('-', ' - ');
      b.appendChild(timeSpan);

      if (taken) {
        const sub = document.createElement('small');
        sub.textContent = isAdminBlock ? (detail.reason || 'Blokované') : 'Obsadené';
        b.appendChild(sub);
      } else if (past) {
        const sub = document.createElement('small');
        sub.textContent = 'Uplynulo';
        b.appendChild(sub);
      }

      b.onclick = () => toggleSlot(s);
      box.appendChild(b);
    });
  }

  // Výber musí byť súvislý: kliknutie mimo rozsahu začne nový výber, kliknutie na krajný blok ho odoberie
  function toggleSlot(s) {
    const i = SLOTS.indexOf(s);
    const sel = state.selected.map((x) => SLOTS.indexOf(x)).sort((a, b) => a - b);
    if (sel.includes(i)) {
      if (i === sel[0] || i === sel[sel.length - 1]) sel.splice(sel.indexOf(i), 1); else sel.length = 0;
    } else if (sel.length && (i === sel[0] - 1 || i === sel[sel.length - 1] + 1)) {
      sel.push(i); sel.sort((a, b) => a - b);
    } else { sel.length = 0; sel.push(i); }
    // zabráň prekríženiu s obsadeným blokom
    const ok = sel.every((x) => !state.booked.includes(SLOTS[x]));
    state.selected = ok ? sel.map((x) => SLOTS[x]) : [s];
    renderSlots(); updateForm();
  }

  // ---------- Formulár ----------
  function updateForm() {
    const has = state.selected.length > 0;
    $('step-form').hidden = !has;
    if (!has) return;
    const first = state.selected[0].split('-')[0], last = state.selected[state.selected.length - 1].split('-')[1];
    $('sum-court').textContent = state.court.name;
    $('sum-date').textContent = fmtDate(state.date);
    $('sum-time').textContent = `${first} – ${last} (${state.selected.length} h)`;
    $('sum-price').textContent = `${state.selected.length * PRICE} €`;
  }

  const form = $('booking-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('form-error'); err.hidden = true;
    const f = Object.fromEntries(new FormData(form));
    let bad = null;
    form.querySelectorAll('input').forEach((i) => i.classList.remove('invalid'));
    if (f.name.trim().length < 3) bad = ['name', 'Zadajte meno a priezvisko.'];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) bad = ['email', 'Zadajte platný e-mail.'];
    else if (!/^\+?[0-9 ()\-]{7,20}$/.test(f.phone.trim())) bad = ['phone', 'Zadajte platné telefónne číslo.'];
    if (bad) { form.elements[bad[0]].classList.add('invalid'); form.elements[bad[0]].focus(); err.textContent = bad[1]; err.hidden = false; return; }

    setLoading(true);
    try {
      const r = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtId: state.court.id, date: state.date, timeSlots: state.selected,
          customer: { name: f.name, email: f.email, phone: f.phone, note: f.note },
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        err.textContent = data.error || 'Rezerváciu sa nepodarilo odoslať.'; err.hidden = false;
        if (r.status === 409) { state.selected = []; await loadSlots(); updateForm(); err.hidden = false; $('step-form').hidden = true; alert(data.error); }
        return;
      }
      showDone(data.booking);
    } catch {
      err.textContent = 'Chyba pripojenia. Skúste to znova.'; err.hidden = false;
    } finally { setLoading(false); }
  });

  function setLoading(on) {
    $('submit-btn').disabled = on;
    $('submit-btn').querySelector('.spinner').hidden = !on;
    $('submit-btn').querySelector('.label').textContent = on ? 'Odosielam…' : 'Potvrdiť rezerváciu';
  }

  function showDone(b) {
    ['step-court', 'step-date', 'step-time', 'step-form'].forEach((id) => ($(id).hidden = true));
    const t = [...b.timeSlots].sort();
    $('done-text').textContent = `${b.courtName}, ${fmtDate(b.date)}, ${t[0].split('-')[0]} – ${t[t.length - 1].split('-')[1]} · ${b.totalPrice} €`;
    if ($('spam-warning')) {
      $('spam-warning').textContent = 'Skontrolujte si prosím aj priečinok Spam / Nevyžiadaná pošta.';
    }
    $('step-done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  $('new-booking').onclick = () => {
    form.reset(); state.selected = []; state.date = null;
    $('step-done').hidden = true; $('step-court').hidden = false; $('step-date').hidden = false; $('step-time').hidden = true;
    renderCalendar();
  };

  // ---------- PWA ----------
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);

  let deferred = null;

  if (isIOS) {
    // Na iOS nie je možné programovo spustiť inštaláciu – zobrazujeme výlučne inštruktážnu bublinu
    $('install-banner').hidden = true;
    if (!standalone && !sessionStorage.getItem('installDismissed')) {
      $('ios-hint').hidden = false;
    }
  } else {
    $('ios-hint').hidden = true;
    if (isAndroid) {
      $('install-text').textContent = 'Pridajte si kurty na plochu pre rýchle rezervácie';
      $('install-btn').textContent = 'Pridať';
    } else {
      $('install-text').textContent = 'Nainštalujte si aplikáciu do počítača pre rýchly prístup';
      $('install-btn').textContent = 'Inštalovať';
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      if (!standalone && !sessionStorage.getItem('installDismissed')) {
        $('install-banner').hidden = false;
      }
    });
  }

  $('install-btn').onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('install-banner').hidden = true;
  };
  $('install-close').onclick = () => {
    $('install-banner').hidden = true;
    sessionStorage.setItem('installDismissed', '1');
  };
  $('ios-close').onclick = () => {
    $('ios-hint').hidden = true;
    sessionStorage.setItem('installDismissed', '1');
  };

  renderCourts(); renderCalendar();
})();
