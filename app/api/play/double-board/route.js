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
  getDoubleBoardPointValue,
  normalizeDoubleBoardMode,
  normalizeDoubleBoardAnswer,
  scoreSolvedDoubleBoardQuestion,
} from "@/lib/question-engine/double-board";
import { listAccessibleCourses } from "@/lib/student-games/courses";
import { upsertGameStats } from "@/lib/student-games/stats";

const GAME_SLUG = "double_board_review";
const DEFAULT_FREE_FOR_ALL_TIMER_SECONDS = 10;
const MAX_FREE_FOR_ALL_TIMER_SECONDS = 120;
const START_COUNTDOWN_SECONDS = 3;
const PLAYER_PRESENCE_WINDOW_MS = 8000;

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nowIso() {
  return new Date().toISOString();
}

function isPlayerPresent(player, nowMs = Date.now()) {
  const updatedAtMs = Date.parse(String(player?.updated_at || ""));
  if (!Number.isFinite(updatedAtMs)) return false;
  return nowMs - updatedAtMs <= PLAYER_PRESENCE_WINDOW_MS;
}

function normalizeAnswerMode(value) {
  return value === "multiple_choice" ? "multiple_choice" : "typed";
}

function normalizePlayMode(value) {
  return value === "one_at_a_time" ? "one_at_a_time" : "free_for_all";
}

function normalizeFreeForAllTimerSeconds(value) {
  const parsed = Math.round(Number(value));

  if (!Number.isFinite(parsed)) {
    return DEFAULT_FREE_FOR_ALL_TIMER_SECONDS;
  }

  return Math.max(1, Math.min(MAX_FREE_FOR_ALL_TIMER_SECONDS, parsed));
}

function normalizeStudentSettingsEnabled(value) {
  return Boolean(value);
}

function firstNameFromDisplayName(displayName) {
  return String(displayName || "").trim().split(/\s+/).filter(Boolean)[0] || "Player";
}

function parseFutureTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) && time > Date.now() ? new Date(time).toISOString() : null;
}

function buildSessionSettingsSnapshot(session, sessionMetadata) {
  return {
    numberMode: normalizeDoubleBoardMode(session?.number_mode),
    answerMode: normalizeAnswerMode(sessionMetadata?.answerMode),
    playMode: normalizePlayMode(sessionMetadata?.playMode),
    turnAdvanceMode: sessionMetadata?.turnAdvanceMode === "one_per_turn" ? "one_per_turn" : "until_wrong",
    freeForAllTimerSeconds: normalizeFreeForAllTimerSeconds(sessionMetadata?.freeForAllTimerSeconds),
  };
}

function normalizeStudentSettingVote(vote, fallbackSettings, phase) {
  const safeVote = vote && typeof vote === "object" ? vote : {};
  return {
    phase: Math.max(1, Number(safeVote.phase || phase || 1)),
    displayName: String(safeVote.displayName || "").trim() || "Student",
    numberMode: normalizeDoubleBoardMode(safeVote.numberMode || fallbackSettings.numberMode),
    answerMode: normalizeAnswerMode(safeVote.answerMode || fallbackSettings.answerMode),
    playMode: normalizePlayMode(safeVote.playMode || fallbackSettings.playMode),
    turnAdvanceMode: safeVote.turnAdvanceMode === "one_per_turn" ? "one_per_turn" : "until_wrong",
    freeForAllTimerSeconds: normalizeFreeForAllTimerSeconds(
      safeVote.freeForAllTimerSeconds || fallbackSettings.freeForAllTimerSeconds
    ),
  };
}

function chooseRandomWinningValue(entries) {
  if (!entries.length) return null;
  return entries[Math.floor(Math.random() * entries.length)]?.value || null;
}

function buildResolvedStudentSettings(session, sessionMetadata) {
  const currentSettings = buildSessionSettingsSnapshot(session, sessionMetadata);
  const phase = Math.max(1, Number(sessionMetadata?.settingsVotePhase || 1));
  const allVotes = Object.entries(sessionMetadata?.studentSettingVotes || {})
    .map(([userId, vote]) => ({
      userId,
      ...normalizeStudentSettingVote(vote, currentSettings, phase),
    }))
    .filter((vote) => vote.phase === phase);
  const summary = {
    phase,
    totalVotes: allVotes.length,
    settings: {},
  };
  const resolvedSettings = { ...currentSettings };

  for (const key of [
    "numberMode",
    "answerMode",
    "playMode",
    "turnAdvanceMode",
    "freeForAllTimerSeconds",
  ]) {
    const counts = new Map();

    for (const vote of allVotes) {
      const value = vote[key];
      counts.set(value, Number(counts.get(value) || 0) + 1);
    }

    const countEntries = [...counts.entries()].map(([value, count]) => ({ value, count }));
    const highestCount = countEntries.reduce((max, entry) => Math.max(max, entry.count), 0);
    const winners = countEntries.filter((entry) => entry.count === highestCount);
    const winningValue =
      winners.length > 0 ? chooseRandomWinningValue(winners) : currentSettings[key];

    summary.settings[key] = {
      winner: winningValue,
      counts: countEntries,
    };
    resolvedSettings[key] = winningValue;
  }

  return {
    summary,
    resolvedSettings,
  };
}

function buildSessionMetadata(metadata = {}, questions = []) {
  const safeMetadata = metadata && typeof metadata === "object" ? metadata : {};
  const questionMap = new Map((questions || []).map((question) => [question.id, question]));
  const activeClaims = {};
  const freeForAllLockouts = {};

  for (const [questionId, claim] of Object.entries(safeMetadata.activeClaims || {})) {
    const question = questionMap.get(questionId);
    if (questionMap.size > 0 && (!question || question.solved)) continue;
    if (!claim || typeof claim !== "object" || !claim.userId || !claim.displayName) continue;

    const expiresAt = parseFutureTime(claim.expiresAt);
    if (!expiresAt) continue;

    activeClaims[questionId] = {
      userId: claim.userId,
      displayName: claim.displayName,
      firstName: firstNameFromDisplayName(claim.displayName),
      claimedAt: claim.claimedAt || nowIso(),
      expiresAt,
    };
  }

  for (const [questionId, userIds] of Object.entries(safeMetadata.freeForAllLockouts || {})) {
    const question = questionMap.get(questionId);
    if (questionMap.size > 0 && (!question || question.solved)) continue;
    if (!Array.isArray(userIds)) continue;
    const sanitizedUserIds = userIds.map((value) => normalizeId(value)).filter(Boolean);
    if (sanitizedUserIds.length) {
      freeForAllLockouts[questionId] = sanitizedUserIds;
    }
  }

  return {
    ...safeMetadata,
    answerMode: normalizeAnswerMode(safeMetadata.answerMode),
    playMode: normalizePlayMode(safeMetadata.playMode),
    turnAdvanceMode: safeMetadata.turnAdvanceMode === "one_per_turn" ? "one_per_turn" : "until_wrong",
    turnIndex: Math.max(0, Number(safeMetadata.turnIndex || 0)),
    activeTurnUserId: normalizeId(safeMetadata.activeTurnUserId),
    turnOrderUserIds: Array.isArray(safeMetadata.turnOrderUserIds)
      ? safeMetadata.turnOrderUserIds.map((value) => normalizeId(value)).filter(Boolean)
      : [],
    studentSettingsEnabled: normalizeStudentSettingsEnabled(safeMetadata.studentSettingsEnabled),
    settingsVotePhase: Math.max(1, Number(safeMetadata.settingsVotePhase || 1)),
    studentSettingVotes:
      safeMetadata.studentSettingVotes && typeof safeMetadata.studentSettingVotes === "object"
        ? safeMetadata.studentSettingVotes
        : {},
    resolvedStudentSettings:
      safeMetadata.resolvedStudentSettings && typeof safeMetadata.resolvedStudentSettings === "object"
        ? safeMetadata.resolvedStudentSettings
        : null,
    resolvedStudentVoteSummary:
      safeMetadata.resolvedStudentVoteSummary && typeof safeMetadata.resolvedStudentVoteSummary === "object"
        ? safeMetadata.resolvedStudentVoteSummary
        : null,
    freeForAllTimerSeconds: normalizeFreeForAllTimerSeconds(safeMetadata.freeForAllTimerSeconds),
    startCountdownEndsAt: parseFutureTime(safeMetadata.startCountdownEndsAt),
    activeClaims,
    freeForAllLockouts,
  };
}

function questionClaimForPayload(claim) {
  if (!claim) return null;

  return {
    userId: claim.userId,
    displayName: claim.displayName,
    firstName: claim.firstName || firstNameFromDisplayName(claim.displayName),
    claimedAt: claim.claimedAt,
    expiresAt: claim.expiresAt,
  };
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

function serializeQuestion(
  row,
  canManage,
  sessionStatus,
  claim = null,
  solvedCount = 0,
  lockoutUserIds = []
) {
  const solved = Boolean(row.solved);
  const everMissed = Boolean(row.ever_missed);
  const attemptCount = Number(row.attempt_count || 0);
  const revealAnswer = solved || sessionStatus === "ended" || canManage;
  const revealExpression = sessionStatus !== "waiting";
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const expressionText = row.expression_text || "Hidden";
  const answerDisplay = formatDoubleBoardAnswer(row.correct_answer, metadata);
  const pointValue = getDoubleBoardPointValue({
    previousAttemptCount: attemptCount,
    question: row,
    solvedCount,
  });

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
    pointValue,
    isHidden: !revealExpression,
    metadata,
    claim: questionClaimForPayload(claim),
    lockoutUserIds,
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

function orderStudentsBySessionMetadata(players, sessionMetadata, options = {}) {
  const presentOnly = options.presentOnly !== false;
  const students = getStudentTurnOrder(players).filter((player) =>
    presentOnly ? isPlayerPresent(player) : true
  );
  const studentMap = new Map(students.map((player) => [player.user_id, player]));
  const ordered = [];

  for (const userId of sessionMetadata?.turnOrderUserIds || []) {
    const player = studentMap.get(userId);
    if (!player) continue;
    ordered.push(player);
    studentMap.delete(userId);
  }

  for (const player of students) {
    if (studentMap.has(player.user_id)) {
      ordered.push(player);
      studentMap.delete(player.user_id);
    }
  }

  return ordered;
}

function getActiveTurnPlayer(players, session) {
  const sessionMetadata = buildSessionMetadata(session?.metadata);
  const students = orderStudentsBySessionMetadata(players, sessionMetadata);
  if (!students.length) return null;

  if (sessionMetadata.activeTurnUserId) {
    const activePlayer = students.find((player) => player.user_id === sessionMetadata.activeTurnUserId);
    if (activePlayer) return activePlayer;
  }

  const turnIndex = Number(sessionMetadata.turnIndex || 0);
  return students[((turnIndex % students.length) + students.length) % students.length] || null;
}

function buildTurnOrderPayload(players, sessionMetadata, activeTurnUserId) {
  return orderStudentsBySessionMetadata(players, sessionMetadata, { presentOnly: false }).map((player, index) => ({
    id: player.id,
    userId: player.user_id,
    displayName: player.display_name,
    score: Number(player.score || 0),
    joinedAt: player.joined_at,
    isPresent: isPlayerPresent(player),
    isActiveTurn: Boolean(activeTurnUserId && activeTurnUserId === player.user_id),
    orderIndex: index,
  }));
}

function sanitizeTurnOrderUserIds(orderedUserIds, players) {
  const studentIds = new Set(
    getStudentTurnOrder(players)
      .map((player) => player.user_id)
      .filter(Boolean)
  );
  const sanitized = [];

  for (const userId of orderedUserIds || []) {
    const normalized = normalizeId(userId);
    if (!normalized || !studentIds.has(normalized) || sanitized.includes(normalized)) continue;
    sanitized.push(normalized);
  }

  for (const player of getStudentTurnOrder(players)) {
    if (player.user_id && !sanitized.includes(player.user_id)) {
      sanitized.push(player.user_id);
    }
  }

  return sanitized;
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

  const sessionMetadata = buildSessionMetadata(session.metadata, questions || []);
  const canManage = viewerCanManageSession(session, viewer.courses, viewer.user, viewer.accountType);
  const solvedCount = (questions || []).filter((question) => question?.solved).length;
  const serializedQuestions = (questions || []).map((row) =>
    serializeQuestion(
      row,
      canManage,
      session.status,
      sessionMetadata.activeClaims?.[row.id] || null,
      solvedCount,
      sessionMetadata.freeForAllLockouts?.[row.id] || []
    )
  );
  const playMode = sessionMetadata.playMode;
  const activeQuestionId =
    playMode === "one_at_a_time" ? getActiveQuestionId(serializedQuestions, playMode, session.status) : null;
  const boards = buildDoubleBoardMatrix(
    serializedQuestions.map((question) => ({
      ...question,
      board_key: question.boardKey,
      row_index: question.rowIndex,
      col_index: question.colIndex,
    }))
  );
  const allPlayers = sortPlayers(players);
  const presentPlayers = allPlayers.filter((player) => isPlayerPresent(player));
  const playerMap = new Map((players || []).map((player) => [player.user_id, player]));
  const questionMap = new Map((questions || []).map((question) => [question.id, question]));
  const visibleLeaderboard = presentPlayers
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
  const turnOrder = buildTurnOrderPayload(
    players || [],
    sessionMetadata,
    activeTurnPlayer?.user_id || null
  );
  const currentSettings = buildSessionSettingsSnapshot(session, sessionMetadata);
  const viewerVote = viewer.user?.id
    ? sessionMetadata.studentSettingVotes?.[viewer.user.id]
      ? normalizeStudentSettingVote(
          sessionMetadata.studentSettingVotes[viewer.user.id],
          currentSettings,
          sessionMetadata.settingsVotePhase
        )
      : null
    : null;
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
    answerMode: sessionMetadata.answerMode,
    multipleChoiceEnabled: sessionMetadata.answerMode === "multiple_choice",
    playMode,
    turnAdvanceMode: sessionMetadata.turnAdvanceMode,
    freeForAllTimerSeconds: sessionMetadata.freeForAllTimerSeconds,
    startCountdownEndsAt: sessionMetadata.startCountdownEndsAt,
    activeQuestionId,
    turnIndex: sessionMetadata.turnIndex,
    activeTurnPlayerId: activeTurnPlayer?.id || null,
    activeTurnUserId: activeTurnPlayer?.user_id || null,
    activeTurnDisplayName: activeTurnPlayer?.display_name || null,
    isViewerTurn: Boolean(activeTurnPlayer?.user_id && activeTurnPlayer.user_id === viewer.user.id),
    turnOrder,
    studentSettingsEnabled: sessionMetadata.studentSettingsEnabled,
    settingsVotePhase: sessionMetadata.settingsVotePhase,
    viewerVote,
    resolvedStudentSettings: sessionMetadata.resolvedStudentSettings,
    resolvedStudentVoteSummary: sessionMetadata.resolvedStudentVoteSummary,
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

async function touchPlayerPresence(admin, sessionId, userId) {
  if (!sessionId || !userId) return;

  await admin
    .from("double_board_players")
    .update({
      updated_at: nowIso(),
    })
    .eq("session_id", sessionId)
    .eq("user_id", userId);
}

async function advanceTurn(admin, session, players = []) {
  const sessionMetadata = buildSessionMetadata(session?.metadata);
  const orderedStudents = orderStudentsBySessionMetadata(players, sessionMetadata);
  let activeTurnUserId = null;

  if (orderedStudents.length) {
    const activeIndex = orderedStudents.findIndex(
      (player) => player.user_id === sessionMetadata.activeTurnUserId
    );
    const nextIndex = activeIndex >= 0 ? (activeIndex + 1) % orderedStudents.length : 0;
    activeTurnUserId = orderedStudents[nextIndex]?.user_id || null;
  }

  const nextMetadata = {
    ...sessionMetadata,
    turnIndex: Number(sessionMetadata.turnIndex || 0) + 1,
    activeTurnUserId,
    turnOrderUserIds: sanitizeTurnOrderUserIds(sessionMetadata.turnOrderUserIds, players),
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

async function replaceSessionQuestions(admin, session, numberMode) {
  const { error: deleteError } = await admin
    .from("double_board_questions")
    .delete()
    .eq("session_id", session.id);

  if (deleteError) throw new Error(deleteError.message);

  const questionRows = createDoubleBoardQuestionRecords(numberMode);
  const { error: insertError } = await admin.from("double_board_questions").insert(
    questionRows.map((question) => ({
      session_id: session.id,
      ...question,
      updated_at: nowIso(),
    }))
  );

  if (insertError) throw new Error(insertError.message);
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
  playMode,
  freeForAllTimerSeconds,
  turnAdvanceMode,
  studentSettingsEnabled,
  existingPlayers = [],
  existingMetadata = null
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

  const initialTurnOrderUserIds = sanitizeTurnOrderUserIds(
    buildSessionMetadata(existingMetadata).turnOrderUserIds,
    existingPlayers
  );
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
        turnAdvanceMode,
        turnIndex: 0,
        activeTurnUserId: null,
        turnOrderUserIds: initialTurnOrderUserIds,
        studentSettingsEnabled,
        settingsVotePhase: 1,
        studentSettingVotes: {},
        resolvedStudentSettings: null,
        resolvedStudentVoteSummary: null,
        freeForAllTimerSeconds,
        startCountdownEndsAt: null,
        activeClaims: {},
        freeForAllLockouts: {},
      },
      updated_at: nowIso(),
    })
    .select("*")
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 400 });
  }

  const playersToCarry = new Map();

  for (const player of existingPlayers || []) {
    if (!player?.user_id) continue;
    playersToCarry.set(player.user_id, {
      session_id: session.id,
      user_id: player.user_id,
      display_name: player.display_name || "MathClaw User",
      role: player.role === "teacher" ? "teacher" : "student",
      score: 0,
      joined_at: player.joined_at || nowIso(),
      updated_at: nowIso(),
    });
  }

  playersToCarry.set(user.id, {
    session_id: session.id,
    user_id: user.id,
    display_name: displayName,
    role: "teacher",
    score: 0,
    joined_at: playersToCarry.get(user.id)?.joined_at || nowIso(),
    updated_at: nowIso(),
  });

  const { error: playerError } = await admin.from("double_board_players").insert(
    [...playersToCarry.values()]
  );

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

  await touchPlayerPresence(admin, session.id, user.id);
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
      const freeForAllTimerSeconds = normalizeFreeForAllTimerSeconds(body.freeForAllTimerSeconds);
      const turnAdvanceMode = body.turnAdvanceMode === "one_per_turn" ? "one_per_turn" : "until_wrong";
      const studentSettingsEnabled = normalizeStudentSettingsEnabled(body.studentSettingsEnabled);
      let existingPlayers = [];
      let existingMetadata = null;

      if (courseId && !canAccessCourse(viewer.courses, courseId)) {
        return NextResponse.json(
          { error: "Double Board is not enabled for that class." },
          { status: 403 }
        );
      }

      if (action === "reset") {
        const sessionId = normalizeId(body.sessionId);
        if (sessionId) {
          const { data: priorSession } = await admin
            .from("double_board_sessions")
            .select("*")
            .eq("id", sessionId)
            .maybeSingle();

          if (!priorSession) {
            return NextResponse.json({ error: "Double Board session not found." }, { status: 404 });
          }

          if (!viewerCanManageSession(priorSession, viewer.courses, user, viewer.accountType)) {
            return NextResponse.json({ error: "Only the host can reset this game." }, { status: 403 });
          }

          const { data: priorPlayers } = await admin
            .from("double_board_players")
            .select("*")
            .eq("session_id", priorSession.id);

          existingPlayers = priorPlayers || [];
          existingMetadata = priorSession.metadata || null;
        }
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
        playMode,
        freeForAllTimerSeconds,
        turnAdvanceMode,
        studentSettingsEnabled,
        existingPlayers,
        existingMetadata
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

    await touchPlayerPresence(admin, session.id, user.id);
    const canManage = viewerCanManageSession(session, viewer.courses, user, viewer.accountType);

    if (action === "start") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can start this game." }, { status: 403 });
      }

      const { data: sessionPlayers } = await admin
        .from("double_board_players")
        .select("*")
        .eq("session_id", session.id);
      const startMetadata = buildSessionMetadata(session.metadata);
      const nextMetadata = {
        ...startMetadata,
        activeTurnUserId:
          startMetadata.activeTurnUserId ||
          getActiveTurnPlayer(sessionPlayers || [], session)?.user_id ||
          null,
        startCountdownEndsAt: new Date(
          Date.now() + START_COUNTDOWN_SECONDS * 1000
        ).toISOString(),
      };

      const { error } = await admin
        .from("double_board_sessions")
        .update({
          status: "live",
          started_at: session.started_at || nowIso(),
          metadata: nextMetadata,
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

      const sessionMetadata = buildSessionMetadata(session.metadata);
      await syncSolvedCount(admin, session.id, { forceEnded: true, endedAt: nowIso() });
      if (sessionMetadata.studentSettingsEnabled) {
        await admin
          .from("double_board_sessions")
          .update({
            metadata: {
              ...sessionMetadata,
              settingsVotePhase: Number(sessionMetadata.settingsVotePhase || 1) + 1,
              resolvedStudentSettings: null,
              resolvedStudentVoteSummary: null,
            },
            updated_at: nowIso(),
          })
          .eq("id", session.id);
      }
      await recordSessionResultsIfNeeded(admin, session.id);
      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle });
    }

    if (action === "reorder_turns") {
      if (!canManage) {
        return NextResponse.json({ error: "Only the host can reorder turns." }, { status: 403 });
      }

      const sessionMetadata = buildSessionMetadata(session.metadata);
      if (sessionMetadata.playMode !== "one_at_a_time") {
        return NextResponse.json({ error: "Turn order only applies in one-at-a-time mode." }, { status: 400 });
      }

      const { data: sessionPlayers } = await admin
        .from("double_board_players")
        .select("*")
        .eq("session_id", session.id);
      const nextTurnOrderUserIds = sanitizeTurnOrderUserIds(body.orderedUserIds, sessionPlayers || []);
      const activeTurnPlayer = getActiveTurnPlayer(sessionPlayers || [], session);
      const { error } = await admin
        .from("double_board_sessions")
        .update({
          metadata: {
            ...sessionMetadata,
            turnOrderUserIds: nextTurnOrderUserIds,
            activeTurnUserId: activeTurnPlayer?.user_id || sessionMetadata.activeTurnUserId || null,
          },
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle, result: { message: "Turn order updated." } });
    }

    if (action === "submit_vote") {
      if (canManage) {
        return NextResponse.json({ error: "Only students can submit setting votes." }, { status: 403 });
      }

      const sessionMetadata = buildSessionMetadata(session.metadata);
      if (!sessionMetadata.studentSettingsEnabled) {
        return NextResponse.json({ error: "Student voting is not enabled for this game." }, { status: 400 });
      }

      const currentSettings = buildSessionSettingsSnapshot(session, sessionMetadata);
      const nextStudentSettingVotes = {
        ...sessionMetadata.studentSettingVotes,
        [user.id]: normalizeStudentSettingVote(
          {
            ...body,
            displayName,
            phase: sessionMetadata.settingsVotePhase,
          },
          currentSettings,
          sessionMetadata.settingsVotePhase
        ),
      };
      const voteMetadata = {
        ...sessionMetadata,
        studentSettingVotes: nextStudentSettingVotes,
      };
      const { resolvedSettings, summary } = buildResolvedStudentSettings(session, voteMetadata);
      const nextMetadata = {
        ...voteMetadata,
        answerMode: resolvedSettings.answerMode,
        playMode: resolvedSettings.playMode,
        turnAdvanceMode: resolvedSettings.turnAdvanceMode,
        freeForAllTimerSeconds: resolvedSettings.freeForAllTimerSeconds,
        resolvedStudentSettings: resolvedSettings,
        resolvedStudentVoteSummary: summary,
      };

      if (session.status === "waiting" && resolvedSettings.numberMode !== session.number_mode) {
        await replaceSessionQuestions(admin, session, resolvedSettings.numberMode);
      }

      const { error } = await admin
        .from("double_board_sessions")
        .update({
          number_mode: resolvedSettings.numberMode,
          metadata: nextMetadata,
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({ session: bundle, result: { message: "Vote submitted." } });
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

    if (action === "claim_question") {
      if (session.status !== "live") {
        return NextResponse.json({ error: "This game is not accepting answers right now." }, { status: 400 });
      }

      const sessionMetadata = buildSessionMetadata(session.metadata);
      if (sessionMetadata.playMode !== "free_for_all") {
        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        return NextResponse.json({ session: bundle, result: { claimed: true } });
      }

      if (
        sessionMetadata.startCountdownEndsAt &&
        Date.parse(sessionMetadata.startCountdownEndsAt) > Date.now()
      ) {
        return NextResponse.json({ error: "The game countdown is still running." }, { status: 400 });
      }

      const questionId = normalizeId(body.questionId);
      const player = await ensurePlayer(
        admin,
        session.id,
        user,
        displayName,
        canManage ? "teacher" : "student"
      );
      const { data: question } = await admin
        .from("double_board_questions")
        .select("*")
        .eq("id", questionId)
        .eq("session_id", session.id)
        .maybeSingle();

      if (!question) {
        return NextResponse.json({ error: "Question not found." }, { status: 404 });
      }

      if (question.solved) {
        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        return NextResponse.json({
          session: bundle,
          result: {
            claimed: false,
            message: "That question is already solved.",
          },
        });
      }

      const activeClaims = {
        ...buildSessionMetadata(session.metadata).activeClaims,
      };
      const freeForAllLockouts = buildSessionMetadata(session.metadata).freeForAllLockouts;
      const existingClaim = activeClaims[question.id];

      if (freeForAllLockouts?.[question.id]?.includes(user.id)) {
        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        return NextResponse.json({
          session: bundle,
          result: {
            claimed: false,
            message: "That tile is locked for you until another student tries it.",
          },
        });
      }

      if (existingClaim?.userId === user.id) {
        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        return NextResponse.json({
          session: bundle,
          result: {
            claimed: true,
            playerId: player.id,
          },
        });
      }

      if (existingClaim?.userId && existingClaim.userId !== user.id) {
        const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
        return NextResponse.json({
          session: bundle,
          result: {
            claimed: false,
            message: `${existingClaim.firstName} is answering that one right now.`,
          },
        });
      }

      activeClaims[question.id] = {
        userId: user.id,
        displayName,
        firstName: firstNameFromDisplayName(displayName),
        claimedAt: nowIso(),
        expiresAt: new Date(
          Date.now() + sessionMetadata.freeForAllTimerSeconds * 1000
        ).toISOString(),
      };

      const { error } = await admin
        .from("double_board_sessions")
        .update({
          metadata: {
            ...sessionMetadata,
            activeClaims,
          },
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
      return NextResponse.json({
        session: bundle,
        result: {
          claimed: true,
          playerId: player.id,
        },
      });
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
      const sessionMetadata = buildSessionMetadata(session.metadata);
      const playMode = sessionMetadata.playMode;
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

      if (
        sessionMetadata.startCountdownEndsAt &&
        Date.parse(sessionMetadata.startCountdownEndsAt) > Date.now()
      ) {
        return NextResponse.json({ error: "The game countdown is still running." }, { status: 400 });
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

      if (playMode === "free_for_all") {
        const questionScopedMetadata = buildSessionMetadata(session.metadata);
        const activeClaim = questionScopedMetadata.activeClaims[question.id];

        if (!activeClaim || activeClaim.userId !== user.id) {
          const bundle = await loadSessionBundle(admin, session.id, { ...viewer, user });
          return NextResponse.json({
            session: bundle,
            result: {
              correct: false,
              stale: true,
              message: activeClaim
                ? `${activeClaim.firstName} is answering that one right now.`
                : "Click the tile to claim it before answering.",
            },
          });
        }
      }

      const currentLockouts = {
        ...sessionMetadata.freeForAllLockouts,
      };
      if (playMode === "free_for_all") {
        const questionLockouts = Array.isArray(currentLockouts[question.id])
          ? currentLockouts[question.id].filter((lockedUserId) => lockedUserId !== user.id)
          : [];
        if (questionLockouts.length) {
          currentLockouts[question.id] = questionLockouts;
        } else {
          delete currentLockouts[question.id];
        }
      }

      const isCorrect = submittedAnswer === Number(question.correct_answer);

      if (isCorrect) {
        const nextClaims = {
          ...sessionMetadata.activeClaims,
        };
        delete nextClaims[question.id];
        delete currentLockouts[question.id];

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

        if (playMode === "one_at_a_time" && sessionMetadata.turnAdvanceMode === "one_per_turn") {
          const { data: sessionPlayers } = await admin
            .from("double_board_players")
            .select("*")
            .eq("session_id", session.id);
          await advanceTurn(admin, session, sessionPlayers || []);
        }

        await admin
          .from("double_board_sessions")
          .update({
            metadata: {
              ...sessionMetadata,
              activeClaims: nextClaims,
              freeForAllLockouts: currentLockouts,
            },
            updated_at: nowIso(),
          })
          .eq("id", session.id);

        const syncedSession = await syncSolvedCount(admin, session.id);
        const pointsEarned = scoreSolvedDoubleBoardQuestion({
          previousAttemptCount: question.attempt_count,
          question,
          solvedCount: Number(session.total_solved_count || 0) + 1,
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
        .update({
          metadata: {
            ...sessionMetadata,
            activeClaims: buildSessionMetadata(session.metadata).activeClaims,
            freeForAllLockouts:
              playMode === "free_for_all"
                ? {
                    ...currentLockouts,
                    [question.id]: [user.id],
                  }
                : currentLockouts,
          },
          updated_at: nowIso(),
        })
        .eq("id", session.id);

      if (playMode === "one_at_a_time") {
        const { data: sessionPlayers } = await admin
          .from("double_board_players")
          .select("*")
          .eq("session_id", session.id);
        await advanceTurn(admin, session, sessionPlayers || []);
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
