import React from "react";

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return ts || ""; }
}

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function avatarHue(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

function Av({ name }) {
  return (
    <span className="av" style={{ background: `hsl(${avatarHue(name)},55%,44%)` }}>
      {initials(name)}
    </span>
  );
}

// ── SprintHistory ──────────────────────────────────────────────────────────
// Props:
//   rows     – pre-filtered sprint-change rows ({ ts, author, from, to })
//              derived from history rows where field === 'Sprint'
//   issueKey – current Jira issue key (display only)
export default function SprintHistory({ rows, issueKey }) {
  if (!rows || !rows.length) {
    return (
      <div className="sprint-empty">
        <span className="sprint-empty-ico">🏃</span>
        <div className="sprint-empty-msg">No sprint moves recorded for {issueKey || "this issue"}.</div>
        <div className="sprint-empty-sub">
          Sprint changes will appear here once the issue is moved between sprints.
        </div>
      </div>
    );
  }

  // Collect all unique sprint names for summary stats
  const sprintsSet = new Set();
  rows.forEach(r => {
    if (r.from) sprintsSet.add(r.from);
    if (r.to)   sprintsSet.add(r.to);
  });

  const currentSprint = rows[0]?.to || null;

  return (
    <div className="sprint-history">
      {/* Summary bar */}
      <div className="sprint-summary">
        <span className="sprint-stat">
          <strong>{rows.length}</strong> sprint move{rows.length !== 1 ? "s" : ""}
        </span>
        <span className="sprint-stat-divider" />
        <span className="sprint-stat">
          <strong>{sprintsSet.size}</strong> sprint{sprintsSet.size !== 1 ? "s" : ""} touched
        </span>
        {currentSprint && (
          <>
            <span className="sprint-stat-divider" />
            <span className="sprint-stat sprint-current-label">
              Current sprint:&nbsp;
              <span className="sprint-badge sprint-badge-active">{currentSprint}</span>
            </span>
          </>
        )}
      </div>

      {/* Timeline */}
      <div className="sprint-timeline">
        {rows.map((r, i) => {
          const isFirst = i === 0;
          const moved   = r.from && r.to && r.from !== r.to;
          const added   = !r.from && r.to;
          const removed = r.from && !r.to;
          return (
            <div key={i} className={`sprint-tl-entry${isFirst ? " sprint-tl-entry-latest" : ""}`}>
              <div className="sprint-tl-dot" />
              <div className="sprint-tl-body">
                <div className="sprint-tl-row">
                  <Av name={r.author} />
                  <strong className="sprint-tl-author">{r.author}</strong>
                  {moved && (
                    <>
                      <span className="sprint-tl-verb">moved to</span>
                      <span className="sprint-badge sprint-badge-to">{r.to}</span>
                      <span className="sprint-tl-from-label">from</span>
                      <span className="sprint-badge sprint-badge-from">{r.from}</span>
                    </>
                  )}
                  {added && (
                    <>
                      <span className="sprint-tl-verb">added to sprint</span>
                      <span className="sprint-badge sprint-badge-to">{r.to}</span>
                    </>
                  )}
                  {removed && (
                    <>
                      <span className="sprint-tl-verb">removed from sprint</span>
                      <span className="sprint-badge sprint-badge-from">{r.from}</span>
                    </>
                  )}
                  {!moved && !added && !removed && (
                    <span className="sprint-tl-verb">sprint updated</span>
                  )}
                  <span className="sprint-tl-time">{fmtDate(r.ts)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
