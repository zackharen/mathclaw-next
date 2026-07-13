import { NextResponse } from "next/server";
import { getAccountTypeForUser, isTeacherAccountType } from "@/lib/auth/account-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCREEN_IDS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const POLL_TYPES = new Set(["multiple_choice", "thumbs", "scale"]);
const QUESTION_TYPES = new Set(["text", "latex"]);
const STUDENT_NAME_LIMIT = 40;
const QUESTION_LIMIT = 500;
const BROADCAST_SEND_TIMEOUT_MS = 1500;

function jsonError(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function jsonOk(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate" },
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(String(value || ""));
}

function isMissingPollTables(error) {
  return error?.code === "42P01" || error?.code === "PGRST205" || /projector_polls|projector_poll_votes/i.test(error?.message || "");
}

function normalizeScreenNumber(value) {
  const screenNumber = String(value || "").trim();
  return SCREEN_IDS.includes(screenNumber) ? screenNumber : null;
}

function normalizeScreenIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeScreenNumber).filter(Boolean))];
}

function normalizeOptionalText(value, limit) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, limit);
}

function normalizeRoomSlots(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((slot, index) => ({
    name: String(slot?.name || `Screen ${index + 1}`).trim().replace(/\s+/g, " ").slice(0, 60) || `Screen ${index + 1}`,
    inputType: ["touch", "keyboard_mouse", "display_only"].includes(slot?.inputType) ? slot.inputType : "display_only",
    enabled: slot?.enabled !== false,
  }));
}

function publicPoll(row) {
  if (!row) return null;
  return {
    id: row.id,
    question: row.question,
    questionType: row.question_type || "text",
    type: row.poll_type,
    choices: Array.isArray(row.choices) ? row.choices : [],
    targetScreenIds: Array.isArray(row.target_screen_ids) ? row.target_screen_ids.map(String) : [],
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at || null,
  };
}

function normalizeChoices(type, sourceChoices) {
  if (type === "thumbs") {
    return [
      { id: "up", label: "Thumbs up" },
      { id: "down", label: "Thumbs down" },
    ];
  }
  if (type === "scale") {
    return ["1", "2", "3", "4", "5"].map((value) => ({ id: value, label: value }));
  }
  const rawChoices = Array.isArray(sourceChoices) ? sourceChoices : [];
  const choices = rawChoices
    .slice(0, 6)
    .map((choice, index) => {
      if (choice && typeof choice === "object") {
        return {
          id: String(choice.id || String.fromCharCode(65 + index)).trim().slice(0, 24) || String.fromCharCode(65 + index),
          label: String(choice.label || choice.text || String.fromCharCode(65 + index)).trim().slice(0, 120) || String.fromCharCode(65 + index),
        };
      }
      const label = String(choice || "").trim().slice(0, 120);
      return { id: String.fromCharCode(65 + index), label: label || String.fromCharCode(65 + index) };
    })
    .filter((choice) => choice.id && choice.label);
  if (choices.length < 2) {
    return ["A", "B", "C", "D"].map((label) => ({ id: label, label }));
  }
  return choices;
}

function validChoiceId(poll, choice) {
  const safeChoice = String(choice || "").trim().slice(0, 80);
  return (Array.isArray(poll?.choices) ? poll.choices : []).some((item) => String(item?.id) === safeChoice) ? safeChoice : "";
}

function aggregateResults(poll, votes = []) {
  const choices = Array.isArray(poll?.choices) ? poll.choices : [];
  const counts = Object.fromEntries(choices.map((choice) => [String(choice.id), 0]));
  votes.forEach((vote) => {
    const key = String(vote.choice || "");
    if (Object.prototype.hasOwnProperty.call(counts, key)) counts[key] += 1;
  });
  return {
    poll: publicPoll(poll),
    choices: choices.map((choice) => ({
      id: String(choice.id),
      label: String(choice.label || choice.id),
      count: counts[String(choice.id)] || 0,
    })),
    totalVotes: votes.length,
    expectedVotes: Array.isArray(poll?.target_screen_ids) ? poll.target_screen_ids.length : 0,
  };
}

async function getTeacherContext(admin) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: jsonError("Sign in as a teacher to manage projector polls.", 401) };

  const accountType = await getAccountTypeForUser(supabase, user);
  if (!isTeacherAccountType(accountType)) {
    return { error: jsonError("Only teacher accounts can manage projector polls.", 403) };
  }

  const { data: session, error } = await admin
    .from("projector_sessions")
    .select("id")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { error: jsonError(error.message, 500) };
  if (!session) return { error: jsonError("Open Projector once before managing polls.", 404) };
  return { user, session };
}

async function findSessionByToken(admin, token) {
  for (const screenId of SCREEN_IDS) {
    const { data, error } = await admin
      .from("projector_sessions")
      .select("id, teacher_id, screen_tokens")
      .contains("screen_tokens", { [screenId]: token })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return { session: data, screenNumber: screenId };
  }
  return null;
}

async function getActiveRoom(admin, teacherId) {
  const { data, error } = await admin
    .from("projector_room_profiles")
    .select("slots")
    .eq("teacher_id", teacherId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(error.message);
  }
  return data || null;
}

async function getActiveRoomSlot(admin, teacherId, screenNumber) {
  const room = await getActiveRoom(admin, teacherId);
  const slots = normalizeRoomSlots(room?.slots);
  return slots[Number(screenNumber) - 1] || { name: `Screen ${screenNumber}`, inputType: "display_only", enabled: false };
}

async function getActiveTouchScreens(admin, teacherId) {
  const room = await getActiveRoom(admin, teacherId);
  const slots = normalizeRoomSlots(room?.slots);
  return slots
    .map((slot, index) =>
      slot.enabled !== false && slot.inputType === "touch"
        ? { screenId: String(index + 1), name: slot.name || `Screen ${index + 1}` }
        : null
    )
    .filter(Boolean);
}

async function broadcastPollChanged(admin, sessionId, pollId = null) {
  const channel = admin.channel(`projector-session-${sessionId}`);
  try {
    await Promise.race([
      channel.send({
        type: "broadcast",
        event: "poll-updated",
        payload: { pollId, changedAt: new Date().toISOString() },
      }),
      new Promise((resolve) => setTimeout(resolve, BROADCAST_SEND_TIMEOUT_MS)),
    ]);
  } finally {
    await admin.removeChannel(channel);
  }
}

async function loadPollResults(admin, teacherId, pollId) {
  if (!isUuid(pollId)) return { error: jsonError("Choose a poll.", 400) };
  const { data: poll, error: pollError } = await admin
    .from("projector_polls")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("id", pollId)
    .maybeSingle();

  if (isMissingPollTables(pollError)) return { setupMissing: true };
  if (pollError) return { error: jsonError(pollError.message, 500) };
  if (!poll) return { error: jsonError("Poll not found.", 404) };

  const { data: votes, error: voteError } = await admin
    .from("projector_poll_votes")
    .select("screen_number, screen_name, student_name, choice, updated_at")
    .eq("poll_id", poll.id)
    .order("updated_at", { ascending: false });

  if (isMissingPollTables(voteError)) return { setupMissing: true };
  if (voteError) return { error: jsonError(voteError.message, 500) };
  return { results: aggregateResults(poll, votes || []), votes: votes || [] };
}

async function listTeacherPolls(admin, teacherId) {
  const { data: polls, error } = await admin
    .from("projector_polls")
    .select("*")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (isMissingPollTables(error)) return { setupMissing: true };
  if (error) return { error: jsonError(error.message, 500) };

  const activePoll = (polls || []).find((poll) => poll.status === "open") || null;
  const results = activePoll ? await loadPollResults(admin, teacherId, activePoll.id) : null;
  return {
    activePoll: publicPoll(activePoll),
    activeResults: results?.results || (activePoll ? aggregateResults(activePoll, []) : null),
    recentPolls: (polls || []).map(publicPoll),
  };
}

async function getReceiverPoll(admin, token) {
  if (!token) return jsonError("Connect this screen before voting.", 401);
  const resolved = await findSessionByToken(admin, token);
  if (!resolved?.session || !resolved.screenNumber) return jsonError("Projector token not found.", 404);

  const slot = await getActiveRoomSlot(admin, resolved.session.teacher_id, resolved.screenNumber);
  if (slot.enabled === false || slot.inputType !== "touch") {
    return jsonOk({ poll: null, vote: null, eligible: false });
  }

  const { data: poll, error: pollError } = await admin
    .from("projector_polls")
    .select("*")
    .eq("teacher_id", resolved.session.teacher_id)
    .eq("session_id", resolved.session.id)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isMissingPollTables(pollError)) return jsonOk({ setupMissing: true, poll: null, vote: null });
  if (pollError) return jsonError(pollError.message, 500);
  if (!poll || !Array.isArray(poll.target_screen_ids) || !poll.target_screen_ids.map(String).includes(String(resolved.screenNumber))) {
    return jsonOk({ poll: null, vote: null, eligible: true });
  }

  const { data: vote, error: voteError } = await admin
    .from("projector_poll_votes")
    .select("student_name, choice, updated_at")
    .eq("poll_id", poll.id)
    .eq("screen_number", Number(resolved.screenNumber))
    .maybeSingle();

  if (isMissingPollTables(voteError)) return jsonOk({ setupMissing: true, poll: null, vote: null });
  if (voteError) return jsonError(voteError.message, 500);
  return jsonOk({
    poll: publicPoll(poll),
    vote: vote ? { studentName: vote.student_name || "", choice: vote.choice, updatedAt: vote.updated_at } : null,
    eligible: true,
  });
}

async function createPoll(admin, teacherId, sessionId, body) {
  const question = String(body.question || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, QUESTION_LIMIT);
  if (!question) return jsonError("Add a poll question.");
  const pollType = POLL_TYPES.has(body.pollType) ? body.pollType : "multiple_choice";
  const questionType = QUESTION_TYPES.has(body.questionType) ? body.questionType : "text";
  const choices = normalizeChoices(pollType, body.choices);
  const touchScreens = await getActiveTouchScreens(admin, teacherId);
  const touchIds = new Set(touchScreens.map((screen) => screen.screenId));
  const requestedIds = normalizeScreenIds(body.screenIds).filter((screenId) => touchIds.has(screenId));
  const targetScreenIds = requestedIds.length ? requestedIds : touchScreens.map((screen) => screen.screenId);
  if (!targetScreenIds.length) return jsonError("Turn on at least one active touch screen before launching a poll.");

  await admin
    .from("projector_polls")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("teacher_id", teacherId)
    .eq("status", "open");

  const { data: poll, error } = await admin
    .from("projector_polls")
    .insert({
      teacher_id: teacherId,
      session_id: sessionId,
      question,
      question_type: questionType,
      poll_type: pollType,
      choices,
      target_screen_ids: targetScreenIds,
    })
    .select("*")
    .single();

  if (isMissingPollTables(error)) return jsonError("Projector polls are not set up yet.", 503);
  if (error) return jsonError(error.message, 500);
  await broadcastPollChanged(admin, sessionId, poll.id);
  return jsonOk({ poll: publicPoll(poll), results: aggregateResults(poll, []) });
}

async function closePoll(admin, teacherId, sessionId, body) {
  const pollId = String(body.pollId || "");
  if (!isUuid(pollId)) return jsonError("Choose a poll to close.");
  const { data: poll, error } = await admin
    .from("projector_polls")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("teacher_id", teacherId)
    .eq("id", pollId)
    .select("*")
    .maybeSingle();

  if (isMissingPollTables(error)) return jsonError("Projector polls are not set up yet.", 503);
  if (error) return jsonError(error.message, 500);
  if (!poll) return jsonError("Poll not found.", 404);
  await broadcastPollChanged(admin, sessionId, poll.id);
  const results = await loadPollResults(admin, teacherId, poll.id);
  if (results.error) return results.error;
  return jsonOk({ poll: publicPoll(poll), results: results.results });
}

async function vote(admin, body) {
  const token = String(body.token || "").trim();
  const pollId = String(body.pollId || "");
  if (!token) return jsonError("Connect this screen before voting.", 401);

  const resolved = await findSessionByToken(admin, token);
  if (!resolved?.session || !resolved.screenNumber) return jsonError("Projector token not found.", 404);
  const slot = await getActiveRoomSlot(admin, resolved.session.teacher_id, resolved.screenNumber);
  if (slot.enabled === false) return jsonError("This screen is inactive right now.", 403);
  if (slot.inputType !== "touch") return jsonError("This screen is not set up for voting.", 403);

  let pollQuery = admin
    .from("projector_polls")
    .select("*")
    .eq("teacher_id", resolved.session.teacher_id)
    .eq("session_id", resolved.session.id)
    .eq("status", "open");
  if (isUuid(pollId)) {
    pollQuery = pollQuery.eq("id", pollId);
  } else {
    pollQuery = pollQuery.order("created_at", { ascending: false }).limit(1);
  }
  const { data: poll, error: pollError } = await pollQuery.maybeSingle();

  if (isMissingPollTables(pollError)) return jsonError("Projector polls are not set up yet.", 503);
  if (pollError) return jsonError(pollError.message, 500);
  if (!poll) return jsonError("Poll not found.", 404);
  if (!Array.isArray(poll.target_screen_ids) || !poll.target_screen_ids.map(String).includes(String(resolved.screenNumber))) {
    return jsonError("This screen is not part of the current poll.", 403);
  }
  const choice = validChoiceId(poll, body.choice);
  if (!choice) return jsonError("Choose one of the poll options.");

  const studentName = normalizeOptionalText(body.studentName, STUDENT_NAME_LIMIT) || null;
  const votePayload = {
    poll_id: poll.id,
    teacher_id: poll.teacher_id,
    session_id: poll.session_id,
    screen_number: Number(resolved.screenNumber),
    screen_name: slot.name || `Screen ${resolved.screenNumber}`,
    student_name: studentName,
    choice,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("projector_poll_votes")
    .upsert(votePayload, { onConflict: "poll_id,screen_number" })
    .select("student_name, choice, updated_at")
    .single();

  if (isMissingPollTables(error)) return jsonError("Projector polls are not set up yet.", 503);
  if (error) return jsonError(error.message, 500);
  await broadcastPollChanged(admin, poll.session_id, poll.id);
  return jsonOk({ vote: { studentName: data.student_name || "", choice: data.choice, updatedAt: data.updated_at } });
}

export async function GET(request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const token = String(searchParams.get("token") || "").trim();
  if (token) return getReceiverPoll(admin, token);

  const context = await getTeacherContext(admin);
  if (context.error) return context.error;
  if (searchParams.get("action") === "results") {
    const result = await loadPollResults(admin, context.user.id, searchParams.get("pollId"));
    if (result.setupMissing) return jsonOk({ setupMissing: true });
    if (result.error) return result.error;
    return jsonOk(result);
  }
  const payload = await listTeacherPolls(admin, context.user.id);
  if (payload.setupMissing) return jsonOk({ setupMissing: true });
  if (payload.error) return payload.error;
  return jsonOk(payload);
}

export async function POST(request) {
  const admin = createAdminClient();
  const body = await request.json().catch(() => ({}));
  if (body.action === "vote") return vote(admin, body);

  const context = await getTeacherContext(admin);
  if (context.error) return context.error;
  if (body.action === "create") return createPoll(admin, context.user.id, context.session.id, body);
  if (body.action === "close") return closePoll(admin, context.user.id, context.session.id, body);
  return jsonError("Choose a poll action.");
}
