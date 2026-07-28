import SubmitButton from "@/app/components/SubmitButton";
import { addCoTeacherAction, removeCoTeacherAction } from "@/app/classes/actions";

// Placeholder rendered while the co-teacher fetch streams in. It keeps the same
// details/summary shell as the real panel so the collapsed card does not shift.
export function CoTeacherPanelFallback({ courseTitle }) {
  return (
    <details className="gameControlsDetails classNestedDetails">
      <summary className="gameControlsSummary" aria-label={`${courseTitle} co-teachers`}>
        <div>
          <h2>Co-Teachers</h2>
          <p className="coTeacherPanelLoading" aria-live="polite">
            Loading co-teachers…
          </p>
        </div>
        <span className="gameControlsToggle" aria-hidden="true">
          <span className="showLabel">Show</span>
          <span className="hideLabel">Hide</span>
        </span>
      </summary>
      <div className="gameControlsBody classNestedBody">
        <div className="skeletonLine" style={{ width: "70%" }} aria-hidden="true" />
      </div>
    </details>
  );
}

export default async function CoTeacherPanel({ statePromise, courseId, courseTitle, returnTo }) {
  const state = await statePromise;
  const currentCoTeachers = state.byCourseId.get(courseId) || [];
  const availableCoTeachers = state.candidateOptionsByCourseId.get(courseId) || [];

  return (
    <details className="gameControlsDetails classNestedDetails">
      <summary className="gameControlsSummary" aria-label={`${courseTitle} co-teachers`}>
        <div>
          <h2>Co-Teachers</h2>
          <p>
            {state.unavailable
              ? "Co-teacher tools are unavailable right now"
              : `${currentCoTeachers.length} co-teacher${currentCoTeachers.length === 1 ? "" : "s"} connected`}
          </p>
        </div>
        <span className="gameControlsToggle" aria-hidden="true">
          <span className="showLabel">Show</span>
          <span className="hideLabel">Hide</span>
        </span>
      </summary>
      <div className="gameControlsBody classNestedBody">
        {state.unavailable ? (
          <p className="classCoTeacherEmpty" role="status">
            Could not load co-teacher information right now. Reload the page to try again.
          </p>
        ) : (
          <>
            {currentCoTeachers.length > 0 ? (
              <div className="classCoTeacherList">
                {currentCoTeachers.map((teacher) => (
                  <div key={teacher.profileId} className="classCoTeacherItem">
                    <div>
                      <strong>{teacher.displayName}</strong>
                      <span>{teacher.email}</span>
                    </div>
                    <form action={removeCoTeacherAction}>
                      <input type="hidden" name="course_id" value={courseId} />
                      <input type="hidden" name="profile_id" value={teacher.profileId} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <SubmitButton className="btn ghost" pendingLabel="Removing…">
                        Remove Co-Teacher
                      </SubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            ) : (
              <p className="classCoTeacherEmpty">No co-teachers yet.</p>
            )}
            <form action={addCoTeacherAction} className="classCoTeacherForm">
              <input type="hidden" name="course_id" value={courseId} />
              <input type="hidden" name="return_to" value={returnTo} />
              <select
                className="input"
                name="profile_id"
                defaultValue=""
                disabled={availableCoTeachers.length === 0}
              >
                <option value="" disabled>
                  {availableCoTeachers.length > 0 ? "Add a co-teacher" : "No more teachers available"}
                </option>
                {availableCoTeachers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName}
                    {candidate.email ? ` · ${candidate.email}` : ""}
                  </option>
                ))}
              </select>
              <SubmitButton
                className="btn ghost"
                pendingLabel="Adding…"
                disabled={availableCoTeachers.length === 0}
              >
                Add Co-Teacher
              </SubmitButton>
            </form>
          </>
        )}
      </div>
    </details>
  );
}
