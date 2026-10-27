// Receives Content-Security-Policy-Report-Only violations (see next.config.mjs)
// and writes one short line per report to the Vercel logs.
export async function POST(request) {
  try {
    const body = await request.json();
    const report = body?.["csp-report"] || body?.[0]?.body || body || {};
    const directive = report["violated-directive"] || report.effectiveDirective || "";
    const blocked = report["blocked-uri"] || report.blockedURL || "";
    const page = report["document-uri"] || report.documentURL || "";
    const pagePath = page ? new URL(page, "https://mathclaw.com").pathname : "";
    console.warn(`[csp-report] ${directive} blocked=${String(blocked).slice(0, 200)} page=${pagePath}`);
  } catch {
    // Malformed reports are ignored.
  }
  return new Response(null, { status: 204 });
}
