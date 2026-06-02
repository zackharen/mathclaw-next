# Future Ideas Bank

Use this file as MathClaw's lightweight idea and future-work bank.

Load this file only when the user asks about future ideas, backlog, roadmap candidates, todo items, or asks to reference the ideas bank. Keep entries concise and move anything actively scheduled into `session_handoff.md`.

## Game And Classroom Ideas

### Projector Classroom Display System
- Product direction: grow Projector from a send-to-screen tool into a classroom display operating system for projectors, TVs, iPads, desktops, laptops, and side-room displays controlled from one teacher dashboard.
- Current foundation: Projector Party is live with four screens, PIN/token screen connection, text/LaTeX/image/video sending, projector-friendly screen-recording conversion, fullscreen receiver controls, full-viewport media display, Projector Library v1 for saving single reusable content items, and Scene Library / Room Setups for saving full four-screen arrangements.
- Built: **Scene Library / Room Setups** saves the full current arrangement of all screens as one reusable scene and restores it later. Example scenes: `Start of Class`, `Group Work`, `Exit Ticket`, `Escape Room Clue 1`.
- Built: **Room Setup folders** let teachers organize saved room setups by class or situation. Folder filters show as a two-column alphabetical list.
- Built: **Dashboard sidebar cleanup** has collapsible **Screen Selection**, **Room Setups**, and **Saved Items** sections. Screen Selection sits at the top, opens by default, and contains both screen targeting and content type selection.
- Built: **Saved thumbnail behavior** keeps videos/GIFs from autoplaying in tiny saved-item and room-setup thumbnails while allowing videos to play in the four live dashboard screen previews and actual projector screens.
- Priority 1, **Saved Item Library polish**: add edit/rename, search/filter, categories or activity types (`Questions`, `Activities`, `Word Walls`, `Data Walls`, `News`, `Announcements`), and clearer language so saved single items and full room setups feel distinct.
- Priority 2, **Playlists / Timed Rotations**: group saved items or scenes into timed rotations per screen or across all screens. Teachers should choose interval timing and target screens.
- Priority 3, **Screen Profiles**: let teachers rename/configure screens as real room devices such as `Main Projector`, `Side Room TV`, `iPad Table 1`, or `Teacher Laptop`, with optional display type (`projector`, `tablet`, `desktop`, `camera device`).
- Priority 4, **Schedule-Based Display Rules**: attach scenes/playlists/content to periods or time blocks so displays automatically show information relevant to the current class.
- Priority 5, **Camera Upload Queue**: camera-capable devices can upload student work to a teacher-approved queue, then the teacher sends selected work to the main projector or a specific screen.
- Priority 6, **Assessment Mode**: focused display mode for prompts, timers, response status, and anonymized class results; eventually connect to MathClaw game/session data.
- Priority 7, **Room Layout / Screen Map**: arrange screens visually to match the room, enabling animated activities that move around the space and clearer side-room orchestration.
- Priority 8, **Launch Games To Screens**: send games or game states to selected displays, such as leaderboard on main projector, puzzle clue on side-room display, and group challenges on tablets.
- Priority 9, **Desmos-Style Graph Display**: start with simple function input and graph/table projection before attempting full Desmos-level behavior.
- Priority 10, **AI Problem / Explanation Generator**: teacher prompts AI for a specific group need, reviews the generated example/problem/explanation, then sends it to a target screen. Keep teacher approval in the loop.
- Priority 11, **Escape Room Builder**: special mode for timed reveals, side-room clues, group-specific screens, and room-map-driven puzzle flow. Build after scenes, screen profiles, and timed rotations exist.
- Priority 12, **Chromecast / Hardware Casting**: useful setup convenience, but lower software priority because `/projector/screen` already works on browser-based displays.

### Tournaments
- Host tournaments across MathClaw games with automatic bracket generation and round progression.
- **Connect 4** is the obvious starting point — traditional 1v1 bracket, players join via code, teacher advances rounds, projector-friendly bracket view.
- For games that aren't natively 1v1 (e.g. Integer Practice, Locker), design a 1v1 or small-group (3-4 player) format that produces a clear winner per match so bracket logic still works.
- Key features to design: teacher-created tournament codes, bracket generation, round advancement controls, winner recording, rematch support, and a projector view of the live bracket.
- Keep the first version narrow: one game type, class-scoped participation, teacher-controlled round progression, simple winner recording.

### Complete Locker Practice
- Finish hands-on playtesting and tuning for Locker Practice.
- Focus on the realism of Level 6, mobile/touch controls, keyboard/mouse ergonomics, and classroom readiness.

### Mastery Settings Dashboard
- Continue refining the owner/admin mastery controls.
- Use real Integer Practice play data to tune defaults, clarify settings labels, and make the simulator useful for fast decisions.

### Open Middle
- Add an Open Middle-style activity format.
- Preserve the core feel: constrained digits or values, multiple solution paths, mathematical reasoning, and classroom discussion.

### Showdown Framework Rework
- Rework the Showdown framework so future head-to-head or reveal-based games can share cleaner infrastructure.
- Look for common needs across setup, joining, round state, reveal timing, scoring, rematches, and projector views before extracting shared code.

### Admin View Switch
- From the admin account, allow switching to view the site as a different account type (student, teacher, owner, etc.).
- UI: clicking the account chip in the top-left reveals a dropdown to select the impersonated role.
- The switch should be clearly indicated so it's always obvious when viewing as a non-admin role.
- Scoped to visual/UX preview — does not need to create real sessions or modify data as the impersonated user unless explicitly designed that way.

### Desmos Curriculum
- A structured curriculum of Desmos skills students need for standardized tests, drawn from an existing Canva doc with skill breakdowns.
- Build the skill list into the site as browsable/trackable content, then attach interactive activities for each skill so students can practice and demonstrate mastery.
- Eventually integrate with the existing mastery/progress tracking infrastructure.
- Starting point: import the Canva skill list into the brain or a reference file before scoping the build.

### Data & Probability Storytelling Blog
- A blog-style section of the site where math and probability are used to tell real stories.
- First story idea: volleyball team risk aversion — players avoid hitting hard to avoid errors, but a Bayesian probability argument shows that error rate vs. point-winning rate may favor aggressive play. Frame around how each error changes the probability of winning the game, and how to calculate the threshold where aggression becomes the better strategy.
- Goal: make mathematical reasoning feel relevant and narrative-driven, not just computational.
- Could double as a teacher resource or conversation-starter for probability units.

## Maintenance Notes
- Keep speculative ideas here, not in `session_handoff.md`.
- Add enough context that a future AI session can understand the idea without loading broad history.
- Mark promoted ideas as moved once they become active work.
