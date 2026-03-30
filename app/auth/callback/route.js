import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ensureProfileForUser,
  normalizeAccountType,
  sanitizeNextForAccountType,
} from "@/lib/auth/account-type";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const requestedAccountType = normalizeAccountType(
    requestUrl.searchParams.get("account_type")
  );

  let next = sanitizeNextForAccountType(requestedNext, requestedAccountType);

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const currentAccountType = normalizeAccountType(
        user.user_metadata?.account_type || requestedAccountType
      );

      if (user.user_metadata?.account_type !== currentAccountType) {
        await supabase.auth.updateUser({
          data: { account_type: currentAccountType },
        });
      }

      await ensureProfileForUser(supabase, user, currentAccountType);
      next = sanitizeNextForAccountType(requestedNext, currentAccountType);
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
