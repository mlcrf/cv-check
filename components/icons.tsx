const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const UploadIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" strokeWidth="1.5" {...stroke}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M12 17v-6" />
    <path d="m9.5 13.5 2.5-2.5 2.5 2.5" />
  </svg>
);

export const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" strokeWidth="2" {...stroke}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const ExpandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" strokeWidth="2" {...stroke}>
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="m21 3-7 7" />
    <path d="m3 21 7-7" />
  </svg>
);

export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" strokeWidth="2" {...stroke}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);
