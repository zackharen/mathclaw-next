"use client";

import { useEffect } from "react";

function getCourseIdFromCard(card) {
  const link = card.querySelector('a[href^="/classes/"][href$="/plan"]');
  const match = link?.getAttribute("href")?.match(/^\/classes\/([^/]+)\/plan$/);
  return match?.[1] || "";
}

function appendText(parent, tag, text, className = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
  return element;
}

function createAssignmentsSection(rules) {
  const details = document.createElement("details");
  details.className = "gameControlsDetails classNestedDetails dashboardAssignmentInjected";

  const summary = document.createElement("summary");
  summary.className = "gameControlsSummary";
  const copy = document.createElement("div");
  appendText(copy, "h2", "Announcement Assignments");
  appendText(
    copy,
    "p",
    `${rules.length} active assignment rule${rules.length === 1 ? "" : "s"} for this class`
  );
  const toggle = document.createElement("span");
  toggle.className = "gameControlsToggle";
  appendText(toggle, "span", "Show", "showLabel");
  appendText(toggle, "span", "Hide", "hideLabel");
  summary.appendChild(copy);
  summary.appendChild(toggle);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "gameControlsBody classNestedBody";

  if (rules.length > 0) {
    const list = document.createElement("div");
    list.className = "classCoTeacherList";
    for (const rule of rules) {
      const item = document.createElement("div");
      item.className = "classCoTeacherItem";
      const itemCopy = document.createElement("div");
      appendText(itemCopy, "strong", rule.label || "Assignment");
      appendText(itemCopy, "span", rule.scope || "All classes");
      appendText(itemCopy, "p", rule.summary || "");
      item.appendChild(itemCopy);
      list.appendChild(item);
    }
    body.appendChild(list);
  } else {
    appendText(body, "p", "No announcement assignments are active for this class.", "classCoTeacherEmpty");
  }

  const ctaRow = document.createElement("div");
  ctaRow.className = "ctaRow";
  const link = document.createElement("a");
  link.className = "btn";
  link.href = "/onboarding/profile#announcement-assignments";
  link.textContent = "Edit Assignments";
  ctaRow.appendChild(link);
  body.appendChild(ctaRow);
  details.appendChild(body);

  return details;
}

function insertAfterClassSettings(card, section) {
  const settingsSummary = Array.from(card.querySelectorAll(".gameControlsSummary")).find((summary) =>
    summary.textContent?.includes("Class Settings")
  );
  const settingsDetails = settingsSummary?.closest("details");
  if (settingsDetails) {
    settingsDetails.insertAdjacentElement("afterend", section);
    return;
  }
  card.querySelector(".classCourseBody")?.appendChild(section);
}

export default function DashboardAssignmentInjector() {
  useEffect(() => {
    let cancelled = false;

    async function loadAssignments() {
      const response = await fetch("/api/dashboard/announcement-assignments", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (cancelled) return;

      const assignmentsByCourseId = payload.assignmentsByCourseId || {};
      document.querySelectorAll(".classCourseCard").forEach((card) => {
        if (card.querySelector(".dashboardAssignmentInjected")) return;
        const courseId = getCourseIdFromCard(card);
        if (!courseId) return;
        const rules = assignmentsByCourseId[courseId] || [];
        insertAfterClassSettings(card, createAssignmentsSection(rules));
      });
    }

    loadAssignments().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
