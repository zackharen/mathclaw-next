function numericValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function lastTenAverage(rows) {
  const relevant = rows.slice(0, 10);
  if (relevant.length === 0) return 0;
  const total = relevant.reduce((sum, row) => sum + numericValue(row.score), 0);
  return total / relevant.length;
}

function average(rows) {
  if (rows.length === 0) return 0;
  const total = rows.reduce((sum, row) => sum + numericValue(row.score), 0);
  return total / rows.length;
}

function best(rows) {
  return rows.reduce((max, row) => Math.max(max, numericValue(row.score)), 0);
}

export async function upsertGameStats({
  supabase,
  userId,
  gameSlug,
  courseId = null,
  latestStats = {},
}) {
  const globalQuery = supabase
    .from("game_sessions")
    .select("score, metadata, created_at")
    .eq("player_id", userId)
    .eq("game_slug", gameSlug)
    .order("created_at", { ascending: false });

  const courseQuery = courseId
    ? supabase
        .from("game_sessions")
        .select("score, metadata, created_at")
        .eq("player_id", userId)
        .eq("game_slug", gameSlug)
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const [{ data: globalRows, error: globalError }, { data: courseRows, error: courseError }] =
    await Promise.all([globalQuery, courseQuery]);

  if (globalError) throw new Error(globalError.message);
  if (courseError) throw new Error(courseError.message);

  const latestSkillRating = numericValue(
    latestStats.skillRating ??
      globalRows?.[0]?.metadata?.skillRatingAfter ??
      1
  );

  const globalPayload = {
    player_id: userId,
    game_slug: gameSlug,
    sessions_played: (globalRows || []).length,
    total_score: (globalRows || []).reduce((sum, row) => sum + numericValue(row.score), 0),
    average_score: average(globalRows || []),
    last_10_average: lastTenAverage(globalRows || []),
    best_score: best(globalRows || []),
    skill_rating: latestSkillRating,
    stats: latestStats,
    updated_at: new Date().toISOString(),
  };

  const { error: globalUpsertError } = await supabase
    .from("game_player_global_stats")
    .upsert(globalPayload, { onConflict: "player_id,game_slug" });

  if (globalUpsertError) throw new Error(globalUpsertError.message);

  if (courseId) {
    const coursePayload = {
      course_id: courseId,
      player_id: userId,
      game_slug: gameSlug,
      sessions_played: (courseRows || []).length,
      total_score: (courseRows || []).reduce((sum, row) => sum + numericValue(row.score), 0),
      average_score: average(courseRows || []),
      last_10_average: lastTenAverage(courseRows || []),
      best_score: best(courseRows || []),
      skill_rating: latestSkillRating,
      stats: latestStats,
      updated_at: new Date().toISOString(),
    };

    const { error: courseUpsertError } = await supabase
      .from("course_game_player_stats")
      .upsert(coursePayload, { onConflict: "course_id,player_id,game_slug" });

    if (courseUpsertError) throw new Error(courseUpsertError.message);
  }

  return {
    global: globalPayload,
    course: courseId
      ? {
          course_id: courseId,
          sessions_played: (courseRows || []).length,
          average_score: average(courseRows || []),
          last_10_average: lastTenAverage(courseRows || []),
          best_score: best(courseRows || []),
        }
      : null,
  };
}
