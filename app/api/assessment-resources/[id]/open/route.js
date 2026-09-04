import { NextResponse } from "next/server";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { LESSON_RESOURCE_BUCKET, normalizeLessonResourceUrl } from "@/lib/lesson-resources/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/auth/sign-in", request.url));
  const admin = createAdminClient();
  const { data: resource, error } = await admin
    .from("assessment_resources")
    .select("id, course_id, resource_type, url, storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error || !resource) return NextResponse.json({ error: "Assessment resource not found." }, { status: 404 });
  const access = await getCourseAccessForUser(supabase, user.id, resource.course_id, "id, owner_id");
  if (!access?.course) return NextResponse.json({ error: "You do not have access to this assessment resource." }, { status: 403 });
  if (resource.resource_type === "link") {
    const url = normalizeLessonResourceUrl(resource.url);
    if (!url) return NextResponse.json({ error: "This link is invalid." }, { status: 400 });
    return NextResponse.redirect(url);
  }
  const { data, error: signedError } = await admin.storage
    .from(resource.storage_bucket || LESSON_RESOURCE_BUCKET)
    .createSignedUrl(resource.storage_path, 300, { download: false });
  if (signedError || !data?.signedUrl) return NextResponse.json({ error: signedError?.message || "File could not be opened." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
