"use client";

import CopyButton from "../announcements/copy-button";
import { useGridCellToggle } from "./grid-cell-toggle";

// Announcements are stored one per class per day (course_announcements is unique
// on course_id + class_date), so a cell has at most one. On a multi-lesson day
// that one announcement is a combined block covering every lesson in the cell.
// Stored text is not rewritten when pacing moves lessons, so flag any cell lesson
// the text never names: it was likely generated for an older plan.
export default function GridCellAnnouncements({ lessons, announcement }) {
  const { buttonProps, panelProps } = useGridCellToggle();
  const count = announcement ? 1 : 0;
  const missing = announcement ? lessons.filter((lesson) => !announcement.includes(lesson.label)) : [];

  return (
    <>
      <button className="btn allClassesGridToggle allClassesGridSlotAnnouncements" {...buttonProps}>
        Announcements ({count})
      </button>
      <div className="allClassesGridFilesPanel allClassesGridAnnouncements allClassesGridPanel" {...panelProps}>
        <strong className="allClassesGridPanelTitle">Announcements</strong>
        {announcement ? (
          <>
            {lessons.length > 1 ? (
              <div className="allClassesGridAnnouncementLessons">
                <span>One announcement covers all {lessons.length} lessons:</span>
                <ul>
                  {lessons.map((lesson) => (
                    <li key={lesson.id}>{lesson.label}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <span className="allClassesGridAnnouncementLessons">For {lessons[0]?.label}</span>
            )}
            {missing.length > 0 ? (
              <p className="allClassesGridAnnouncementStale">
                Doesn&apos;t mention {missing.map((lesson) => lesson.label).join(" or ")}, so it may be out of
                date. Use Refresh Announcements on this class&apos;s Daily Plan.
              </p>
            ) : null}
            <pre className="announcementText">{announcement}</pre>
            <CopyButton text={announcement} />
          </>
        ) : (
          <p className="allClassesGridMuted">
            No announcement generated for this day yet. Use Generate Announcements on this class&apos;s Daily
            Plan.
          </p>
        )}
      </div>
    </>
  );
}
