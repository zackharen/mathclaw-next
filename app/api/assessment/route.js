import {
  context,
  teacherOnly,
  result,
  fail,
  body,
  originCheck,
  responseError,
  json,
  requireRow,
  cas,
  audit,
} from "@/lib/assessments/server";
import { curatedDraft, draftDrift } from "@/lib/assessments/drafting";
import { liveCoverage } from "@/lib/assessments/coverage";
import {
  validateDraft,
  spiralLast,
  safeQuestion,
  anonymousStats,
  latestSubmittedScores,
  scorePercent,
  ZACK_ID,
} from "@/lib/assessments/core";
import reference17 from "@/lib/assessments/reference-17.json";
import { weeklyDraftQuestions } from "@/lib/assessments/weekly-drafts";
import { makeQuestion, topicCatalog } from "@/lib/assessments/bank";
import {
  loadAssignment,
  startAttempt,
  saveAttempt,
  attemptView,
  attemptReleased,
  gradeDocument,
  teacherGrade,
  reviewedScore,
  matchingAttempts,
  practiceQuestion,
  chosenQuestions,
} from "@/lib/assessments/delivery";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const url = new URL(request.url),
      ctx = await context(url.searchParams.get("course")),
      { admin, course, teacher, user } = ctx;
    if (url.searchParams.has("coverage")) {
      teacherOnly(ctx);
      return json(await liveCoverage(ctx, url.searchParams.get("coverage")));
    }
    if (url.searchParams.has("draft")) {
      teacherOnly(ctx);
      return json(
        requireRow(
          result(
            await admin
              .from("mc_assessment_drafts")
              .select("*")
              .eq("id", url.searchParams.get("draft"))
              .eq("owner_id", user.id)
              .single(),
          ),
        ),
      );
    }
    if (url.searchParams.has("id")) {
      const c = await loadAssignment(ctx, url.searchParams.get("id"));
      const all = result(
        await admin
          .from("mc_assessment_attempts")
          .select("*")
          .eq("assignment_id", c.id)
          .order("attempt_number"),
      );
      if (teacher) {
        const members = result(
          await admin
            .from("student_course_memberships")
            .select("profile_id")
            .eq("course_id", course.id),
        );
        const ids = members.map((m) => m.profile_id),
          profiles = ids.length
            ? result(
                await admin
                  .from("profiles")
                  .select("id,display_name")
                  .in("id", ids),
              )
            : [];
        const draft = result(
          await admin
            .from("mc_assessment_drafts")
            .select("*")
            .eq("id", c.draft_id)
            .single(),
        );
        const currentCoverage = draft?.week
          ? await liveCoverage({ ...ctx, courses: [course] }, draft.week)
          : null;
        const coverageDrift = draft?.week
          ? draftDrift(draft, currentCoverage.manifests[0])
          : false;
        return json({
          coverageDrift,
          currentCoverage,
          assignment: c,
          attempts: all.map((a) => attemptView(a, c, true)),
          roster: members.map((m) => ({
            id: m.profile_id,
            name:
              profiles.find((p) => p.id === m.profile_id)?.display_name ||
              "Student",
          })),
          topics: topicCatalog(),
        });
      }
      const a = all
        .filter((a) => a.user_id === user.id)
        .sort((a, b) => b.attempt_number - a.attempt_number)[0];
      return json({
        assignment: {
          id: c.id,
          title: c.title,
          revision: c.revision,
          approved_at: c.approved_at,
          is_open: c.is_open,
          open_at: c.open_at,
          close_at: c.close_at,
          time_minutes: c.time_minutes,
          mode: c.document.mode,
          canStartAnother: Boolean(
            a?.submitted_at &&
            (c.document.grants?.[user.id]?.attempts || 1) > a.attempt_number,
          ),
          supervisedOnly: Boolean(
            c.document.grants?.[user.id]?.supervised_only,
          ),
        },
        attempt: a ? attemptView(a, c) : null,
        stats:
          attemptReleased(a, c) && a?.score !== null
            ? anonymousStats(
                latestSubmittedScores(all.filter((x) => attemptReleased(x, c))),
                a.score,
              )
            : null,
      });
    }
    const classes = result(
      await admin
        .from("mc_assessment_classes")
        .select("*")
        .eq("course_id", course.id)
        .order("created_at", { ascending: false }),
    );
    const visible = teacher
      ? classes
      : classes.filter(
          (c) =>
            c.approved_at &&
            (!c.document.target_user || c.document.target_user === user.id),
        );
    const drafts = teacher
      ? result(
          await admin
            .from("mc_assessment_drafts")
            .select("*")
            .eq("owner_id", ZACK_ID)
            .order("created_at", { ascending: false }),
        )
      : [];
    const library = teacher
      ? result(
          await admin
            .from("mc_question_versions")
            .select("*")
            .eq("owner_id", ZACK_ID)
            .order("created_at", { ascending: false }),
        )
      : [];
    return json({
      teacher,
      courses: ctx.courses,
      course,
      assignments: visible.map((c) => ({
        id: c.id,
        title: c.title,
        approved_at: c.approved_at,
        is_open: c.is_open,
        open_at: c.open_at,
        close_at: c.close_at,
        released_at: c.released_at,
        practice: Boolean(c.approved_at),
        practiceSkills: c.document.questions?.map((q) => ({
          id: q.id,
          skill: q.skill,
          name: q.name || q.skill,
        })),
        mode: c.document.mode,
      })),
      drafts,
      library,
      topics: teacher ? topicCatalog() : [],
    });
  } catch (e) {
    return responseError(e);
  }
}

export async function POST(request) {
  try {
    originCheck(request);
    const d = await body(request),
      ctx = await context(d.course),
      { admin, course, user } = ctx;
    if (
      [
        "previewPath",
        "convertAdaptive",
        "importReferences",
        "create",
        "edit",
        "approve",
        "access",
        "release",
        "grade",
        "teacherSubmit",
        "grant",
        "library",
        "generate",
        "bulkPreview",
        "bulkApply",
        "spiral",
        "recovery",
      ].includes(d.action)
    )
      teacherOnly(ctx);
    if (d.action === "previewPath")
      return json(
        makeQuestion(
          d.generator,
          Math.max(1, Math.min(5, Number(d.level) || 2)),
        ),
      );
    if (d.action === "convertAdaptive") {
      const row = requireRow(
        result(
          await admin
            .from("mc_assessment_drafts")
            .select("*")
            .eq("id", d.draft_id)
            .eq("owner_id", user.id)
            .single(),
        ),
      );
      const source = d.document || row.document;
      if (!Array.isArray(source.questions) || source.questions.length > 30)
        fail("Invalid draft.");
      const questions = source.questions.map((q) => {
        if (!q.manual && q.generator) return { ...q, spiral: false };
        if (!q.adaptiveGenerator)
          fail(
            "A question has no verified selected-response counterpart. Replace it before choosing adaptive mode.",
          );
        return {
          ...makeQuestion(q.adaptiveGenerator, 2),
          id: q.id,
          skill: q.skill,
          spiral: false,
          lessonIds: q.lessonIds,
          source: q.source,
        };
      });
      return json({
        ...source,
        mode: "adaptive",
        questions,
        grading_reviewed_at: null,
      });
    }
    if (d.action === "importReferences") {
      const existing = result(
        await admin
          .from("mc_question_versions")
          .select("document")
          .eq("owner_id", user.id),
      );
      const missing = reference17.filter(
        (q) =>
          !existing.some(
            (v) =>
              v.document.provenance?.file === q.provenance.file &&
              v.document.provenance?.item === q.provenance.item,
          ),
      );
      if (missing.length)
        result(
          await admin.from("mc_question_versions").insert(
            missing.map((q) => ({
              owner_id: user.id,
              title: q.name,
              skill: q.skill,
              document: q,
              status: "candidate",
            })),
          ),
        );
      return json({ imported: missing.length });
    }
    if (d.action === "generate") {
      const coverage = await liveCoverage(ctx, d.week);
      if (coverage.skipped)
        return json({
          skipped: true,
          reason: "No assessment November 2–6, 2026.",
        });
      const drafts = [];
      const existingDrafts = result(
        await admin
          .from("mc_assessment_drafts")
          .select("*")
          .eq("owner_id", user.id)
          .eq("week", d.week),
      );
      for (const group of coverage.groups) {
        const source_key = `weekly:${d.week}:${group.key}`;
        let draft = existingDrafts.find(
          (v) =>
            v.source_key === source_key ||
            group.classes.some(
              (m) => v.document.coverageSnapshots?.[m.course_id],
            ),
        );
        if (!draft) {
          let generated = weeklyDraftQuestions(group.lessons, d.week);
          if (!generated.questions.length) {
            const library = result(
              await admin
                .from("mc_question_versions")
                .select("*")
                .eq("owner_id", user.id)
                .eq("status", "curated"),
            );
            const classIds = group.classes.map((c) => c.course_id);
            const published = result(
              await admin
                .from("mc_assessment_classes")
                .select("id")
                .in("course_id", classIds),
            );
            const attempts = published.length
              ? result(
                  await admin
                    .from("mc_assessment_attempts")
                    .select("document")
                    .in(
                      "assignment_id",
                      published.map((c) => c.id),
                    )
                    .not("submitted_at", "is", null),
                )
              : [];
            generated = curatedDraft(group.lessons, library, attempts);
          }
          const document = {
            mode: "standard",
            variants: false,
            target_minutes: 30,
            questions: generated.questions,
            coverage: group,
            coverageSnapshots: Object.fromEntries(
              group.classes.map((c) => [c.course_id, c.snapshot]),
            ),
            sources: generated.sources,
            warnings:
              generated.warnings ||
              (generated.questions.length
                ? []
                : [
                    "Source-aligned questions need teacher review before this draft can be approved.",
                  ]),
            spiralRationale:
              generated.spiralRationale ||
              "First assessment: prerequisite selected by teacher; no prior MathClaw results.",
          };
          draft = result(
            await admin
              .from("mc_assessment_drafts")
              .insert({
                owner_id: user.id,
                source_key,
                week: d.week,
                title: `Assessment · ${d.week} · ${group.classes.map((c) => c.title).join(" / ")}`,
                document,
              })
              .select()
              .single(),
          );
        }
        for (const m of group.classes) {
          const exists = result(
            await admin
              .from("mc_assessment_classes")
              .select("id")
              .eq("draft_id", draft.id)
              .eq("course_id", m.course_id)
              .maybeSingle(),
          );
          if (!exists)
            result(
              await admin.from("mc_assessment_classes").insert({
                draft_id: draft.id,
                course_id: m.course_id,
                owner_id: user.id,
                title: draft.title,
              }),
            );
        }
        const drift = group.classes.some((m) => draftDrift(draft, m));
        drafts.push({ id: draft.id, drift });
      }
      return json({ coverage, drafts });
    }
    if (d.action === "create") {
      const draft = result(
        await admin
          .from("mc_assessment_drafts")
          .insert({
            owner_id: user.id,
            source_key: crypto.randomUUID(),
            title: String(d.title || "New assessment").slice(0, 200),
            document: {
              mode: "standard",
              questions: [],
              variants: false,
              target_minutes: 30,
            },
          })
          .select()
          .single(),
      );
      result(
        await admin.from("mc_assessment_classes").insert({
          draft_id: draft.id,
          course_id: course.id,
          owner_id: user.id,
          title: draft.title,
        }),
      );
      return json(draft);
    }
    if (d.action === "edit") {
      const row = requireRow(
        result(
          await admin
            .from("mc_assessment_drafts")
            .select("*")
            .eq("id", d.id)
            .eq("owner_id", user.id)
            .single(),
        ),
      );
      if (d.revision !== row.revision)
        fail("Draft changed. Reload before saving.", 409);
      if (
        !d.document ||
        !Array.isArray(d.document.questions) ||
        d.document.questions.length > 30
      )
        fail("Invalid draft.");
      return json(
        await cas(admin, "mc_assessment_drafts", row, {
          title: String(d.title || row.title).slice(0, 200),
          document: {
            ...d.document,
            questions: spiralLast(
              d.document.questions,
              d.document.mode || "standard",
            ),
          },
        }),
      );
    }
    if (d.action === "library") {
      if (d.id) {
        const row = requireRow(
          result(
            await admin
              .from("mc_question_versions")
              .select("*")
              .eq("id", d.id)
              .eq("owner_id", user.id)
              .single(),
          ),
        );
        if (d.approve !== true) fail("Explicit approval is required.");
        const inserted = result(
          await admin
            .from("mc_question_versions")
            .insert({
              owner_id: user.id,
              title: row.title,
              skill: row.skill,
              document: row.document,
              status: "curated",
              approved_at: new Date().toISOString(),
            })
            .select()
            .single(),
        );
        await audit(ctx, "curate-question", {
          source: row.id,
          version: inserted.id,
        });
        return json(inserted);
      }
      const q = d.question || makeQuestion(d.skill, d.level || 3);
      return json(
        result(
          await admin
            .from("mc_question_versions")
            .insert({
              owner_id: user.id,
              title: q.name || q.prompt.slice(0, 80),
              skill: q.skill,
              document: q,
              status: d.suggestion ? "suggestion" : "candidate",
            })
            .select()
            .single(),
        ),
      );
    }
    const c = await loadAssignment(ctx, d.id);
    if (
      d.assignmentRevision !== undefined &&
      d.assignmentRevision !== c.revision
    )
      fail("Class settings changed. Reload before saving.", 409);
    if (d.action === "approve") {
      if (c.approved_at)
        fail(
          "This published version is fixed. Create a new assessment for new content.",
        );
      const draft = requireRow(
        result(
          await admin
            .from("mc_assessment_drafts")
            .select("*")
            .eq("id", c.draft_id)
            .eq("owner_id", user.id)
            .single(),
        ),
      );
      const doc = {
        ...draft.document,
        title: draft.title,
        questions: spiralLast(
          draft.document.questions,
          draft.document.mode || "standard",
        ),
      };
      validateDraft(doc);
      if (doc.week === "2026-11-02" || draft.week === "2026-11-02")
        fail("This week is explicitly skipped.");
      if (
        doc.mode !== "standard" &&
        doc.questions.some((q) => !q.generator || q.manual)
      )
        fail(
          "Adaptive mode requires verified generators and automatic scoring for every skill.",
        );
      if (
        doc.variants &&
        doc.questions.some((q) => !q.generator && !q.variants?.length)
      )
        fail("Supply equivalent variations for each question.");
      doc.questions.forEach((q) => practiceQuestion(q, crypto.randomUUID()));
      const published = await cas(admin, "mc_assessment_classes", c, {
        title: draft.title,
        document: { ...doc, draftRevision: draft.revision, grants: {} },
        approved_at: new Date().toISOString(),
        is_open: false,
      });
      await audit(ctx, "approve-assessment", {
        id: c.id,
        draftRevision: draft.revision,
      });
      return json(published);
    }
    if (d.action === "access") {
      if (!c.approved_at) fail("Approve the assessment first.");
      const time = d.time_minutes === null ? null : Number(d.time_minutes);
      if (time !== null && (!Number.isInteger(time) || time < 1 || time > 240))
        fail("Choose 1–240 minutes or untimed.");
      for (const value of [d.open_at, d.close_at])
        if (value && !Number.isFinite(Date.parse(value)))
          fail("Invalid schedule date.");
      if (
        d.open_at &&
        d.close_at &&
        Date.parse(d.close_at) <= Date.parse(d.open_at)
      )
        fail("Closing must follow opening.");
      const updated = await cas(admin, "mc_assessment_classes", c, {
        is_open: d.is_open === true,
        open_at: d.open_at || null,
        close_at: d.close_at || null,
        time_minutes: time,
      });
      await audit(ctx, "assessment-access", {
        id: c.id,
        open: updated.is_open,
      });
      return json(updated);
    }
    if (d.action === "release") {
      const attempts = result(
        await admin
          .from("mc_assessment_attempts")
          .select("id,revision,score,submitted_at")
          .eq("assignment_id", c.id),
      );
      if (d.release && attempts.some((a) => a.submitted_at && a.score === null))
        fail("Finish grading submitted attempts before releasing results.");
      await audit(ctx, "release-results", {
        id: c.id,
        release: d.release === true,
      });
      return json(
        await cas(admin, "mc_assessment_classes", c, {
          released_at: d.release ? new Date().toISOString() : null,
          document: {
            ...c.document,
            releasedAttempts: d.release
              ? Object.fromEntries(
                  attempts
                    .filter((a) => a.submitted_at && a.score !== null)
                    .map((a) => [a.id, a.revision]),
                )
              : {},
          },
        }),
      );
    }
    if (d.action === "grant") {
      const member = result(
        await admin
          .from("student_course_memberships")
          .select("profile_id")
          .eq("course_id", course.id)
          .eq("profile_id", d.student)
          .maybeSingle(),
      );
      if (!member) fail("Choose a student in this class.");
      const grant = d.grant || {};
      for (const key of ["attempts", "time_minutes", "extra_minutes"])
        if (
          grant[key] !== undefined &&
          grant[key] !== null &&
          (!Number.isInteger(grant[key]) ||
            grant[key] < (key === "extra_minutes" ? 0 : 1) ||
            grant[key] > (key === "attempts" ? 10 : 480))
        )
          fail("Invalid makeup limits.");
      for (const key of ["open_at", "close_at"])
        if (grant[key] && !Number.isFinite(Date.parse(grant[key])))
          fail("Invalid makeup window.");
      return json(
        await cas(admin, "mc_assessment_classes", c, {
          document: {
            ...c.document,
            grants: { ...c.document.grants, [d.student]: grant },
          },
        }),
      );
    }
    if (d.action === "bulkPreview" || d.action === "bulkApply") {
      const attempts = result(
        await admin
          .from("mc_assessment_attempts")
          .select("*")
          .eq("assignment_id", c.id),
      );
      const matches = matchingAttempts(
        attempts,
        d.question_id,
        d.answer,
        d.prompt,
      );
      if (d.action === "bulkPreview")
        return json({
          matches: matches.map((a) => ({
            id: a.id,
            revision: a.revision,
            user_id: a.user_id,
          })),
        });
      if (
        !Array.isArray(d.preview) ||
        d.preview.length !== matches.length ||
        matches.some(
          (a) =>
            !d.preview.some((p) => p.id === a.id && p.revision === a.revision),
        )
      )
        fail("Responses changed. Preview again.", 409);
      const q = matches[0]?.document.questions.find(
        (q) => q.id === d.question_id,
      );
      if (!q || !Number.isFinite(d.mark) || d.mark < 0 || d.mark > q.points)
        fail("Invalid partial-credit mark.");
      const patches = matches.map((a) => {
        const marks = { ...a.document.marks, [q.id]: d.mark };
        return {
          id: a.id,
          revision: a.revision,
          score: reviewedScore(a.document, marks),
        };
      });
      const changed = result(
        await admin.rpc("mc_bulk_grade", {
          p_assignment: c.id,
          p_revision: c.revision,
          p_patches: patches,
          p_question: q.id,
          p_mark: d.mark,
          p_note: String(d.note || "").slice(0, 4000),
          p_actor: user.id,
        }),
      );
      await audit(ctx, "class-answer-adjustment", {
        assignment: c.id,
        question: q.id,
        attempts: changed,
        mark: d.mark,
      });
      return json({ changed });
    }
    if (d.action === "spiral") {
      const member = result(
        await admin
          .from("student_course_memberships")
          .select("profile_id")
          .eq("course_id", course.id)
          .eq("profile_id", d.student)
          .maybeSingle(),
      );
      if (!member) fail("Student is not in this class.");
      const previous = result(
        await admin
          .from("mc_assessment_attempts")
          .select("document,assignment_id")
          .eq("user_id", d.student)
          .not("submitted_at", "is", null),
      );
      const classAssignments = result(
        await admin
          .from("mc_assessment_classes")
          .select("id")
          .eq("course_id", course.id),
      );
      const permitted = new Set(classAssignments.map((x) => x.id));
      const pool = previous
        .filter(
          (a) =>
            permitted.has(a.assignment_id) &&
            (d.random || a.assignment_id === c.id),
        )
        .flatMap((a) => a.document.questions)
        .map((q) =>
          q.manual && q.adaptiveGenerator
            ? {
                ...makeQuestion(q.adaptiveGenerator, 2),
                skill: q.skill,
                spiral: false,
              }
            : q,
        )
        .filter((q) => q.generator && !q.manual);
      const questions = [
        ...new Map(
          pool.map((q) => [q.skill, { ...q, spiral: false }]),
        ).values(),
      ];
      if (!questions.length)
        fail(
          "No previously assessed skills with verified generators are available.",
        );
      if (d.reviewed !== true)
        fail("Review the proposed adaptive grading method before unlocking.");
      const doc = {
        mode: "spiral",
        target_minutes: Number(d.minutes) || 30,
        cap: Math.min(
          30,
          Math.max(6, Math.round((Number(d.minutes) || 30) / 2)),
        ),
        questions,
        grading_reviewed_at: new Date().toISOString(),
        target_user: d.student,
        recoveryTarget: c.id,
        grants: {},
        original_history_preserved: true,
        evidenceNote:
          "Selected-response counterparts provide concept evidence; written proofs and independent graph construction still need teacher judgment before recovery approval.",
      };
      const draft = result(
        await admin
          .from("mc_assessment_drafts")
          .insert({
            owner_id: user.id,
            source_key: crypto.randomUUID(),
            title: "Spiral Review",
            document: doc,
          })
          .select()
          .single(),
      );
      return json(
        result(
          await admin
            .from("mc_assessment_classes")
            .insert({
              draft_id: draft.id,
              course_id: course.id,
              owner_id: user.id,
              title: "Spiral Review",
              document: doc,
              approved_at: new Date().toISOString(),
              is_open: true,
            })
            .select()
            .single(),
        ),
      );
    }
    if (d.action === "start")
      return json(attemptView(await startAttempt(ctx, c), c, ctx.teacher));
    if (d.action === "practiceSave") {
      if (!c.approved_at) fail("Practice unavailable.");
      const row = requireRow(
        result(
          await admin
            .from("mc_learning_state")
            .select("*")
            .eq("user_id", user.id)
            .eq("course_id", course.id)
            .single(),
        ),
      );
      const run = row.document.assessmentPractice;
      if (!run || run.assignment !== c.id || run.question.id !== d.question_id)
        fail("Practice changed. Reload.", 409);
      if (JSON.stringify(d.work).length > 1000000)
        fail("Practice work too large.");
      const updated = result(
        await admin
          .from("mc_learning_state")
          .update({
            document: {
              ...row.document,
              assessmentPractice: { ...run, work: d.work },
            },
            revision: row.revision + 1,
          })
          .eq("user_id", user.id)
          .eq("course_id", course.id)
          .eq("revision", row.revision)
          .select()
          .maybeSingle(),
      );
      if (!updated) fail("Practice changed. Retry saving.", 409);
      return json({ saved: true });
    }
    if (d.action === "practice") {
      if (!c.approved_at) fail("Practice opens after approval.");
      const previous = result(
        await admin
          .from("mc_learning_state")
          .select("document")
          .eq("user_id", user.id)
          .eq("course_id", course.id)
          .maybeSingle(),
      );
      const active = previous?.document?.assessmentPractice;
      if (!d.fresh && active?.assignment === c.id)
        return json({
          question: safeQuestion(active.question),
          work: active.work || {},
        });
      const question =
        c.document.questions.find((q) => q.id === d.question_id) ||
        c.document.questions[0];
      const assessed = chosenQuestions(c, user.id).map((q) => q.prompt);
      let q;
      for (let i = 0; i < 20; i++) {
        q = {
          ...practiceQuestion(question, crypto.randomUUID()),
          id: crypto.randomUUID(),
        };
        if (!assessed.includes(q.prompt)) break;
        q = null;
      }
      if (!q) fail("Choose another fresh practice question.");
      // Persist practice separately; assessment values and grades are never reused.
      const state = result(
        await admin
          .from("mc_learning_state")
          .select("*")
          .eq("user_id", user.id)
          .eq("course_id", course.id)
          .maybeSingle(),
      );
      const document = {
        ...state?.document,
        assessmentPractice: {
          question: q,
          assignment: c.id,
          work: {},
          at: new Date().toISOString(),
        },
      };
      if (state) {
        const out = result(
          await admin
            .from("mc_learning_state")
            .update({ document, revision: state.revision + 1 })
            .eq("user_id", user.id)
            .eq("course_id", course.id)
            .eq("revision", state.revision)
            .select()
            .maybeSingle(),
        );
        if (!out) fail("Practice changed. Try again.", 409);
      } else
        result(
          await admin
            .from("mc_learning_state")
            .insert({ user_id: user.id, course_id: course.id, document }),
        );
      return json({ question: safeQuestion(q), work: {} });
    }
    if (d.action === "practiceCheck") {
      if (!c.approved_at) fail("Practice is unavailable.");
      const state = requireRow(
        result(
          await admin
            .from("mc_learning_state")
            .select("*")
            .eq("user_id", user.id)
            .eq("course_id", course.id)
            .single(),
        ),
      );
      const q = state.document.assessmentPractice?.question;
      if (!q || state.document.assessmentPractice.assignment !== c.id)
        fail("Start a practice question first.");
      return json({
        correct: !q.manual && String(d.answer || "").trim() === q.answer,
        manual: q.manual,
        solution: q.solution || q.answer,
        rubric: q.rubric || q.criteria,
      });
    }
    const a = requireRow(
      result(
        await admin
          .from("mc_assessment_attempts")
          .select("*")
          .eq("id", d.attempt_id)
          .eq("assignment_id", c.id)
          .single(),
      ),
    );
    if (d.action === "save")
      return json(attemptView(await saveAttempt(ctx, c, a, d), c, ctx.teacher));
    if (d.action === "teacherSubmit") {
      if (a.submitted_at) fail("Already submitted.");
      const doc = gradeDocument(a.document);
      const score =
        doc.mode === "standard"
          ? scorePercent(doc.questions, doc.marks)
          : (doc.proposedGrade?.score ?? null);
      return json(
        await cas(admin, "mc_assessment_attempts", a, {
          submitted_at: new Date().toISOString(),
          document: doc,
          score,
        }),
      );
    }
    if (d.action === "grade") {
      await audit(ctx, "grade-attempt", { id: a.id, revision: a.revision });
      return json(await teacherGrade(ctx, c, a, d));
    }
    if (d.action === "recovery") {
      if (
        d.approve !== true ||
        c.document.mode !== "spiral" ||
        !a.submitted_at ||
        a.score === null
      )
        fail(
          "Review a submitted, graded Spiral Review and explicitly approve recovery.",
        );
      const original = requireRow(
        result(
          await admin
            .from("mc_assessment_attempts")
            .select("*")
            .eq("assignment_id", c.document.recoveryTarget)
            .eq("user_id", a.user_id)
            .order("attempt_number", { ascending: false })
            .limit(1)
            .single(),
        ),
      );
      const target = await loadAssignment(ctx, original.assignment_id);
      return json(
        await teacherGrade(ctx, target, original, {
          revision: original.revision,
          marks: original.document.marks,
          override: a.score,
          note: `Teacher approved recovery from ${a.id}. Original grade retained in history.`,
        }),
      );
    }
    fail("Unknown action.");
  } catch (e) {
    return responseError(e);
  }
}
