import React from "react";
import { invoke, view as forgeView } from "@forge/bridge";
import "./App.css";

const DATE_OPTS = [
  { value: "any",        label: "Any dates" },
  { value: "today",      label: "Today" },
  { value: "yesterday",  label: "Yesterday" },
  { value: "this_week",  label: "This Week" },
  { value: "prev_week",  label: "Previous Week" },
  { value: "last_7",     label: "Last 7 days" },
  { value: "last_28",    label: "Last 28 days" },
  { value: "this_month", label: "This Month" },
  { value: "prev_month", label: "Previous Month" },
];

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return ts || ""; }
}

function matchDate(ts, f) {
  if (f === "any") return true;
  const d = new Date(ts), now = new Date();
  const sod = x => { const c = new Date(x); c.setHours(0, 0, 0, 0); return c; };
  const sow = x => { const c = sod(x); c.setDate(c.getDate() - c.getDay()); return c; };
  const som = x => { const c = new Date(x); c.setDate(1); c.setHours(0, 0, 0, 0); return c; };
  const T = sod(now);
  if (f === "today")      return d >= T;
  if (f === "yesterday")  { const y = new Date(T); y.setDate(y.getDate() - 1); return d >= y && d < T; }
  if (f === "this_week")  return d >= sow(now);
  if (f === "prev_week")  { const tw = sow(now); const pw = new Date(tw); pw.setDate(pw.getDate() - 7); return d >= pw && d < tw; }
  if (f === "last_7")     { const c = new Date(now); c.setDate(c.getDate() - 7); return d >= c; }
  if (f === "last_28")    { const c = new Date(now); c.setDate(c.getDate() - 28); return d >= c; }
  if (f === "this_month") return d >= som(now);
  if (f === "prev_month") { const tm = som(now); const pm = new Date(tm); pm.setMonth(pm.getMonth() - 1); return d >= pm && d < tm; }
  return true;
}

function flatten(history) {
  const rows = [];
  (history || []).forEach(h => {
    const items = h.items || [];
    if (!items.length) {
      rows.push({ ts: h.timestamp, author: h.author || "System", field: "", from: "", to: "", type: h.type });
    } else {
      items.forEach(it => {
        const fromVal = (it.fromString !== undefined && it.fromString !== null) ? it.fromString : (it.from || "");
        const toVal   = (typeof it["toString"] === "string")                   ? it["toString"] : (it.to || "");
        rows.push({ ts: h.timestamp, author: h.author || "System", field: it.field || "", from: fromVal, to: toVal, type: h.type });
      });
    }
  });
  return rows;
}

function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function avatarHue(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

const STATUS_MAP = {
  "todo": "#42526E", "to do": "#42526E",
  "inprogress": "#0052CC", "in progress": "#0052CC",
  "done": "#00875A",
  "inreview": "#6554C0", "in review": "#6554C0",
  "closed": "#00875A", "resolved": "#00875A",
  "blocked": "#DE350B", "open": "#42526E",
};
function statusColor(v) { return STATUS_MAP[(v || "").toLowerCase()] || "#42526E"; }

function Av({ name }) {
  return (
    <span className="av" style={{ background: `hsl(${avatarHue(name)},55%,44%)` }}>
      {initials(name)}
    </span>
  );
}

function Val({ v, field }) {
  if (!v && v !== 0) return <em className="nil">None</em>;
  if (field && /status/i.test(field)) {
    return <span className="status-badge" style={{ background: statusColor(v) }}>{v.toUpperCase()}</span>;
  }
  return <span className="change-val">{v}</span>;
}

function Changes({ from, to, field }) {
  const hf = from !== null && from !== undefined && from !== "";
  const ht = to   !== null && to   !== undefined && to   !== "";
  if (!hf && !ht) return <em className="nil">&#8212;</em>;
  if (!hf) return <Val v={to} field={field} />;
  if (!ht) return <span className="ch-row"><Val v={from} field={field} /><span className="arr"> &#8594; </span><em className="nil">None</em></span>;
  return <span className="ch-row"><Val v={from} field={field} /><span className="arr"> &#8594; </span><Val v={to} field={field} /></span>;
}

function dlBlob(name, mime, content) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (_) {}
}

function doCSV(rows, key) {
  const h = ["Date", "Author", "Field", "From", "To"];
  const q = v => `"${String(v || "").replace(/"/g, '""')}"`;
  const csv = [h, ...rows.map(r => [fmtDate(r.ts), r.author, r.field, r.from, r.to])]
    .map(row => row.map(q).join(",")).join("\r\n");
  dlBlob(`${key || "history"}.csv`, "text/csv;charset=utf-8;", "\uFEFF" + csv);
}

function doXLS(rows, key) {
  const h = ["Date", "Author", "Field", "From", "To"];
  const x = v => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<html><head><meta charset="UTF-8"></head><body><table border="1">
<thead><tr>${h.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
${rows.map(r => `<tr>${[fmtDate(r.ts), r.author, r.field, r.from, r.to].map(v => `<td>${x(v)}</td>`).join("")}</tr>`).join("")}
</tbody></table></body></html>`;
  dlBlob(`${key || "history"}.xls`, "application/vnd.ms-excel", html);
}

function doPDF(rows, key) {
  const h = ["Date", "Author", "Field", "From", "To"];
  const x = v => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Work Item History</title>
<style>body{font-family:Arial,sans-serif;padding:24px;font-size:12px}
h2{font-size:16px;margin-bottom:12px;color:#172B4D}
table{width:100%;border-collapse:collapse}
th{background:#0052CC;color:#fff;padding:8px 10px;text-align:left;font-size:11px}
td{border:1px solid #DFE1E6;padding:6px 10px}
tr:nth-child(even) td{background:#F8F9FA}
@media print{.noprint{display:none}}</style></head>
<body><h2>${key || ""} &#8212; Work Item History</h2>
<table><thead><tr>${h.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
${rows.map(r => `<tr>${[fmtDate(r.ts), r.author, r.field, r.from, r.to].map(v => `<td>${x(v)}</td>`).join("")}</tr>`).join("")}
</tbody></table>
<br class="noprint"><button class="noprint" onclick="window.print()">Save as PDF</button>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=650");
  if (w) { w.document.write(html); w.document.close(); }
  else { dlBlob(`${key || "history"}-print.html`, "text/html", html); }
}

function DDMenu({ label, opts, val, onChange, alignRight }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const sel = opts.find(o => o.value === val);
  return (
    <div className="dd-wrap" ref={ref}>
      <button className="dd-btn" onClick={() => setOpen(v => !v)}>
        {label && <span className="dd-prefix">{label}</span>}
        <span>{sel ? sel.label : val}</span>
        <span className="dd-arrow">&#9660;</span>
      </button>
      {open && (
        <ul className={`dd-list${alignRight ? " align-r" : ""}`}>
          {opts.map(o => (
            <li key={o.value} className={o.value === val ? "dd-active" : ""}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function App() {
  const [allRows, setAllRows]   = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [error,   setError]     = React.useState(null);
  const [issueKey, setIssueKey] = React.useState(null);

  const [dateF,    setDateF]    = React.useState("any");
  const [userF,    setUserF]    = React.useState("any");
  const [fieldF,   setFieldF]   = React.useState("any");
  const [search,   setSearch]   = React.useState("");
  const [asc,      setAsc]      = React.useState(false);
  const [viewMode, setViewMode] = React.useState("table");

  const [exportOpen, setExportOpen] = React.useState(false);
  const exportRef = React.useRef(null);

  React.useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const load = React.useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const ctx = await forgeView.getContext();
      const key = ctx && ctx.extension && ctx.extension.issue && ctx.extension.issue.key;
      if (key) setIssueKey(key);
      const res = await invoke("fetchHistory", { issueKey: key });
      if (res && res.error && !(res.history || []).length) {
        setError(res.error);
      } else {
        setAllRows(flatten(res && res.history ? res.history : []));
      }
    } catch (e) {
      setError(e.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const userOpts = React.useMemo(() => {
    const s = new Set(allRows.map(r => r.author).filter(Boolean));
    return [{ value: "any", label: "Any User" }, ...Array.from(s).sort().map(a => ({ value: a, label: a }))];
  }, [allRows]);

  const fieldOpts = React.useMemo(() => {
    const s = new Set(allRows.map(r => r.field).filter(Boolean));
    return [{ value: "any", label: "All Fields" }, ...Array.from(s).sort().map(f => ({ value: f, label: f }))];
  }, [allRows]);

  const rows = React.useMemo(() => {
    let r = allRows;
    if (dateF  !== "any") r = r.filter(x => matchDate(x.ts, dateF));
    if (userF  !== "any") r = r.filter(x => x.author === userF);
    if (fieldF !== "any") r = r.filter(x => x.field  === fieldF);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => (x.author + x.field + x.from + x.to).toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => { const d = new Date(b.ts) - new Date(a.ts); return asc ? -d : d; });
  }, [allRows, dateF, userF, fieldF, search, asc]);

  const hasFilter = dateF !== "any" || userF !== "any" || fieldF !== "any" || search;
  const clearAll  = () => { setDateF("any"); setUserF("any"); setFieldF("any"); setSearch(""); };

  return (
    <div className="wih">

      <div className="wih-bar">
        <div className="wih-bar-l">
          <div className="vt">
            <button className={`vt-btn${viewMode === "table"  ? " on" : ""}`} onClick={() => setViewMode("table")}  title="Table view">&#9776;</button>
            <button className={`vt-btn${viewMode === "stream" ? " on" : ""}`} onClick={() => setViewMode("stream")} title="Activity stream">&#931;&#931;</button>
          </div>
          {!loading && <span className="cnt">{rows.length} change{rows.length !== 1 ? "s" : ""}</span>}
          <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
            <span className={loading ? "spin-ico" : ""}>&#8635;</span>
          </button>
        </div>

        <div className="wih-bar-r">
          <DDMenu label="Date: " opts={DATE_OPTS}  val={dateF}  onChange={setDateF} />
          <DDMenu label="Updated by: " opts={userOpts} val={userF} onChange={setUserF} />

          <div className="srch">
            <span className="srch-ico">&#128269;</span>
            <input className="srch-inp" placeholder="Search..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="dd-wrap" ref={exportRef}>
            <button className="icon-btn" title="Export"
              onClick={() => setExportOpen(v => !v)}>&#11015;</button>
            {exportOpen && (
              <ul className="dd-list align-r">
                <li onClick={() => { doXLS(rows, issueKey); setExportOpen(false); }}>&#128202; Excel</li>
                <li onClick={() => { doCSV(rows, issueKey); setExportOpen(false); }}>&#128196; CSV</li>
                <li onClick={() => { doPDF(rows, issueKey); setExportOpen(false); }}>&#128203; PDF</li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {!loading && fieldOpts.length > 2 && (
        <div className="wih-filter-row">
          <DDMenu label="Field: " opts={fieldOpts} val={fieldF} onChange={setFieldF} />
          {hasFilter && <button className="clr-btn" onClick={clearAll}>&#10005; Clear filters</button>}
        </div>
      )}

      {loading && (
        <div className="state-box">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      )}

      {!loading && error && (
        <div className="err-box">
          <strong>Error loading history</strong>
          <p>{error}</p>
          <button className="prim-btn" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="state-box">
          <div className="empty-ico">&#128203;</div>
          <p className="empty-title">No history{hasFilter ? " matching filters" : ""}</p>
          <p className="empty-sub">{hasFilter ? "Try different filters." : "Field changes will appear here."}</p>
          {hasFilter && <button className="prim-btn" onClick={clearAll}>Clear filters</button>}
        </div>
      )}

      {!loading && !error && rows.length > 0 && viewMode === "table" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="th-sort" onClick={() => setAsc(v => !v)}>
                  Date of change <span className="sort-ico">{asc ? "&#9650;" : "&#9660;"}</span>
                </th>
                <th>Updater</th>
                <th>Field</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="td-date">{fmtDate(r.ts)}</td>
                  <td>
                    <div className="user-cell">
                      <Av name={r.author} />
                      <span>{r.author}</span>
                    </div>
                  </td>
                  <td className="td-field">{r.field || "&#8212;"}</td>
                  <td><Changes from={r.from} to={r.to} field={r.field} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && viewMode === "stream" && (
        <div className="stream">
          {rows.map((r, i) => (
            <div key={i} className="s-row">
              <Av name={r.author} />
              <div className="s-body">
                <div className="s-head">
                  <strong>{r.author}</strong>
                  {r.field
                    ? <span> {r.from && r.to ? "changed" : r.to ? "updated" : "cleared"} the <em>{r.field}</em></span>
                    : <span> made a change</span>}
                  <span className="s-when"> {fmtDate(r.ts)}</span>
                </div>
                {(r.from || r.to) && (
                  <div className="s-change">
                    <Changes from={r.from} to={r.to} field={r.field} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
