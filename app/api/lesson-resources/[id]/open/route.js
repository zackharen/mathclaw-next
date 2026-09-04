import { NextResponse } from "next/server";
import { LESSON_RESOURCE_BUCKET, normalizeLessonResourceUrl } from "@/lib/lesson-resources/constants";
import { canUserOpenLessonResource } from "@/lib/lesson-resources/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/auth/sign-in", _request.url));

  const admin = createAdminClient();
  const { data: resource, error } = await admin
    .from("lesson_resources")
    .select("id, owner_id, resource_type, url, storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !resource) {
    return NextResponse.json({ error: "Resource not found." }, { status: 404 });
  }
  if (!(await canUserOpenLessonResource({ userId: user.id, resource, admin }))) {
    return NextResponse.json({ error: "You do not have access to this resource." }, { status: 403 });
  }

  if (resource.resource_type === "link") {
    const url = normalizeLessonResourceUrl(resource.url);
    if (!url) return NextResponse.json({ error: "This link is invalid." }, { status: 400 });
    return NextResponse.redirect(url);
  }

  const { data, error: signedUrlError } = await admin.storage
    .from(resource.storage_bucket || LESSON_RESOURCE_BUCKET)
    .createSignedUrl(resource.storage_path, 300, { download: false });
  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json({ error: signedUrlError?.message || "File could not be opened." }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl);
}
