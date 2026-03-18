import AnalyticsDashboard from "./components/AnalyticsDashboard";
import DeletedIssues from "./components/DeletedIssues";
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
  { value: "custom",     label: "Custom range..." },
];

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return ts || ""; }
}

function matchDate(ts, f, customStart, customEnd) {
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
  if (f === "custom") {
    const start = customStart ? sod(new Date(customStart)) : null;
    const end   = customEnd   ? (() => { const e = new Date(customEnd); e.setHours(23, 59, 59, 999); return e; })() : null;
    if (start && d < start) return false;
    if (end   && d > end)   return false;
    return true;
  }
  return true;
}

function flatten(history) {
  const rows = [];
  (history || []).forEach(h => {
    const author = h.author || "";
    // Skip system-generated entries
    if (!author || author.toLowerCase() === "system") return;
    const items = h.items || [];
    if (!items.length) {
      rows.push({ ts: h.timestamp, author, field: "", from: "", to: "", type: h.type });
    } else {
      items.forEach(it => {
        const fromVal = (it.fromString !== undefined && it.fromString !== null) ? it.fromString : (it.from || "");
        const toVal   = (typeof it["toString"] === "string")                   ? it["toString"] : (it.to || "");
        rows.push({ ts: h.timestamp, author, field: it.field || "", from: fromVal, to: toVal, type: h.type });
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

function Val({ v, field, role }) {
  if (!v && v !== 0) return role === "from" ? <span className="cv-old">Unassigned</span> : <em className="nil">None</em>;
  if (field && /status/i.test(field)) {
    return <span className="status-badge" style={{ background: statusColor(v) }}>{v.toUpperCase()}</span>;
  }
  if (role === "from") return <span className="cv-old">{v}</span>;
  if (role === "to")   return <span className="cv-new">{v}</span>;
  return <span className="change-val">{v}</span>;
}

function Changes({ from, to, field }) {
  const hf = from !== null && from !== undefined && from !== "";
  const ht = to   !== null && to   !== undefined && to   !== "";
  if (!hf && !ht) return <em className="nil">&#8212;</em>;
  if (!hf) return <Val v={to} field={field} role="to" />;
  if (!ht) return <span className="ch-row"><Val v={from} field={field} role="from" /><span className="arr"> &#8594; </span><em className="nil">None</em></span>;
  return <span className="ch-row"><Val v={from} field={field} role="from" /><span className="arr"> &#8594; </span><Val v={to} field={field} role="to" /></span>;
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

function DateFilter({ opts, val, label, onChange, customStart, customEnd, onCustomStart, onCustomEnd }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="dd-wrap" ref={ref}>
      <button className="dd-btn" onClick={() => setOpen(v => !v)}>
        <span className="dd-prefix">Date: </span>
        <span>{label}</span>
        <span className="dd-arrow">&#9660;</span>
      </button>
      {open && (
        <div className="dd-list cdr-panel">
          {opts.map(o => (
            <div key={o.value}
              className={"dd-list-item" + (o.value === val ? " dd-active" : "") + (o.value === "custom" ? " dd-custom-trigger" : "")}
              onClick={() => { onChange(o.value); if (o.value !== "custom") setOpen(false); }}>
              {o.label}
            </div>
          ))}
          {val === "custom" && (
            <div className="cdr-inputs" onClick={e => e.stopPropagation()}>
              <div className="cdr-row">
                <label className="cdr-lbl">From</label>
                <input type="date" className="cdr-date" value={customStart}
                  max={customEnd || undefined}
                  onChange={e => onCustomStart(e.target.value)} />
              </div>
              <div className="cdr-row">
                <label className="cdr-lbl">To</label>
                <input type="date" className="cdr-date" value={customEnd}
                  min={customStart || undefined}
                  onChange={e => onCustomEnd(e.target.value)} />
              </div>
              <button className="prim-btn cdr-apply" onClick={() => setOpen(false)}>Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldHeaderFilter({ opts, val, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = val !== "any";
  return (
    <span className={`fh-wrap${active ? " fh-on" : ""}`} ref={ref}>
      <button className={`fh-btn${active ? " fh-active" : ""}`}
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        title={active ? `Filtering: ${val}` : "Filter by field"}>&#9783;</button>
      {active && (
        <button className="fh-clear"
          onClick={e => { e.stopPropagation(); onChange("any"); }}
          title="Clear field filter">&#10005;</button>
      )}
      {open && (
        <ul className="fh-list">
          {opts.map(o => (
            <li key={o.value} className={o.value === val ? "dd-active" : ""}
              onClick={e => { e.stopPropagation(); onChange(o.value); setOpen(false); }}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
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

function IssueActivityApp() {
  const [allRows, setAllRows]   = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [error,   setError]     = React.useState(null);
  const [issueKey, setIssueKey] = React.useState(null);

  const [dateF,       setDateF]       = React.useState("any");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd,   setCustomEnd]   = React.useState("");
  const [userF,    setUserF]    = React.useState("any");
  const [fieldF,   setFieldF]   = React.useState("any");
  const [search,   setSearch]   = React.useState("");
  const [asc,      setAsc]      = React.useState(false);
  const [viewMode, setViewMode] = React.useState("table");

  const [page,      setPage]      = React.useState(1);
  const [pageSize,  setPageSize]  = React.useState(25);
  const loadedAt = React.useRef(null);
  const [lastUpdated, setLastUpdated] = React.useState("");

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
        loadedAt.current = Date.now();
        setPage(1);
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
    if (dateF  !== "any") r = r.filter(x => matchDate(x.ts, dateF, customStart, customEnd));
    if (userF  !== "any") r = r.filter(x => x.author === userF);
    if (fieldF !== "any") r = r.filter(x => x.field  === fieldF);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => (x.author + x.field + x.from + x.to).toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => { const d = new Date(b.ts) - new Date(a.ts); return asc ? -d : d; });
  }, [allRows, dateF, customStart, customEnd, userF, fieldF, search, asc]);

  const hasFilter = dateF !== "any" || userF !== "any" || fieldF !== "any" || search;
  const clearAll  = () => { setDateF("any"); setCustomStart(""); setCustomEnd(""); setUserF("any"); setFieldF("any"); setSearch(""); setPage(1); };

  // "Last updated" ticker
  React.useEffect(() => {
    function tick() {
      if (!loadedAt.current) { setLastUpdated(""); return; }
      const s = Math.floor((Date.now() - loadedAt.current) / 1000);
      if (s < 60)       setLastUpdated(`${s} second${s !== 1 ? "s" : ""} ago`);
      else if (s < 3600) { const m = Math.floor(s / 60); setLastUpdated(`${m} minute${m !== 1 ? "s" : ""} ago`); }
      else               { const h = Math.floor(s / 3600); setLastUpdated(`${h} hour${h !== 1 ? "s" : ""} ago`); }
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [allRows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows  = rows.slice((page - 1) * pageSize, page * pageSize);
  const PAGE_SIZE_OPTS = [{ value: 10, label: "10" }, { value: 25, label: "25" }, { value: 50, label: "50" }, { value: 100, label: "100" }];

  // label shown on the date button when custom range is active
  const dateBtnLabel = React.useMemo(() => {
    if (dateF !== "custom") return DATE_OPTS.find(o => o.value === dateF)?.label || "Any dates";
    const fmt = v => v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
    if (customStart && customEnd) return `${fmt(customStart)} – ${fmt(customEnd)}`;
    if (customStart) return `From ${fmt(customStart)}`;
    if (customEnd)   return `Until ${fmt(customEnd)}`;
    return "Custom range";
  }, [dateF, customStart, customEnd]);

  return (
    <div className="wih">

      <div className="wih-bar">
        <div className="wih-bar-l">
          <div className="vt">
            <button className={`vt-btn${viewMode === "table"  ? " on" : ""}`} onClick={() => setViewMode("table")}  title="Table view">&#9776;</button>
            <button className={`vt-btn${viewMode === "stream" ? " on" : ""}`} onClick={() => setViewMode("stream")} title="Activity stream">&#931;&#931;</button>
            <button className={`vt-btn${viewMode === "dashboard" ? " on" : ""}`} onClick={() => setViewMode("dashboard")} title="Dashboard view">📊</button>
          </div>
          {!loading && <span className="cnt">{rows.length} change{rows.length !== 1 ? "s" : ""}</span>}
          {!loading && hasFilter && <button className="clr-btn" onClick={clearAll}>&#10005; Clear</button>}
          <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
            <span className={loading ? "spin-ico" : ""}>&#8635;</span>
          </button>
        </div>

        <div className="wih-bar-r">
          <DateFilter
            opts={DATE_OPTS}
            val={dateF}
            label={dateBtnLabel}
            onChange={v => { setDateF(v); if (v !== "custom") { setCustomStart(""); setCustomEnd(""); } }}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStart={setCustomStart}
            onCustomEnd={setCustomEnd}
          />
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
                <th className="th-sort" onClick={() => { setAsc(v => !v); setPage(1); }}>
                  Date of change <span className="sort-ico">{asc ? "▲" : "▼"}</span>
                </th>
                <th>Updater</th>
                <th className="th-field-col">Field <FieldHeaderFilter opts={fieldOpts} val={fieldF} onChange={v => { setFieldF(v); setPage(1); }} /></th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, i) => (
                <tr key={i}>
                  <td className="td-date">{fmtDate(r.ts)}</td>
                  <td>
                    <div className="user-cell">
                      <Av name={r.author} />
                      <span>{r.author}</span>
                    </div>
                  </td>
                  <td className="td-field">{r.field || "\u2014"}</td>
                  <td><Changes from={r.from} to={r.to} field={r.field} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && fieldF !== "any" && viewMode === "stream" && (
        <div className="wih-filter-row">
          <span className="field-chip">Field: <strong>{fieldF}</strong>
            <button className="field-chip-x" onClick={() => setFieldF("any")} title="Remove">&#10005;</button>
          </span>
        </div>
      )}

      {!loading && !error && rows.length > 0 && viewMode === "stream" && (
        <div className="stream">
          {pagedRows.map((r, i) => (
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
      {!loading && !error && rows.length > 0 && viewMode === "dashboard" && (
  <AnalyticsDashboard rows={rows} isProject={false} />
)}

      {!loading && !error && rows.length > 0 && (
        <div className="pg-footer">
          <span className="pg-updated">
            {lastUpdated ? `Last updated: ${lastUpdated}` : ""}
          </span>
          <div className="pg-controls">
            <span className="pg-label">Logs per page:</span>
            <DDMenu opts={PAGE_SIZE_OPTS} val={pageSize}
              onChange={v => { setPageSize(Number(v)); setPage(1); }} alignRight />
            <button className="pg-nav" disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}>&#8249;</button>
            <span className="pg-num">{page}</span>
            <button className="pg-nav" disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}>&#8250;</button>
            <input className="pg-jump" type="number" min="1" max={totalPages}
              placeholder={String(totalPages)}
              onKeyDown={e => { if (e.key === "Enter") { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) { setPage(v); e.target.value = ""; } } }} />
            <button className="pg-go"
              onClick={e => { const inp = e.target.previousSibling; const v = parseInt(inp.value); if (v >= 1 && v <= totalPages) { setPage(v); inp.value = ""; } }}>Go&gt;</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Key multi-select filter ────────────────────────────────────────────────
function KeyFilter({ allRows, selected, onChange }) {
  const [open,    setOpen]    = React.useState(false);
  const [draft,   setDraft]   = React.useState(selected); // working copy until Apply
  const [search,  setSearch]  = React.useState("");
  const ref = React.useRef(null);

  // Sync draft when external selected changes (e.g. clear all)
  React.useEffect(() => { setDraft(selected); }, [selected]);

  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Build {key -> count} from ALL rows (unfiltered)
  const keyCounts = React.useMemo(() => {
    const m = {};
    allRows.forEach(r => { m[r.issueKey] = (m[r.issueKey] || 0) + 1; });
    return m;
  }, [allRows]);

  const sortedKeys = React.useMemo(() =>
    Object.keys(keyCounts).sort((a, b) => (keyCounts[b] - keyCounts[a]) || a.localeCompare(b))
  , [keyCounts]);

  const filtered = search.trim()
    ? sortedKeys.filter(k => k.toLowerCase().includes(search.toLowerCase()))
    : sortedKeys;

  const allSelected = draft.length === 0; // empty = "any work item"

  function toggle(key) {
    setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function toggleAll() { setDraft([]); }

  const active = selected.length > 0;

  return (
    <span className={`fh-wrap${active ? " fh-on" : ""}`} ref={ref}>
      <button
        className={`fh-btn${active ? " fh-active" : ""}`}
        title={active ? `Filtering: ${selected.join(", ")}` : "Filter by work item key"}
        onClick={e => { e.stopPropagation(); setDraft(selected); setSearch(""); setOpen(v => !v); }}>
        &#9783;
      </button>
      {active && (
        <button className="fh-clear" title="Clear key filter"
          onClick={e => { e.stopPropagation(); onChange([]); }}>&#10005;</button>
      )}
      {open && (
        <div className="kf-panel" onClick={e => e.stopPropagation()}>
          <div className="kf-search-row">
            <input
              className="kf-search"
              placeholder="Find work item key"
              value={search}
              autoFocus
              onChange={e => setSearch(e.target.value)} />
            <span className="kf-search-ico">&#128269;</span>
          </div>
          <ul className="kf-list">
            <li className={`kf-item${allSelected ? " kf-checked" : ""}`}
              onClick={toggleAll}>
              <span className={`kf-cb${allSelected ? " on" : ""}`}>{allSelected ? "\u2714" : ""}</span>
              <span className="kf-lbl">Any work item</span>
            </li>
            {filtered.map(k => {
              const checked = draft.includes(k);
              return (
                <li key={k} className={`kf-item${checked ? " kf-checked" : ""}`} onClick={() => toggle(k)}>
                  <span className={`kf-cb${checked ? " on" : ""}`}>{checked ? "\u2714" : ""}</span>
                  <span className="kf-lbl">{k}</span>
                  <span className="kf-count">{keyCounts[k]}</span>
                </li>
              );
            })}
          </ul>
          <div className="kf-footer">
            <button className="kf-cancel" onClick={() => { setDraft(selected); setOpen(false); }}>Cancel</button>
            <button className="kf-apply" onClick={() => { onChange(draft); setOpen(false); }}>Apply</button>
          </div>
        </div>
      )}
    </span>
  );
}

// ── Project-level Activity Page ────────────────────────────────────────────
function ProjectActivityApp() {
  const [allRows,     setAllRows]     = React.useState([]);
  const [loading,     setLoading]     = React.useState(true);
  const [error,       setError]       = React.useState(null);
  const [projectKey,  setProjectKey]  = React.useState("");
  const [projectName, setProjectName] = React.useState("");
  const [daysInput,   setDaysInput]   = React.useState("8");
  const [days,        setDays]        = React.useState(8);
  const [userF,  setUserF]  = React.useState("any");
  const [keyF,   setKeyF]   = React.useState([]);   // [] = any
  const [fieldF, setFieldF] = React.useState("any");
  const [search, setSearch] = React.useState("");
  const [asc,    setAsc]    = React.useState(false);
  const [page,     setPage]     = React.useState(1);
  const [pageSize, setPageSize] = React.useState(100);
  const [projView, setProjView] = React.useState("activity"); // "activity" | "deleted"
  const loadedAt = React.useRef(null);
  const [lastUpdated, setLastUpdated] = React.useState("");
  const [exportOpen, setExportOpen] = React.useState(false);
  const exportRef = React.useRef(null);
  const ctxRef    = React.useRef(null);

  React.useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const loadData = React.useCallback(async (daysVal) => {
    try {
      setLoading(true); setError(null);
      if (!ctxRef.current) ctxRef.current = await forgeView.getContext();
      const ctx = ctxRef.current;
      const pkey = ctx?.extension?.project?.key;
      const pname = ctx?.extension?.project?.name || pkey;
      if (pkey) { setProjectKey(pkey); setProjectName(pname); }
      const res = await invoke("fetchProjectHistory", { projectKey: pkey, days: daysVal });
      if (res && res.error && !(res.history || []).length) {
        setError(res.error);
      } else {
        setAllRows(res?.history || []);
        loadedAt.current = Date.now();
        setPage(1);
      }
    } catch (e) {
      setError(e.message || "Failed to load project history");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { loadData(8); }, [loadData]);

  React.useEffect(() => {
    function tick() {
      if (!loadedAt.current) { setLastUpdated(""); return; }
      const s = Math.floor((Date.now() - loadedAt.current) / 1000);
      if (s < 5)       setLastUpdated("now");
      else if (s < 60) setLastUpdated(`${s} seconds ago`);
      else if (s < 3600) { const m = Math.floor(s / 60); setLastUpdated(`${m} minute${m !== 1 ? "s" : ""} ago`); }
      else { const hr = Math.floor(s / 3600); setLastUpdated(`${hr} hour${hr !== 1 ? "s" : ""} ago`); }
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [allRows]);

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
    if (userF  !== "any")  r = r.filter(x => x.author === userF);
    if (keyF.length > 0)   r = r.filter(x => keyF.includes(x.issueKey));
    if (fieldF !== "any")  r = r.filter(x => x.field  === fieldF);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => (x.author + x.issueKey + x.summary + x.field + x.from + x.to).toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => { const d = new Date(b.timestamp) - new Date(a.timestamp); return asc ? -d : d; });
  }, [allRows, userF, keyF, fieldF, search, asc]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows  = rows.slice((page - 1) * pageSize, page * pageSize);
  const PAGE_SIZE_OPTS = [{ value: 25, label: "25" }, { value: 50, label: "50" }, { value: 100, label: "100" }];

  function applyDays() {
    const v = parseInt(daysInput);
    if (!isNaN(v) && v > 0) { setDays(v); loadData(v); }
    else setDaysInput(String(days));
  }

  function doExportCSV() {
    const h = ["Date", "Key", "Summary", "Author", "Field", "From", "To"];
    const q = v => `"${String(v || "").replace(/"/g, '""')}"`;
    const csv = [h, ...rows.map(r => [fmtDate(r.timestamp), r.issueKey, r.summary, r.author, r.field, r.from, r.to])]
      .map(row => row.map(q).join(",")).join("\r\n");
    dlBlob(`${projectKey || "project"}-history.csv`, "text/csv;charset=utf-8;", "\uFEFF" + csv);
  }
  function doExportXLS() {
    const h = ["Date", "Key", "Summary", "Author", "Field", "From", "To"];
    const x = v => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<html><head><meta charset="UTF-8"></head><body><table border="1"><thead><tr>${h.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${[fmtDate(r.timestamp), r.issueKey, r.summary, r.author, r.field, r.from, r.to].map(v => `<td>${x(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    dlBlob(`${projectKey || "project"}-history.xls`, "application/vnd.ms-excel", html);
  }

  return (
    <div className="wih proj-page">
      <h2 className="proj-title">
        User activities for space &ldquo;{projectName || projectKey}{projectKey ? ` (${projectKey})` : ""}&rdquo;
      </h2>

      {/* ── Top-level view tabs ── */}
      <div className="proj-tabs">
        <button
          className={`proj-tab${projView === "activity" ? " proj-tab-on" : ""}`}
          onClick={() => setProjView("activity")}>
          &#9776; Activity
        </button>
        <button
          className={`proj-tab${projView === "deleted" ? " proj-tab-on" : ""}`}
          onClick={() => setProjView("deleted")}>
          🗑️ Deleted Issues
        </button>
      </div>

      {/* ── Deleted Issues view ── */}
      {projView === "deleted" && (
        <DeletedIssues projectKey={projectKey} />
      )}

      {/* ── Activity view ── */}
      {projView === "activity" && (<>
      <div className="proj-bar">
        <div className="proj-bar-l">
          {!loading && <span className="cnt">{rows.length} change{rows.length !== 1 ? "s" : ""}</span>}
          <button className="icon-btn" onClick={() => loadData(days)} disabled={loading} title="Refresh">
            <span className={loading ? "spin-ico" : ""}>&#8635;</span>
          </button>
          <DDMenu label="Updated by: " opts={userOpts} val={userF}
            onChange={v => { setUserF(v); setPage(1); }} />
          <span className="days-wrap">
            Within the last:
            <input className="days-inp" type="number" min="1" max="365"
              value={daysInput}
              onChange={e => setDaysInput(e.target.value)}
              onBlur={applyDays}
              onKeyDown={e => { if (e.key === "Enter") applyDays(); }} />
            days
          </span>
        </div>
        <div className="proj-bar-r">
          <div className="srch">
            <span className="srch-ico">&#128269;</span>
            <input className="srch-inp" placeholder="Search..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <div className="dd-wrap" ref={exportRef}>
            <button className="icon-btn" title="Export" onClick={() => setExportOpen(v => !v)}>
              &#11015; Export &#9660;
            </button>
            {exportOpen && (
              <ul className="dd-list align-r">
                <li onClick={() => { doExportXLS(); setExportOpen(false); }}>&#128202; Excel</li>
                <li onClick={() => { doExportCSV(); setExportOpen(false); }}>&#128196; CSV</li>
              </ul>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner"></div>
          <p>Loading project activities...</p>
        </div>
      )}
      {!loading && error && (
        <div className="err-box">
          <strong>Error loading activities</strong>
          <p>{error}</p>
          <button className="prim-btn" onClick={() => loadData(days)}>Retry</button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <div className="state-box">
          <div className="empty-ico">&#128203;</div>
          <p className="empty-title">No activities found</p>
          <p className="empty-sub">Try increasing the days range or changing filters.</p>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="th-sort" onClick={() => { setAsc(v => !v); setPage(1); }}>
                  Date of change <span className="sort-ico">{asc ? "▲" : "▼"}</span>
                </th>
                <th className="th-field-col">Key
                  <KeyFilter allRows={allRows} selected={keyF}
                    onChange={v => { setKeyF(v); setPage(1); }} />
                </th>
                <th>Summary</th>
                <th>Updater</th>
                <th className="th-field-col">Field
                  <FieldHeaderFilter opts={fieldOpts} val={fieldF}
                    onChange={v => { setFieldF(v); setPage(1); }} />
                </th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, i) => (
                <tr key={i}>
                  <td className="td-date">{fmtDate(r.timestamp)}</td>
                  <td>
                    <a className="key-link"
                      href={`/browse/${r.issueKey}`}
                      target="_blank" rel="noreferrer">{r.issueKey}</a>
                  </td>
                  <td className="td-summary">{r.summary}</td>
                  <td>
                    <div className="user-cell">
                      <Av name={r.author} />
                      <span>{r.author}</span>
                    </div>
                  </td>
                  <td className="td-field">{r.field || "—"}</td>
                  <td><Changes from={r.from} to={r.to} field={r.field} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="pg-footer">
          <span className="pg-updated">{lastUpdated ? `Last updated: ${lastUpdated}` : ""}</span>
          <div className="pg-controls">
            <span className="pg-label">Logs per page:</span>
            <DDMenu opts={PAGE_SIZE_OPTS} val={pageSize}
              onChange={v => { setPageSize(Number(v)); setPage(1); }} alignRight />
            <button className="pg-nav" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>&#8249;</button>
            <span className="pg-num">{page}</span>
            <button className="pg-nav" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>&#8250;</button>
            <input className="pg-jump" type="number" min="1" max={totalPages} placeholder={String(totalPages)}
              onKeyDown={e => { if (e.key === "Enter") { const v = parseInt(e.target.value); if (v >= 1 && v <= totalPages) { setPage(v); e.target.value = ""; } } }} />
            <button className="pg-go"
              onClick={e => { const inp = e.target.previousSibling; const v = parseInt(inp.value); if (v >= 1 && v <= totalPages) { setPage(v); inp.value = ""; } }}>Go&gt;</button>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ── Context switcher (root component) ───────────────────────────────────────
function App() {
  const [mode, setMode] = React.useState(null);
  React.useEffect(() => {
    forgeView.getContext()
      .then(ctx => {
        if (ctx && ctx.extension && ctx.extension.project && !ctx.extension.issue) {
          setMode("project");
        } else {
          setMode("issue");
        }
      })
      .catch(() => setMode("issue"));
  }, []);
  if (mode === "project") return <ProjectActivityApp />;
  if (mode === "issue")   return <IssueActivityApp />;
  return <div className="wih"><div className="state-box"><div className="spinner"></div></div></div>;
}

export default App;
