import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function listSchoolOptions() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("school_name")
    .not("school_name", "is", null)
    .order("school_name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return [...new Set(
    (data || [])
      .map((row) => String(row.school_name || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}
