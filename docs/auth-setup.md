# Supabase Auth Setup

## Environment variables
Set in local `.env.local` and Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Supabase Auth settings
In Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL:
  - Local: `http://localhost:3000`
  - Production: `https://www.mathclaw.com`

- Redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `https://www.mathclaw.com/auth/callback`
  - `https://mathclaw.com/auth/callback`

## Google provider
In Supabase Dashboard -> Authentication -> Providers -> Google:

1. Enable Google.
2. Add Google OAuth client ID/secret from Google Cloud.
3. Add authorized redirect URI shown by Supabase in the Google console.

## Protected routes in app
The middleware currently protects:

- `/onboarding/*`
- `/classes/*`
- `/dashboard/*`

Unauthenticated users are redirected to `/auth/sign-in`.
