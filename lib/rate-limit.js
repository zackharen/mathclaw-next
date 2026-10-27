// Small in-memory rate limiter for API routes and server actions.
// Counts live in each server instance, so this stops a runaway script or
// code guessing from one account, not a distributed attack. Key by user id
// where possible: a whole class shares one school IP address.
const buckets = new Map();
const MAX_KEYS = 5000;

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (now >= v.resetAt) buckets.delete(k);
      if (buckets.size >= MAX_KEYS) buckets.delete(buckets.keys().next().value);
    }
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  const ok = entry.count <= limit;
  return { ok, retryAfterSeconds: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000) };
}

export function tooManyRequests(retryAfterSeconds, message = "Too many requests. Wait a moment and try again.") {
  return Response.json(
    { error: message },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds || 60) } },
  );
}

export function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

// For tests.
export function resetRateLimits() {
  buckets.clear();
}
