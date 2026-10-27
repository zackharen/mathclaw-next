const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing in MathClaw is meant to be framed by another site.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// Report-only for now: browsers log violations to /api/csp-report but block
// nothing. Once the Vercel logs are quiet, rename the header to
// "Content-Security-Policy" to enforce it.
const isDev = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  // Next.js streams inline bootstrap scripts; Desmos and KaTeX load from CDNs.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.desmos.com https://cdn.jsdelivr.net`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.desmos.com",
  "font-src 'self' data: https://cdn.jsdelivr.net https://www.desmos.com",
  // Teachers project images and video from many sites.
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.desmos.com${isDev ? " ws:" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'self' https://www.desmos.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-report",
].join("; ");

securityHeaders.push({ key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy });

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["ffmpeg-static"],
  images: {
    // Logos and static art rarely change; cache optimized variants for a year
    // so they are not re-optimized on every cold edge request.
    minimumCacheTTL: 31536000,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
