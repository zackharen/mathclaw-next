import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ensureProfileForUser,
  getAccountTypeForUser,
  parseAccountType,
  sanitizeNextForAccountType,
} from "@/lib/auth/account-type";

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const requestedAccountType = parseAccountType(requestUrl.searchParams.get("account_type"));

  let next = sanitizeNextForAccountType(requestedNext, requestedAccountType || "teacher");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const currentAccountType =
        requestedAccountType || (await getAccountTypeForUser(supabase, user, "teacher"));

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
