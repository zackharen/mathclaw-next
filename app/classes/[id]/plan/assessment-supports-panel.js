"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assessmentOccurrenceKey,
  getAssessmentSupportCost,
  totalActiveDeduction,
} from "@/lib/assessment-supports/pricing";

function occurrenceLabel(occurrence) {
  const date = new Date(`${occurrence.assignment_date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${occurrence.label} ${occurrence.assessment_number} · ${date}`;
}

function formatRecordedTime(value) {
  if (!value) return "Unknown time";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AssessmentSupportsPanel({ courseId, initialData }) {
  const router = useRouter();
  const occurrences = useMemo(
    () => (initialData.occurrences || []).filter((item) => !item.is_skipped),
    [initialData.occurrences]
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultOccurrence =
    occurrences.find((item) => item.assignment_date >= todayIso) || occurrences.at(-1) || null;
  const [selectedKey, setSelectedKey] = useState(
    defaultOccurrence ? assessmentOccurrenceKey(defaultOccurrence.rule_id, defaultOccurrence.original_date) : ""
  );
  const [selectedStudentId, setSelectedStudentId] = useState(initialData.students?.[0]?.id || "");
  const [selectedSupportId, setSelectedSupportId] = useState(
    initialData.supports?.find((support) => support.enabled)?.id || ""
  );
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedOccurrence = occurrences.find(
    (item) => assessmentOccurrenceKey(item.rule_id, item.original_date) === selectedKey
  ) || defaultOccurrence;
  const activeSupports = (initialData.supports || []).filter((support) => support.enabled);
  const selectedUsages = selectedOccurrence
    ? (initialData.usages || []).filter(
        (usage) =>
          usage.rule_id === selectedOccurrence.rule_id &&
          usage.original_date === selectedOccurrence.original_date
      )
    : [];
  const teacherNameById = new Map(
    (initialData.teachers || []).map((teacher) => [teacher.id, teacher.display_name])
  );

  async function mutate(payload, successMessage) {
    setPending(true);
    setStatus("");
    setError("");
    try {
      const response = await fetch("/api/assessment-supports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courseId, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the change.");
      setStatus(successMessage);
      router.refresh();
    } catch (mutationError) {
      setError(mutationError.message || "Could not save the change.");
    } finally {
      setPending(false);
    }
  }

  function currentCost(support) {
    return selectedOccurrence
      ? getAssessmentSupportCost({
          settings: initialData.settings,
          supportId: support.id,
          occurrence: selectedOccurrence,
          activations: initialData.activations,
          overrides: initialData.overrides,
        })
      : 0;
  }

  return (
    <section className="card assessmentSupportsCard" id="assessment-supports">
      <details className="assessmentSupportsDetails">
        <summary className="assessmentSupportsSummary">
          <div>
            <h2>Assessment Supports</h2>
            <p>Manage optional point-deduction supports and the per-assessment roster ledger.</p>
          </div>
          <span className="assessmentSupportsToggle" aria-hidden="true">
            <span className="showLabel">Show</span>
            <span className="hideLabel">Hide</span>
          </span>
        </summary>

        <div className="assessmentSupportsBody">
          <aside className="assessmentSupportsAccommodationNotice">
            <strong>Required accommodations never cost points.</strong>
            <p>
              Mark an entry as a required IEP/504 or other mandated accommodation in the ledger. It will
              charge 0 points and will not raise that support&apos;s future class price.
            </p>
          </aside>

          <form
            className="assessmentSupportsSettings"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              mutate({
                action: "update_settings",
                startingCost: formData.get("starting_cost"),
                costIncrement: formData.get("cost_increment"),
                isPublished: formData.get("is_published") === "on",
              }, "Assessment support settings saved.");
            }}
          >
            <label>
              <span>Starting deduction</span>
              <input className="input" type="number" min="0" max="1000" name="starting_cost" defaultValue={initialData.settings?.starting_cost ?? 5} />
            </label>
            <label>
              <span>Increase after each class use</span>
              <input className="input" type="number" min="0" max="1000" name="cost_increment" defaultValue={initialData.settings?.cost_increment ?? 5} />
            </label>
            <label className="assessmentSupportsPublishToggle">
              <input type="checkbox" name="is_published" defaultChecked={initialData.settings?.is_published === true} />
              Publish current prices to enrolled students
            </label>
            <button className="btn primary" type="submit" disabled={pending}>Save Pricing</button>
          </form>
          <p className="statusNote">
            Each support escalates independently for the whole class within a marking period. The first
            optional use starts at {initialData.settings?.starting_cost ?? 5} points; the next assessment where
            that same support is used adds {initialData.settings?.cost_increment ?? 5}. Prices reset in the next marking period.
          </p>

          <div className="assessmentSupportsCatalogHeader">
            <div>
              <h3>Support Catalog</h3>
              <p>Rename, describe, enable, disable, or reorder the choices for this class.</p>
            </div>
          </div>
          <div className="assessmentSupportsCatalog">
            {(initialData.supports || []).map((support, index) => (
              <form
                key={`${support.id}-${support.updated_at}`}
                className="assessmentSupportEditor"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  mutate({
                    action: "update_support",
                    supportId: support.id,
                    name: formData.get("name"),
                    description: formData.get("description"),
                    enabled: formData.get("enabled") === "on",
                  }, `${support.name} saved.`);
                }}
              >
                <div className="assessmentSupportOrderButtons" aria-label={`Reorder ${support.name}`}>
                  <button className="btn" type="button" disabled={pending || index === 0} onClick={() => mutate({ action: "move_support", supportId: support.id, direction: "up" }, `${support.name} moved up.`)} aria-label={`Move ${support.name} up`}>↑</button>
                  <button className="btn" type="button" disabled={pending || index === initialData.supports.length - 1} onClick={() => mutate({ action: "move_support", supportId: support.id, direction: "down" }, `${support.name} moved down.`)} aria-label={`Move ${support.name} down`}>↓</button>
                </div>
                <label className="assessmentSupportEnabled">
                  <input type="checkbox" name="enabled" defaultChecked={support.enabled} />
                  Enabled
                </label>
                <label>
                  <span>Name</span>
                  <input className="input" name="name" maxLength={80} defaultValue={support.name} />
                </label>
                <label className="assessmentSupportDescription">
                  <span>Description</span>
                  <input className="input" name="description" maxLength={400} defaultValue={support.description} />
                </label>
                <button className="btn" type="submit" disabled={pending}>Save</button>
              </form>
            ))}
          </div>

          <div className="assessmentSupportsLedgerHeader">
            <div>
              <h3>Assessment Roster Ledger</h3>
              <p>Select any assessment to set one-time prices, record use, or review its permanent history.</p>
            </div>
            {occurrences.length > 0 ? (
              <select className="input" value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} aria-label="Assessment occurrence">
                {occurrences.map((occurrence) => (
                  <option key={assessmentOccurrenceKey(occurrence.rule_id, occurrence.original_date)} value={assessmentOccurrenceKey(occurrence.rule_id, occurrence.original_date)}>
                    {occurrenceLabel(occurrence)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {!selectedOccurrence ? (
            <p>No scheduled assessment occurrences are available for this class yet.</p>
          ) : (
            <>
              <div className="assessmentSupportsPrices">
                {activeSupports.map((support) => {
                  const override = (initialData.overrides || []).find(
                    (row) => row.support_id === support.id && row.rule_id === selectedOccurrence.rule_id && row.original_date === selectedOccurrence.original_date
                  );
                  const activation = (initialData.activations || []).find(
                    (row) => row.support_id === support.id && row.rule_id === selectedOccurrence.rule_id && row.original_date === selectedOccurrence.original_date
                  );
                  return (
                    <form
                      key={`${support.id}-${selectedKey}`}
                      className="assessmentSupportPriceRow"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        mutate({
                          action: "set_override",
                          supportId: support.id,
                          ruleId: selectedOccurrence.rule_id,
                          originalDate: selectedOccurrence.original_date,
                          cost: formData.get("cost"),
                        }, `${support.name} price updated for this assessment.`);
                      }}
                    >
                      <div>
                        <strong>{support.name}</strong>
                        <span>{currentCost(support)}-point deduction</span>
                      </div>
                      <label>
                        <span className="srOnly">Override {support.name} cost</span>
                        <input className="input" type="number" min="0" max="1000" name="cost" defaultValue={override?.cost ?? ""} placeholder="Override" disabled={Boolean(activation)} />
                      </label>
                      <button className="btn" type="submit" disabled={pending || Boolean(activation)}>
                        {activation ? "Snapshotted" : override ? "Save/Clear" : "Set Override"}
                      </button>
                    </form>
                  );
                })}
              </div>

              <details className="assessmentSupportsRosterDetails">
                <summary className="btn primary">Open Roster Ledger</summary>
                <div className="assessmentSupportsRosterBody">
                  {initialData.students.length === 0 ? (
                    <p>No enrolled students are available for this class.</p>
                  ) : activeSupports.length === 0 ? (
                    <p>Enable at least one support before recording usage.</p>
                  ) : (
                    <form
                      className="assessmentSupportsRecordForm"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        mutate({
                          action: "record_usage",
                          studentId: formData.get("student_id"),
                          supportId: formData.get("support_id"),
                          ruleId: selectedOccurrence.rule_id,
                          originalDate: selectedOccurrence.original_date,
                          requiredAccommodation: formData.get("required_accommodation") === "on",
                        }, "Support use recorded.");
                      }}
                    >
                      <label>
                        <span>Student</span>
                        <select className="input" name="student_id" value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}>
                          {initialData.students.map((student) => <option key={student.id} value={student.id}>{student.display_name}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Support used</span>
                        <select className="input" name="support_id" value={selectedSupportId} onChange={(event) => setSelectedSupportId(event.target.value)}>
                          {activeSupports.map((support) => <option key={support.id} value={support.id}>{support.name} · {currentCost(support)} points</option>)}
                        </select>
                      </label>
                      <label className="assessmentSupportsRequiredToggle">
                        <input type="checkbox" name="required_accommodation" />
                        Required IEP/504 or other mandated accommodation — 0 points
                      </label>
                      <button className="btn primary" type="submit" disabled={pending}>Record Support</button>
                    </form>
                  )}

                  <div className="assessmentSupportsRosterList">
                    {initialData.students.map((student) => {
                      const studentUsages = selectedUsages.filter((usage) => usage.student_id === student.id);
                      const activeStudentUsages = studentUsages.filter((usage) => !usage.voided_at);
                      return (
                        <article className="assessmentSupportsStudentLedger" key={student.id}>
                          <header>
                            <strong>{student.display_name}</strong>
                            <span>Total deduction: {totalActiveDeduction(studentUsages)} points</span>
                          </header>
                          {studentUsages.length === 0 ? <p>No supports recorded.</p> : (
                            <div className="list">
                              {studentUsages.map((usage) => (
                                <div className={`assessmentSupportUsage ${usage.voided_at ? "isVoided" : ""}`} key={usage.id}>
                                  <div>
                                    <strong>{usage.support_name}</strong>
                                    <p>
                                      {usage.usage_type === "required_accommodation" ? "Required accommodation · 0 points" : `${usage.charged_cost}-point deduction`}
                                      {usage.voided_at ? " · Voided" : ""}
                                    </p>
                                    <p className="statusNote">
                                      Recorded {formatRecordedTime(usage.recorded_at)} by {teacherNameById.get(usage.recorded_by) || "teacher"}
                                      {usage.void_reason ? ` · ${usage.void_reason}` : ""}
                                    </p>
                                  </div>
                                  {!usage.voided_at ? (
                                    <button
                                      className="btn danger"
                                      type="button"
                                      disabled={pending}
                                      onClick={() => {
                                        if (!window.confirm(`Void ${usage.support_name} for ${student.display_name}? The audit record will remain.`)) return;
                                        const reason = window.prompt("Optional reason for voiding this entry:", "") || "";
                                        mutate({ action: "void_usage", usageId: usage.id, reason }, "Support entry voided. Record the corrected entry if needed.");
                                      }}
                                    >
                                      Void
                                    </button>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          )}
                          {activeStudentUsages.length === 0 && studentUsages.some((usage) => usage.voided_at) ? (
                            <p className="statusNote">All entries for this student are voided.</p>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>
              </details>
            </>
          )}

          {status ? <p className="statusNote" role="status">{status}</p> : null}
          {error ? <p className="errorNotice" role="alert">{error}</p> : null}
        </div>
      </details>
    </section>
  );
}
