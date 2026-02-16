# MathClaw MVP Flow (URL -> Daily Use)

## Locked decisions
- Auth: Supabase (`email/password` + `Google`)
- DB: Supabase Postgres
- First curriculum source: Math Medic
- Supports multiple classes, created one at a time
- Schedule models: `every_day` and `ab`
- Standards: normalized globally
- Default school year: `09/01` to `06/30`
- Timezone default: `America/New_York`
- Announcement mode for v1: minimal
- Pacing mode for v1: one lesson per day

## User journey (MVP)
1. Visit `www.mathclaw.com`
2. Create account
3. Optional: search teachers and send connection request
4. Create class
5. Select curriculum provider (`Math Medic`) and course (`A1/GEO/A2/APPC/APC/APS`)
6. Build/import school calendar
7. Generate pacing plan (one lesson/day on instructional days)
8. Generate daily announcement
9. Copy announcement text with one click
10. Adjust day by adding `off` or `buffer` day and auto-reflow future plan
11. Open dashboard for pacing status

## MVP screens
- `/auth/sign-in`
- `/auth/sign-up`
- `/onboarding/profile`
- `/teachers` (search + connect)
- `/classes`
- `/classes/new`
- `/classes/:id/calendar`
- `/classes/:id/plan`
- `/classes/:id/announcements`
- `/dashboard`

## MVP operations
- `create_course(owner_id, class_name, schedule_model, school_year_start, school_year_end, selected_library_id)`
- `generate_calendar(course_id, model, holidays/off days)`
- `generate_plan(course_id)`
- `insert_day_off(course_id, date, reason)` -> reflow future `course_lesson_plan`
- `insert_buffer_day(course_id, date)` -> reflow future `course_lesson_plan`
- `generate_announcement(course_id, date, template_id)`

## Minimal announcement template
- Date
- Lesson title
- Lesson objective
- Standards

## Out of scope for this MVP slice
- AI-generated do-now/problem text
- Complex schedule models beyond every-day and AB
- Paid subscriptions
- Full colleague resource sharing permissions model
