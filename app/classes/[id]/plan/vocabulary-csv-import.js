"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LESSON_VOCABULARY_CSV_MAX_BYTES,
  parseLessonVocabularyCsv,
} from "@/lib/lesson-resources/constants";
import { postLessonResource } from "@/lib/lesson-resources/client";

export default function VocabularyCsvImport({ courses }) {
  const router = useRouter();
  const inputRef = useRef(null);
  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    setFileName(file?.name || "");
    setRows([]);
    setErrors([]);
    setStatus("");
    if (!file) return;
    if (file.size > LESSON_VOCABULARY_CSV_MAX_BYTES) {
      setErrors(["CSV files must be 1 MB or smaller."]);
      return;
    }
    try {
      const parsed = parseLessonVocabularyCsv(await file.text());
      setRows(parsed.rows);
      setErrors(parsed.errors);
      if (parsed.errors.length === 0) {
        setStatus(`${parsed.rows.length} vocabulary row${parsed.rows.length === 1 ? "" : "s"} ready to import.`);
      }
    } catch {
      setErrors(["MathClaw could not read that CSV file."]);
    }
  }

  async function importRows(event) {
    event.preventDefault();
    if (!courseId || rows.length === 0 || errors.length > 0) return;
    setSaving(true);
    setStatus(`Importing ${rows.length} vocabulary row${rows.length === 1 ? "" : "s"}…`);
    try {
      const data = await postLessonResource({
        action: "import-vocabulary-csv",
        courseId,
        rows,
      });
      setRows([]);
      setErrors([]);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      setStatus(`${data.imported} vocabulary word${data.imported === 1 ? "" : "s"} imported.`);
      router.refresh();
    } catch (error) {
      setErrors(error.details?.length ? error.details : [error.message]);
      setStatus("");
    } finally {
      setSaving(false);
    }
  }

  if (!courses.length) return null;

  return (
    <details className="vocabularyCsvImport">
      <summary className="btn">Upload Vocabulary CSV</summary>
      <form onSubmit={importRows}>
        <p>
          Upload three columns in this order: <strong>word</strong>, <strong>definition</strong>, and
          <strong> lesson number</strong>. A header row is optional. Definitions containing commas must be in quotes.
        </p>
        {courses.length > 1 ? (
          <label>
            <span>Class</span>
            <select className="input" value={courseId} onChange={(event) => setCourseId(event.target.value)} disabled={saving}>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          <span>CSV file</span>
          <input className="input" type="file" accept=".csv,text/csv" ref={inputRef} onChange={chooseFile} disabled={saving} />
        </label>

        {rows.length > 0 && errors.length === 0 ? (
          <div className="vocabularyCsvPreview">
            <strong>{fileName} preview</strong>
            <div>
              <table>
                <thead><tr><th>Word</th><th>Definition</th><th>Lesson</th></tr></thead>
                <tbody>
                  {rows.slice(0, 8).map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.word}</td><td>{row.definition || "—"}</td><td>{row.lessonNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 8 ? <small>Plus {rows.length - 8} more row{rows.length - 8 === 1 ? "" : "s"}.</small> : null}
          </div>
        ) : null}

        {errors.length > 0 ? (
          <div className="errorText" role="alert">
            <strong>CSV needs attention</strong>
            <ul>{errors.slice(0, 12).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>
            {errors.length > 12 ? <small>Plus {errors.length - 12} more issue{errors.length - 12 === 1 ? "" : "s"}.</small> : null}
          </div>
        ) : null}

        <div className="ctaRow">
          <button className="btn primary" type="submit" disabled={saving || rows.length === 0 || errors.length > 0}>
            {saving ? "Importing…" : rows.length > 0
              ? `Import ${rows.length} Vocabulary Word${rows.length === 1 ? "" : "s"}`
              : "Import Vocabulary Words"}
          </button>
          {status ? <span className="statusNote" aria-live="polite">{status}</span> : null}
        </div>
      </form>
    </details>
  );
}
