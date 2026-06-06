"use client";

import { useRouter } from "next/navigation";

export default function ArcadeSuggestionsToggle({ initialHidden }) {
  const router = useRouter();

  function handleChange(e) {
    if (e.target.checked) {
      document.cookie = "hide_arcade_suggestions=; path=/; max-age=0";
    } else {
      document.cookie = "hide_arcade_suggestions=1; path=/; max-age=31536000";
    }
    router.refresh();
  }

  return (
    <label className="calendarSelectCell arcadeSuggestionsToggle">
      <input
        type="checkbox"
        defaultChecked={!initialHidden}
        onChange={handleChange}
      />
      <span>Arcade Suggestions</span>
    </label>
  );
}
