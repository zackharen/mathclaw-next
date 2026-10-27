// Shared Sentry settings. Sentry stays off until NEXT_PUBLIC_SENTRY_DSN is set in Vercel.
// No personal data: no IPs, cookies, query strings, or session replays.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

function stripQuery(url) {
  return typeof url === "string" ? url.split("?")[0] : url;
}

export function scrubEvent(event) {
  if (event.request) {
    event.request.url = stripQuery(event.request.url);
    delete event.request.query_string;
    delete event.request.cookies;
    delete event.request.data;
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.Cookie;
      delete event.request.headers.authorization;
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  for (const crumb of event.breadcrumbs || []) {
    if (crumb.data?.url) crumb.data.url = stripQuery(crumb.data.url);
    if (crumb.data?.to) crumb.data.to = stripQuery(crumb.data.to);
    if (crumb.data?.from) crumb.data.from = stripQuery(crumb.data.from);
  }
  return event;
}

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
  beforeSend: scrubEvent,
};
