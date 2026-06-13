"use client";

/** A simple horizontal level bar (0..1) so a publisher can see audio flowing. */
export function VuMeter({ level }: { level: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        height: 14,
        borderRadius: 8,
        background: "var(--ink)",
        border: "1px solid var(--ink-line-strong)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: "var(--accent-grad)",
          transition: "width 80ms linear",
        }}
      />
    </div>
  );
}
