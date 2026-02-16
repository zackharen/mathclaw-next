#!/usr/bin/env python3
"""Build seed SQL for curriculum library from CSV exports.

Inputs are the two CSV files you provided in Downloads.
Output: data/seed/curriculum_seed.sql
"""

from __future__ import annotations

import csv
import hashlib
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
OUT_SQL = ROOT / "data/seed/curriculum_seed.sql"

IM_CSV = Path("/Users/zackarenstein/Downloads/Curriculum Sheets - Illustrative Mathematics.csv")
MM_CSV = Path("/Users/zackarenstein/Downloads/Curriculum Sheets - Math Medic.csv")

UUID_NAMESPACE = uuid.UUID("9ebfc7a0-37e2-4f72-a121-beb6f4ca9de1")

CLASS_MAP = {
    "A1": "Algebra I",
    "GEO": "Geometry",
    "A2": "Algebra II",
    "APPC": "AP Precalculus",
    "APC": "AP Calculus",
    "APS": "AP Statistics",
}

PROVIDERS = [
    {
        "code": "illustrative_math",
        "name": "Illustrative Mathematics",
        "path": IM_CSV,
        "blocks": ["A1", "GEO", "A2"],
    },
    {
        "code": "math_medic",
        "name": "Math Medic",
        "path": MM_CSV,
        "blocks": ["A1", "GEO", "A2", "APPC", "APC", "APS"],
    },
]


@dataclass(frozen=True)
class LessonRow:
    provider_code: str
    class_code: str
    class_name: str
    sequence_index: int
    source_lesson_code: str | None
    title: str
    objective: str
    standards: Tuple[str, ...]


def stable_uuid(*parts: str) -> str:
    key = "|".join(parts)
    return str(uuid.uuid5(UUID_NAMESPACE, key))


def norm_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def normalize_standard(value: str) -> List[str]:
    raw = norm_text(value)
    if not raw or raw == "-":
        return []

    pieces = re.split(r"[,;]\s*", raw)
    out: List[str] = []
    seen = set()

    for item in pieces:
        s = norm_text(item).upper().replace(" ", "")
        if not s or s == "-":
            continue
        # Keep only values that look like a standard/topic code.
        if not re.match(r"^[A-Z][A-Z0-9-]*(\.[A-Z0-9]+)*(\(\+\))?$", s):
            continue
        if s not in seen:
            out.append(s)
            seen.add(s)

    return out


def extract_source_lesson_code(title: str) -> str | None:
    t = norm_text(title)
    if not t:
        return None

    m = re.match(r"^([0-9]+\.[0-9]+)", t)
    if m:
        return m.group(1)

    m2 = re.match(r"^(Review\s+[0-9]+\.[0-9]+(?:-[0-9]+\.[0-9]+)?)", t, flags=re.IGNORECASE)
    if m2:
        return m2.group(1)

    return None


def read_csv_lessons(provider: Dict[str, object]) -> List[LessonRow]:
    path = Path(provider["path"])
    blocks: List[str] = provider["blocks"]  # type: ignore[assignment]
    provider_code: str = provider["code"]  # type: ignore[assignment]

    if not path.exists():
        raise FileNotFoundError(f"Missing CSV: {path}")

    lessons: List[LessonRow] = []
    seq_by_class: Dict[str, int] = {b: 0 for b in blocks}

    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            for class_code in blocks:
                lesson_col = f"{class_code} Lesson"
                objective_col = f"{class_code} Objective"
                standards_col = f"{class_code} Standards"

                title = norm_text(row.get(lesson_col, ""))
                if not title:
                    continue

                seq_by_class[class_code] += 1
                objective = norm_text(row.get(objective_col, ""))
                standards = tuple(normalize_standard(row.get(standards_col, "")))
                source_code = extract_source_lesson_code(title)

                lessons.append(
                    LessonRow(
                        provider_code=provider_code,
                        class_code=class_code,
                        class_name=CLASS_MAP[class_code],
                        sequence_index=seq_by_class[class_code],
                        source_lesson_code=source_code,
                        title=title,
                        objective=objective,
                        standards=standards,
                    )
                )

    return lessons


def sql_literal(value: str | None) -> str:
    if value is None:
        return "null"
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def build_sql(lessons: Iterable[LessonRow]) -> str:
    lessons = list(lessons)

    provider_ids = {
        p["code"]: stable_uuid("provider", p["code"]) for p in PROVIDERS
    }

    library_ids: Dict[Tuple[str, str], str] = {}
    for l in lessons:
        key = (l.provider_code, l.class_code)
        if key not in library_ids:
            library_ids[key] = stable_uuid("library", l.provider_code, l.class_code)

    standard_codes = sorted({s for l in lessons for s in l.standards})
    standard_ids = {code: stable_uuid("standard", code) for code in standard_codes}

    out: List[str] = []
    out.append("-- generated by scripts/build_curriculum_seed.py")
    out.append("begin;")
    out.append("")

    for p in PROVIDERS:
        code = p["code"]
        pid = provider_ids[code]
        out.append(
            "insert into public.curriculum_providers (id, code, name) values "
            f"({sql_literal(pid)}, {sql_literal(code)}, {sql_literal(p['name'])}) "
            "on conflict (code) do update set name = excluded.name;"
        )

    out.append("")

    for (provider_code, class_code), lid in sorted(library_ids.items()):
        pid = provider_ids[provider_code]
        class_name = CLASS_MAP[class_code]
        out.append(
            "insert into public.curriculum_libraries (id, provider_id, class_code, class_name) values "
            f"({sql_literal(lid)}, {sql_literal(pid)}, {sql_literal(class_code)}, {sql_literal(class_name)}) "
            "on conflict (provider_id, class_code) do update set class_name = excluded.class_name;"
        )

    out.append("")

    for code in standard_codes:
        sid = standard_ids[code]
        out.append(
            "insert into public.standards (id, code) values "
            f"({sql_literal(sid)}, {sql_literal(code)}) "
            "on conflict (code) do nothing;"
        )

    out.append("")

    for l in lessons:
        lid = library_ids[(l.provider_code, l.class_code)]
        lesson_id = stable_uuid(
            "lesson",
            l.provider_code,
            l.class_code,
            str(l.sequence_index),
            hashlib.sha1(l.title.encode("utf-8")).hexdigest()[:12],
        )
        out.append(
            "insert into public.curriculum_lessons "
            "(id, library_id, sequence_index, source_lesson_code, title, objective) values "
            f"({sql_literal(lesson_id)}, {sql_literal(lid)}, {l.sequence_index}, "
            f"{sql_literal(l.source_lesson_code)}, {sql_literal(l.title)}, {sql_literal(l.objective)}) "
            "on conflict (library_id, sequence_index) do update set "
            "source_lesson_code = excluded.source_lesson_code, "
            "title = excluded.title, objective = excluded.objective;"
        )

        for std in l.standards:
            sid = standard_ids[std]
            out.append(
                "insert into public.curriculum_lesson_standards (lesson_id, standard_id) values "
                f"({sql_literal(lesson_id)}, {sql_literal(sid)}) "
                "on conflict do nothing;"
            )

    out.append("")
    out.append("commit;")
    out.append("")

    return "\n".join(out)


def main() -> None:
    lessons: List[LessonRow] = []
    for provider in PROVIDERS:
        lessons.extend(read_csv_lessons(provider))

    sql = build_sql(lessons)
    OUT_SQL.parent.mkdir(parents=True, exist_ok=True)
    OUT_SQL.write_text(sql, encoding="utf-8")

    total_standards = len({s for l in lessons for s in l.standards})
    print(f"Wrote {OUT_SQL}")
    print(f"Lessons: {len(lessons)}")
    print(f"Standards: {total_standards}")


if __name__ == "__main__":
    main()
