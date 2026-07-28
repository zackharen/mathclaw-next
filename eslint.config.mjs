import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Same generated output, but nested inside a worktree rather than at the root.
    "**/.next/**",
    "**/out/**",
    // Throwaway agent worktrees. They are gitignored local state, not repo source,
    // but flat config does not read .gitignore, so `eslint .` was linting stale
    // copies of the app and burying the real source findings.
    ".claude/worktrees/**",
  ]),
  {
    // Projector screens render whatever a teacher pushes: base64 `data:` URIs
    // (screen_states routinely carries megabytes of them), GIFs, and arbitrary
    // remote URLs, at sizes decided by CSS object-fit rather than known at render
    // time. next/image cannot optimize data: URIs, needs explicit dimensions, and
    // would require allowlisting every host a teacher might paste. The renderer
    // also relies on plain <img> remount semantics (key={content}) to reset
    // object-fit geometry on iPad Safari. Plain <img> is the correct element here.
    files: [
      "app/projector/**/*.js",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;
