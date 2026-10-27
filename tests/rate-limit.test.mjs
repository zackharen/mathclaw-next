import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, resetRateLimits } from "../lib/rate-limit.js";
import { scrubEvent } from "../lib/observability/sentry-options.js";

test("rate limit allows up to the limit, then blocks until the window resets", () => {
  resetRateLimits();
  const opts = { limit: 3, windowMs: 60_000 };
  assert.equal(rateLimit("a", opts).ok, true);
  assert.equal(rateLimit("a", opts).ok, true);
  assert.equal(rateLimit("a", opts).ok, true);
  const blocked = rateLimit("a", opts);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfterSeconds > 0 && blocked.retryAfterSeconds <= 60);
  assert.equal(rateLimit("b", opts).ok, true, "other keys are separate");
});

test("rate limit window expires", () => {
  resetRateLimits();
  const opts = { limit: 1, windowMs: 1 };
  assert.equal(rateLimit("c", opts).ok, true);
  const until = Date.now() + 5;
  while (Date.now() < until) {}
  assert.equal(rateLimit("c", opts).ok, true);
});

test("Sentry events lose query strings, cookies, and personal details", () => {
  const event = scrubEvent({
    request: {
      url: "https://www.mathclaw.com/play?join=ABC123",
      query_string: "join=ABC123",
      cookies: { sb: "x" },
      data: { answer: "42" },
      headers: { cookie: "sb=x", authorization: "Bearer t", "user-agent": "ua" },
    },
    user: { id: "u1", email: "kid@school.org", ip_address: "1.2.3.4" },
    breadcrumbs: [{ data: { url: "/api/x?code=1", to: "/a?b=c", from: "/d?e=f" } }],
  });
  assert.equal(event.request.url, "https://www.mathclaw.com/play");
  assert.equal(event.request.query_string, undefined);
  assert.equal(event.request.cookies, undefined);
  assert.equal(event.request.data, undefined);
  assert.deepEqual(event.request.headers, { "user-agent": "ua" });
  assert.deepEqual(event.user, { id: "u1" });
  assert.deepEqual(event.breadcrumbs[0].data, { url: "/api/x", to: "/a", from: "/d" });
});
