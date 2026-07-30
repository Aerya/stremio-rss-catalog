function parseRetryAfterAt(error, fallbackMs = 15 * 60 * 1000, now = Date.now()) {
  const status = Number(error?.response?.status || error?.httpStatus) || null;
  if (status !== 429) return null;
  const value = error?.response?.headers?.['retry-after']
    ?? error?.response?.headers?.get?.('retry-after');
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return now + Math.max(1000, seconds * 1000);
  }
  const date = Date.parse(String(value || ''));
  if (Number.isFinite(date) && date > now) return date;
  return now + fallbackMs;
}

function rateLimitMessage(label, retryAfterAt) {
  const suffix = Number(retryAfterAt) > Date.now()
    ? `, reprise autorisée vers ${new Date(retryAfterAt).toLocaleString('fr-FR')}`
    : '';
  return `${label} limite temporairement les requêtes (HTTP 429)${suffix}`;
}

module.exports = { parseRetryAfterAt, rateLimitMessage };
