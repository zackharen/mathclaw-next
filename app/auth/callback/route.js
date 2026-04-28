import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureProfileForUser,
  getAccountTypeForUser,
  parseAccountType,
  sanitizeNextForAccountType,
} from "@/lib/auth/account-type";
import { removeLegacySavedGamesFromMetadata } from "@/lib/auth/session-metadata";
import { normalizeJoinCode } from "@/lib/student-games/join-code";

function appendQueryParams(path, entries) {
  const url = new URL(path, "http://localhost");
  for (const [key, value] of Object.entries(entries)) {
    if (value === null || value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

async function joinCourseByCodeForUser(userId, rawJoinCode) {
  const joinCode = normalizeJoinCode(rawJoinCode);
  if (!joinCode) return { courseId: null, error: "missing" };

  const admin = createAdminClient();
  const { data: courses, error: courseError } = await admin
    .from("courses")
    .select("id, owner_id")
    .ilike("student_join_code", joinCode)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (courseError) {
    return { courseId: null, error: "server" };
  }

  const course = courses?.[0] || null;
  if (!course) {
    return { courseId: null, error: "not_found" };
  }

  if (course.owner_id !== userId) {
    const { error: membershipError } = await admin.from("student_course_memberships").upsert(
      {
        course_id: course.id,
        profile_id: userId,
      },
      { onConflict: "course_id,profile_id" }
    );

    if (membershipError) {
      return { courseId: null, error: "server" };
    }
  }

  return { courseId: course.id, error: null };
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = requestUrl.searchParams.get("next");
  const requestedAccountType = parseAccountType(requestUrl.searchParams.get("account_type"));
  const requestedSchoolName = String(requestUrl.searchParams.get("school_name") || "").trim();
  const requestedJoinCode = requestUrl.searchParams.get("join_code");

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

      if (
        user.user_metadata?.account_type !== currentAccountType ||
        user.user_metadata?.saved_games ||
        (requestedSchoolName && user.user_metadata?.school_name !== requestedSchoolName)
      ) {
        const { metadata } = removeLegacySavedGamesFromMetadata(user.user_metadata);
        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            ...metadata,
            account_type: currentAccountType,
            ...(requestedSchoolName ? { school_name: requestedSchoolName } : {}),
          },
        });
        if (updateError) {
          return NextResponse.redirect(
            new URL(
              `/auth/sign-in?error=${encodeURIComponent("Could not finish account cleanup. Please try again.")}`,
              requestUrl.origin
            )
          );
        }
      }

      const {
        data: { user: refreshedUser },
      } = await supabase.auth.getUser();

      await ensureProfileForUser(supabase, refreshedUser || user, currentAccountType);
      next = sanitizeNextForAccountType(requestedNext, currentAccountType);

      if (currentAccountType === "student" && requestedJoinCode) {
        const joinResult = await joinCourseByCodeForUser(user.id, requestedJoinCode);
        if (joinResult.courseId) {
          next = appendQueryParams(next, { join_success: "1", course: joinResult.courseId });
        } else if (joinResult.error) {
          next = appendQueryParams(next, { join_error: joinResult.error });
        }
      }
    }
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
