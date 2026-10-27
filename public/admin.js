(() => {
  'use strict';

  const SLOTS = Array.from({ length: 13 }, (_, i) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(8 + i)}:00-${p(9 + i)}:00`;
  });
  const COURTS = [
    { id: 'court_1', name: 'Kurt 1 – Antuka', clay: true },
    { id: 'court_2', name: 'Kurt 2 – Antuka', clay: true },
    { id: 'court_3', name: 'Kurt 3 – Hard', clay: false },
  ];
  const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${+d}. ${+m}. ${y}`; };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const state = {
    auth: null,
    court: COURTS[0],
    month: new Date(today.getFullYear(), today.getMonth(), 1),
    date: null,
    booked: [],
    slotDetails: {},
    selected: [],
    loadId: 0,
  };

  // ---------- Prihlásenie (Meno: Tenis, Heslo: Tenis1) ----------
  const loginForm = $('login-form');
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('login-error');
    err.hidden = true;
    const username = $('login-user').value.trim();
    const password = $('login-pass').value;

    if (username !== 'Tenis' || password !== 'Tenis1') {
      err.textContent = 'Nesprávne prihlasovacie meno alebo heslo.';
      err.hidden = false;
      return;
    }

    try {
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'admin_login', username, password }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        err.textContent = d.error || 'Nesprávne prihlasovacie meno alebo heslo.';
        err.hidden = false;
        return;
      }
      state.auth = { username, password };
      sessionStorage.setItem('tenisAdminAuth', JSON.stringify(state.auth));
      showDashboard();
    } catch {
      err.textContent = 'Chyba pripojenia k serveru.';
      err.hidden = false;
    }
  });

  $('logout-btn').onclick = () => {
    state.auth = null;
    sessionStorage.removeItem('tenisAdminAuth');
    $('dashboard').hidden = true;
    $('login-section').hidden = false;
    loginForm.reset();
  };

  function showDashboard() {
    $('login-section').hidden = true;
    $('dashboard').hidden = false;
    renderCourts();
    renderCalendar();
  }

  // Obnovenie relácie ak už je správca prihlásený v sessionStorage
  try {
    const saved = JSON.parse(sessionStorage.getItem('tenisAdminAuth') || 'null');
    if (saved && saved.username === 'Tenis' && saved.password === 'Tenis1') {
      state.auth = saved;
      showDashboard();
    }
  } catch {}

  // ---------- Kurty ----------
  function renderCourts() {
    $('courts').innerHTML = '';
    COURTS.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.className = 'court-btn' + (c.clay ? ' clay' : '');
      b.setAttribute('aria-selected', c.id === state.court.id);
      b.innerHTML = `<strong>${c.name}</strong><small>Správa blokácií</small>`;
      b.onclick = () => {
        state.court = c;
        state.selected = [];
        renderCourts();
        loadSlots();
        updateForm();
      };
      $('courts').appendChild(b);
    });
  }

  // ---------- Kalendár ----------
  function renderCalendar() {
    const y = state.month.getFullYear(), m = state.month.getMonth();
    $('month-label').textContent = `${MONTHS[m]} ${y}`;
    $('prev-month').disabled = y === today.getFullYear() && m === today.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const cal = $('calendar');
    cal.innerHTML = '';
    for (let i = 0; i < offset; i++) cal.insertAdjacentHTML('beforeend', '<span class="day empty"></span>');
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), s = iso(date);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = d;
      b.className = 'day' + (date.getTime() === today.getTime() ? ' today' : '') + (s === state.date ? ' selected' : '');
      b.disabled = date < today;
      b.onclick = () => {
        state.date = s;
        state.selected = [];
        renderCalendar();
        loadSlots();
        updateForm();
      };
      cal.appendChild(b);
    }
  }

  $('prev-month').onclick = () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    renderCalendar();
  };
  $('next-month').onclick = () => {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    renderCalendar();
  };

  // ---------- Časové sloty ----------
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
      if (id === state.loadId) $('slots').innerHTML = '<p class="error">Nepodarilo sa načítať termíny.</p>';
    }
  }

  function renderSlots() {
    const box = $('slots');
    box.innerHTML = '';
    SLOTS.forEach((s) => {
      const taken = state.booked.includes(s);
      const detail = state.slotDetails?.[s];
      const isAdminBlock = Boolean(taken && detail?.isAdminBlock);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot'
        + (state.selected.includes(s) ? ' selected' : '')
        + (isAdminBlock ? ' admin-blocked' : '');
      b.disabled = taken;

      const timeSpan = document.createElement('span');
      timeSpan.textContent = s.replace('-', ' - ');
      b.appendChild(timeSpan);

      if (taken) {
        const sub = document.createElement('small');
        sub.textContent = isAdminBlock ? (detail.reason || 'Blokované') : 'Obsadené';
        b.appendChild(sub);
      }

      b.onclick = () => toggleSlot(s);
      box.appendChild(b);
    });
  }

  function toggleSlot(s) {
    if (state.selected.includes(s)) {
      state.selected = state.selected.filter((x) => x !== s);
    } else {
      state.selected = [...state.selected, s].sort();
    }
    renderSlots();
    updateForm();
  }

  // ---------- Formulár blokácie ----------
  function updateForm() {
    const has = state.selected.length > 0;
    $('step-form').hidden = !has;
    if (!has) return;
    $('sum-court').textContent = state.court.name;
    $('sum-date').textContent = fmtDate(state.date);
    $('sum-time').textContent = state.selected.join(', ');
  }

  const blockForm = $('block-form');
  blockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('form-error');
    err.hidden = true;
    const reasonInput = $('block-reason');
    const blockReason = reasonInput.value.trim();

    reasonInput.classList.remove('invalid');
    if (!blockReason) {
      reasonInput.classList.add('invalid');
      reasonInput.focus();
      err.textContent = 'Zadajte dôvod blokácie (napr. Turnaj).';
      err.hidden = false;
      return;
    }

    setLoading(true);
    try {
      const r = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isAdminBlock: true,
          adminUser: state.auth?.username,
          adminPassword: state.auth?.password,
          courtId: state.court.id,
          date: state.date,
          timeSlots: state.selected,
          blockReason,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        err.textContent = data.error || 'Blokáciu sa nepodarilo uložiť.';
        err.hidden = false;
        if (r.status === 409) {
          state.selected = [];
          await loadSlots();
          updateForm();
        }
        return;
      }
      showDone(data.booking);
    } catch {
      err.textContent = 'Chyba pripojenia. Skúste to znova.';
      err.hidden = false;
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    $('submit-btn').disabled = on;
    $('submit-btn').querySelector('.spinner').hidden = !on;
    $('submit-btn').querySelector('.label').textContent = on ? 'Ukladám…' : 'Zablokovať vybrané časy';
  }

  function showDone(b) {
    ['step-court', 'step-date', 'step-time', 'step-form'].forEach((id) => ($(id).hidden = true));
    $('done-text').textContent = `${b.courtName} · ${fmtDate(b.date)} · ${b.timeSlots.join(', ')} (${b.blockReason})`;
    $('step-done').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $('new-block').onclick = () => {
    blockForm.reset();
    state.selected = [];
    $('step-done').hidden = true;
    $('step-court').hidden = false;
    $('step-date').hidden = false;
    $('step-time').hidden = false;
    loadSlots();
    updateForm();
  };
})();
