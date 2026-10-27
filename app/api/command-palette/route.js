import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { listEditableCoursesForUser } from "@/lib/courses/access";

// Classes for the teacher command palette. Loaded only when the palette opens.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ classes: [] }, { status: 401 });

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) return NextResponse.json({ classes: [] }, { status: 403 });

  try {
    const courses = await listEditableCoursesForUser(supabase, user.id);
    const classes = courses.map((course) => ({
      id: course.id,
      title: course.title || course.class_name || "Untitled class",
      subtitle: course.title && course.class_name && course.class_name !== course.title ? course.class_name : "",
    }));
    return NextResponse.json({ classes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ classes: [] }, { status: 500 });
  }
}
