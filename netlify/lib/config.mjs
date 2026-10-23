export const PRICE_PER_HOUR = 8;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 21;

export const COURTS = {
  court_1: 'Kurt 1 – Antuka',
  court_2: 'Kurt 2 – Antuka',
  court_3: 'Kurt 3 – Hard',
};

const pad = (n) => String(n).padStart(2, '0');

/** Všetkých 13 povolených slotov: "08:00-09:00" ... "20:00-21:00" */
export const ALL_SLOTS = Array.from(
  { length: CLOSE_HOUR - OPEN_HOUR },
  (_, i) => `${pad(OPEN_HOUR + i)}:00-${pad(OPEN_HOUR + i + 1)}:00`
);
