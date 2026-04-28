"use client";

import { useState } from "react";

export default function MasteryRangeInput({ label, suffix, defaultValue, ...props }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <label>
      {label}: {value}{suffix || ""}
      <input
        className="input"
        type="range"
        defaultValue={defaultValue}
        {...props}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}
