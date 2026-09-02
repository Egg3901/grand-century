function daysInMonth(year, month) {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function compareDateParts(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** Parse OHM's YYYY, YYYY-MM, or YYYY-MM-DD convention into an inclusive bound. */
export function parseOhmDate(value, bound = 'start') {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d{1,6})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : bound === 'end' ? 12 : 1;
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  const maxDay = daysInMonth(year, month);
  const day = match[3] ? Number(match[3]) : bound === 'end' ? maxDay : 1;
  if (!Number.isInteger(day) || day < 1 || day > maxDay) return null;
  return [year, month, day];
}

export function requireExactDate(value) {
  if (typeof value !== 'string' || !/^-?\d{1,6}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`[ohm] expected an exact YYYY-MM-DD date, got ${String(value)}`);
  }
  const parsed = parseOhmDate(value);
  if (!parsed) throw new Error(`[ohm] invalid date ${value}`);
  return parsed;
}

export function relationActiveOn(tags, exactDate) {
  const target = requireExactDate(exactDate);
  const start = tags?.start_date ? parseOhmDate(tags.start_date, 'start') : null;
  const end = tags?.end_date ? parseOhmDate(tags.end_date, 'end') : null;
  if (tags?.start_date && !start) return false;
  if (tags?.end_date && !end) return false;
  return (!start || compareDateParts(start, target) <= 0)
    && (!end || compareDateParts(target, end) <= 0);
}
