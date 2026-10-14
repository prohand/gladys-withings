// -----------------------------------------------------------------------------
// Dates as Withings speaks them: unix seconds for measures and nights,
// `YYYY-MM-DD` in the account's own timezone for the daily activity.
// -----------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of an instant in a timezone (UTC when it is unknown). */
export function ymd(ms, timeZone) {
  const format = (zone) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(ms));
  try {
    return format(timeZone || 'UTC');
  } catch {
    // An unknown zone name (RangeError): the UTC date is off by a few hours
    // at worst.
    return format('UTC');
  }
}

/** `YYYY-MM-DD` a number of days away from an instant, in UTC. */
export function ymdShift(ms, days) {
  return ymd(ms + days * DAY_MS, 'UTC');
}

export function toSeconds(ms) {
  return Math.floor(ms / 1000);
}

/** ISO 8601 date of a unix timestamp in seconds. */
export function isoFromSeconds(seconds) {
  return new Date(Number(seconds) * 1000).toISOString();
}
