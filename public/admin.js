(() => {
  'use strict';

  const SLOTS = Array.from({ length: 13 }, (_, i) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${p(8 + i)}:00-${p(9 + i)}:00`;
  });
  const COURTS = [
    { id: 'court_1', name: 'Kurt 1 – Antuka', clay: true },
    { id: 'court_2', name: 'Kurt 2 – Antuka', clay: true },
    { id: 'court_3', name: 'Kurt 3 – Antuka', clay: true },
  ];
  const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];

  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${+d}. ${+m}. ${y}`; };
  const fmtTimeSlots = (slots = []) => {
    if (!slots.length) return '';
    const sorted = [...slots].sort();
    const idxs = sorted.map((s) => SLOTS.indexOf(s));
    const contiguous = idxs.every((v, i) => i === 0 || v === idxs[i - 1] + 1);
    if (contiguous) {
      return `${sorted[0].split('-')[0]} – ${sorted[sorted.length - 1].split('-')[1]}`;
    }
    return sorted.join(', ');
  };

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
    allBookings: [],
    activeModalBooking: null,
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
    loadAllBookings();
  }

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
        renderCalendar();
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

    // Zistíme, ktoré dni v mesiaci majú rezervácie pre vybraný kurt
    const busyDates = new Set(
      state.allBookings
        .filter((b) => b.courtId === state.court.id)
        .map((b) => b.date)
    );

    for (let i = 0; i < offset; i++) cal.insertAdjacentHTML('beforeend', '<span class="day empty"></span>');
    for (let d = 1; d <= days; d++) {
      const date = new Date(y, m, d), s = iso(date);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = d;
      b.className = 'day'
        + (date.getTime() === today.getTime() ? ' today' : '')
        + (s === state.date ? ' selected' : '')
        + (busyDates.has(s) ? ' has-bookings' : '');
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

  function findBookingForSlot(courtId, date, slot) {
    return state.allBookings.find(
      (b) => b.courtId === courtId && b.date === date && Array.isArray(b.timeSlots) && b.timeSlots.includes(slot)
    );
  }

  function renderSlots() {
    const box = $('slots');
    box.innerHTML = '';
    SLOTS.forEach((s) => {
      const taken = state.booked.includes(s);
      const detail = state.slotDetails?.[s];
      const bookingObj = taken ? findBookingForSlot(state.court.id, state.date, s) : null;
      const isAdminBlock = Boolean(taken && (detail?.isAdminBlock || bookingObj?.isAdminBlock));

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot'
        + (state.selected.includes(s) ? ' selected' : '')
        + (taken ? (isAdminBlock ? ' admin-blocked slot-clickable-taken' : ' slot-booked-client slot-clickable-taken') : '');

      const timeSpan = document.createElement('span');
      timeSpan.textContent = s.replace('-', ' - ');
      b.appendChild(timeSpan);

      if (taken) {
        const sub = document.createElement('small');
        if (isAdminBlock) {
          sub.textContent = `🔒 ${detail?.reason || bookingObj?.blockReason || 'Blokované'}`;
        } else {
          const clientName = bookingObj?.customer?.name || 'Obsadené';
          sub.textContent = `👤 ${clientName}`;
        }
        b.appendChild(sub);
        b.title = 'Kliknite pre zobrazenie detailu a zrušenie';
        b.onclick = () => openSlotModal(s, bookingObj, detail);
      } else {
        b.onclick = () => toggleSlot(s);
      }

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

  // ---------- Popup Modal pre obsadený slot v kalendári ----------
  function addRow(dl, label, value) {
    if (!value) return;
    const div = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    div.appendChild(dt);
    div.appendChild(dd);
    dl.appendChild(div);
  }

  function openSlotModal(slot, bookingObj, detail) {
    const isBlock = Boolean(bookingObj?.isAdminBlock ?? detail?.isAdminBlock);
    const targetBooking = bookingObj || {
      bookingId: '',
      courtId: state.court.id,
      courtName: state.court.name,
      date: state.date,
      timeSlots: [slot],
      isAdminBlock: isBlock,
      blockReason: detail?.reason || 'Blokované',
      customer: { name: 'Klient' },
    };

    state.activeModalBooking = targetBooking;
    const badge = $('modal-badge');
    badge.className = 'booking-badge ' + (isBlock ? 'badge-block' : 'badge-client');
    badge.textContent = isBlock ? 'Admin blokácia' : 'Klientska rezervácia';

    $('modal-title').textContent = isBlock
      ? (targetBooking.blockReason || 'Blokovaný termín')
      : (targetBooking.customer?.name || 'Rezervácia klienta');

    const dl = $('modal-details');
    dl.innerHTML = '';
    addRow(dl, 'Kurt', targetBooking.courtName || state.court.name);
    addRow(dl, 'Dátum', fmtDate(targetBooking.date));
    addRow(dl, 'Čas', fmtTimeSlots(targetBooking.timeSlots));

    if (isBlock) {
      addRow(dl, 'Dôvod blokácie', targetBooking.blockReason || 'Blokované');
    } else {
      addRow(dl, 'Meno klienta', targetBooking.customer?.name);
      addRow(dl, 'Telefón', targetBooking.customer?.phone);
      addRow(dl, 'E-mail', targetBooking.customer?.email);
      addRow(dl, 'Poznámka', targetBooking.customer?.note);
      if (targetBooking.totalPrice) {
        addRow(dl, 'Cena', `${targetBooking.totalPrice} €`);
      }
    }

    const cancelBtn = $('modal-cancel-btn');
    cancelBtn.disabled = false;
    cancelBtn.textContent = isBlock ? 'Zrušiť blokáciu' : 'Zrušiť rezerváciu';
    cancelBtn.onclick = () => deleteBooking(targetBooking, cancelBtn, true);

    $('slot-modal-backdrop').hidden = false;
  }

  function closeSlotModal() {
    $('slot-modal-backdrop').hidden = true;
    state.activeModalBooking = null;
  }

  $('modal-close').onclick = closeSlotModal;
  $('slot-modal-backdrop').addEventListener('click', (e) => {
    if (e.target === $('slot-modal-backdrop')) closeSlotModal();
  });

  // ---------- Výber dôvodu blokácie (<select> + dynamické pole "Iné") ----------
  const reasonSelect = $('block-reason-select');
  const customWrap = $('custom-reason-wrap');
  const customInput = $('block-reason-custom');

  reasonSelect.addEventListener('change', () => {
    const isOther = reasonSelect.value === 'Iné';
    customWrap.hidden = !isOther;
    if (isOther) {
      customInput.focus();
    } else {
      customInput.value = '';
      customInput.classList.remove('invalid');
    }
  });

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
    customInput.classList.remove('invalid');

    const isOther = reasonSelect.value === 'Iné';
    const blockReason = isOther ? customInput.value.trim() : reasonSelect.value;

    if (!blockReason) {
      customInput.classList.add('invalid');
      customInput.focus();
      err.textContent = 'Zadajte vlastný dôvod blokácie.';
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
      await loadAllBookings();
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
    customWrap.hidden = true;
    state.selected = [];
    $('step-done').hidden = true;
    $('step-court').hidden = false;
    $('step-date').hidden = false;
    $('step-time').hidden = false;
    loadSlots();
    updateForm();
  };

  // ---------- Aktuálne rezervácie a blokácie (Zoznam + Rušenie so storno e-mailom) ----------
  $('refresh-bookings').onclick = () => loadAllBookings();

  async function loadAllBookings() {
    if (!state.auth) return;
    const container = $('admin-bookings-list');
    container.innerHTML = '<p class="muted">Načítavam zoznam rezervácií…</p>';
    try {
      const r = await fetch('/api/bookings?all=1', {
        headers: {
          'x-admin-user': state.auth.username,
          'x-admin-password': state.auth.password,
        },
        cache: 'no-store',
      });
      if (!r.ok) throw new Error();
      const data = await r.json();
      state.allBookings = data.bookings || [];
      renderAllBookings();
      renderCalendar();
      if (state.date) renderSlots();
    } catch {
      container.innerHTML = '<p class="error">Nepodarilo sa načítať zoznam rezervácií.</p>';
    }
  }

  function renderAllBookings() {
    const container = $('admin-bookings-list');
    container.innerHTML = '';

    if (!state.allBookings.length) {
      container.innerHTML = '<p class="muted" style="margin:.4rem 0 0">Momentálne nie sú evidované žiadne rezervácie ani blokácie.</p>';
      return;
    }

    state.allBookings.forEach((b) => {
      const item = document.createElement('div');
      item.className = 'booking-item' + (b.isAdminBlock ? ' is-block' : '');

      const info = document.createElement('div');
      info.className = 'booking-info';

      const topRow = document.createElement('div');
      topRow.className = 'booking-top';

      const badge = document.createElement('span');
      badge.className = 'booking-badge ' + (b.isAdminBlock ? 'badge-block' : 'badge-client');
      badge.textContent = b.isAdminBlock ? 'Blokácia' : 'Rezervácia';
      topRow.appendChild(badge);

      const courtStrong = document.createElement('strong');
      courtStrong.textContent = b.courtName || b.courtId;
      topRow.appendChild(courtStrong);

      info.appendChild(topRow);

      const meta = document.createElement('div');
      meta.className = 'booking-meta';
      meta.textContent = `${fmtDate(b.date)} · ${fmtTimeSlots(b.timeSlots)}`;
      info.appendChild(meta);

      const detail = document.createElement('div');
      detail.className = 'booking-detail';
      if (b.isAdminBlock) {
        detail.textContent = `Dôvod: ${b.blockReason || 'Blokované'}`;
      } else {
        const cust = b.customer || {};
        const parts = [cust.name, cust.phone, cust.email].filter(Boolean);
        detail.textContent = `Klient: ${parts.join(' · ')}${cust.note ? ` (${cust.note})` : ''}`;
      }
      info.appendChild(detail);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'danger-btn';
      delBtn.textContent = 'Zrušiť';
      delBtn.onclick = () => deleteBooking(b, delBtn, false);

      item.appendChild(info);
      item.appendChild(delBtn);
      container.appendChild(item);
    });
  }

  async function deleteBooking(b, btn, fromModal) {
    let cancelReason = '';

    if (b.isAdminBlock) {
      if (!confirm('Naozaj chcete zrušiť túto blokáciu?')) return;
    } else {
      const input = prompt('Zadajte dôvod zrušenia rezervácie (odošle sa zákazníkovi e-mailom):', 'Nepriaznivé počasie');
      if (input === null) return;
      cancelReason = input.trim() || 'Zrušené administrátorom';
    }

    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Ruším…';

    try {
      const r = await fetch('/api/bookings', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: b.bookingId,
          date: b.date,
          courtId: b.courtId,
          timeSlots: b.timeSlots,
          cancelReason,
          adminUser: state.auth?.username,
          adminPassword: state.auth?.password,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || 'Nepodarilo sa zrušiť termín.');
        btn.disabled = false;
        btn.textContent = origText;
        return;
      }
      if (fromModal) closeSlotModal();
      await loadAllBookings();
      if (state.date === b.date && state.court.id === b.courtId) {
        await loadSlots();
      }
    } catch {
      alert('Chyba pripojenia k serveru.');
      btn.disabled = false;
      btn.textContent = origText;
    }
  }
})();
