import React from "react";
import { invoke } from "@forge/bridge";

// ── SecurityScanner ──────────────────────────────────────────────────────────
// Scans the current issue / project for PII & DLP sensitive data patterns
// (emails, credit cards, tokens, SSNs, phone numbers, IBANs, etc.)
//
// Props:
//   issueKey   – if provided, scans a single issue
//   projectKey – if provided, scans all recently-updated issues in the project
//   mode       – "issue" | "project"

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_COLORS = {
  critical: { bg: "#FFEBE6", border: "#FF5630", text: "#BF2600", label: "🔴 Critical" },
  high:     { bg: "#FFF0E6", border: "#FF8B00", text: "#974F0C", label: "🟠 High"     },
  medium:   { bg: "#FFFAE6", border: "#FFAB00", text: "#7A5C00", label: "🟡 Medium"   },
  low:      { bg: "#E3FCEF", border: "#36B37E", text: "#006644", label: "🟢 Low"      },
};

function SeverityBadge({ severity }) {
  const s = SEVERITY_COLORS[severity] || SEVERITY_COLORS.medium;
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.text,
      borderRadius: 4, padding: "2px 8px", fontSize: "0.8em", fontWeight: 600, whiteSpace: "nowrap",
    }}>
      {s.label}
    </span>
  );
}

export default function SecurityScanner({ issueKey, projectKey, mode = "issue" }) {
  const [findings,    setFindings]    = React.useState([]);
  const [loading,     setLoading]     = React.useState(false);
  const [scanned,     setScanned]     = React.useState(false);
  const [error,       setError]       = React.useState(null);
  const [scanScope,   setScanScope]   = React.useState("current"); // "current" | "history"
  const [severityF,   setSeverityF]   = React.useState("all");
  const [patternF,    setPatternF]    = React.useState("all");
  const [search,      setSearch]      = React.useState("");
  const [exportOpen,  setExportOpen]  = React.useState(false);
  const exportRef = React.useRef(null);

  React.useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  async function runScan() {
    setLoading(true); setError(null); setFindings([]);
    try {
      const payload = mode === "project"
        ? { projectKey, scanScope }
        : { issueKey, scanScope };
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
    if (severityF !== "all") f = f.filter(x => x.severity === severityF);
    if (patternF  !== "all") f = f.filter(x => x.pattern  === patternF);
    if (search.trim()) {
      const q = search.toLowerCase();
      f = f.filter(x => (x.issueKey + x.field + x.pattern + x.snippet + x.context).toLowerCase().includes(q));
    }
    return f;
  }, [findings, severityF, patternF, search]);

  const uniquePatterns = React.useMemo(() =>
    [...new Set(findings.map(f => f.pattern))].sort(),
  [findings]);

  const counts = React.useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0, low: 0 };
    findings.forEach(f => { if (c[f.severity] !== undefined) c[f.severity]++; });
    return c;
  }, [findings]);

  function exportCSV() {
    const h = ["Severity", "Issue Key", "Field", "Pattern", "Snippet", "Context", "Count"];
    const q = v => `"${String(v||"").replace(/"/g,'""')}"`;
    const csv = [h, ...filtered.map(f => [f.severity,f.issueKey||issueKey||"",f.field,f.pattern,f.snippet,f.context,f.count])]
      .map(row => row.map(q).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `pii-scan-${issueKey||projectKey||"report"}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  return (
    <div className="scanner-wrap">
      {/* Header */}
      <div className="scanner-header">
        <span className="scanner-title">🔐 Security Scanner — PII &amp; DLP</span>
        <span className="scanner-sub">
          Detect sensitive data in {mode === "project" ? "project issues" : `issue ${issueKey}`}: emails, credit cards, tokens, IBANs, SSNs, and more.
        </span>
      </div>

      {/* Controls */}
      <div className="scanner-controls">
        <div className="scanner-scope">
          <label className="scanner-scope-label">Scan scope:</label>
          <label className="scanner-radio">
            <input type="radio" name="scope" value="current" checked={scanScope === "current"}
              onChange={() => setScanScope("current")} />
            Current field values &amp; comments
          </label>
          <label className="scanner-radio">
            <input type="radio" name="scope" value="history" checked={scanScope === "history"}
              onChange={() => setScanScope("history")} />
            Include full change history
          </label>
        </div>
        <button className="prim-btn scanner-run-btn" onClick={runScan} disabled={loading}>
          {loading ? <><span className="spin-ico">&#8635;</span> Scanning…</> : "🔍 Run Scan"}
        </button>
      </div>

      {/* Summary badges */}
      {scanned && !loading && (
        <div className="scanner-summary">
          {Object.entries(counts).map(([sev, count]) => (
            <div key={sev} className={`scanner-summary-card sev-${sev}`}
              style={{ cursor: "pointer", opacity: severityF !== "all" && severityF !== sev ? 0.4 : 1 }}
              onClick={() => setSeverityF(severityF === sev ? "all" : sev)}>
              <SeverityBadge severity={sev} />
              <strong className="scanner-summary-count">{count}</strong>
            </div>
          ))}
          {findings.length === 0 && (
            <div className="scanner-clean">
              <span>✅ No PII or sensitive data patterns detected.</span>
            </div>
          )}
        </div>
      )}

      {error && <div className="err-box"><strong>Scan error</strong><p>{error}</p></div>}

      {/* Filters + export */}
      {scanned && findings.length > 0 && (
        <div className="scanner-filter-bar">
          <select className="scanner-select" value={severityF} onChange={e => setSeverityF(e.target.value)}>
            <option value="all">All severities</option>
            {["critical","high","medium","low"].map(s => <option key={s} value={s}>{SEVERITY_COLORS[s].label}</option>)}
          </select>
          <select className="scanner-select" value={patternF} onChange={e => setPatternF(e.target.value)}>
            <option value="all">All patterns</option>
            {uniquePatterns.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="srch">
            <span className="srch-ico">&#128269;</span>
            <input className="srch-inp" placeholder="Search findings…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="dd-wrap" ref={exportRef}>
            <button className="icon-btn" title="Export" onClick={() => setExportOpen(v => !v)}>
              &#11015; Export &#9660;
            </button>
            {exportOpen && (
              <ul className="dd-list align-r">
                <li onClick={() => { exportCSV(); setExportOpen(false); }}>&#128196; CSV</li>
              </ul>
            )}
          </div>
          <span className="cnt">{filtered.length} finding{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      )}

      {/* Findings table */}
      {scanned && filtered.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Severity</th>
                {mode === "project" && <th>Issue Key</th>}
                <th>Field</th>
                <th>Pattern Detected</th>
                <th>Sample</th>
                <th>Context</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, i) => {
                const sev = SEVERITY_COLORS[f.severity] || SEVERITY_COLORS.medium;
                return (
                  <tr key={i} style={{ background: sev.bg }}>
                    <td><SeverityBadge severity={f.severity} /></td>
                    {mode === "project" && <td><a className="key-link" href={`/browse/${f.issueKey}`} target="_blank" rel="noreferrer">{f.issueKey}</a></td>}
                    <td className="td-field">{f.field}</td>
                    <td><strong>{f.pattern}</strong></td>
                    <td><code className="scanner-snippet">{f.snippet}</code></td>
                    <td className="td-summary" style={{ color: "#6B778C", fontSize: "0.85em" }}>{f.context}</td>
                    <td style={{ textAlign: "center" }}>{f.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && scanned && filtered.length === 0 && findings.length > 0 && (
        <div className="state-box">
          <p className="empty-title">No findings match current filters</p>
          <button className="prim-btn" onClick={() => { setSeverityF("all"); setPatternF("all"); setSearch(""); }}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
