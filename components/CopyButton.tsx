"use client";

import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (non-HTTPS, older browser): fall back to a hidden textarea
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

interface Props {
  /** Built on click, so large prompts aren't assembled for every render */
  getText: () => string;
  label: string;
  className?: string;
  title?: string;
}

export default function CopyButton({ getText, label, className = "copy-btn", title }: Props) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button type="button" className={`${className}${copied ? " copied" : ""}`} title={title}
      onClick={async () => {
        await copyText(getText());
        setCopied(true);
      }}>
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
