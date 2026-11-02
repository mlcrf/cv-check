"use client";

import { useState } from "react";
import { UploadIcon } from "./icons";

interface Props {
  onChoose: () => void;
}

/** The whole grey box opens the file picker; files can also be dropped anywhere on the page. */
export default function UploadBox({ onChoose }: Props) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`drop${over ? " over" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Choose a PDF to upload"
      onClick={onChoose}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onChoose();
        }
      }}
      onDragEnter={() => setOver(true)}
      onDragOver={() => setOver(true)}
      onDragLeave={() => setOver(false)}
      onDrop={() => setOver(false)}
    >
      <UploadIcon />
      <strong>Choose a PDF</strong>
      or drag your CV here
      <span className="limit">PDF, max 4 MB</span>
    </div>
  );
}
