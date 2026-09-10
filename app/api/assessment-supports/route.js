import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCourseAccessForUser } from "@/lib/courses/access";
import { loadAssessmentScheduleData } from "@/lib/assessment-resources/server";
import { assessmentOccurrenceKey } from "@/lib/assessment-supports/pricing";

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function wholeCost(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000 ? parsed : null;
}

function occurrenceFromSchedule(schedule, ruleId, originalDate) {
  const key = assessmentOccurrenceKey(ruleId, originalDate);
  return (schedule.occurrences || []).find(
    (item) => !item.is_skipped && assessmentOccurrenceKey(item.rule_id, item.original_date) === key
  );
}

async function teacherContext(body) {
  const courseId = String(body?.courseId || "").trim();
  if (!courseId) return { error: jsonError("Choose a class.") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: jsonError("Sign in to continue.", 401) };

  const access = await getCourseAccessForUser(
    supabase,
    user.id,
    courseId,
    "id, title, class_name, owner_id, school_year_start, school_year_end, schedule_model, ab_meeting_day"
  );
  if (!access?.course) return { error: jsonError("That class is unavailable.", 403) };

  return { supabase, user, course: access.course };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid request.");
  }

  let context;
  try {
    context = await teacherContext(body);
  } catch (error) {
    return jsonError(error.message || "Could not verify class access.", 403);
  }
  if (context.error) return context.error;
  const { supabase, user, course } = context;
  const action = String(body.action || "");

  try {
    if (action === "update_settings") {
      const startingCost = wholeCost(body.startingCost);
      const costIncrement = wholeCost(body.costIncrement);
      if (startingCost === null || costIncrement === null) {
        return jsonError("Costs must be whole numbers from 0 to 1,000.");
      }
      const { error } = await supabase
        .from("course_assessment_support_settings")
        .update({
          starting_cost: startingCost,
          cost_increment: costIncrement,
          is_published: body.isPublished === true,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        })
        .eq("course_id", course.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "update_support") {
      const supportId = String(body.supportId || "").trim();
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      if (!supportId || !name || name.length > 80 || description.length > 400) {
        return jsonError("Use a support name up to 80 characters and a description up to 400 characters.");
      }
      const { error } = await supabase
        .from("course_assessment_supports")
        .update({
          name,
          description,
          enabled: body.enabled === true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", supportId)
        .eq("course_id", course.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "move_support") {
      const supportId = String(body.supportId || "").trim();
      const direction = body.direction === "up" ? -1 : body.direction === "down" ? 1 : 0;
      if (!supportId || !direction) return jsonError("Choose a support to move.");
      const { data: supports, error: supportsError } = await supabase
        .from("course_assessment_supports")
        .select("id, sort_order")
        .eq("course_id", course.id)
        .order("sort_order", { ascending: true });
      if (supportsError) throw supportsError;
      const index = (supports || []).findIndex((item) => item.id === supportId);
      const swapIndex = index + direction;
      if (index < 0 || swapIndex < 0 || swapIndex >= supports.length) {
        return NextResponse.json({ ok: true });
      }
      const current = supports[index];
      const adjacent = supports[swapIndex];
      const [{ error: currentError }, { error: adjacentError }] = await Promise.all([
        supabase
          .from("course_assessment_supports")
          .update({ sort_order: adjacent.sort_order, updated_at: new Date().toISOString() })
          .eq("id", current.id)
          .eq("course_id", course.id),
        supabase
          .from("course_assessment_supports")
          .update({ sort_order: current.sort_order, updated_at: new Date().toISOString() })
          .eq("id", adjacent.id)
          .eq("course_id", course.id),
      ]);
      if (currentError) throw currentError;
      if (adjacentError) throw adjacentError;
      return NextResponse.json({ ok: true });
    }

    if (action === "set_override") {
      const supportId = String(body.supportId || "").trim();
      const ruleId = String(body.ruleId || "").trim();
      const originalDate = String(body.originalDate || "").trim();
      const schedule = await loadAssessmentScheduleData({ course });
      const occurrence = occurrenceFromSchedule(schedule, ruleId, originalDate);
      if (!occurrence) return jsonError("That assessment occurrence is unavailable. Refresh and try again.");

      const { data: activation, error: activationError } = await supabase
        .from("assessment_support_activations")
        .select("id")
        .eq("course_id", course.id)
        .eq("support_id", supportId)
        .eq("rule_id", ruleId)
        .eq("original_date", originalDate)
        .maybeSingle();
      if (activationError) throw activationError;
      if (activation) return jsonError("This cost has already been snapshotted and cannot be rewritten.");

      if (body.cost === "" || body.cost === null || body.cost === undefined) {
        const { error } = await supabase
          .from("assessment_support_cost_overrides")
          .delete()
          .eq("course_id", course.id)
          .eq("support_id", supportId)
          .eq("rule_id", ruleId)
          .eq("original_date", originalDate);
        if (error) throw error;
      } else {
        const cost = wholeCost(body.cost);
        if (cost === null) return jsonError("The override must be a whole number from 0 to 1,000.");
        const { error } = await supabase
          .from("assessment_support_cost_overrides")
          .upsert({
            course_id: course.id,
            support_id: supportId,
            rule_id: ruleId,
            original_date: originalDate,
            cost,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          }, { onConflict: "support_id,rule_id,original_date" });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "record_usage") {
      const supportId = String(body.supportId || "").trim();
      const studentId = String(body.studentId || "").trim();
      const ruleId = String(body.ruleId || "").trim();
      const originalDate = String(body.originalDate || "").trim();
      if (!supportId || !studentId) return jsonError("Choose a student and support.");
      const schedule = await loadAssessmentScheduleData({ course });
      const occurrence = occurrenceFromSchedule(schedule, ruleId, originalDate);
      if (!occurrence) return jsonError("That assessment occurrence is unavailable. Refresh and try again.");
      const { error } = await supabase.rpc("record_assessment_support_usage", {
        p_course_id: course.id,
        p_support_id: supportId,
        p_student_id: studentId,
        p_rule_id: occurrence.rule_id,
        p_original_date: occurrence.original_date,
        p_assignment_date: occurrence.assignment_date,
        p_assessment_label: occurrence.label,
        p_assessment_number: occurrence.assessment_number,
        p_marking_period_name: occurrence.marking_period || `Marking Period ${occurrence.marking_period_number}`,
        p_marking_period_number: occurrence.marking_period_number,
        p_required_accommodation: body.requiredAccommodation === true,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (action === "void_usage") {
      const usageId = String(body.usageId || "").trim();
      if (!usageId) return jsonError("Choose a record to void.");
      const { data: usage, error: usageError } = await supabase
        .from("assessment_support_usages")
        .select("id")
        .eq("id", usageId)
        .eq("course_id", course.id)
        .maybeSingle();
      if (usageError) throw usageError;
      if (!usage) return jsonError("That record is unavailable.", 404);
      const { error } = await supabase.rpc("void_assessment_support_usage", {
        p_usage_id: usageId,
        p_reason: String(body.reason || "").trim() || null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return jsonError("Unknown assessment-support action.");
  } catch (error) {
    const message = String(error?.message || "Could not update assessment supports.");
    if (String(error?.code || "") === "23505") {
      return jsonError("That support is already recorded for this student on this assessment.");
    }
    return jsonError(message, 500);
  }
}
