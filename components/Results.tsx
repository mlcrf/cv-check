"use client";

import { useState } from "react";
import { allFixesPrompt, fixable, promptFor } from "@/lib/prompts";
import type { Check, CheckResult, Status } from "@/lib/types";
import CopyButton from "./CopyButton";
import { ChevronIcon, ExpandIcon } from "./icons";
import Lightbox from "./Lightbox";

const LABELS: Record<Status, string> = { pass: "OK", warn: "Warning", fail: "Issue", info: "Note" };
const RING_RADIUS = 60;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function band(score: number) {
  if (score >= 80) return { verdict: "Looking great", ring: "var(--green-600)", text: "var(--green-700)" };
  if (score >= 60) return { verdict: "Good, with some fixes", ring: "var(--yellow-500)", text: "var(--yellow-800)" };
  return { verdict: "Needs work", ring: "var(--red-600)", text: "var(--red-700)" };
}

function CheckCard({ check }: { check: Check }) {
  return (
    <div className={`check ${check.status}`}>
      <div className="check-head">
        <span className={`badge ${check.status}`}>{LABELS[check.status]}</span>
        <h3>{check.title}</h3>
        {check.fix && check.status !== "pass" && (
          <CopyButton label="Copy prompt" getText={() => promptFor(check)}
            title="Copy a prompt to paste into an AI assistant to fix this" />
        )}
      </div>
      <p>{check.message}</p>
      {check.details.length > 0 && (
        <ul>
          {check.details.map((d, i) => <li key={i}>{d}</li>)}
        </ul>
      )}
    </div>
  );
}

interface Props {
  result: CheckResult;
  fileName: string;
  previews: string[] | null; // null while the pages are still being drawn
  onCheckAnother: () => void;
}

export default function Results({ result, fileName, previews, onCheckAnother }: Props) {
  const [showPassed, setShowPassed] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const { score, counts, pages, words, checks } = result;
  const { verdict, ring, text } = band(score);

  // Show what needs attention; tuck passed checks behind a toggle
  const attention = checks.filter((c) => c.status !== "pass");
  const passed = checks.filter((c) => c.status === "pass");
  const passLabel = `${passed.length} passed check${passed.length === 1 ? "" : "s"}`;
  const fixCount = fixable(result).length;

  return (
    <div className="results">
      <h2>Results</h2>
      <aside className="sidebar">
        <div className="card score">
          <div className="ring">
            <svg width="136" height="136" viewBox="0 0 140 140">
              <circle cx="70" cy="70" r={RING_RADIUS} fill="none" stroke="var(--slate-100)" strokeWidth="10" />
              <circle cx="70" cy="70" r={RING_RADIUS} fill="none" stroke={ring} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={RING_LENGTH} strokeDashoffset={RING_LENGTH * (1 - score / 100)} />
            </svg>
            <div className="num">{score}<small>/100</small></div>
          </div>
          <div className="verdict" style={{ color: text }}>{verdict}</div>
          <div className="tally">
            <span><b>{counts.fail ?? 0}</b> issues</span>
            <span><b>{counts.warn ?? 0}</b> warnings</span>
            <span><b>{counts.pass ?? 0}</b> passed</span>
          </div>
          <div className="meta">
            {fileName}<br />{pages} page{pages > 1 ? "s" : ""} · {words} words
          </div>
          <button className="btn btn-secondary" type="button" onClick={onCheckAnother}>Check another CV</button>
        </div>

        <div className="previews">
          {previews === null ? (
            <div className="preview-placeholder" aria-label="Loading preview" />
          ) : previews.length > 0 && (
            <>
              <button className="preview" type="button" onClick={() => setViewerOpen(true)} aria-label="Enlarge CV preview">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL rendered in the browser */}
                <img src={previews[0]} alt="First page preview" />
                <span className="zoom"><ExpandIcon /></span>
              </button>
              {pages > 1 && <div className="more-pages">Page 1 of {pages} · click to view all</div>}
            </>
          )}
        </div>
      </aside>

      <div className="checks">
        {fixCount > 0 && (
          <div className="fix-bar">
            <p>Fix with AI: copy a prompt from any result and paste it into ChatGPT, Claude or similar, with your CV attached.</p>
            <CopyButton className="btn btn-secondary" label={`Copy all fixes (${fixCount})`} getText={() => allFixesPrompt(result)} />
          </div>
        )}
        {attention.length
          ? attention.map((c) => <CheckCard key={c.id} check={c} />)
          : <div className="all-clear">Nothing to fix — every check passed.</div>}
        {passed.length > 0 && (
          <>
            <button className="btn btn-secondary toggle" type="button" aria-expanded={showPassed}
              onClick={() => setShowPassed((v) => !v)}>
              <span>{showPassed ? "Hide" : "Show"} {passLabel}</span> <ChevronIcon />
            </button>
            {showPassed && (
              <div className="passed">
                {passed.map((c) => <CheckCard key={c.id} check={c} />)}
              </div>
            )}
          </>
        )}
      </div>

      {viewerOpen && previews && <Lightbox pages={previews} onClose={() => setViewerOpen(false)} />}
    </div>
  );
}
