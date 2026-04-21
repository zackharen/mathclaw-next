import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildDefaultDisplayName,
  getAccountTypeForUser,
} from "@/lib/auth/account-type";
import { logInternalEvent } from "@/lib/observability/events";
import {
  buildDoubleBoardMatrix,
  buildDoubleBoardReviewItems,
  createDoubleBoardQuestionRecords,
  DOUBLE_BOARD_TOTAL_QUESTIONS,
  formatDoubleBoardAnswer,
  normalizeDoubleBoardMode,
  normalizeDoubleBoardAnswer,
  scoreSolvedDoubleBoardQuestion,
} from "@/lib/question-engine/double-board";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { upsertGameStats } from "@/lib/student-games/stats";

const GAME_SLUG = "double_board_review";

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeAnswerMode(value) {
  return value === "multiple_choice" ? "multiple_choice" : "typed";
}

function normalizePlayMode(value) {
  return value === "one_at_a_time" ? "one_at_a_time" : "free_for_all";
}

function isTeacherRelationship(relationship) {
  return relationship === "owner" || relationship === "co_teacher";
}

async function getViewerContext(supabase, user) {
  const accountType = await getAccountTypeForUser(supabase, user);
  const courses = await listAccessibleCourses(supabase, user.id, {
    gameSlug: GAME_SLUG,
    viewerAccountType: accountType,
  });

  return { accountType, courses };
}

function getCourseRecord(courses, courseId) {
  return (courses || []).find((course) => course.id === courseId) || null;
}

function canManageCourse(courses, courseId, accountType) {
  if (!courseId) return accountType !== "student";
  return isTeacherRelationship(getCourseRecord(courses, courseId)?.relationship);
}

function canAccessCourse(courses, courseId) {
  if (!courseId) return true;
  return Boolean(getCourseRecord(courses, courseId));
}

function viewerCanAccessSession(session, courses, user) {
  if (!session) return false;
  if (!session.course_id) return session.host_teacher_id === user.id;
  return canAccessCourse(courses, session.course_id);
}

function viewerCanManageSession(session, courses, user, accountType) {
  if (!session) return false;
  if (session.host_teacher_id === user.id) return true;
  return canManageCourse(courses, session.course_id, accountType);
}

async function resolveDisplayName(supabase, user) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  return String(data?.display_name || buildDefaultDisplayName(user)).trim() || "MathClaw User";
}

function sortQuestionsInBoardOrder(questions) {
  return [...(questions || [])].sort((a, b) => {
    const boardCompare = String(a.boardKey || a.board_key || "").localeCompare(
      String(b.boardKey || b.board_key || "")
    );
    if (boardCompare !== 0) return boardCompare;

    const rowCompare = Number(a.rowIndex ?? a.row_index ?? 0) - Number(b.rowIndex ?? b.row_index ?? 0);
    if (rowCompare !== 0) return rowCompare;

    return Number(a.colIndex ?? a.col_index ?? 0) - Number(b.colIndex ?? b.col_index ?? 0);
  });
}

function getActiveQuestionId(questions, playMode, sessionStatus) {
  if (playMode !== "one_at_a_time" || sessionStatus !== "live") {
    return null;
  }

  return (
    sortQuestionsInBoardOrder(questions).find((question) => !question.solved)?.id || null
  );
}

function serializeQuestion(row, canManage, sessionStatus) {
  const solved = Boolean(row.solved);
  const everMissed = Boolean(row.ever_missed);
  const attemptCount = Number(row.attempt_count || 0);
  const revealAnswer = solved || sessionStatus === "ended" || canManage;
  const revealExpression = sessionStatus !== "waiting";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const expressionText = row.expression_text || "Hidden";
  const answerDisplay = formatDoubleBoardAnswer(row.correct_answer, metadata);

  return {
    id: row.id,
    boardKey: row.board_key,
    rowIndex: row.row_index,
    colIndex: row.col_index,
    operand1: row.operand1,
    operator: row.operator,
    operand2: row.operand2,
    expressionText: revealExpression ? expressionText : "Hidden",
    correctAnswer: revealAnswer ? row.correct_answer : null,
    answerDisplay: revealAnswer ? answerDisplay : null,
    solved,
    everMissed,
    attemptCount,
    retryValue: 2 ** attemptCount,
    isHidden: !revealExpression,
    metadata,
    state: solved ? (everMissed ? "solved-after-miss" : "solved") : everMissed ? "missed" : "unanswered",
    displayValue: solved ? `${expressionText} = ${answerDisplay}` : everMissed ? "X" : " ",
  };
}

function sortPlayers(players) {
  return [...(players || [])].sort((a, b) => {
    const byScore = Number(b.score || 0) - Number(a.score || 0);
    if (byScore !== 0) return byScore;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
}

function sortPlayersByJoinOrder(players) {
  return [...(players || [])].sort(
    (a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  );
}

function getStudentTurnOrder(players) {
  return sortPlayersByJoinOrder(players).filter((player) => player.role === "student");
}

function getActiveTurnPlayer(players, session) {
  const students = getStudentTurnOrder(players);
  if (!students.length) return null;

  const turnIndex = Number(session?.metadata?.turnIndex || 0);
  return students[((turnIndex % students.length) + students.length) % students.length] || null;
}

async function loadSessionBundle(admin, sessionId, viewer) {
  const [{ data: session }, { data: players }, { data: questions }, { data: attempts }] = await Promise.all([
    admin.from("double_board_sessions").select("*").eq("id", sessionId).maybeSingle(),
    admin
      .from("double_board_players")
      .select("*")
      .eq("session_id", sessionId),
    admin
      .from("double_board_questions")
      .select("*")
      .eq("session_id", sessionId),
    admin
      .from("double_board_attempts")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true }),
  ]);

  if (!session) return null;

  const canManage = viewerCanManageSession(session, viewer.courses, viewer.user, viewer.accountType);
  const serializedQuestions = (questions || []).map((row) =>
    serializeQuestion(row, canManage, session.status)
  );
  const playMode = normalizePlayMode(session.metadata?.playMode);
  const activeQuestionId =
    playMode === "one_at_a_time" ? null : getActiveQuestionId(serializedQuestions, playMode, session.status);
  const boards = buildDoubleBoardMatrix(
    serializedQuestions.map((question) => ({
      ...question,
      board_key: question.boardKey,
      row_index: question.rowIndex,
      col_index: question.colIndex,
    }))
  );
  const solvedCount = serializedQuestions.filter((question) => question.solved).length;
  const allPlayers = sortPlayers(players);
  const playerMap = new Map((players || []).map((player) => [player.user_id, player]));
  const questionMap = new Map((questions || []).map((question) => [question.id, question]));
  const visibleLeaderboard = allPlayers
    .filter((player) => player.role === "student")
    .map((player, index) => ({
      id: player.id,
      userId: player.user_id,
      displayName: player.display_name,
      role: player.role,
      score: Number(player.score || 0),
      joinedAt: player.joined_at,
      rank: index + 1,
    }));
  const leaderboard = visibleLeaderboard;
  const viewerPlayer = allPlayers.find((player) => player.user_id === viewer.user.id) || null;
  const answerHistoryByUser = {};

  for (const attempt of attempts || []) {
    const playerRecord = playerMap.get(attempt.player_id);
    const questionRecord = questionMap.get(attempt.question_id);
    if (!playerRecord || !questionRecord) continue;

    if (!viewerCanManageSession(session, viewer.courses, viewer.user, viewer.accountType) && attempt.player_id !== viewer.user.id) {
      continue;
    }

    if (!answerHistoryByUser[attempt.player_id]) {
      answerHistoryByUser[attempt.player_id] = [];
    }

    answerHistoryByUser[attempt.player_id].push({
      id: attempt.id,
      questionId: attempt.question_id,
      playerId: attempt.player_id,
      playerDisplayName: playerRecord.display_name,
      expressionText:
        questionRecord.expression_text || "Hidden",
      submittedAnswer: attempt.submitted_answer,
      submittedAnswerDisplay: formatDoubleBoardAnswer(
        attempt.submitted_answer,
        questionRecord.metadata || {}
      ),
      correctAnswerDisplay: formatDoubleBoardAnswer(
        questionRecord.correct_answer,
        questionRecord.metadata || {}
      ),
      isCorrect: Boolean(attempt.is_correct),
      boardKey: questionRecord.board_key,
      rowIndex: questionRecord.row_index,
      colIndex: questionRecord.col_index,
      createdAt: attempt.created_at,
      metadata: questionRecord.metadata || {},
    });
  }

  const activeTurnPlayer = getActiveTurnPlayer(players || [], session);
  const reviewItems =
    session.status === "ended"
      ? buildDoubleBoardReviewItems(questions || [])
      : [];

  return {
    id: session.id,
    courseId: session.course_id,
    hostTeacherId: session.host_teacher_id,
    status: session.status,
    numberMode: session.number_mode,
    totalSolvedCount: solvedCount,
    totalRemainingCount: DOUBLE_BOARD_TOTAL_QUESTIONS - solvedCount,
    joinedCount: leaderboard.filter((player) => player.role === "student").length,
    missedCount: serializedQuestions.filter(
      (question) => question.everMissed && !question.solved
    ).length,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    updatedAt: session.updated_at,
    resultsRecordedAt: session.results_recorded_at,
    answerMode: normalizeAnswerMode(session.metadata?.answerMode),
    multipleChoiceEnabled: normalizeAnswerMode(session.metadata?.answerMode) === "multiple_choice",
    playMode,
    activeQuestionId,
    turnIndex: Number(session.metadata?.turnIndex || 0),
    activeTurnPlayerId: activeTurnPlayer?.id || null,
    activeTurnUserId: activeTurnPlayer?.user_id || null,
    activeTurnDisplayName: activeTurnPlayer?.display_name || null,
    isViewerTurn: Boolean(activeTurnPlayer?.user_id && activeTurnPlayer.user_id === viewer.user.id),
    canManage,
    isJoined: Boolean(viewerPlayer),
    viewerPlayerId: viewerPlayer?.id || null,
    viewerScore: Number(viewerPlayer?.score || 0),
    leaderboard,
    answerHistoryByUser,
    boards,
    reviewItems,
  };
}

async function fetchSessionByLocator(admin, locator, viewer) {
  if (locator.sessionId) {
    const { data } = await admin
      .from("double_board_sessions")
      .select("*")
      .eq("id", locator.sessionId)
      .maybeSingle();
    return data;
  }

  let query = admin.from("double_board_sessions").select("*");

  if (locator.courseId) {
    query = query.eq("course_id", locator.courseId);
  } else {
    query = query.is("course_id", null).eq("host_teacher_id", viewer.user.id);
  }

  if (locator.allowWaiting) {
    query = query.in("status", ["waiting", "live", "ended"]);
  } else {
    query = query.eq("status", "live");
  }

  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function ensurePlayer(admin, sessionId, user, displayName, role = "student") {
  const payload = {
    session_id: sessionId,
    user_id: user.id,
    display_name: displayName,
    role,
    updated_at: nowIso(),
  };

  const { data, error } = await admin
    .from("double_board_players")
    .upsert(payload, {
      onConflict: "session_id,user_id",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function bumpTurnIndex(admin, session) {
  const nextMetadata = {
    ...(session.metadata || {}),
    turnIndex: Number(session?.metadata?.turnIndex || 0) + 1,
  };

  const { error } = await admin
    .from("double_board_sessions")
    .update({
      metadata: nextMetadata,
      updated_at: nowIso(),
    })
    .eq("id", session.id);

  if (error) throw new Error(error.message);
}

async function syncSolvedCount(admin, sessionId, options = {}) {
  const { count, error } = await admin
    .from("double_board_questions")
    .select("id", { head: true, count: "exact" })
    .eq("session_id", sessionId)
    .eq("solved", true);

  if (error) throw new Error(error.message);

  const solvedCount = Number(count || 0);
  const nextStatus =
    solvedCount >= DOUBLE_BOARD_TOTAL_QUESTIONS ? "ended" : options.forceEnded ? "ended" : null;
  const updatePayload = {
    total_solved_count: solvedCount,
    updated_at: nowIso(),
  };

  if (nextStatus === "ended") {
    updatePayload.status = "ended";
    updatePayload.ended_at = options.endedAt || nowIso();
  }

  const { data, error: updateError } = await admin
    .from("double_board_sessions")
    .update(updatePayload)
    .eq("id", sessionId)
    .select("*")
    .single();

  if (updateError) throw new Error(updateError.message);
  return data;
}

async function recordSessionResultsIfNeeded(admin, sessionId) {
  const { data: session } = await admin
    .from("double_board_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || session.status !== "ended" || session.results_recorded_at) {
    return;
  }

  const { data: players } = await admin
    .from("double_board_players")
    .select("*")
    .eq("session_id", sessionId);

  const eligiblePlayers = (players || []).filter(
    (player) => player.role === "student" || Number(player.score || 0) > 0
  );

  for (const player of eligiblePlayers) {
    const { error: insertError } = await admin.from("game_sessions").insert({
      game_slug: GAME_SLUG,
      player_id: player.user_id,
      course_id: session.course_id,
      score: Number(player.score || 0),
      result: "finished",
      metadata: {
        sessionId,
        numberMode: session.number_mode,
        joinedAs: player.role,
        totalSolvedCount: Number(session.total_solved_count || 0),
      },
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    await upsertGameStats({
      supabase: admin,
      userId: player.user_id,
      gameSlug: GAME_SLUG,
      courseId: session.course_id,
      latestStats: {
        skillRating: Number(player.score || 0),
        result: "finished",
        totalSolvedCount: Number(session.total_solved_count || 0),
      },
    });
  }

  const { error: updateError } = await admin
    .from("double_board_sessions")
    .update({
      results_recorded_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("id", sessionId);

  if (updateError) throw new Error(updateError.message);
}

async function createFreshSession(
  admin,
  viewer,
  user,
  courseId,
  numberMode,
  displayName,
  answerMode,
  playMode
) {
  if (!canManageCourse(viewer.courses, courseId, viewer.accountType)) {
    return NextResponse.json(
      { error: "Only a teacher can host Double Board for that class." },
      { status: 403 }
    );
  }

  if (!courseId && viewer.accountType === "student") {
    return NextResponse.json(
      { error: "Students cannot create preview Double Board rooms." },
      { status: 403 }
    );
  }

  const questionRows = createDoubleBoardQuestionRecords(numberMode);
  const { data: session, error: sessionError } = await admin
    .from("double_board_sessions")
    .insert({
      course_id: courseId,
      host_teacher_id: user.id,
      number_mode: numberMode,
      status: "waiting",
      total_solved_count: 0,
      metadata: {
        mockMode: !courseId,
        answerMode,
        playMode,
        turnIndex: 0,
      },
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 400 });
  }

  const { error: playerError } = await admin.from("double_board_players").insert({
    session_id: session.id,
    user_id: user.id,
    display_name: displayName,
    role: "teacher",
    updated_at: nowIso(),
  });

  if (playerError) {
    return NextResponse.json({ error: playerError.message }, { status: 400 });
  }

  const { error: questionsError } = await admin.from("double_board_questions").insert(
    questionRows.map((question) => ({
      session_id: session.id,
      ...question,
      updated_at: nowIso(),
    }))
  );

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 400 });
  }

  const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
  return NextResponse.json({ session: bundle });
}

async function resolveSolverDisplayName(admin, sessionId, solverUserId) {
  if (!solverUserId) return "Someone";

  const { data: player } = await admin
    .from("double_board_players")
    .select("display_name")
    .eq("session_id", sessionId)
    .eq("user_id", solverUserId)
    .maybeSingle();

  if (player?.display_name) {
    return player.display_name;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", solverUserId)
    .maybeSingle();

  return String(profile?.display_name || "Someone").trim() || "Someone";
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
  const allowWaiting = searchParams.get("includeWaiting") === "1";

  if (courseId && !canAccessCourse(viewer.courses, courseId)) {
    return NextResponse.json({ error: "Double Board is not enabled for that class." }, { status: 403 });
  }

  const session = await fetchSessionByLocator(
    admin,
    { sessionId, courseId, allowWaiting },
    { ...viewer, user }
  );

  if (!session) return NextResponse.json({ session: null });

  if (!viewerCanAccessSession(session, viewer.courses, user)) {
    return NextResponse.json({ error: "You do not have access to this Double Board session." }, { status: 403 });
  }

  const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
  return NextResponse.json({ session: bundle });
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
    if (action === "create" || action === "reset") {
      const courseId = normalizeId(body.courseId);
      const numberMode = normalizeDoubleBoardMode(body.numberMode);
      const answerMode = normalizeAnswerMode(body.answerMode);
      const playMode = normalizePlayMode(body.playMode);

      if (courseId && !canAccessCourse(viewer.courses, courseId)) {
        return NextResponse.json(
          { error: "Double Board is not enabled for that class." },
          { status: 403 }
        );
      }

      const staleSessionUpdate = admin
        .from("double_board_sessions")
        .update({
          status: "ended",
          ended_at: nowIso(),
          updated_at: nowIso(),
        })
        .in("status", ["waiting", "live"]);

      if (courseId) {
        await staleSessionUpdate.eq("course_id", courseId);
      } else {
        await staleSessionUpdate.eq("host_teacher_id", user.id).is("course_id", null);
      }

      return createFreshSession(
        admin,
        viewer,
        user,
        courseId,
        numberMode,
        displayName,
        answerMode,
        playMode
      );
    }

    const sessionId = normalizeId(body.sessionId);
    if (!sessionId) {
      return NextResponse.json({ error: "Session id is required." }, { status: 400 });
    }

    const { data: session } = await admin
      .from("double_board_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();

    if (!session) {
      return NextResponse.json({ error: "Double Board session not found." }, { status: 404 });
    }

    if (!viewerCanAccessSession(session, viewer.courses, user)) {
      return NextResponse.json(
        { error: "You do not have access to this Double Board session." },
        { status: 403 }
      );
    }

    const canManage = viewerCanManageSession(session, viewer.courses, user, viewer.accountType);

    if (action === "start") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can start this game." }, { status: 403 });
      }

      const { error } = await admin
        .from("double_board_sessions")
        .update({
          status: "live",
          started_at: session.started_at || nowIso(),
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await ensurePlayer(admin, session.id, user, displayName, "teacher");
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "end") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can end this game." }, { status: 403 });
      }

      await syncSolvedCount(admin, session.id, { forceEnded: true, endedAt: nowIso() });
      await recordSessionResultsIfNeeded(admin, session.id);
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "join") {
      if (session.status !== "live" && session.status !== "waiting") {
        return NextResponse.json({ error: "This game is not accepting joins right now." }, { status: 400 });
      }

      await ensurePlayer(
        admin,
        session.id,
        user,
        displayName,
        canManage ? "teacher" : "student"
      );
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "answer") {
      if (session.status !== "live") {
        return NextResponse.json({ error: "This game is not accepting answers right now." }, { status: 400 });
      }

      const questionId = normalizeId(body.questionId);
      const player = await ensurePlayer(
        admin,
        session.id,
        user,
        displayName,
        canManage ? "teacher" : "student"
      );
      const playMode = normalizePlayMode(session.metadata?.playMode);
      const { data: question } = await admin
        .from("double_board_questions")
        .select("*")
        .eq("id", questionId)
        .eq("session_id", session.id)
        .maybeSingle();

      if (!question) {
        return NextResponse.json({ error: "Question not found." }, { status: 404 });
      }

      const submittedAnswer = normalizeDoubleBoardAnswer(body.answer, question.metadata || {});

      if (!questionId || submittedAnswer === null) {
        return NextResponse.json(
          { error: "Enter a valid multiplier like 1.08." },
          { status: 400 }
        );
      }

      if (question.solved) {
        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        const solverName = await resolveSolverDisplayName(admin, session.id, question.solved_by_player_id);
        return NextResponse.json({
          session: bundle,
          result: {
            correct: false,
            stale: true,
            message:
              playMode === "free_for_all"
                ? `${solverName} stole your points!`
                : "That question was already solved by someone else.",
          },
        });
      }

      if (playMode === "one_at_a_time") {
        const { data: sessionPlayers } = await admin
          .from("double_board_players")
          .select("*")
          .eq("session_id", session.id);

        const activeTurnPlayer = getActiveTurnPlayer(sessionPlayers || [], session);

        if (activeTurnPlayer?.user_id && activeTurnPlayer.user_id !== user.id) {
          const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
          return NextResponse.json({
            session: bundle,
            result: {
              correct: false,
              stale: true,
              message: `It is ${activeTurnPlayer.display_name}'s turn.`,
            },
          });
        }
      }

      const isCorrect = submittedAnswer === Number(question.correct_answer);

      if (isCorrect) {
        const { data: solvedQuestion, error: solveError } = await admin
          .from("double_board_questions")
          .update({
            solved: true,
            solved_by_player_id: user.id,
            solved_at: nowIso(),
            updated_at: nowIso(),
          })
          .eq("id", question.id)
          .eq("solved", false)
          .select("*")
          .maybeSingle();

        if (!solvedQuestion || solveError) {
          const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
          const latestQuestion = solvedQuestion || question;
          const solverName = await resolveSolverDisplayName(
            admin,
            session.id,
            latestQuestion?.solved_by_player_id
          );
          return NextResponse.json({
            session: bundle,
            result: {
              correct: false,
              stale: true,
              message:
                playMode === "free_for_all"
                  ? `${solverName} stole your points!`
                  : "That question was already solved by someone else.",
            },
          });
        }

        const { error: attemptError } = await admin.from("double_board_attempts").insert({
          session_id: session.id,
          question_id: question.id,
          player_id: user.id,
          submitted_answer: submittedAnswer,
          is_correct: true,
        });

        if (attemptError) {
          return NextResponse.json({ error: attemptError.message }, { status: 400 });
        }

        if (playMode === "one_at_a_time") {
          await bumpTurnIndex(admin, session);
        }

        const syncedSession = await syncSolvedCount(admin, session.id);
        const pointsEarned = scoreSolvedDoubleBoardQuestion({
          solvedCountAfter: syncedSession.total_solved_count,
          previousAttemptCount: question.attempt_count,
        });

        const { error: scoreError } = await admin
          .from("double_board_players")
          .update({
            score: Number(player.score || 0) + pointsEarned,
            updated_at: nowIso(),
          })
          .eq("id", player.id);

        if (scoreError) {
          return NextResponse.json({ error: scoreError.message }, { status: 400 });
        }

        if (Number(syncedSession.total_solved_count || 0) >= DOUBLE_BOARD_TOTAL_QUESTIONS) {
          await recordSessionResultsIfNeeded(admin, session.id);
        }

        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        return NextResponse.json({
          session: bundle,
          result: {
            correct: true,
            pointsEarned,
            message: `Correct. ${pointsEarned} points earned.`,
          },
        });
      }

      const { error: wrongAttemptError } = await admin.from("double_board_attempts").insert({
        session_id: session.id,
        question_id: question.id,
        player_id: user.id,
        submitted_answer: submittedAnswer,
        is_correct: false,
      });

      if (wrongAttemptError) {
        return NextResponse.json({ error: wrongAttemptError.message }, { status: 400 });
      }

      const { count: wrongCount, error: wrongCountError } = await admin
        .from("double_board_attempts")
        .select("id", { head: true, count: "exact" })
        .eq("question_id", question.id)
        .eq("is_correct", false);

      if (wrongCountError) {
        return NextResponse.json({ error: wrongCountError.message }, { status: 400 });
      }

      const { error: questionError } = await admin
        .from("double_board_questions")
        .update({
          attempt_count: Number(wrongCount || 0),
          ever_missed: true,
          updated_at: nowIso(),
        })
        .eq("id", question.id);

      if (questionError) {
        return NextResponse.json({ error: questionError.message }, { status: 400 });
      }

      await admin
        .from("double_board_sessions")
        .update({ updated_at: nowIso() })
        .eq("id", session.id);

      if (playMode === "one_at_a_time") {
        await bumpTurnIndex(admin, session);
      }

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({
        session: bundle,
        result: {
          correct: false,
          message: "Not correct yet. That tile stays open and gains value.",
        },
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    await logInternalEvent({
      eventKey: "double_board_api_error",
      source: "api.play.double-board",
      message: error?.message || "Unknown Double Board error",
      user,
      accountType: viewer.accountType,
      context: {
        action,
      },
    });

    return NextResponse.json(
      { error: error?.message || "Double Board request failed." },
      { status: 500 }
    );
  }
}
