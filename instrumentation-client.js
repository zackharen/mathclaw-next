import { sentryOptions } from "@/lib/observability/sentry-options";

// Load the Sentry browser SDK only when a DSN is configured, so pages don't
// download it while error tracking is switched off.
let captureTransition = null;

if (sentryOptions.enabled) {
  import("@sentry/nextjs").then((Sentry) => {
    Sentry.init(sentryOptions);
    captureTransition = Sentry.captureRouterTransitionStart;
  });
}

export function onRouterTransitionStart(...args) {
  captureTransition?.(...args);
}
