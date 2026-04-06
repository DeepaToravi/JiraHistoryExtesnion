import React from "react";
import { invoke } from "@forge/bridge";

// ── SecurityScanner ──────────────────────────────────────────────────────────
// Global-level PII & DLP scanner — matches marketplace Issue History look.
// Props:
//   projectKey – optional project key to scope scan; if omitted scans all spaces
//   mode       – "global" (default) | "project"

// Severity dot rating: critical=5, high=4, medium=3, low=1 (out of 5)
const SEV_META = {
  critical: { dots: 5, color: "#FF5630", label: "Critical" },
  high:     { dots: 4, color: "#FF8B00", label: "High"     },
  medium:   { dots: 3, color: "#FFAB00", label: "Medium"   },
  low:      { dots: 1, color: "#36B37E", label: "Low"      },
};

function SeverityDots({ severity }) {
  const m = SEV_META[severity] || SEV_META.low;
  return (
    <span className="sev-dots" title={m.label}>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className="sev-dot"
          style={{ background: i <= m.dots ? m.color : "#DFE1E6" }} />
      ))}
      <span className="sev-dot-label" style={{ color: m.color }}>{m.dots}/5</span>
    </span>
  );
}

function fmt(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return isoStr.slice(0, 16).replace("T", " "); }
}

export default function SecurityScanner({ projectKey, mode = "global" }) {
  const [findings,  setFindings]  = React.useState([]);
  const [loading,   setLoading]   = React.useState(false);
  const [scanned,   setScanned]   = React.useState(false);
  const [error,     setError]     = React.useState(null);
  const [scanScope, setScanScope] = React.useState("current");
  const [projects,  setProjects]  = React.useState([]);
  const [jiraUsers, setJiraUsers] = React.useState([]);

  // Static list of all known PII pattern names (mirrors PII_PATTERNS in backend)
  const KNOWN_PATTERNS = [
    "Email Address", "Credit Card Number", "Phone Number", "IP Address",
    "SSN (US)", "Passport / ID", "API Key / Token", "IBAN", "ZIP / Postal Code",
  ];

  // Fetch available projects on mount to populate Space dropdown
  React.useEffect(() => {
    invoke("fetchAccessibleProjects").then(res => {
      if (res.projects) setProjects(res.projects);
    }).catch(() => {});
  }, []);

  // Fetch Jira users on mount to populate Updated By dropdown
  React.useEffect(() => {
    invoke("fetchJiraUsers").then(res => {
      if (res.users) setJiraUsers(res.users.map(u => u.displayName).filter(Boolean).sort());
    }).catch(() => {});
  }, []);

  // Filters
  const [fSpace,   setFSpace]   = React.useState(projectKey || "all");
  const [fUpdater, setFUpdater] = React.useState("any");
  const [fFrom,    setFFrom]    = React.useState("");
  const [fTo,      setFTo]      = React.useState("");
  const [fSev,     setFSev]     = React.useState("all");
  const [fPattern, setFPattern] = React.useState("all");
  const [fSearch,  setFSearch]  = React.useState("");
  const [perPage,  setPerPage]  = React.useState(100);

  // Merge static known patterns with any new ones found in scan results
  const allPatterns = React.useMemo(() => {
    const fromFindings = findings.map(f => f.pattern).filter(Boolean);
    return [...new Set([...KNOWN_PATTERNS, ...fromFindings])].sort();
  }, [findings]);

  // Merge pre-fetched Jira users with any additional updaters found in scan results
  const allUpdaters = React.useMemo(() => {
    const fromFindings = findings.map(f => f.updater).filter(Boolean);
    return [...new Set([...jiraUsers, ...fromFindings])].sort();
  }, [findings, jiraUsers]);

  async function runScan() {
    setLoading(true); setError(null); setFindings([]); setScanned(false);
    try {
      const payload = { scanScope };
      if (fSpace && fSpace !== "all") payload.projectKey = fSpace;
      const res = await invoke("scanIssueForPII", payload);
      if (res.error) setError(res.error);
      setFindings(res.findings || []);
      setScanned(true);
    } catch (e) {
      setError(e.message || "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  const filtered = React.useMemo(() => {
    let f = findings;
    if (fSev !== "all")     f = f.filter(x => x.severity === fSev);
    if (fPattern !== "all") f = f.filter(x => x.pattern  === fPattern);
    if (fUpdater !== "any") f = f.filter(x => x.updater  === fUpdater);
    if (fFrom) f = f.filter(x => x.firstDetected && x.firstDetected >= fFrom);
    if (fTo)   f = f.filter(x => x.firstDetected && x.firstDetected <= fTo + "T23:59:59");
    if (fSearch.trim()) {
      const q = fSearch.toLowerCase();
      f = f.filter(x =>
        (x.issueKey + x.summary + x.field + x.pattern + (x.actualValue || "") + x.context).toLowerCase().includes(q)
      );
    }
    return f;
  }, [findings, fSev, fPattern, fUpdater, fFrom, fTo, fSearch]);

  const counts = React.useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    findings.forEach(f => { if (c[f.severity] !== undefined) c[f.severity]++; });
    return c;
  }, [findings]);

  function exportCSV() {
    const h = ["First Detected", "Key", "Summary", "Updater", "Field", "Severity", "Type of Finding", "Security Finding"];
    const q = v => `"${String(v || "").replace(/"/g, '""')}"`;
    const csv = [h, ...filtered.map(f => [
      f.firstDetected?.slice(0, 16) || "",
      f.issueKey || "",
      f.summary  || "",
      f.updater  || "",
      f.field    || "",
      f.severity || "",
      f.pattern  || "",
      f.actualValue || f.snippet || "",
    ])].map(r => r.map(q).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `pii-scan-${fSpace || "global"}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const paged = filtered.slice(0, perPage);

  return (
    <div className="gl-scanner">
      {/* ── Header row ── */}
      <div className="gl-scanner-header">
        <div className="gl-scanner-header-l">
          <span className="gl-scanner-icon">&#128274;</span>
          <div>
            <div className="gl-scanner-title">Security Scanner</div>
            <div className="gl-scanner-sub">PII &amp; DLP — detect sensitive data across your Jira spaces</div>
          </div>
        </div>
        <div className="gl-scanner-scope">
          <label className="gl-scanner-radio">
            <input type="radio" name="gl-scope" value="current"
              checked={scanScope === "current"} onChange={() => setScanScope("current")} />
            Current fields &amp; comments
          </label>
          <label className="gl-scanner-radio">
            <input type="radio" name="gl-scope" value="history"
              checked={scanScope === "history"} onChange={() => setScanScope("history")} />
            Include full history
          </label>
        </div>
        <button className="gl-scanner-run prim-btn" onClick={runScan} disabled={loading}>
          {loading ? <><span className="spin-ico">&#8635;</span> Scanning…</> : "🔍 Run Scan"}
        </button>
      </div>

      {/* ── Filter bar (marketplace style) ── */}
      <div className="gl-scanner-bar">
        <div className="gl-bar-group">
          <label className="gl-bar-label">Space</label>
          <select className="gl-bar-sel" value={fSpace} onChange={e => setFSpace(e.target.value)}>
            <option value="all">All spaces</option>
            {projects.map(p => (
              <option key={p.key} value={p.key}>{p.name} ({p.key})</option>
            ))}
          </select>
        </div>
        <div className="gl-bar-group">
          <label className="gl-bar-label">Updated by</label>
          <select className="gl-bar-sel" value={fUpdater} onChange={e => setFUpdater(e.target.value)}>
            <option value="any">Any User</option>
            {allUpdaters.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="gl-bar-group">
          <label className="gl-bar-label">From</label>
          <input type="date" className="gl-bar-date" value={fFrom} onChange={e => setFFrom(e.target.value)} />
        </div>
        <div className="gl-bar-group">
          <label className="gl-bar-label">To</label>
          <input type="date" className="gl-bar-date" value={fTo} onChange={e => setFTo(e.target.value)} />
        </div>
        <div className="gl-bar-group">
          <label className="gl-bar-label">Severity</label>
          <select className="gl-bar-sel" value={fSev} onChange={e => setFSev(e.target.value)}>
            <option value="all">All</option>
            {["critical","high","medium","low"].map(s =>
              <option key={s} value={s}>{SEV_META[s].label}</option>)}
          </select>
        </div>
        <div className="gl-bar-group">
          <label className="gl-bar-label">Finding type</label>
          <select className="gl-bar-sel" value={fPattern} onChange={e => setFPattern(e.target.value)}>
            <option value="all">All types</option>
            {allPatterns.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="gl-bar-group gl-bar-search">
          <label className="gl-bar-label">Search</label>
          <div className="srch" style={{ minWidth: 180 }}>
            <span className="srch-ico">&#128269;</span>
            <input className="srch-inp" placeholder="Key, summary, value…"
              value={fSearch} onChange={e => setFSearch(e.target.value)} />
          </div>
        </div>
        <button className="icon-btn" title="Refresh" onClick={runScan} disabled={loading}
          style={{ alignSelf: "flex-end", marginBottom: 2 }}>&#8635;</button>
        {scanned && filtered.length > 0 && (
          <button className="icon-btn" title="Export CSV" onClick={exportCSV}
            style={{ alignSelf: "flex-end", marginBottom: 2 }}>&#11015; CSV</button>
        )}
      </div>

      {/* ── Summary cards ── */}
      {scanned && !loading && (
        <div className="gl-scanner-summary">
          {Object.entries(counts).map(([sev, count]) => (
            <div key={sev} className={`gl-sev-card sev-${sev}`}
              style={{ opacity: fSev !== "all" && fSev !== sev ? 0.45 : 1, cursor: "pointer" }}
              onClick={() => setFSev(fSev === sev ? "all" : sev)}>
              <span className="gl-sev-label" style={{ color: SEV_META[sev].color }}>{SEV_META[sev].label}</span>
              <strong className="gl-sev-count">{count}</strong>
            </div>
          ))}
          {findings.length === 0 && (
            <div className="scanner-clean"><span>✅ No PII or sensitive data patterns detected.</span></div>
          )}
        </div>
      )}

      {error && <div className="err-box"><strong>Scan error:</strong> {error}</div>}

      {/* ── Results meta row ── */}
      {scanned && findings.length > 0 && (
        <div className="gl-scanner-meta">
          <span>{filtered.length} of {findings.length} findings</span>
          <label style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
            Findings per page:
            <select className="gl-bar-sel" value={perPage} onChange={e => setPerPage(Number(e.target.value))}
              style={{ width: 70 }}>
              {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}

      {/* ── Findings table (marketplace layout) ── */}
      {scanned && paged.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl gl-scanner-tbl">
            <thead>
              <tr>
                <th>First detected</th>
                <th>Key</th>
                <th>Summary</th>
                <th>Updater</th>
                <th>Field</th>
                <th>Severity</th>
                <th>Type of finding</th>
                <th>Security finding</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((f, i) => (
                <tr key={i}>
                  <td style={{ whiteSpace: "nowrap", color: "#5E6C84", fontSize: "0.85em" }}>
                    {fmt(f.firstDetected)}
                  </td>
                  <td>
                    <a className="key-link" href={`/browse/${f.issueKey}`}
                      target="_blank" rel="noreferrer">{f.issueKey}</a>
                  </td>
                  <td className="td-summary" style={{ maxWidth: 220 }}>{f.summary}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{f.updater || "—"}</td>
                  <td className="td-field">{f.field}</td>
                  <td><SeverityDots severity={f.severity} /></td>
                  <td style={{ fontWeight: 500 }}>{f.pattern}</td>
                  <td>
                    <code className="gl-scanner-value"
                      style={{ color: SEV_META[f.severity]?.color || "#172B4D" }}>
                      {f.actualValue || f.snippet || "—"}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {scanned && !loading && filtered.length === 0 && findings.length > 0 && (
        <div className="state-box">
          <p className="empty-title">No findings match current filters</p>
          <button className="prim-btn"
            onClick={() => { setFSev("all"); setFPattern("all"); setFSearch(""); setFUpdater("any"); setFFrom(""); setFTo(""); }}>
            Clear filters
          </button>
        </div>
      )}

      {!scanned && !loading && (
        <div className="state-box" style={{ textAlign: "center", color: "#5E6C84", padding: 32 }}>
          <p>Select a space (or leave as &quot;All spaces&quot;) and click <strong>Run Scan</strong> to detect PII and sensitive data.</p>
        </div>
      )}
    </div>
  );
}
