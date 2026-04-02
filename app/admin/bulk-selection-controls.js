"use client";

import { useEffect, useState } from "react";

function getBulkCheckboxes() {
  if (typeof document === "undefined") return [];

  return Array.from(
    document.querySelectorAll(
      'input[type="checkbox"][name="selected_user_ids"][form="adminBulkActionForm"]'
    )
  );
}

export default function BulkSelectionControls() {
  const [allSelected, setAllSelected] = useState(false);

  useEffect(() => {
    const syncState = () => {
      const checkboxes = getBulkCheckboxes();
      setAllSelected(checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked));
    };

    syncState();

    const checkboxes = getBulkCheckboxes();
    checkboxes.forEach((checkbox) => checkbox.addEventListener("change", syncState));

    return () => {
      checkboxes.forEach((checkbox) => checkbox.removeEventListener("change", syncState));
    };
  }, []);

  function handleToggleAll() {
    const checkboxes = getBulkCheckboxes();
    const nextValue = !allSelected;

    checkboxes.forEach((checkbox) => {
      checkbox.checked = nextValue;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    });

    setAllSelected(nextValue);
  }

  return (
    <div className="adminBulkSelectionHeader" aria-label="Bulk account selection controls">
      <button className="btn ghost" type="button" onClick={handleToggleAll}>
        {allSelected ? "Clear All" : "Select All"}
      </button>
    </div>
  );
}
