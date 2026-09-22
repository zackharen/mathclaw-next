// Lets a receiver saved to an iPad's Home Screen launch without Safari's
// toolbar/address bar (true standalone mode). This is the only way to get a
// fullscreen-equivalent view on iPadOS before 16.4, which never supported the
// in-page Fullscreen API for anything but a <video> element — see the
// toggleFullscreen() fallback comment in screen-client.js.
export const metadata = {
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Projector",
  },
  // Next.js's `appleWebApp.capable` only emits the modern unprefixed
  // `mobile-web-app-capable`, but iPadOS Safari before 16.4 — the exact
  // devices this is for — only honors the legacy Apple-prefixed name.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  viewportFit: "cover",
};

export default function ProjectorScreenLayout({ children }) {
  return children;
}
