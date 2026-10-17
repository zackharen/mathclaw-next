"use client";

import { saveGridPlanAction } from "./actions";
import { GridSaveStatus, useGridSaveFeedback } from "./grid-save-feedback";

export default function GridCompletionButton({ courseId, classDate, complete, returnTo }) {
  const feedback = useGridSaveFeedback();
  return (
    <form className="allClassesGridSlotComplete" action={(data) => feedback.run(() => saveGridPlanAction(data))}>
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="class_date" value={classDate} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="grid_action" value={complete ? "planned" : "complete"} />
      <button className={`btn allClassesGridComplete${complete ? " isComplete" : ""}`}
        type="submit" disabled={feedback.saving} aria-busy={feedback.saving}>
        {feedback.saving ? <><span className="buttonSpinner" aria-hidden="true" />Saving…</>
          : complete ? "✓ Completed" : "Mark Complete"}
      </button>
      <GridSaveStatus {...feedback} pendingInControl />
    </form>
  );
}
