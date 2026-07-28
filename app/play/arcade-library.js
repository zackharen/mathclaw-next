"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

const FILTERS = [
  ["all", "All games"],
  ["group", "Group play"],
  ["arcade", "Arcade"],
  ["math_skills", "Math skills"],
  ["survival_skills", "Life skills"],
];

const GAME_ART = {
  "2048": { glyph: "2ⁿ", tone: "violet" },
  connect4: { glyph: "●●", tone: "coral" },
  integer_practice: { glyph: "±", tone: "blue" },
  money_counting: { glyph: "$", tone: "green" },
  number_compare: { glyph: "< >", tone: "gold" },
  telling_time: { glyph: "◷", tone: "blue" },
  slope_intercept: { glyph: "y=", tone: "violet" },
  comet_typing: { glyph: "⌨", tone: "coral" },
  locker_practice: { glyph: "#", tone: "gold" },
  spiral_review: { glyph: "↻", tone: "green" },
  question_kind_review: { glyph: "?", tone: "violet" },
  double_board_review: { glyph: "▦", tone: "blue" },
  lowest_number_wins: { glyph: "↓", tone: "coral" },
  open_middle: { glyph: "□", tone: "gold" },
  tournaments: { glyph: "🏆", tone: "violet" },
};

function artFor(game, index) {
  return GAME_ART[game.slug] || {
    glyph: game.name.slice(0, 2).toUpperCase(),
    tone: ["violet", "blue", "green", "coral", "gold"][index % 5],
  };
}

function categoryLabel(category) {
  if (category === "group") return "Group play";
  if (category === "math_skills") return "Math skills";
  if (category === "survival_skills") return "Life skills";
  return "Arcade";
}

function formatScore(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number - Math.round(number)) < 0.05) return String(Math.round(number));
  return String(Math.round(number * 10) / 10);
}

function GameTile({ game, index }) {
  const art = artFor(game, index);
  const sessions = Number(game.stats?.sessionsPlayed || 0);
  const best = formatScore(game.stats?.bestScore);

  return (
    <article className="arcadeLibraryCard">
      <div className={`arcadeLibraryArt is-${art.tone}`} aria-hidden="true">
        <span>{art.glyph}</span>
        <i />
        <i />
        <i />
      </div>
      <div className="arcadeLibraryCardBody">
        <div className="arcadeLibraryCardMeta">
          <span>{categoryLabel(game.category)}</span>
          {game.isMultiplayer ? <span>Multiplayer</span> : null}
        </div>
        <h3>{game.name}</h3>
        <p>{game.description}</p>
        <div className="arcadeLibraryProgress" aria-label={`${game.name} progress`}>
          <span>{sessions ? `${sessions} played` : "Ready to start"}</span>
          {sessions ? <strong>Best {best}</strong> : <strong>New</strong>}
        </div>
        <Link className="arcadeLibraryPlay" href={game.href}>
          Play now <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

export default function ArcadeLibrary({ games, tournamentHref, emptyMessage }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const libraryGames = useMemo(
    () => [
      ...games,
      {
        slug: "tournaments",
        name: "Live Tournaments",
        description: "Build a Connect 4 bracket from students who are live in the room.",
        category: "group",
        isMultiplayer: true,
        href: tournamentHref,
        stats: null,
      },
    ],
    [games, tournamentHref]
  );

  const visibleGames = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return libraryGames.filter((game) => {
      const matchesFilter = filter === "all" || game.category === filter;
      const matchesQuery =
        !needle ||
        `${game.name} ${game.description} ${categoryLabel(game.category)}`
          .toLowerCase()
          .includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [filter, libraryGames, query]);

  const featured =
    games.find((game) => Number(game.stats?.sessionsPlayed || 0) > 0) ||
    games.find((game) => game.slug === "2048") ||
    games[0];
  const featuredArt = featured ? artFor(featured, 0) : null;

  return (
    <section className="arcadeLibrary" aria-labelledby="arcade-library-title">
      <div className="arcadeLibraryHero">
        <div className="arcadeLibraryHeroCopy">
          <p className="eyebrow">MathClaw Arcade</p>
          <h2 id="arcade-library-title">Pick a game. Build a streak.</h2>
          <p>Practice, compete, or run a whole-class challenge from one fast game library.</p>
        </div>
        <label className="arcadeLibrarySearch">
          <span aria-hidden="true">⌕</span>
          <span className="srOnly">Search games</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games and skills"
          />
        </label>
      </div>

      {featured ? (
        <Link className={`arcadeFeatured is-${featuredArt.tone}`} href={featured.href}>
          <div className="arcadeFeaturedArt" aria-hidden="true">
            <span>{featuredArt.glyph}</span>
          </div>
          <div className="arcadeFeaturedCopy">
            <span className="arcadeFeaturedKicker">
              {Number(featured.stats?.sessionsPlayed || 0) ? "Jump back in" : "Featured game"}
            </span>
            <h3>{featured.name}</h3>
            <p>{featured.description}</p>
            <strong>Play {featured.name} <span aria-hidden="true">→</span></strong>
          </div>
          <div className="arcadeFeaturedStat">
            <span>{Number(featured.stats?.sessionsPlayed || 0) ? "Personal best" : "Your next streak"}</span>
            <strong>
              {Number(featured.stats?.sessionsPlayed || 0)
                ? formatScore(featured.stats?.bestScore)
                : "Start"}
            </strong>
          </div>
        </Link>
      ) : null}

      <div className="arcadeLibraryToolbar">
        <div className="arcadeLibraryFilters" aria-label="Filter games">
          {FILTERS.map(([value, label]) => (
            <button
              className={filter === value ? "isActive" : ""}
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span>{visibleGames.length} {visibleGames.length === 1 ? "game" : "games"}</span>
      </div>

      {visibleGames.length ? (
        <div className="arcadeLibraryGrid">
          {visibleGames.map((game, index) => (
            <GameTile game={game} index={index} key={game.slug} />
          ))}
        </div>
      ) : (
        <div className="arcadeLibraryEmpty">
          <strong>No games found.</strong>
          <p>{emptyMessage || "Try another search or category."}</p>
          <button type="button" onClick={() => { setFilter("all"); setQuery(""); }}>
            Show all games
          </button>
        </div>
      )}
    </section>
  );
}
