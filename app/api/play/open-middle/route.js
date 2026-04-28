import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDefaultDisplayName,
  getAccountTypeForUser,
  isTeacherAccountType,
} from "@/lib/auth/account-type";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import {
  buildBlankPlacements,
  buildDefaultOpenMiddleRules,
  generateOpenMiddleVersions,
  getOpenMiddleVisibilityLabel,
  normalizeDigitPool,
  normalizeOperatorPool,
  OPEN_MIDDLE_GAME_SLUG,
  parseOpenMiddleTemplate,
  usedDigitsFromPlacements,
  validateOpenMiddleResponse,
} from "@/lib/open-middle/core";

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTimerSeconds(value) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(15, Math.min(parsed, 900));
}

function normalizeVisibility(value) {
  return ["private", "class", "school", "public"].includes(value) ? value : "private";
}

function normalizeSessionStatus(value) {
  return ["waiting", "live", "reveal", "ended"].includes(value) ? value : "waiting";
}

async function getViewerContext(supabase, user) {
  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: OPEN_MIDDLE_GAME_SLUG,
    viewerAccountType: accountType,
  });
  return { accountType, courses };
}

function getCourseRecord(courses, courseId) {
  return (courses || []).find((course) => course.id === courseId) || null;
}

function canManageCourse(courses, courseId, accountType) {
  if (!courseId) return isTeacherAccountType(accountType);
  const course = getCourseRecord(courses, courseId);
  return Boolean(
    course && (course.relationship === "owner" || course.relationship === "co_teacher")
  );
}

function canAccessCourse(courses, courseId) {
  if (!courseId) return true;
  return Boolean(getCourseRecord(courses, courseId));
}

async function resolveDisplayName(supabase, user) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return String(data?.display_name || buildDefaultDisplayName(user)).trim() || "MathClaw User";
}

async function resolveSchoolContext(admin, supabase, user, requestedSchoolName = "") {
  const normalizedName = String(requestedSchoolName || "").trim();
  const { data: profile } = await supabase
    .from("profiles")
    .select("school_name")
    .eq("id", user.id)
    .maybeSingle();
  const schoolName = normalizedName || String(profile?.school_name || "").trim();

  if (!schoolName) {
    const { data: memberships } = await admin
      .from("school_memberships")
      .select("school_id, role, schools!inner(id, name)")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: true });

    return {
      schoolId: memberships?.[0]?.school_id || null,
      schools: (memberships || []).map((row) => ({
        id: row.school_id,
        name: row.schools?.name || "School",
        role: row.role || "member",
      })),
    };
  }

  let { data: school } = await admin.from("schools").select("*").ilike("name", schoolName).maybeSingle();
  if (!school) {
    const { data: inserted, error } = await admin
      .from("schools")
      .insert({
        name: schoolName,
        created_by: user.id,
        updated_at: nowIso(),
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    school = inserted;
  }

  await admin.from("school_memberships").upsert(
    {
      school_id: school.id,
      profile_id: user.id,
      role: school.created_by === user.id ? "owner" : "member",
      updated_at: nowIso(),
    },
    { onConflict: "school_id,profile_id" }
  );

  const { data: memberships } = await admin
    .from("school_memberships")
    .select("school_id, role, schools!inner(id, name)")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });

  return {
    schoolId: school.id,
    schools: (memberships || []).map((row) => ({
      id: row.school_id,
      name: row.schools?.name || "School",
      role: row.role || "member",
    })),
  };
}

function templateVisibleToViewer(template, viewer, userId, schoolIds = []) {
  if (!template) return false;
  if (template.created_by === userId) return true;
  if (!template.approved) return false;
  if (template.visibility === "public") return true;
  if (template.visibility === "school") {
    return template.school_id && schoolIds.includes(template.school_id);
  }
  if (template.visibility === "class") {
    const courseId = template.rules?.courseId || null;
    return courseId ? canAccessCourse(viewer.courses, courseId) : false;
  }
  return false;
}

async function listVisibleTemplates(admin, viewer, user, options = {}) {
  const courseId = normalizeId(options.courseId);
  const schoolContext = await resolveSchoolContext(admin, admin, user);
  const schoolIds = schoolContext.schools.map((row) => row.id);
  const { data: templates } = await admin
    .from("open_middle_templates")
    .select("*, open_middle_template_versions(*)")
    .order("updated_at", { ascending: false })
    .limit(100);

  return (templates || [])
    .filter((template) => templateVisibleToViewer(template, viewer, user.id, schoolIds))
    .filter((template) => {
      if (!courseId) return true;
      if (template.visibility !== "class") return true;
      return String(template.rules?.courseId || "") === courseId;
    })
    .map((template) => ({
      id: template.id,
      title: template.title,
      standardCode: template.standard_code || "",
      visibility: template.visibility,
      visibilityLabel: getOpenMiddleVisibilityLabel(template.visibility),
      approved: Boolean(template.approved),
      createdBy: template.created_by,
      schoolId: template.school_id,
      digitPool: normalizeDigitPool(template.digit_pool),
      rules: template.rules || buildDefaultOpenMiddleRules(),
      parsedStructure: template.parsed_structure || null,
      rawInput: template.raw_input,
      versions: (template.open_middle_template_versions || [])
        .sort((a, b) => Number(b.is_base) - Number(a.is_base))
        .map((version) => ({
          id: version.id,
          title: version.title,
          rawInput: version.raw_input,
          parsedStructure: version.parsed_structure,
          operatorSignature: version.operator_signature,
          isBase: Boolean(version.is_base),
        })),
    }));
}

async function listSessionRows(admin, viewer, user, courseId = null) {
  let query = admin
    .from("open_middle_sessions")
    .select(
      "*, open_middle_templates(title, standard_code, digit_pool, rules), open_middle_template_versions(title, raw_input, parsed_structure, operator_signature)"
    )
    .in("status", ["waiting", "live", "reveal"])
    .order("updated_at", { ascending: false })
    .limit(20);

  if (courseId) {
    query = query.eq("course_id", courseId);
  } else if (viewer.accountType === "teacher") {
    const teacherCourseIds = viewer.courses
      .filter((course) => course.relationship === "owner" || course.relationship === "co_teacher")
      .map((course) => course.id);
    if (teacherCourseIds.length) {
      query = query.in("course_id", teacherCourseIds);
    } else {
      query = query.eq("host_teacher_id", user.id);
    }
  } else {
    const studentCourseIds = viewer.courses.map((course) => course.id);
    if (!studentCourseIds.length) return [];
    query = query.in("course_id", studentCourseIds);
  }

  const { data } = await query;
  return data || [];
}

async function syncSessionState(admin, session) {
  const safeStatus = normalizeSessionStatus(session?.status);
  if (safeStatus !== "live") return session;
  const revealAtMs = Date.parse(String(session?.reveal_at || ""));
  if (!Number.isFinite(revealAtMs) || revealAtMs > Date.now()) return session;

  const { data: updated, error } = await admin
    .from("open_middle_sessions")
    .update({
      status: "reveal",
      updated_at: nowIso(),
    })
    .eq("id", session.id)
    .select("*")
    .single();

  if (error) return session;
  return updated || session;
}

async function ensurePlayer(admin, sessionId, user, displayName, role) {
  const { data, error } = await admin
    .from("open_middle_players")
    .upsert(
      {
        session_id: sessionId,
        user_id: user.id,
        display_name: displayName,
        role,
        updated_at: nowIso(),
      },
      { onConflict: "session_id,user_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function finalizeResponsesForSession(admin, session, templateVersion, template) {
  const { data: responses } = await admin
    .from("open_middle_responses")
    .select("*")
    .eq("session_id", session.id);

  for (const response of responses || []) {
    const validation = validateOpenMiddleResponse({
      parsedStructure: templateVersion.parsed_structure,
      placements: response.response_values || {},
      digitPool: template.digit_pool || [],
      rules: template.rules || {},
    });

    await admin
      .from("open_middle_responses")
      .update({
        validation_result: validation,
        is_complete: validation.isComplete,
        is_correct: validation.isCorrect,
        submitted_at: response.submitted_at || nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", response.id);
  }
}

function sessionVisibleToViewer(session, viewer, user) {
  if (!session) return false;
  if (session.host_teacher_id === user.id) return true;
  return canAccessCourse(viewer.courses, session.course_id);
}

function sessionManageableByViewer(session, viewer, user) {
  if (!session) return false;
  if (session.host_teacher_id === user.id) return true;
  return canManageCourse(viewer.courses, session.course_id, viewer.accountType);
}

function serializeDashboardSession(session) {
  const template = session.open_middle_templates || {};
  const version = session.open_middle_template_versions || {};
  const revealAtMs = Date.parse(String(session.reveal_at || ""));
  return {
    id: session.id,
    courseId: session.course_id,
    status: session.status,
    timerSeconds: Number(session.timer_seconds || 120),
    revealAt: session.reveal_at,
    secondsRemaining: Number.isFinite(revealAtMs)
      ? Math.max(0, Math.ceil((revealAtMs - Date.now()) / 1000))
      : 0,
    templateTitle: template.title || version.title || "Open Middle",
    standardCode: template.standard_code || "",
    versionTitle: version.title || template.title || "Base version",
  };
}

async function loadSessionBundle(admin, sessionId, viewer, user) {
  const { data: rawSession } = await admin
    .from("open_middle_sessions")
    .select(
      "*, open_middle_templates(*), open_middle_template_versions(*), open_middle_players(*), open_middle_responses(*)"
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (!rawSession) return null;
  if (!sessionVisibleToViewer(rawSession, viewer, user)) return null;

  const session = await syncSessionState(admin, rawSession);
  const template = rawSession.open_middle_templates || {};
  const templateVersion = rawSession.open_middle_template_versions || {};
  const canManage = sessionManageableByViewer(rawSession, viewer, user);

  if (session.status === "reveal" || session.status === "ended") {
    await finalizeResponsesForSession(admin, session, templateVersion, template);
  }

  const { data: players } = await admin
    .from("open_middle_players")
    .select("*")
    .eq("session_id", session.id)
    .order("joined_at", { ascending: true });
  const { data: responses } = await admin
    .from("open_middle_responses")
    .select("*")
    .eq("session_id", session.id)
    .order("updated_at", { ascending: false });

  const playersById = new Map((players || []).map((player) => [player.user_id, player]));
  const viewerResponse = (responses || []).find((response) => response.user_id === user.id) || null;
  const revealAtMs = Date.parse(String(session.reveal_at || ""));

  return {
    id: session.id,
    courseId: session.course_id,
    status: session.status,
    canManage,
    title: template.title || templateVersion.title || "Open Middle",
    versionTitle: templateVersion.title || template.title || "Open Middle",
    standardCode: template.standard_code || "",
    timerSeconds: Number(session.timer_seconds || 120),
    revealAt: session.reveal_at,
    secondsRemaining: Number.isFinite(revealAtMs)
      ? Math.max(0, Math.ceil((revealAtMs - Date.now()) / 1000))
      : 0,
    digitPool: normalizeDigitPool(template.digit_pool),
    rules: template.rules || buildDefaultOpenMiddleRules(),
    rawInput: templateVersion.raw_input || template.raw_input || "",
    parsedStructure: templateVersion.parsed_structure || template.parsed_structure || null,
    playerCount: (players || []).length,
    players: (players || []).map((player) => ({
      userId: player.user_id,
      displayName: player.display_name,
      role: player.role,
      joinedAt: player.joined_at,
      hasResponse: (responses || []).some((response) => response.user_id === player.user_id),
    })),
    viewerResponse: viewerResponse
      ? {
          placements: viewerResponse.response_values || {},
          usedDigits: usedDigitsFromPlacements(viewerResponse.response_values || {}),
          updatedAt: viewerResponse.updated_at,
          isCorrect:
            session.status === "reveal" || session.status === "ended"
              ? Boolean(viewerResponse.is_correct)
              : null,
          validation:
            session.status === "reveal" || session.status === "ended"
              ? viewerResponse.validation_result || null
              : null,
        }
      : {
          placements: buildBlankPlacements(templateVersion.parsed_structure?.blankCount || 0),
          usedDigits: [],
          updatedAt: null,
          isCorrect: null,
          validation: null,
        },
    responses: canManage
      ? (responses || []).map((response) => ({
          userId: response.user_id,
          displayName: playersById.get(response.user_id)?.display_name || "Student",
          placements: response.response_values || {},
          validation: response.validation_result || null,
          isCorrect: Boolean(response.is_correct),
          isComplete: Boolean(response.is_complete),
          updatedAt: response.updated_at,
        }))
      : [],
  };
}

async function loadDashboardBundle(admin, viewer, user, courseId = null) {
  const schoolContext = await resolveSchoolContext(admin, admin, user);
  const [templates, sessions] = await Promise.all([
    listVisibleTemplates(admin, viewer, user, { courseId }),
    listSessionRows(admin, viewer, user, courseId),
  ]);

  return {
    templates,
    sessions: sessions.map(serializeDashboardSession),
    schools: schoolContext.schools,
  };
}

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = await getViewerContext(supabase, user);
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const sessionId = normalizeId(searchParams.get("sessionId"));
  const courseId = normalizeId(searchParams.get("courseId"));

  try {
    if (sessionId) {
      const session = await loadSessionBundle(admin, sessionId, viewer, user);
      if (!session) return NextResponse.json({ error: "Session not found." }, { status: 404 });
      return NextResponse.json({ session });
    }

    const dashboard = await loadDashboardBundle(admin, viewer, user, courseId);
    return NextResponse.json({ dashboard });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Open Middle failed to load." }, { status: 400 });
  }
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const viewer = await getViewerContext(supabase, user);
  const admin = createAdminClient();
  const displayName = await resolveDisplayName(supabase, user);
  const body = await request.json();
  const action = String(body.action || "");

  try {
    if (action === "save_template") {
      const title = String(body.title || "").trim();
      const rawInput = String(body.rawInput || "");
      const standardCode = String(body.standardCode || "").trim();
      const visibility = normalizeVisibility(body.visibility);
      const digitPool = normalizeDigitPool(body.digitPool);
      const versionOperators = normalizeOperatorPool(body.versionOperators);
      const authorCourseId = normalizeId(body.courseId);
      const schoolName = String(body.schoolName || "").trim();

      if (!title || !rawInput) {
        return NextResponse.json({ error: "Title and puzzle are required." }, { status: 400 });
      }

      if (visibility === "class" && authorCourseId && !canManageCourse(viewer.courses, authorCourseId, viewer.accountType)) {
        return NextResponse.json({ error: "You cannot publish a class template for that course." }, { status: 403 });
      }

      const parsed = parseOpenMiddleTemplate(rawInput);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.errors[0]?.message || "Template parsing failed.", parseErrors: parsed.errors }, { status: 400 });
      }

      const schoolContext =
        visibility === "school" || schoolName ? await resolveSchoolContext(admin, supabase, user, schoolName) : { schoolId: null };
      const rules = buildDefaultOpenMiddleRules({
        courseId: visibility === "class" ? authorCourseId : null,
      });
      rules.versionOperators = versionOperators;

      const approved = isTeacherAccountType(viewer.accountType);
      const { data: template, error } = await admin
        .from("open_middle_templates")
        .insert({
          created_by: user.id,
          school_id: schoolContext.schoolId || null,
          title,
          raw_input: parsed.normalizedRawInput,
          parsed_structure: parsed.structure,
          digit_pool: digitPool,
          rules,
          standard_code: standardCode || null,
          visibility,
          approved,
          updated_at: nowIso(),
        })
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const versions = generateOpenMiddleVersions({
        title,
        rawInput: parsed.normalizedRawInput,
        parsedStructure: parsed.structure,
        rules,
      });

      const { error: versionError } = await admin.from("open_middle_template_versions").insert(
        versions.map((version) => ({
          template_id: template.id,
          ...version,
        }))
      );

      if (versionError) return NextResponse.json({ error: versionError.message }, { status: 400 });

      const dashboard = await loadDashboardBundle(admin, viewer, user, normalizeId(body.courseId));
      return NextResponse.json({ dashboard, result: { message: "Template saved." } });
    }

    if (action === "approve_template") {
      const templateId = normalizeId(body.templateId);
      if (!templateId || !isTeacherAccountType(viewer.accountType)) {
        return NextResponse.json({ error: "Only teachers can approve templates." }, { status: 403 });
      }

      const { data: template } = await admin.from("open_middle_templates").select("*").eq("id", templateId).maybeSingle();
      if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

      const courseId = String(template.rules?.courseId || "");
      const canApprove =
        template.created_by === user.id ||
        (courseId && canManageCourse(viewer.courses, courseId, viewer.accountType));

      if (!canApprove) {
        return NextResponse.json({ error: "You do not have permission to approve that template." }, { status: 403 });
      }

      await admin
        .from("open_middle_templates")
        .update({
          approved: true,
          updated_at: nowIso(),
        })
        .eq("id", templateId);

      const dashboard = await loadDashboardBundle(admin, viewer, user, normalizeId(body.courseId));
      return NextResponse.json({ dashboard, result: { message: "Template approved." } });
    }

    if (action === "create_session") {
      const courseId = normalizeId(body.courseId);
      const templateId = normalizeId(body.templateId);
      const versionId = normalizeId(body.versionId);
      const timerSeconds = normalizeTimerSeconds(body.timerSeconds);

      if (!templateId || !versionId) {
        return NextResponse.json({ error: "Pick a template version first." }, { status: 400 });
      }

      if (courseId && !canManageCourse(viewer.courses, courseId, viewer.accountType)) {
        return NextResponse.json({ error: "Only teachers can launch Open Middle in that class." }, { status: 403 });
      }

      const { data: template } = await admin.from("open_middle_templates").select("*").eq("id", templateId).maybeSingle();
      const { data: version } = await admin.from("open_middle_template_versions").select("*").eq("id", versionId).eq("template_id", templateId).maybeSingle();
      if (!template || !version) {
        return NextResponse.json({ error: "Template version not found." }, { status: 404 });
      }

      await admin
        .from("open_middle_sessions")
        .update({
          status: "ended",
          ended_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("course_id", courseId)
        .in("status", ["waiting", "live", "reveal"]);

      const { data: session, error } = await admin
        .from("open_middle_sessions")
        .insert({
          course_id: courseId,
          host_teacher_id: user.id,
          template_id: templateId,
          template_version_id: versionId,
          timer_seconds: timerSeconds,
          status: "waiting",
          updated_at: nowIso(),
        })
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await ensurePlayer(admin, session.id, user, displayName, "teacher");
      const dashboard = await loadDashboardBundle(admin, viewer, user, courseId);
      const sessionBundle = await loadSessionBundle(admin, session.id, viewer, user);
      return NextResponse.json({ dashboard, session: sessionBundle });
    }

    const sessionId = normalizeId(body.sessionId);
    if (!sessionId) {
      return NextResponse.json({ error: "Session id is required." }, { status: 400 });
    }

    const { data: rawSession } = await admin.from("open_middle_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!rawSession) return NextResponse.json({ error: "Session not found." }, { status: 404 });

    const session = await syncSessionState(admin, rawSession);
    if (!sessionVisibleToViewer(session, viewer, user)) {
      return NextResponse.json({ error: "You do not have access to this session." }, { status: 403 });
    }

    const canManage = sessionManageableByViewer(session, viewer, user);
    const { data: template } = await admin.from("open_middle_templates").select("*").eq("id", session.template_id).single();
    const { data: version } = await admin.from("open_middle_template_versions").select("*").eq("id", session.template_version_id).single();

    if (action === "join") {
      await ensurePlayer(admin, session.id, user, displayName, canManage ? "teacher" : "student");
      const sessionBundle = await loadSessionBundle(admin, session.id, viewer, user);
      return NextResponse.json({ session: sessionBundle });
    }

    if (action === "start") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the teacher can start this session." }, { status: 403 });
      }

      const revealAt = new Date(Date.now() + Number(session.timer_seconds || 120) * 1000).toISOString();
      await admin
        .from("open_middle_sessions")
        .update({
          status: "live",
          started_at: session.started_at || nowIso(),
          reveal_at: revealAt,
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      await ensurePlayer(admin, session.id, user, displayName, "teacher");
      const sessionBundle = await loadSessionBundle(admin, session.id, viewer, user);
      return NextResponse.json({ session: sessionBundle });
    }

    if (action === "reveal") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the teacher can reveal responses." }, { status: 403 });
      }

      await admin
        .from("open_middle_sessions")
        .update({
          status: "reveal",
          updated_at: nowIso(),
        })
        .eq("id", session.id);
      await finalizeResponsesForSession(admin, session, version, template);
      const sessionBundle = await loadSessionBundle(admin, session.id, viewer, user);
      return NextResponse.json({ session: sessionBundle });
    }

    if (action === "end") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the teacher can end this session." }, { status: 403 });
      }

      await admin
        .from("open_middle_sessions")
        .update({
          status: "ended",
          ended_at: nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", session.id);
      await finalizeResponsesForSession(admin, session, version, template);
      const sessionBundle = await loadSessionBundle(admin, session.id, viewer, user);
      return NextResponse.json({ session: sessionBundle });
    }

    if (action === "save_response") {
      if (session.status === "ended") {
        return NextResponse.json({ error: "This session has already ended." }, { status: 400 });
      }

      await ensurePlayer(admin, session.id, user, displayName, canManage ? "teacher" : "student");
      const placements = buildBlankPlacements(
        version.parsed_structure?.blankCount || 0,
        body.placements && typeof body.placements === "object" ? body.placements : {}
      );
      const shouldFinalize = session.status === "reveal" || session.status === "ended";
      const validation = shouldFinalize
        ? validateOpenMiddleResponse({
            parsedStructure: version.parsed_structure,
            placements,
            digitPool: template.digit_pool || [],
            rules: template.rules || {},
          })
        : {};

      await admin.from("open_middle_responses").upsert(
        {
          session_id: session.id,
          user_id: user.id,
          template_version_id: version.id,
          response_values: placements,
          validation_result: validation,
          is_complete: shouldFinalize ? Boolean(validation.isComplete) : false,
          is_correct: shouldFinalize ? Boolean(validation.isCorrect) : false,
          submitted_at: nowIso(),
          updated_at: nowIso(),
        },
        { onConflict: "session_id,user_id" }
      );

      const sessionBundle = await loadSessionBundle(admin, session.id, viewer, user);
      return NextResponse.json({
        session: sessionBundle,
        result: {
          message:
            sessionBundle?.status === "reveal" || sessionBundle?.status === "ended"
              ? "Response saved and checked."
              : "Work saved.",
        },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Open Middle request failed." }, { status: 400 });
  }
}
