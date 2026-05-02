# Future Ideas Bank

Use this file as MathClaw's lightweight idea and future-work bank.

Load this file only when the user asks about future ideas, backlog, roadmap candidates, todo items, or asks to reference the ideas bank. Keep entries concise and move anything actively scheduled into `session_handoff.md`.

## Game And Classroom Ideas

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
