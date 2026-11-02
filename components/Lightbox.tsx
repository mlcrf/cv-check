"use client";

import { useEffect, useRef } from "react";
import { CloseIcon } from "./icons";

interface Props {
  pages: string[];
  onClose: () => void;
}

/** Full-screen view of the CV's pages. Closes on the ✕, a click on the backdrop, or Esc. */
export default function Lightbox({ pages, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="CV preview" onClick={onClose}>
      <button ref={closeRef} className="close" type="button" onClick={onClose} aria-label="Close preview">
        <CloseIcon />
      </button>
      <div className="pages">
        {pages.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs rendered in the browser
          <img key={i} src={src} alt={`Page ${i + 1}`} onClick={(e) => e.stopPropagation()} />
        ))}
      </div>
    </div>
  );
}
