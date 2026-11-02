"use client";

import { useEffect, useRef, useState } from "react";
import Results from "@/components/Results";
import UploadBox from "@/components/UploadBox";
import type { CheckResult } from "@/lib/types";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: CheckResult; fileName: string };

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [previews, setPreviews] = useState<string[] | null>(null);
  const [error, setError] = useState("");
  const uploadId = useRef(0);

  const choose = () => inputRef.current?.click();

  async function upload(file: File) {
    setError("");
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF file.");
      return;
    }
    const id = ++uploadId.current;
    setState({ kind: "loading" });
    setPreviews(null);

    const body = new FormData();
    body.append("cv", file);
    try {
      const res = await fetch("/api/check", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      if (id !== uploadId.current) return;
      setState({ kind: "done", result: data, fileName: file.name });
      // page images are drawn in the browser so the API response stays small;
      // pdf.js is loaded on demand so it stays out of the server render
      import("@/lib/render-pages")
        .then(({ renderPreviews }) => renderPreviews(file))
        .then((images) => id === uploadId.current && setPreviews(images))
        .catch(() => id === uploadId.current && setPreviews([]));
    } catch (e) {
      if (id !== uploadId.current) return;
      setState({ kind: "idle" });
      setError((e as Error).message);
    }
  }

  // Accept a PDF dropped anywhere on the page
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) upload(file);
    };
    document.addEventListener("dragover", prevent);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", prevent);
      document.removeEventListener("drop", onDrop);
    };
  });

  return (
    <main>
      <div className="column">
        <header>
          <h1>CV Check</h1>
          <p>Upload your CV as a PDF to check its formatting, structure and ATS-readability.</p>
        </header>

        {state.kind === "idle" && <UploadBox onChoose={choose} />}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = "";
          }}
        />

        {error && <div className="error">{error}</div>}
        {state.kind === "loading" && (
          <div className="loading"><div className="spinner" />Checking your CV…</div>
        )}
        {state.kind === "done" && (
          <Results result={state.result} fileName={state.fileName} previews={previews} onCheckAnother={choose} />
        )}

        <p className="privacy">Your file is checked and then discarded — it is never stored.</p>
      </div>
    </main>
  );
}
