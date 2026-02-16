# Curriculum Import Runbook

## Source files
- `/Users/zackarenstein/Downloads/Curriculum Sheets - Illustrative Mathematics.csv`
- `/Users/zackarenstein/Downloads/Curriculum Sheets - Math Medic.csv`

## Generated artifacts
- Schema: `/Users/zackarenstein/Documents/New project/supabase/schema.sql`
- Seed SQL: `/Users/zackarenstein/Documents/New project/data/seed/curriculum_seed.sql`
- Generator script: `/Users/zackarenstein/Documents/New project/scripts/build_curriculum_seed.py`

## What gets normalized
- Class blocks from each CSV become curriculum libraries by provider + class code.
- Lessons are ordered by `sequence_index` per provider/class.
- Standards are normalized into `public.standards` and linked through `public.curriculum_lesson_standards`.

## Class code mapping
- `A1` -> `Algebra I`
- `GEO` -> `Geometry`
- `A2` -> `Algebra II`
- `APPC` -> `AP Precalculus`
- `APC` -> `AP Calculus`
- `APS` -> `AP Statistics`

## Rebuild seed after CSV updates
```bash
cd "/Users/zackarenstein/Documents/New project"
python3 scripts/build_curriculum_seed.py
```

## Apply to Supabase
1. Run `/Users/zackarenstein/Documents/New project/supabase/schema.sql` in the Supabase SQL editor.
2. Run `/Users/zackarenstein/Documents/New project/data/seed/curriculum_seed.sql`.

## Current dataset stats
- Lessons: `910`
- Unique standards: `334`
