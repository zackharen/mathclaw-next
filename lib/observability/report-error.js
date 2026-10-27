import { sentryOptions } from "@/lib/observability/sentry-options";

// Sends a caught error to Sentry when it is configured. Loads the SDK lazily.
export function reportError(error) {
  if (!sentryOptions.enabled) return;
  import("@sentry/nextjs")
    .then((Sentry) => Sentry.captureException(error))
    .catch(() => {});
}
