"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAccountTypeForUser } from "@/lib/auth/account-type";

function encodeError(error) {
  return encodeURIComponent(error?.message || "unknown-error");
}

export async function submitBugReportAction(formData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect=/report-bug");
  }

  const summary = String(formData.get("summary") || "").trim();
  const details = String(formData.get("details") || "").trim();
  const expectedBehavior = String(formData.get("expected_behavior") || "").trim();
  const pagePath = String(formData.get("page_path") || "").trim();
  const severity = String(formData.get("severity") || "normal").trim().toLowerCase();

  if (!summary || !details) {
    redirect("/report-bug?error=missing-fields");
  }

  const allowedSeverity = ["minor", "normal", "major", "blocking"];
  const normalizedSeverity = allowedSeverity.includes(severity) ? severity : "normal";
  const accountType = await getAccountTypeForUser(supabase, user);
  const reporterName =
    user.user_metadata?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    "";

  const admin = createAdminClient();
  const { error } = await admin.from("bug_reports").insert({
    reporter_id: user.id,
    reporter_email: user.email || "unknown@mathclaw.local",
    reporter_name: reporterName || null,
    account_type: accountType || null,
    page_path: pagePath || null,
    severity: normalizedSeverity,
    summary,
    details,
    expected_behavior: expectedBehavior || null,
    status: "open",
  });

  if (error) {
    redirect(`/report-bug?error=${encodeError(error)}`);
  }

  revalidatePath("/admin");
  redirect("/report-bug?submitted=1");
}
