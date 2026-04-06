import AnalyticsDashboard from "./components/AnalyticsDashboard";
import { DynamicStatusChart } from "./components/Charts";
import DashboardGadget from "./components/DashboardGadget";
import DeletedIssues from "./components/DeletedIssues";
import SavedReports from "./components/SavedReports";
import AppPermissions from "./components/AppPermissions";
import SecurityScanner from "./components/SecurityScanner";
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
    // Comment-type entries (added / edited)
    if (h.type === "comment") {
      const it = (h.items || [])[0] || {};
      rows.push({
        ts: h.timestamp, author,
        field: "comment",
        from: it.fromString || "",
        to: it.toString || "Comment added",
        type: "comment",
        commentBody: h.commentBody || "",
      });
      return;
    }
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
function rowId(r) { return `${r.ts}|${r.author}|${r.field}|${r.from}|${r.to}`; }

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

function Changes({ from, to, field, commentBody }) {
  // Special rendering for comment field
  if ((field || "").toLowerCase() === "comment") {
    const isEdit = (from || "").toLowerCase() === "edited";
    const text = commentBody || to || "";
    return (
      <span className="comment-change">
        <span className={`comment-badge ${isEdit ? "comment-edited" : "comment-added"}`}>
          {isEdit ? "✏ Edited" : "💬 Added"}
        </span>
        {text && (
          <span className="comment-preview">
            {text.length > 120 ? text.slice(0, 120) + "…" : text}
          </span>
        )}
      </span>
    );
  }
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
  const x = v => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const STATUS_COLORS = {
    "done":"#E3FCEF","closed":"#E3FCEF","resolved":"#E3FCEF",
    "inprogress":"#DEEBFF","in progress":"#DEEBFF",
    "todo":"#F4F5F7","to do":"#F4F5F7",
    "blocked":"#FFEBE6",
  };
  const PRI_COLORS = { highest:"#FFEBE6", high:"#FFEBE6", critical:"#FFEBE6", medium:"#FFFAE6", low:"#E3FCEF", lowest:"#E3FCEF" };
  function fieldBg(field, from, to) {
    if ((field||"").toLowerCase() === "status") return STATUS_COLORS[(to||"").toLowerCase()] || "#FFFFFF";
    if ((field||"").toLowerCase() === "priority") return PRI_COLORS[(to||"").toLowerCase()] || "#FFFFFF";
    if ((field||"").toLowerCase() === "comment") return "#EAE6FF";
    return "#FFFFFF";
  }
  // Summary stats for a second sheet
  const userMap = {}, fieldMap = {};
  rows.forEach(r => {
    userMap[r.author] = (userMap[r.author] || 0) + 1;
    if (r.field) fieldMap[r.field] = (fieldMap[r.field] || 0) + 1;
  });
  const topUsers  = Object.entries(userMap).sort((a,b)=>b[1]-a[1]).slice(0, 10);
  const topFields = Object.entries(fieldMap).sort((a,b)=>b[1]-a[1]).slice(0, 10);

  const detailRows = rows.map(r => {
    const bg = fieldBg(r.field, r.from, r.to);
    return `<tr style="background:${bg}">${[fmtDate(r.ts||r.timestamp), r.author, r.field, r.from, r.to].map(v => `<td style="border:1px solid #DFE1E6;padding:5px 8px">${x(v)}</td>`).join("")}</tr>`;
  }).join("");

  const summaryRows = [
    ...topUsers.map(([u,c]) => `<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">User Activity</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(u)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c} changes</td></tr>`),
    ...topFields.map(([f,c]) => `<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">Field</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(f)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c} times</td></tr>`),
  ].join("");

  const HEADER_STYLE = "background:#0052CC;color:#ffffff;font-weight:bold;padding:7px 10px;border:1px solid #0052CC;font-size:12px";
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>Change History</x:Name><x:WorksheetOptions><x:Selected/></x:WorksheetOptions></x:ExcelWorksheet>
  <x:ExcelWorksheet><x:Name>Summary</x:Name></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11px}
  table{border-collapse:collapse;margin-bottom:24px}
  .sheet-title{font-size:14px;font-weight:bold;color:#172B4D;margin:12px 0 6px 0}
</style></head>
<body>
<p class="sheet-title">&#128202; ${x(key || "Issue")} — Change History (${rows.length} records)</p>
<table>
  <thead><tr>
    <th style="${HEADER_STYLE};width:130px">Date of Change</th>
    <th style="${HEADER_STYLE};width:120px">Updated By</th>
    <th style="${HEADER_STYLE};width:100px">Field</th>
    <th style="${HEADER_STYLE};width:160px">From</th>
    <th style="${HEADER_STYLE};width:160px">To</th>
  </tr></thead>
  <tbody>${detailRows}</tbody>
</table>
<p class="sheet-title">&#128200; Summary — Top Contributors &amp; Changed Fields</p>
<table>
  <thead><tr>
    <th style="${HEADER_STYLE};width:120px">Category</th>
    <th style="${HEADER_STYLE};width:180px">Name</th>
    <th style="${HEADER_STYLE};width:100px">Count</th>
  </tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
</body></html>`;
  dlBlob(`${key || "history"}-advanced.xls`, "application/vnd.ms-excel", html);
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

function DateFilter({ opts, val, label, onChange, customStart, customEnd, onCustomStart, onCustomEnd, onOpenChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const setOpenAndNotify = React.useCallback((v) => {
    setOpen(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      if (onOpenChange) onOpenChange(next);
      return next;
    });
  }, [onOpenChange]);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpenAndNotify(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [setOpenAndNotify]);
  return (
    <div className="dd-wrap" ref={ref}>
      <button className="dd-btn" onClick={() => setOpenAndNotify(v => !v)}>
        <span className="dd-prefix">Date: </span>
        <span>{label}</span>
        <span className="dd-arrow">&#9660;</span>
      </button>
      {open && (
        <div className="dd-list cdr-panel">
          {opts.map(o => (
            <div key={o.value}
              className={"dd-list-item" + (o.value === val ? " dd-active" : "") + (o.value === "custom" ? " dd-custom-trigger" : "")}
              onClick={() => { onChange(o.value); if (o.value !== "custom") setOpenAndNotify(false); }}>
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
              <button className="prim-btn cdr-apply" onClick={() => setOpenAndNotify(false)}>Apply</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldHeaderFilter({ opts, val, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = val !== "any";
  const visibleOpts = search.trim()
    ? opts.filter(o => o.value === "any" || o.label.toLowerCase().includes(search.toLowerCase()))
    : opts;
  return (
    <span className={`fh-wrap${active ? " fh-on" : ""}`} ref={ref}>
      <button className={`fh-btn${active ? " fh-active" : ""}`}
        onClick={e => { e.stopPropagation(); setOpen(v => !v); setSearch(""); }}
        title={active ? `Filtering: ${val}` : "Filter by field"}>&#9783;</button>
      {active && (
        <button className="fh-clear"
          onClick={e => { e.stopPropagation(); onChange("any"); }}
          title="Clear field filter">&#10005;</button>
      )}
      {open && (
        <ul className="fh-list">
          {opts.length > 8 && (
            <li className="fh-search-item" onClick={e => e.stopPropagation()}>
              <input
                className="fh-search-inp"
                placeholder="Search fields..."
                value={search}
                autoFocus
                onChange={e => setSearch(e.target.value)}
              />
            </li>
          )}
          {visibleOpts.map(o => (
            <li key={o.value} className={o.value === val ? "dd-active" : ""}
              onClick={e => { e.stopPropagation(); onChange(o.value); setOpen(false); setSearch(""); }}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

function DDMenu({ label, opts, val, onChange, alignRight, searchable }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const sel = opts.find(o => o.value === val);
  const visibleOpts = searchable
    ? search.trim()
      ? opts.filter(o => o.value === "any" || o.label.toLowerCase().includes(search.toLowerCase()))
      : opts.filter(o => o.value === "any")
    : opts;
  return (
    <div className="dd-wrap" ref={ref}>
      <button className="dd-btn" onClick={() => { setOpen(v => !v); setSearch(""); }}>
        {label && <span className="dd-prefix">{label}</span>}
        <span>{sel ? sel.label : val}</span>
        <span className="dd-arrow">&#9660;</span>
      </button>
      {open && (
        <ul className={`dd-list${alignRight ? " align-r" : ""}`}>
          {searchable && (
            <li className="dd-search-item" onClick={e => e.stopPropagation()}>
              <input
                className="dd-search-inp"
                placeholder="Search users..."
                value={search}
                autoFocus
                onChange={e => setSearch(e.target.value)}
              />
            </li>
          )}
          {visibleOpts.map(o => (
            <li key={o.value} className={o.value === val ? "dd-active" : ""}
              onClick={() => { onChange(o.value); setOpen(false); setSearch(""); }}>
              {o.label}
            </li>
          ))}
          {searchable && search.trim() && visibleOpts.filter(o => o.value !== "any").length === 0 && (
            <li className="dd-no-results">No users found for "{search}"</li>
          )}
          {searchable && !search.trim() && (
            <li className="dd-hint">Type to search for a user</li>
          )}
        </ul>
      )}
    </div>
  );
}

function IssueActivityApp() {
  const [allRows, setAllRows]   = React.useState([]);
  const [allJiraFields, setAllJiraFields] = React.useState([]);
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
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  const [exportOpen, setExportOpen] = React.useState(false);
  const exportRef = React.useRef(null);

  React.useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const [selectedIds,     setSelectedIds]     = React.useState(new Set());
  const [showRevertModal, setShowRevertModal] = React.useState(false);
  const [reverting,       setReverting]       = React.useState(false);
  const [revertResults,   setRevertResults]   = React.useState(null);

  const [perms,   setPerms]   = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false);

  // Fetch export permission whenever we know the issue key
  React.useEffect(() => {
    if (!issueKey) return;
    const projectKey = issueKey.split('-')[0];
    invoke("getAppPermissions", { projectKey })
      .then(res => {
        setIsAdmin(res?.isAdmin || false);
        setPerms(res?.settings || { viewHistory: 'all', viewDeleted: 'all', exportHistory: 'all' });
      })
      .catch(() => setPerms({ viewHistory: 'all', viewDeleted: 'all', exportHistory: 'all' }));
  }, [issueKey]);

  const canExport      = !perms || isAdmin || perms.exportHistory !== 'admins_only';
  const canViewHistory = !perms || isAdmin || perms.viewHistory   !== 'admins_only';

  const load = React.useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const ctx = await forgeView.getContext();
      const key = ctx && ctx.extension && ctx.extension.issue && ctx.extension.issue.key;
      if (key) setIssueKey(key);
      // Fetch history and all available Jira fields in parallel
      const [res, fieldsRes] = await Promise.all([
        invoke("fetchHistory", { issueKey: key }),
        invoke("fetchIssueFields", { issueKey: key }).catch(() => ({ fields: [] })),
      ]);
      if (res && res.error && !(res.history || []).length) {
        setError(res.error);
      } else {
        setAllRows(flatten(res && res.history ? res.history : []));
        loadedAt.current = Date.now();
        setPage(1);
      }
      setAllJiraFields(fieldsRes?.fields || []);
    } catch (e) {
      setError(e.message || "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // ── Restore all filters from a saved report ──────────────────────────
  function handleLoadReport(report) {
    const f = report.filters || {};
    if (f.dateF       !== undefined) setDateF(f.dateF);
    if (f.customStart !== undefined) setCustomStart(f.customStart);
    if (f.customEnd   !== undefined) setCustomEnd(f.customEnd);
    if (f.userF       !== undefined) setUserF(f.userF);
    if (f.fieldF      !== undefined) setFieldF(f.fieldF);
    if (f.search      !== undefined) setSearch(f.search);
    if (f.asc         !== undefined) setAsc(f.asc);
    if (f.viewMode    !== undefined) setViewMode(f.viewMode);
    setPage(1);
  }

  // ── Current filter snapshot for saving ───────────────────────────────
  const currentFilters = { dateF, customStart, customEnd, userF, fieldF, search, asc, viewMode };

  const userOpts = React.useMemo(() => {
    const s = new Set(allRows.map(r => r.author).filter(Boolean));
    return [{ value: "any", label: "Any User" }, ...Array.from(s).sort().map(a => ({ value: a, label: a }))];
  }, [allRows]);

  const fieldOpts = React.useMemo(() => {
    // Fields that appear in history (exact names, used for filter matching)
    const historyFields = new Set(allRows.map(r => r.field).filter(Boolean));
    // Lowercase lookup to prevent case-duplicate entries
    const lowerSeen = new Set(Array.from(historyFields).map(f => f.toLowerCase()));
    // Merge in every field from the Jira API not already covered by history
    const merged = new Set(historyFields);
    allJiraFields.forEach(f => {
      if (f.name && !lowerSeen.has(f.name.toLowerCase())) {
        merged.add(f.name);
        lowerSeen.add(f.name.toLowerCase());
      }
    });
    return [
      { value: "any", label: "All Fields" },
      ...Array.from(merged).sort((a, b) => a.localeCompare(b)).map(f => ({ value: f, label: f })),
    ];
  }, [allRows, allJiraFields]);

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
  const clearAll  = () => { setDateF("any"); setCustomStart(""); setCustomEnd(""); setUserF("any"); setFieldF("any"); setSearch(""); setSelectedIds(new Set()); setPage(1); };

  const selectedChanges = React.useMemo(
    () => rows.filter(r => selectedIds.has(rowId(r))),
    [rows, selectedIds]
  );

  async function handleBulkRevert() {
    if (!selectedChanges.length || reverting) return;
    setReverting(true);
    setRevertResults(null);
    try {
      const res = await invoke("revertChanges", { issueKey, changes: selectedChanges });
      const results = res.results || [];
      setRevertResults(results);
      if (results.length > 0 && results.every(r => r.success)) {
        setTimeout(() => {
          setShowRevertModal(false);
          setRevertResults(null);
          setSelectedIds(new Set());
          load();
        }, 1200);
      }
    } catch (e) {
      setRevertResults([{ field: "All", success: false, error: e.message || "Revert failed" }]);
    } finally {
      setReverting(false);
    }
  }

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
            onOpenChange={setDatePickerOpen}
          />
          <DDMenu label="Updated by: " opts={userOpts} val={userF} onChange={setUserF} searchable />

          <div className="srch">
            <span className="srch-ico">&#128269;</span>
            <input className="srch-inp" placeholder="Search..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>

          {canExport && (
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
          )}
          <SavedReports
            currentFilters={currentFilters}
            viewType={viewMode}
            onLoad={handleLoadReport}
          />
        </div>
      </div>

      {perms !== null && !canViewHistory && (
        <div className="perm-denied">
          <div className="perm-denied-ico">&#128274;</div>
          <p className="perm-denied-title">Access Restricted</p>
          <p className="perm-denied-sub">View Issue History is limited to project admins for this project.</p>
        </div>
      )}

      {(perms === null || canViewHistory) && loading && (
        <div className="state-box">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      )}

      {(perms === null || canViewHistory) && !loading && error && (
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

      {(perms === null || canViewHistory) && !loading && !error && rows.length > 0 && viewMode === "table" && (<>
        {selectedIds.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-bar-info">
              {selectedIds.size} row{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button className="bulk-revert-btn" onClick={() => { setRevertResults(null); setShowRevertModal(true); }}>
              &#8633; Revert Selected
            </button>
            <button className="clr-btn" onClick={() => setSelectedIds(new Set())}>&#10005; Clear</button>
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="th-cb">
                  <input
                    type="checkbox"
                    title="Select / deselect this page"
                    checked={pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(rowId(r)))}
                    ref={el => { if (el) el.indeterminate = pagedRows.some(r => selectedIds.has(rowId(r))) && !pagedRows.every(r => selectedIds.has(rowId(r))); }}
                    onChange={e => {
                      const next = new Set(selectedIds);
                      pagedRows.forEach(r => { e.target.checked ? next.add(rowId(r)) : next.delete(rowId(r)); });
                      setSelectedIds(next);
                    }}
                  />
                </th>
                <th className="th-sort" onClick={() => { setAsc(v => !v); setPage(1); }}>
                  Date of change <span className="sort-ico">{asc ? "▲" : "▼"}</span>
                </th>
                <th>Updater</th>
                <th className="th-field-col">Field <FieldHeaderFilter opts={fieldOpts} val={fieldF} onChange={v => { setFieldF(v); setPage(1); }} /></th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, i) => {
                const id = rowId(r);
                const checked = selectedIds.has(id);
                return (
                  <tr key={i} className={checked ? "tr-selected" : ""}>
                    <td className="td-cb">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next = new Set(selectedIds);
                          e.target.checked ? next.add(id) : next.delete(id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
                    <td className="td-date">{fmtDate(r.ts)}</td>
                    <td>
                      <div className="user-cell">
                        <Av name={r.author} />
                        <span>{r.author}</span>
                      </div>
                    </td>
                    <td className="td-field">{r.field || "\u2014"}</td>
                    <td><Changes from={r.from} to={r.to} field={r.field} commentBody={r.commentBody} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {(perms === null || canViewHistory) && !loading && !error && fieldF !== "any" && viewMode === "stream" && (
        <div className="wih-filter-row">
          <span className="field-chip">Field: <strong>{fieldF}</strong>
            <button className="field-chip-x" onClick={() => setFieldF("any")} title="Remove">&#10005;</button>
          </span>
        </div>
      )}

      {(perms === null || canViewHistory) && !loading && !error && rows.length > 0 && viewMode === "stream" && (
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
                {(r.from || r.to || r.commentBody) && (
                  <div className="s-change">
                    <Changes from={r.from} to={r.to} field={r.field} commentBody={r.commentBody} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {(perms === null || canViewHistory) && !loading && !error && rows.length > 0 && viewMode === "dashboard" && (
  <AnalyticsDashboard rows={rows} isProject={false} />
)}

      {(perms === null || canViewHistory) && !loading && !error && rows.length > 0 && (
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
      {/* Bulk Revert Confirmation Modal */}
      {showRevertModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowRevertModal(false); setRevertResults(null); } }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">&#8633; Revert {selectedChanges.length} Change{selectedChanges.length !== 1 ? "s" : ""}</span>
              <button className="modal-close" onClick={() => { setShowRevertModal(false); setRevertResults(null); }}>&#10005;</button>
            </div>
            <div className="modal-body">
              {!revertResults ? (
                <>
                  <ul className="revert-list">
                    {selectedChanges.map((r, i) => (
                      <li key={i} className="revert-list-item">
                        <span className="revert-field-name">{r.field || "\u2014"}</span>
                        <Changes from={r.to} to={r.from} field={r.field} commentBody={r.commentBody} />
                      </li>
                    ))}
                  </ul>
                  <p className="revert-warning">
                    &#9888; This will attempt to set each selected field back to its <strong>previous value</strong> on <strong>{issueKey}</strong>. The action uses your Jira credentials and cannot be undone automatically.
                  </p>
                </>
              ) : (
                <ul className="revert-list">
                  {revertResults.map((r, i) => (
                    <li key={i} className="revert-list-item">
                      <span className="revert-field-name">{r.field || "\u2014"}</span>
                      {r.success
                        ? <span className="revert-result-ok">&#10004; Reverted successfully</span>
                        : <span className="revert-result-err">&#10008; {r.error || "Failed"}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button className="ghost-btn" onClick={() => { setShowRevertModal(false); setRevertResults(null); }}>
                {revertResults ? "Close" : "Cancel"}
              </button>
              {!revertResults && (
                <button className="prim-btn" onClick={handleBulkRevert} disabled={reverting}>
                  {reverting ? "Reverting\u2026" : "Confirm Revert"}
                </button>
              )}
              {revertResults && revertResults.some(r => r.success) && (
                <button className="prim-btn" onClick={() => { setShowRevertModal(false); setRevertResults(null); setSelectedIds(new Set()); load(); }}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* spacer so the date dropdown is never clipped by a short iframe */}
      {datePickerOpen && <div aria-hidden="true" className="date-picker-spacer" />}
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
  const [userF,     setUserF]     = React.useState("any");
  const [keyF,      setKeyF]      = React.useState([]);   // [] = any
  const [fieldF,    setFieldF]    = React.useState("any");
  const [assigneeF, setAssigneeF] = React.useState("any");
  const [sprintF,   setSprintF]   = React.useState("any");
  const [savedFilters,    setSavedFilters]    = React.useState([]);
  const [savedFilterId,   setSavedFilterId]   = React.useState("");   // selected Jira filter id
  const [showFilterMenu,  setShowFilterMenu]  = React.useState(false);
  const filterMenuRef = React.useRef(null);
  const [search, setSearch] = React.useState("");
  const [asc,    setAsc]    = React.useState(false);
  const [page,     setPage]     = React.useState(1);
  const [pageSize, setPageSize] = React.useState(100);
  const [projView, setProjView] = React.useState("activity"); // "activity" | "deleted" | "settings"
  const loadedAt = React.useRef(null);
  const [lastUpdated, setLastUpdated] = React.useState("");
  const [exportOpen, setExportOpen] = React.useState(false);
  const exportRef = React.useRef(null);
  const ctxRef    = React.useRef(null);
  const [perms,   setPerms]   = React.useState(null); // null = not yet loaded
  const [isAdmin, setIsAdmin] = React.useState(false);

  const [selectedIds,     setSelectedIds]     = React.useState(new Set());
  const [showRevertModal, setShowRevertModal] = React.useState(false);
  const [reverting,       setReverting]       = React.useState(false);
  const [revertResults,   setRevertResults]   = React.useState(null);

  React.useEffect(() => {
    const h = e => {
      if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false);
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setShowFilterMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Load saved Jira filters once the project key is known
  React.useEffect(() => {
    if (!projectKey) return;
    invoke("fetchProjectSavedFilters", { projectKey })
      .then(r => setSavedFilters(r.filters || []))
      .catch(() => {});
  }, [projectKey]);

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

  // Fetch saved permissions whenever the projectKey becomes known
  React.useEffect(() => {
    if (!projectKey) return;
    invoke("getAppPermissions", { projectKey })
      .then(res => {
        setIsAdmin(res?.isAdmin || false);
        setPerms(res?.settings || { viewHistory: 'all', viewDeleted: 'all', exportHistory: 'all' });
      })
      .catch(() => setPerms({ viewHistory: 'all', viewDeleted: 'all', exportHistory: 'all' }));
  }, [projectKey]);

  // If user is on a tab they no longer have access to, redirect to Activity
  React.useEffect(() => {
    if (!perms) return;
    if (projView === "deleted" && !isAdmin && perms.viewDeleted === 'admins_only') {
      setProjView("activity");
    }
  }, [perms, isAdmin, projView]);

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

  const assigneeOpts = React.useMemo(() => {
    const s = new Set(allRows.map(r => r.assignee).filter(Boolean));
    return [{ value: "any", label: "Any Assignee" }, ...Array.from(s).sort().map(a => ({ value: a, label: a }))];
  }, [allRows]);

  const sprintOpts = React.useMemo(() => {
    const s = new Set(allRows.map(r => r.sprint).filter(Boolean));
    return [{ value: "any", label: "Any Sprint" }, ...Array.from(s).sort().map(sp => ({ value: sp, label: sp }))];
  }, [allRows]);

  const rows = React.useMemo(() => {
    let r = allRows;
    if (userF     !== "any") r = r.filter(x => x.author   === userF);
    if (keyF.length > 0)    r = r.filter(x => keyF.includes(x.issueKey));
    if (fieldF    !== "any") r = r.filter(x => x.field    === fieldF);
    if (assigneeF !== "any") r = r.filter(x => x.assignee === assigneeF);
    if (sprintF   !== "any") r = r.filter(x => x.sprint   === sprintF);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => (x.author + x.issueKey + x.summary + x.field + x.from + x.to).toLowerCase().includes(q));
    }
    // Filter by saved Jira filter: narrow to issue keys that the filter's JQL would match.
    // We use the filter's JQL text to check issue keys contained in allRows.
    if (savedFilterId) {
      const filterObj = savedFilters.find(f => f.id === savedFilterId);
      if (filterObj && filterObj.jql) {
        // Build set of issue keys in allRows that match this filter's project scope heuristically.
        // For a client-side approximation: extract project= references from JQL and narrow keys.
        const jqlUp = filterObj.jql.toUpperCase();
        const projMatch = jqlUp.match(/PROJECT\s*=\s*"?([A-Z0-9]+)"?/);
        if (projMatch) {
          const projPrefix = projMatch[1].toUpperCase() + "-";
          r = r.filter(x => (x.issueKey || "").toUpperCase().startsWith(projPrefix));
        }
      }
    }
    return [...r].sort((a, b) => { const d = new Date(b.timestamp) - new Date(a.timestamp); return asc ? -d : d; });
  }, [allRows, userF, keyF, fieldF, assigneeF, sprintF, savedFilterId, savedFilters, search, asc]);

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
    const x = v => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const STATUS_COLORS = { "done":"#E3FCEF","closed":"#E3FCEF","resolved":"#E3FCEF","inprogress":"#DEEBFF","in progress":"#DEEBFF","todo":"#F4F5F7","to do":"#F4F5F7","blocked":"#FFEBE6" };
    const PRI_COLORS = { highest:"#FFEBE6",high:"#FFEBE6",critical:"#FFEBE6",medium:"#FFFAE6",low:"#E3FCEF",lowest:"#E3FCEF" };
    // Build user/key/sprint summary stats
    const userMap={}, keyMap={}, sprintMap={};
    rows.forEach(r => {
      userMap[r.author] = (userMap[r.author]||0)+1;
      keyMap[r.issueKey] = (keyMap[r.issueKey]||0)+1;
      if (r.sprint) sprintMap[r.sprint] = (sprintMap[r.sprint]||0)+1;
    });
    const topUsers   = Object.entries(userMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topIssues  = Object.entries(keyMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topSprints = Object.entries(sprintMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const HEADER_STYLE = "background:#0052CC;color:#ffffff;font-weight:bold;padding:7px 10px;border:1px solid #0052CC;font-size:12px";
    const detailRows = rows.map(r => {
      const fieldLow = (r.field||"").toLowerCase();
      let bg = "#FFFFFF";
      if (fieldLow === "status")   bg = STATUS_COLORS[(r.to||"").toLowerCase()] || "#FFFFFF";
      if (fieldLow === "priority") bg = PRI_COLORS[(r.to||"").toLowerCase()] || "#FFFFFF";
      if (fieldLow === "comment")  bg = "#EAE6FF";
      return `<tr style="background:${bg}">${[fmtDate(r.timestamp),r.issueKey,r.summary,r.author,r.field,r.from,r.to].map(v=>`<td style="border:1px solid #DFE1E6;padding:5px 8px">${x(v)}</td>`).join("")}</tr>`;
    }).join("");
    const summaryRows = [
      ...topUsers.map(([u,c]) => `<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">User</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(u)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c}</td></tr>`),
      ...topIssues.map(([k,c]) => `<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">Issue</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(k)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c}</td></tr>`),
      ...topSprints.map(([s,c]) => `<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">Sprint</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(s)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c}</td></tr>`),
    ].join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>Activity</x:Name><x:WorksheetOptions><x:Selected/></x:WorksheetOptions></x:ExcelWorksheet>
  <x:ExcelWorksheet><x:Name>Summary</x:Name></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11px}table{border-collapse:collapse;margin-bottom:24px}.sheet-title{font-size:14px;font-weight:bold;color:#172B4D;margin:12px 0 6px}</style></head>
<body>
<p class="sheet-title">&#128202; ${x(projectKey||"Project")} — Activity Report (${rows.length} changes)</p>
<table>
  <thead><tr>
    <th style="${HEADER_STYLE};width:130px">Date</th><th style="${HEADER_STYLE};width:70px">Key</th>
    <th style="${HEADER_STYLE};width:160px">Summary</th><th style="${HEADER_STYLE};width:120px">Author</th>
    <th style="${HEADER_STYLE};width:100px">Field</th><th style="${HEADER_STYLE};width:130px">From</th>
    <th style="${HEADER_STYLE};width:130px">To</th>
  </tr></thead><tbody>${detailRows}</tbody>
</table>
<p class="sheet-title">&#128200; Summary</p>
<table>
  <thead><tr><th style="${HEADER_STYLE};width:80px">Category</th><th style="${HEADER_STYLE};width:180px">Name</th><th style="${HEADER_STYLE};width:80px">Changes</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
</body></html>`;
    dlBlob(`${projectKey||"project"}-advanced.xls`, "application/vnd.ms-excel", html);
  }

  // ── Permission enforcement flags (null perms = not yet loaded → default allow) ──
  const canViewHistory = !perms || isAdmin || perms.viewHistory  !== 'admins_only';
  const canViewDeleted = !perms || isAdmin || perms.viewDeleted  !== 'admins_only';
  const canExport      = !perms || isAdmin || perms.exportHistory !== 'admins_only';

  const projRowId = r => `${r.timestamp}|${r.author}|${r.issueKey}|${r.field}|${r.from}|${r.to}`;

  const selectedChanges = React.useMemo(
    () => rows.filter(r => selectedIds.has(projRowId(r))),
    [rows, selectedIds]
  );

  async function handleBulkRevert() {
    if (!selectedChanges.length || reverting) return;
    setReverting(true); setRevertResults(null);
    try {
      const byKey = {};
      selectedChanges.forEach(r => {
        if (!byKey[r.issueKey]) byKey[r.issueKey] = [];
        byKey[r.issueKey].push(r);
      });
      const allResults = [];
      await Promise.all(
        Object.entries(byKey).map(async ([key, changes]) => {
          try {
            const res = await invoke("revertChanges", { issueKey: key, changes });
            (res.results || []).forEach(result => allResults.push({ ...result, issueKey: key }));
          } catch (e) {
            changes.forEach(c => allResults.push({ field: c.field, issueKey: key, success: false, error: e.message || "Revert failed" }));
          }
        })
      );
      setRevertResults(allResults);
      if (allResults.length > 0 && allResults.every(r => r.success)) {
        setTimeout(() => {
          setShowRevertModal(false); setRevertResults(null); setSelectedIds(new Set());
          loadData(days);
        }, 1200);
      }
    } catch (e) {
      setRevertResults([{ field: "All", success: false, error: e.message || "Revert failed" }]);
    } finally {
      setReverting(false);
    }
  }

  // ── Saved Reports: snapshot + restore ──────────────────────────────────
  const currentFilters = { userF, keyF, fieldF, assigneeF, sprintF, savedFilterId, search, asc, daysInput };

  function handleLoadReport(report) {
    const f = report.filters || {};
    if (f.userF         !== undefined) setUserF(f.userF);
    if (f.keyF          !== undefined) setKeyF(f.keyF);
    if (f.fieldF        !== undefined) setFieldF(f.fieldF);
    if (f.assigneeF     !== undefined) setAssigneeF(f.assigneeF);
    if (f.sprintF       !== undefined) setSprintF(f.sprintF);
    if (f.savedFilterId !== undefined) setSavedFilterId(f.savedFilterId);
    if (f.search        !== undefined) setSearch(f.search);
    if (f.asc         !== undefined) setAsc(f.asc);
    if (f.daysInput   !== undefined) { setDaysInput(f.daysInput); loadData(parseInt(f.daysInput) || days); }
    setPage(1);
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
        {canViewDeleted && (
          <button
            className={`proj-tab${projView === "deleted" ? " proj-tab-on" : ""}`}
            onClick={() => setProjView("deleted")}>
            🗑️ Deleted Issues
          </button>
        )}
      </div>

      {/* ── Deleted Issues view ── */}
      {projView === "deleted" && (
        <DeletedIssues projectKey={projectKey} />
      )}

      {/* ── Activity view ── */}
      {projView === "activity" && (
        !canViewHistory ? (
          <div className="perm-denied">
            <div className="perm-denied-ico">&#128274;</div>
            <p className="perm-denied-title">Access Restricted</p>
            <p className="perm-denied-sub">View Issue History is limited to project admins for this project.</p>
          </div>
        ) : (<>
      <div className="proj-bar">
        <div className="proj-bar-l">
          {!loading && <span className="cnt">{rows.length} change{rows.length !== 1 ? "s" : ""}</span>}
          <button className="icon-btn" onClick={() => loadData(days)} disabled={loading} title="Refresh">
            <span className={loading ? "spin-ico" : ""}>&#8635;</span>
          </button>
          <DDMenu label="Updated by: " opts={userOpts} val={userF}
            onChange={v => { setUserF(v); setPage(1); }} searchable />
          <DDMenu label="Assignee: " opts={assigneeOpts} val={assigneeF}
            onChange={v => { setAssigneeF(v); setPage(1); }} searchable />
          <DDMenu label="Sprint: " opts={sprintOpts} val={sprintF}
            onChange={v => { setSprintF(v); setPage(1); }} />
          {/* Saved Jira filter picker */}
          {savedFilters.length > 0 && (
            <div className="dd-wrap" ref={filterMenuRef} style={{ position: "relative" }}>
              <button className="dd-btn" onClick={() => setShowFilterMenu(v => !v)}>
                <span className="dd-prefix">Filter: </span>
                <span>{savedFilters.find(f => f.id === savedFilterId)?.name || "Any"}</span>
                <span className="dd-arrow">&#9660;</span>
              </button>
              {savedFilterId && (
                <button className="fh-clear" title="Clear filter"
                  onClick={e => { e.stopPropagation(); setSavedFilterId(""); setPage(1); }}>&#10005;</button>
              )}
              {showFilterMenu && (
                <ul className="dd-list">
                  <li className={!savedFilterId ? "dd-active" : ""}
                    onClick={() => { setSavedFilterId(""); setShowFilterMenu(false); setPage(1); }}>Any</li>
                  {savedFilters.map(f => (
                    <li key={f.id} className={savedFilterId === f.id ? "dd-active" : ""}
                      onClick={() => { setSavedFilterId(f.id); setShowFilterMenu(false); setPage(1); }}>
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
          {canExport && (
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
          )}
          <SavedReports
            currentFilters={currentFilters}
            viewType="project"
            onLoad={handleLoadReport}
          />
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

      {!loading && !error && rows.length > 0 && (<>
        {selectedIds.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-bar-info">
              {selectedIds.size} row{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button className="bulk-revert-btn" onClick={() => { setRevertResults(null); setShowRevertModal(true); }}>
              &#8633; Revert Selected
            </button>
            <button className="clr-btn" onClick={() => setSelectedIds(new Set())}>&#10005; Clear</button>
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="th-cb">
                  <input
                    type="checkbox"
                    title="Select / deselect this page"
                    checked={pagedRows.length > 0 && pagedRows.every(r => selectedIds.has(projRowId(r)))}
                    ref={el => { if (el) el.indeterminate = pagedRows.some(r => selectedIds.has(projRowId(r))) && !pagedRows.every(r => selectedIds.has(projRowId(r))); }}
                    onChange={e => {
                      const next = new Set(selectedIds);
                      pagedRows.forEach(r => { e.target.checked ? next.add(projRowId(r)) : next.delete(projRowId(r)); });
                      setSelectedIds(next);
                    }}
                  />
                </th>
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
              {pagedRows.map((r, i) => {
                const id = projRowId(r);
                const checked = selectedIds.has(id);
                return (
                  <tr key={i} className={checked ? "tr-selected" : ""}>
                    <td className="td-cb">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          const next = new Set(selectedIds);
                          e.target.checked ? next.add(id) : next.delete(id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>
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
                    <td><Changes from={r.from} to={r.to} field={r.field} commentBody={r.commentBody} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </>)}

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
      {/* Bulk Revert Confirmation Modal */}
      {showRevertModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowRevertModal(false); setRevertResults(null); } }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">&#8633; Revert {selectedChanges.length} Change{selectedChanges.length !== 1 ? "s" : ""}</span>
              <button className="modal-close" onClick={() => { setShowRevertModal(false); setRevertResults(null); }}>&#10005;</button>
            </div>
            <div className="modal-body">
              {!revertResults ? (
                <>
                  <ul className="revert-list">
                    {selectedChanges.map((r, i) => (
                      <li key={i} className="revert-list-item">
                        <span className="revert-field-name">{r.issueKey} &mdash; {r.field || "\u2014"}</span>
                        <Changes from={r.to} to={r.from} field={r.field} commentBody={r.commentBody} />
                      </li>
                    ))}
                  </ul>
                  <p className="revert-warning">
                    &#9888; This will attempt to set each selected field back to its <strong>previous value</strong>. Changes span multiple work items and cannot be undone automatically.
                  </p>
                </>
              ) : (
                <ul className="revert-list">
                  {revertResults.map((r, i) => (
                    <li key={i} className="revert-list-item">
                      <span className="revert-field-name">{r.issueKey} &mdash; {r.field || "\u2014"}</span>
                      {r.success
                        ? <span className="revert-result-ok">&#10004; Reverted successfully</span>
                        : <span className="revert-result-err">&#10008; {r.error || "Failed"}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">

              <button className="ghost-btn" onClick={() => { setShowRevertModal(false); setRevertResults(null); }}>
                {revertResults ? "Close" : "Cancel"}
              </button>
              {!revertResults && (
                <button className="prim-btn" onClick={handleBulkRevert} disabled={reverting}>
                  {reverting ? "Reverting\u2026" : "Confirm Revert"}
                </button>
              )}
              {revertResults && revertResults.some(r => r.success) && (
                <button className="prim-btn" onClick={() => { setShowRevertModal(false); setRevertResults(null); setSelectedIds(new Set()); loadData(days); }}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      </>))}
    </div>
  );
}

// ── Global Page App ────────────────────────────────────────────────────────
function GlPriorityBadge({ v }) {
  const map = {
    highest: { color: "#FF5630", icon: "▲▲" },
    high:    { color: "#FF7452", icon: "▲"  },
    medium:  { color: "#FF8B00", icon: "—"  },
    low:     { color: "#2684FF", icon: "▼"  },
    lowest:  { color: "#0065FF", icon: "▼▼" },
  };
  const s = map[(v || "").toLowerCase()] || { color: "#6B778C", icon: "—" };
  return <span style={{ color: s.color, fontWeight: 600, whiteSpace: "nowrap", fontSize: "0.85em" }}>{s.icon} {v || "—"}</span>;
}

const GL_SELECT_MODES = [
  { value: "space",    label: "Space"              },
  { value: "assignee", label: "Assignee"           },
  { value: "reporter", label: "Reporter"           },
  { value: "label",    label: "Label"              },
  { value: "sprint",   label: "Sprint"             },
  { value: "filter",   label: "Filter"             },
  { value: "jql",      label: "JQL"                },
  { value: "deleted",  label: "Deleted work items" },
];

// ── Column sort context menu (⋮ button on each sortable column header) ────
function ColSortMenu({ colKey, label, sortCol, sortAsc, onSort, isDate, children }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const isActive = sortCol === colKey;
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const ascLabel  = isDate ? "Sort oldest → newest" : "Sort A → Z";
  const descLabel = isDate ? "Sort newest → oldest" : "Sort Z → A";
  return (
    <span className="csm-wrap" ref={ref}>
      <span className="csm-label">
        {label}
        {isActive && <span className="csm-arrow">{sortAsc ? " ▲" : " ▼"}</span>}
        {children}
      </span>
      <button className={`csm-btn${open ? " csm-open" : ""}`}
        title="Sort options"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}>&#8942;</button>
      {open && (
        <div className="csm-menu">
          <div className={`csm-item${isActive ? " csm-on" : ""}`}
            onClick={() => { onSort(colKey, isActive ? !sortAsc : false); setOpen(false); }}>
            <span className="csm-ico">&#9660;</span> Manage sorting
          </div>
          <div className="csm-sep" />
          <div className={`csm-item${isActive && sortAsc ? " csm-on" : ""}`}
            onClick={() => { onSort(colKey, true); setOpen(false); }}>{ascLabel}</div>
          <div className={`csm-item${isActive && !sortAsc ? " csm-on" : ""}`}
            onClick={() => { onSort(colKey, false); setOpen(false); }}>{descLabel}</div>
        </div>
      )}
    </span>
  );
}

function GlColHeaderFilter({ label, opts, val, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = val !== "any";
  return (
    <span className={`fh-wrap${active ? " fh-on" : ""}`} ref={ref} style={{ display: "inline-block", position: "relative" }}>
      <button className={`fh-btn${active ? " fh-active" : ""}`}
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        title={active ? `Filtering: ${val}` : `Filter by ${label}`}>&#9783;</button>
      {active && (
        <button className="fh-clear" onClick={e => { e.stopPropagation(); onChange("any"); }} title="Clear">&#10005;</button>
      )}
      {open && (
        <ul className="fh-list" style={{ minWidth: 140 }}>
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

// Full-page cross-project history — exact marketplace feature parity.
function GlobalPageApp() {
  const [history,    setHistory]    = React.useState([]);
  const [projects,   setProjects]   = React.useState([]);
  const [loading,    setLoading]    = React.useState(true);
  const [error,      setError]      = React.useState(null);

  // ── Select-mode state ────────────────────────────────────────────────────
  const [selectMode,      setSelectMode]      = React.useState("space"); // space|assignee|reporter|label|sprint|filter|jql|deleted
  const [projectKey,      setProjectKey]      = React.useState("all");   // space mode
  const [jqlText,         setJqlText]         = React.useState("");       // jql mode
  const [secondaryVal,    setSecondaryVal]    = React.useState("");       // assignee/reporter id OR label/sprint text OR filterId
  const [secondaryLabel,  setSecondaryLabel]  = React.useState("");       // display name for assignee/reporter/filter
  const [userSuggestions, setUserSuggestions] = React.useState([]);
  const [userSugLoading,  setUserSugLoading]  = React.useState(false);
  const [savedFilters,    setSavedFilters]    = React.useState([]);
  const [showSecMenu,     setShowSecMenu]     = React.useState(false);
  const [labelOptions,    setLabelOptions]    = React.useState([]);
  const [sprintOptions,   setSprintOptions]   = React.useState([]);
  const [secSearch,       setSecSearch]       = React.useState("");

  // ── Server-fetch params ──────────────────────────────────────────────────
  const [days,      setDays]      = React.useState(30);
  const [daysInput, setDaysInput] = React.useState("30");
  const [keepDeleted, setKeepDeleted] = React.useState(false);

  // ── Client-side filters ──────────────────────────────────────────────────
  const [userF,       setUserF]       = React.useState("any");
  const [priorityF,   setPriorityF]   = React.useState("any");
  const [statusF,     setStatusF]     = React.useState("any");
  const [dateF,       setDateF]       = React.useState("any");
  const [customStart, setCustomStart] = React.useState("");
  const [customEnd,   setCustomEnd]   = React.useState("");
  const [sortAsc,     setSortAsc]     = React.useState(false);
  const [sortCol,     setSortCol]     = React.useState("date"); // date|updater|key|summary|priority|status

  // ── View mode ────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = React.useState("table"); // table | people | chart

  // ── UI state ─────────────────────────────────────────────────────────────
  const [showModeMenu,  setShowModeMenu]  = React.useState(false);
  const [showProjMenu,  setShowProjMenu]  = React.useState(false);
  const [showUserMenu,  setShowUserMenu]  = React.useState(false);
  const [userSearch,    setUserSearch]    = React.useState("");
  const [exportOpen,    setExportOpen]    = React.useState(false);
  const [page,          setPage]          = React.useState(1);
  const [pageSize,      setPageSize]      = React.useState(10);
  const [datePickerOpen,  setDatePickerOpen]  = React.useState(false);
  const [collapsedKeys,   setCollapsedKeys]   = React.useState(new Set());
  const [visibleCols,     setVisibleCols]     = React.useState(new Set(["date","updater","key","issuetype","summary","priority","status","field","changes"]));
  const [showColPicker,   setShowColPicker]   = React.useState(false);
  const loadedAt      = React.useRef(null);
  const [lastUpdated, setLastUpdated] = React.useState("");
  const userSearchTimer = React.useRef(null);

  const [glSelectedIds,     setGlSelectedIds]     = React.useState(new Set());
  const [glShowRevertModal, setGlShowRevertModal] = React.useState(false);
  const [glReverting,       setGlReverting]       = React.useState(false);
  const [glRevertResults,   setGlRevertResults]   = React.useState(null);

  const [glView, setGlView] = React.useState("activity"); // "activity" | "permissions"

  const exportRef    = React.useRef(null);
  const colPickerRef = React.useRef(null);
  const modeMenuRef  = React.useRef(null);
  const projMenuRef  = React.useRef(null);
  const userMenuRef  = React.useRef(null);
  const secMenuRef   = React.useRef(null);

  // Close on outside click
  React.useEffect(() => {
    const handlers = [
      [exportRef,    () => setExportOpen(false)],
      [colPickerRef, () => setShowColPicker(false)],
      [modeMenuRef,  () => setShowModeMenu(false)],
      [projMenuRef,  () => setShowProjMenu(false)],
      [userMenuRef,  () => { setShowUserMenu(false); setUserSearch(""); }],
      [secMenuRef,   () => setShowSecMenu(false)],
    ];
    const h = e => handlers.forEach(([ref, fn]) => { if (ref.current && !ref.current.contains(e.target)) fn(); });
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Last-updated ticker
  React.useEffect(() => {
    function tick() {
      if (!loadedAt.current) { setLastUpdated(""); return; }
      const s = Math.floor((Date.now() - loadedAt.current) / 1000);
      if (s < 5)         setLastUpdated("now");
      else if (s < 60)   setLastUpdated(`${s} seconds ago`);
      else if (s < 3600) { const m = Math.floor(s / 60); setLastUpdated(`${m} minute${m !== 1 ? "s" : ""} ago`); }
      else               { const h = Math.floor(s / 3600); setLastUpdated(`${h} hour${h !== 1 ? "s" : ""} ago`); }
    }
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, [history]);

  // Load saved filters when mode becomes "filter"
  React.useEffect(() => {
    if (selectMode !== "filter" || savedFilters.length > 0) return;
    invoke("fetchSavedFilters").then(r => setSavedFilters(r.filters || [])).catch(() => {});
  }, [selectMode, savedFilters.length]);

  // Load labels when mode becomes "label"
  React.useEffect(() => {
    if (selectMode !== "label" || labelOptions.length > 0) return;
    invoke("fetchJiraLabels").then(r => setLabelOptions(r.labels || [])).catch(() => {});
  }, [selectMode, labelOptions.length]);

  // Load sprints when mode becomes "sprint"
  React.useEffect(() => {
    if (selectMode !== "sprint" || sprintOptions.length > 0) return;
    invoke("fetchJiraSprints").then(r => setSprintOptions((r.sprints || []).map(s => s.name))).catch(() => {});
  }, [selectMode, sprintOptions.length]);

  // Debounced user suggestions for assignee/reporter
  function fetchUserSuggestions(q) {
    if (!q.trim()) { setUserSuggestions([]); return; }
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    userSearchTimer.current = setTimeout(() => {
      setUserSugLoading(true);
      invoke("searchJiraUsers", { query: q })
        .then(r => { setUserSuggestions(r.users || []); setUserSugLoading(false); })
        .catch(() => setUserSugLoading(false));
    }, 300);
  }

  // Build JQL based on current select mode.
  // Returns only the WHERE/filter clause — no ORDER BY — because fetchGadgetHistory appends that.
  function buildJql(daysVal) {
    const d = daysVal !== undefined ? daysVal : days;
    const since = new Date(); since.setDate(since.getDate() - d);
    const sinceStr = since.toISOString().slice(0, 10);
    const datePart = `updated >= "${sinceStr}"`;
    switch (selectMode) {
      case "space":
        return projectKey === "all"
          ? datePart
          : `project = "${projectKey}" AND ${datePart}`;
      case "jql":
        // user-supplied JQL — pass through as-is; backend will use it directly
        return jqlText.trim() || datePart;
      case "assignee":
        return secondaryVal
          ? `assignee = "${secondaryVal}" AND ${datePart}`
          : datePart;
      case "reporter":
        return secondaryVal
          ? `reporter = "${secondaryVal}" AND ${datePart}`
          : datePart;
      case "label":
        return secondaryVal.trim()
          ? `labels = "${secondaryVal.trim()}" AND ${datePart}`
          : datePart;
      case "sprint":
        return secondaryVal.trim()
          ? `sprint = "${secondaryVal.trim()}" AND ${datePart}`
          : datePart;
      case "filter":
        return secondaryVal
          ? `filter = "${secondaryVal}" AND ${datePart}`
          : datePart;
      default:
        return datePart;
    }
  }

  // Core load function
  const load = React.useCallback((daysVal) => {
    const d = daysVal !== undefined ? daysVal : days;

    // Deleted mode — fetch from KVS
    if (selectMode === "deleted") {
      setLoading(true); setError(null);
      invoke("fetchDeletedIssues", { projectKey: "all" })
        .then(res => {
          const hist = (res.issues || []).map(iss => ({
            timestamp:  iss.deletedAt || "",
            author:     iss.deletedBy || "",
            issueKey:   iss.issueKey  || "",
            summary:    iss.summary   || "",
            issueType:  iss.issueType || "",
            priority:   iss.priority  || "",
            status:     iss.status    || "",
            projectKey: iss.projectKey || iss.issueKey?.split("-")[0] || "",
            field:      "deleted",
            from:       "Active",
            to:         "Deleted",
          }));
          setHistory(hist);
          setProjects([...new Set(hist.map(r => r.projectKey).filter(Boolean))].sort());
          loadedAt.current = Date.now();
          setPage(1);
          setLoading(false);
        })
        .catch(e => { setError(e.message || "Failed to load deleted issues"); setLoading(false); });
      return;
    }

    setLoading(true); setError(null);
    invoke("fetchGadgetHistory", { days: d, jqlMode: "jql", jqlText: buildJql(d), currentUserOnly: false })
      .then(res => {
        let hist = res.history || [];
        setProjects(res.projects || []);
        if (keepDeleted) {
          invoke("fetchDeletedIssues", { projectKey: "all" }).then(dr => {
            const del = (dr.issues || []).map(iss => ({
              timestamp:  iss.deletedAt || "", author: iss.deletedBy || "",
              issueKey:   iss.issueKey  || "", summary: iss.summary  || "",
              issueType:  iss.issueType || "", priority: iss.priority || "",
              status:     iss.status    || "", projectKey: iss.projectKey || iss.issueKey?.split("-")[0] || "",
              field: "deleted", from: "Active", to: "Deleted",
            }));
            const merged = [...hist, ...del].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            setHistory(merged);
            loadedAt.current = Date.now();
            setPage(1);
          }).catch(() => { setHistory(hist); loadedAt.current = Date.now(); setPage(1); });
        } else {
          setHistory(hist);
          loadedAt.current = Date.now();
          setPage(1);
        }
        setLoading(false);
      })
      .catch(e => { setError(e.message || "Failed to load"); setLoading(false); });
  }, [selectMode, days, projectKey, jqlText, secondaryVal, keepDeleted]);

  React.useEffect(() => { load(); }, [load]);

  function applyDays() {
    const v = parseInt(daysInput);
    if (!isNaN(v) && v > 0) { setDays(v); load(v); }
    else setDaysInput(String(days));
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const uniqueUsers = React.useMemo(() => {
    const s = new Set(history.map(r => r.author).filter(Boolean));
    return Array.from(s).sort();
  }, [history]);

  const priorityOpts = React.useMemo(() => {
    const s = new Set(history.map(r => r.priority).filter(Boolean));
    return [{ value: "any", label: "Any" }, ...Array.from(s).sort().map(v => ({ value: v, label: v }))];
  }, [history]);

  const statusOpts = React.useMemo(() => {
    const s = new Set(history.map(r => r.status).filter(Boolean));
    return [{ value: "any", label: "Any" }, ...Array.from(s).sort().map(v => ({ value: v, label: v }))];
  }, [history]);

  const filteredRows = React.useMemo(() => {
    let r = history;
    if (userF     !== "any") r = r.filter(x => x.author   === userF);
    if (priorityF !== "any") r = r.filter(x => x.priority === priorityF);
    if (statusF   !== "any") r = r.filter(x => x.status   === statusF);
    if (dateF     !== "any") r = r.filter(x => matchDate(x.timestamp, dateF, customStart, customEnd));
    r = [...r].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "updater": cmp = (a.author   ||"").localeCompare(b.author   ||""); break;
        case "key":     cmp = (a.issueKey ||"").localeCompare(b.issueKey ||""); break;
        case "priority":cmp = (a.priority ||"").localeCompare(b.priority ||""); break;
        case "status":  cmp = (a.status   ||"").localeCompare(b.status   ||""); break;
        case "summary": cmp = (a.summary  ||"").localeCompare(b.summary  ||""); break;
        default:        cmp = new Date(a.timestamp) - new Date(b.timestamp);
      }
      return sortAsc ? cmp : -cmp;
    });
    return r;
  }, [history, userF, priorityF, statusF, dateF, customStart, customEnd, sortAsc, sortCol]);

  const grouped = React.useMemo(() => {
    const order = [], map = {};
    filteredRows.forEach(r => {
      if (!map[r.issueKey]) { map[r.issueKey] = []; order.push(r.issueKey); }
      map[r.issueKey].push(r);
    });
    return order.map(k => ({
      issueKey:  k,
      summary:   map[k][0]?.summary   || "",
      issueType: map[k][0]?.issueType || "",
      priority:  map[k][0]?.priority  || "",
      status:    map[k][0]?.status    || "",
      rows:      map[k],
    }));
  }, [filteredRows]);

  const pagedItems  = viewMode === "table"
    ? grouped.slice((page - 1) * pageSize, page * pageSize)
    : filteredRows.slice((page - 1) * pageSize, page * pageSize);
  const totalItems  = viewMode === "table" ? grouped.length : filteredRows.length;
  const totalPages  = Math.max(1, Math.ceil(totalItems / pageSize));

  const logsOnPage = viewMode === "table"
    ? pagedItems.reduce((n, g) => n + (collapsedKeys.has(g.issueKey) ? 1 : g.rows.length), 0)
    : pagedItems.length;

  const dateBtnLabel = React.useMemo(() => {
    if (dateF !== "custom") return DATE_OPTS.find(o => o.value === dateF)?.label || "Any dates";
    const fmt = v => v ? new Date(v).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "";
    if (customStart && customEnd) return `${fmt(customStart)} – ${fmt(customEnd)}`;
    if (customStart) return `From ${fmt(customStart)}`;
    if (customEnd)   return `Until ${fmt(customEnd)}`;
    return "Custom range";
  }, [dateF, customStart, customEnd]);

  function doExportCSV() {
    const h = ["Date of change","Key","Issue Type","Summary","Priority","Status","Updated by","Field","From","To"];
    const q = v => `"${String(v||"").replace(/"/g,'""')}"`;
    const csv = [h, ...filteredRows.map(r => [fmtDate(r.timestamp),r.issueKey,r.issueType,r.summary,r.priority,r.status,r.author,r.field,r.from,r.to])]
      .map(row => row.map(q).join(",")).join("\r\n");
    dlBlob("issue-history.csv","text/csv;charset=utf-8;","\uFEFF"+csv);
  }
  function doExportXLS() {
    const x = v => String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const STATUS_COLORS = {"done":"#E3FCEF","closed":"#E3FCEF","resolved":"#E3FCEF","inprogress":"#DEEBFF","in progress":"#DEEBFF","todo":"#F4F5F7","to do":"#F4F5F7","blocked":"#FFEBE6"};
    const PRI_COLORS = {highest:"#FFEBE6",high:"#FFEBE6",critical:"#FFEBE6",medium:"#FFFAE6",low:"#E3FCEF",lowest:"#E3FCEF"};
    const userMap={}, projMap={}, fieldMap={};
    filteredRows.forEach(r => {
      userMap[r.author] = (userMap[r.author]||0)+1;
      projMap[r.projectKey||r.issueKey?.split("-")[0]] = (projMap[r.projectKey||r.issueKey?.split("-")[0]]||0)+1;
      if (r.field) fieldMap[r.field] = (fieldMap[r.field]||0)+1;
    });
    const topUsers  = Object.entries(userMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topProjs  = Object.entries(projMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const topFields = Object.entries(fieldMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
    const HEADER_STYLE = "background:#0052CC;color:#fff;font-weight:bold;padding:7px 10px;border:1px solid #0052CC;font-size:12px";
    const detailRows = filteredRows.map(r => {
      const statusBg = STATUS_COLORS[(r.status||"").toLowerCase()]||"#FFFFFF";
      const priBg    = PRI_COLORS[(r.priority||"").toLowerCase()]||"#FFFFFF";
      const fieldBg  = (r.field||"").toLowerCase()==="comment"?"#EAE6FF":"#FFFFFF";
      const rowBg    = fieldBg !== "#FFFFFF" ? fieldBg : statusBg !== "#FFFFFF" ? statusBg : "#FFFFFF";
      return `<tr style="background:${rowBg}">${[fmtDate(r.timestamp),r.issueKey,r.issueType,r.summary,r.priority,r.status,r.author,r.field,r.from,r.to].map(v=>`<td style="border:1px solid #DFE1E6;padding:5px 8px">${x(v)}</td>`).join("")}</tr>`;
    }).join("");
    const summaryRows = [
      ...topUsers.map(([u,c])=>`<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">User</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(u)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c}</td></tr>`),
      ...topProjs.map(([p,c])=>`<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">Project</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(p)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c}</td></tr>`),
      ...topFields.map(([f,c])=>`<tr><td style="border:1px solid #DFE1E6;padding:5px 8px">Field</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${x(f)}</td><td style="border:1px solid #DFE1E6;padding:5px 8px">${c}</td></tr>`),
    ].join("");
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="UTF-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>History</x:Name><x:WorksheetOptions><x:Selected/></x:WorksheetOptions></x:ExcelWorksheet>
  <x:ExcelWorksheet><x:Name>Summary</x:Name></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11px}table{border-collapse:collapse;margin-bottom:24px}.sheet-title{font-size:14px;font-weight:bold;color:#172B4D;margin:12px 0 6px}</style></head>
<body>
<p class="sheet-title">&#128202; Issue History — Advanced Report (${filteredRows.length} changes)</p>
<table>
  <thead><tr>
    <th style="${HEADER_STYLE};width:130px">Date</th><th style="${HEADER_STYLE};width:70px">Key</th>
    <th style="${HEADER_STYLE};width:90px">Type</th><th style="${HEADER_STYLE};width:160px">Summary</th>
    <th style="${HEADER_STYLE};width:80px">Priority</th><th style="${HEADER_STYLE};width:80px">Status</th>
    <th style="${HEADER_STYLE};width:120px">Updated By</th><th style="${HEADER_STYLE};width:100px">Field</th>
    <th style="${HEADER_STYLE};width:130px">From</th><th style="${HEADER_STYLE};width:130px">To</th>
  </tr></thead><tbody>${detailRows}</tbody>
</table>
<p class="sheet-title">&#128200; Summary</p>
<table>
  <thead><tr><th style="${HEADER_STYLE};width:80px">Category</th><th style="${HEADER_STYLE};width:180px">Name</th><th style="${HEADER_STYLE};width:80px">Changes</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
</body></html>`;
    dlBlob("issue-history-advanced.xls","application/vnd.ms-excel",html);
  }

  const modeLabel = GL_SELECT_MODES.find(m => m.value === selectMode)?.label || "Space";
  const PAGE_SIZE_OPTS = [{value:10,label:"10"},{value:25,label:"25"},{value:50,label:"50"},{value:100,label:"100"}];

  // ── Secondary input based on current select mode ─────────────────────────
  function renderSecondaryInput() {
    if (selectMode === "space") {
      return (
        <div className="dd-wrap" ref={projMenuRef} style={{ position:"relative" }}>
          <button className="dd-btn" onClick={() => setShowProjMenu(v => !v)}>
            <span>{projectKey === "all" ? "All work items" : projectKey}</span>
            <span className="dd-arrow">&#9660;</span>
          </button>
          {showProjMenu && (
            <ul className="dd-list">
              <li className={projectKey==="all"?"dd-active":""} onClick={() => { setProjectKey("all"); setShowProjMenu(false); }}>All work items</li>
              {projects.map(p => (
                <li key={p} className={projectKey===p?"dd-active":""} onClick={() => { setProjectKey(p); setShowProjMenu(false); }}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (selectMode === "jql") {
      return (
        <input className="gad-jql-input" style={{ minWidth: 280 }}
          placeholder="e.g. project = KAN AND priority = High"
          value={jqlText} onChange={e => setJqlText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load()} />
      );
    }
    if (selectMode === "assignee" || selectMode === "reporter") {
      return (
        <div className="dd-wrap" ref={secMenuRef} style={{ position:"relative" }}>
          <input className="gad-jql-input" style={{ minWidth: 200 }}
            placeholder={selectMode === "assignee" ? "Search assignee…" : "Search reporter…"}
            value={secondaryLabel}
            onChange={e => {
              setSecondaryLabel(e.target.value);
              setSecondaryVal(e.target.value);
              fetchUserSuggestions(e.target.value);
              setShowSecMenu(true);
            }}
          />
          {showSecMenu && (userSuggestions.length > 0 || userSugLoading) && (
            <ul className="dd-list">
              {userSugLoading && <li style={{ padding:"6px 12px", color:"#888" }}>Searching…</li>}
              {userSuggestions.map(u => (
                <li key={u.accountId} onClick={() => {
                  setSecondaryVal(u.accountId);
                  setSecondaryLabel(u.displayName);
                  setShowSecMenu(false);
                  setUserSuggestions([]);
                }}>{u.displayName}</li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (selectMode === "label" || selectMode === "sprint") {
      const opts = selectMode === "label" ? labelOptions : sprintOptions;
      const placeholder = selectMode === "label" ? "Select label…" : "Select sprint…";
      const filteredOpts = secSearch.trim()
        ? opts.filter(o => o.toLowerCase().includes(secSearch.toLowerCase()))
        : opts;
      return (
        <div className="dd-wrap" ref={secMenuRef} style={{ position: "relative" }}>
          <button className="dd-btn" onClick={() => { setSecSearch(""); setShowSecMenu(v => !v); }}>
            <span>{secondaryVal || placeholder}</span>
            <span className="dd-arrow">&#9660;</span>
          </button>
          {secondaryVal && (
            <button className="fh-clear" title="Clear"
              onClick={e => { e.stopPropagation(); setSecondaryVal(""); setSecondaryLabel(""); load(); }}
              style={{ position:"absolute", right:24, top:"50%", transform:"translateY(-50%)", zIndex:2 }}>&#10005;</button>
          )}
          {showSecMenu && (
            <div className="dd-list" style={{ minWidth: 220, padding: "4px 0" }}>
              {opts.length > 6 && (
                <div style={{ padding: "4px 8px" }} onClick={e => e.stopPropagation()}>
                  <input className="dd-search-inp" placeholder="Search…" autoFocus
                    value={secSearch} onChange={e => setSecSearch(e.target.value)} />
                </div>
              )}
              <ul style={{ listStyle:"none", margin:0, padding:0, maxHeight:220, overflowY:"auto" }}>
                <li style={{ padding:"6px 12px", cursor:"pointer", color:"#888" }}
                  className={secondaryVal === "" ? "dd-active" : ""}
                  onClick={() => { setSecondaryVal(""); setSecondaryLabel(""); setShowSecMenu(false); setSecSearch(""); load(); }}
                >Any {selectMode}</li>
                {filteredOpts.map(o => (
                  <li key={o}
                    className={secondaryVal === o ? "dd-active" : ""}
                    style={{ padding:"6px 12px", cursor:"pointer" }}
                    onClick={() => { setSecondaryVal(o); setSecondaryLabel(o); setShowSecMenu(false); setSecSearch(""); }}>
                    {o}
                  </li>
                ))}
                {filteredOpts.length === 0 && (
                  <li style={{ padding:"6px 12px", color:"#888", fontStyle:"italic" }}>
                    {opts.length === 0 ? "Loading…" : `No results for "${secSearch}"`}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      );
    }
    if (selectMode === "filter") {
      return (
        <div className="dd-wrap" ref={secMenuRef} style={{ position:"relative" }}>
          <button className="dd-btn" onClick={() => setShowSecMenu(v => !v)}>
            <span>{savedFilters.find(f => f.id === secondaryVal)?.name || "Select filter…"}</span>
            <span className="dd-arrow">&#9660;</span>
          </button>
          {showSecMenu && (
            <ul className="dd-list">
              {savedFilters.length === 0 && <li style={{ padding:"6px 12px", color:"#888" }}>No saved filters found</li>}
              {savedFilters.map(f => (
                <li key={f.id} className={secondaryVal===f.id?"dd-active":""}
                  onClick={() => { setSecondaryVal(f.id); setSecondaryLabel(f.name); setShowSecMenu(false); }}>
                  {f.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (selectMode === "deleted") {
      return <span style={{ fontSize:"0.85em", color:"#DE350B", fontWeight:600 }}>Showing all deleted work items</span>;
    }
    return null;
  }

  const glRowId = r => `${r.timestamp}|${r.author}|${r.issueKey}|${r.field}|${r.from}|${r.to}`;

  // All visible change-rows across every page (respects collapse state) — used for computing selected changes
  const glAllGroupedRows = React.useMemo(() => {
    return grouped.flatMap(g => collapsedKeys.has(g.issueKey) ? [g.rows[0]] : g.rows);
  }, [grouped, collapsedKeys]);

  // Rows visible on the current page — used for the page-level "select all" checkbox
  const glAllVisiblePageRows = React.useMemo(() => {
    return pagedItems.flatMap(group =>
      collapsedKeys.has(group.issueKey) ? [group.rows[0]] : group.rows
    );
  }, [pagedItems, collapsedKeys]);

  const glSelectedChanges = React.useMemo(
    () => glAllGroupedRows.filter(r => glSelectedIds.has(glRowId(r))),
    [glAllGroupedRows, glSelectedIds]
  );

  async function handleGlBulkRevert() {
    if (!glSelectedChanges.length || glReverting) return;
    setGlReverting(true); setGlRevertResults(null);
    try {
      const byKey = {};
      glSelectedChanges.forEach(r => {
        if (!byKey[r.issueKey]) byKey[r.issueKey] = [];
        byKey[r.issueKey].push(r);
      });
      const allResults = [];
      await Promise.all(
        Object.entries(byKey).map(async ([key, changes]) => {
          try {
            const res = await invoke("revertChanges", { issueKey: key, changes });
            (res.results || []).forEach(result => allResults.push({ ...result, issueKey: key }));
          } catch (e) {
            changes.forEach(c => allResults.push({ field: c.field, issueKey: key, success: false, error: e.message || "Revert failed" }));
          }
        })
      );
      setGlRevertResults(allResults);
      if (allResults.length > 0 && allResults.every(r => r.success)) {
        setTimeout(() => {
          setGlShowRevertModal(false); setGlRevertResults(null); setGlSelectedIds(new Set());
          load();
        }, 1200);
      }
    } catch (e) {
      setGlRevertResults([{ field: "All", success: false, error: e.message || "Revert failed" }]);
    } finally {
      setGlReverting(false);
    }
  }

  return (
    <div className="wih proj-page">
      <h2 className="proj-title">Issue History</h2>

      {/* ── Top-level view tabs ── */}
      <div className="proj-tabs">
        <button className={`proj-tab${glView === "activity" ? " proj-tab-on" : ""}`}
          onClick={() => setGlView("activity")}>&#9776; Activity</button>
        <button className={`proj-tab${glView === "security" ? " proj-tab-on" : ""}`}
          onClick={() => setGlView("security")}>🔐 Security Scanner</button>
        <button className={`proj-tab${glView === "permissions" ? " proj-tab-on" : ""}`}
          onClick={() => setGlView("permissions")}>&#9881; Permissions</button>
      </div>

      {/* ── Permissions view ── */}
      {glView === "permissions" && (
        <AppPermissions projectKey="_global" />
      )}

      {/* ── Security Scanner view ── */}
      {glView === "security" && (
        <SecurityScanner mode="global" />
      )}

      {/* ── Activity view ── */}
      {glView === "activity" && (<>

      {/* ── Toolbar row 1: select mode + secondary + updated by + save view ── */}
      <div className="proj-bar" style={{ flexWrap:"wrap", gap:"6px", alignItems:"center", marginBottom:6 }}>
        <div className="proj-bar-l" style={{ flexWrap:"wrap", gap:"6px", alignItems:"center" }}>

          {/* Select work items by */}
          <div className="dd-wrap" ref={modeMenuRef} style={{ position:"relative" }}>
            <button className="dd-btn" onClick={() => setShowModeMenu(v => !v)}>
              <span className="dd-prefix">Select work items by: </span>
              <span>{modeLabel}</span><span className="dd-arrow">&#9660;</span>
            </button>
            {showModeMenu && (
              <ul className="dd-list">
                {GL_SELECT_MODES.map(m => (
                  <li key={m.value} className={selectMode===m.value?"dd-active":""}
                    onClick={() => { setSelectMode(m.value); setSecondaryVal(""); setSecondaryLabel(""); setShowModeMenu(false); setPage(1); }}>
                    {m.label}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Secondary input */}
          {renderSecondaryInput()}

          {/* Updated by */}
          <div className="dd-wrap" ref={userMenuRef} style={{ position:"relative" }}>
            <button className="dd-btn" onClick={() => setShowUserMenu(v => !v)}>
              <span className="dd-prefix">Updated by: </span>
              <span>{userF !== "any" ? userF : "Any User"}</span>
              <span className="dd-arrow">&#9660;</span>
            </button>
            {showUserMenu && (
              <div className="dd-list" style={{ minWidth:220, padding:"4px 0" }}>
                <div style={{ padding:"4px 8px" }}>
                  <input className="dd-search-inp" placeholder="Search users…" autoFocus
                    value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                </div>
                <ul style={{ listStyle:"none", margin:0, padding:0, maxHeight:220, overflowY:"auto" }}>
                  <li className={userF==="any"?"dd-active":""} style={{ padding:"6px 12px", cursor:"pointer" }}
                    onClick={() => { setUserF("any"); setShowUserMenu(false); setUserSearch(""); setPage(1); }}>Any User</li>
                  {uniqueUsers
                    .filter(u => !userSearch.trim() || u.toLowerCase().includes(userSearch.toLowerCase()))
                    .map(u => (
                      <li key={u} className={userF===u?"dd-active":""} style={{ padding:"6px 12px", cursor:"pointer" }}
                        onClick={() => { setUserF(u); setShowUserMenu(false); setUserSearch(""); setPage(1); }}>{u}</li>
                    ))}
                  {userSearch.trim() && uniqueUsers.filter(u => u.toLowerCase().includes(userSearch.toLowerCase())).length === 0 && (
                    <li style={{ padding:"6px 12px", color:"#888", fontStyle:"italic" }}>No users found</li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {/* Save View */}
          <SavedReports
            currentFilters={{ selectMode, projectKey, jqlText, secondaryVal, secondaryLabel, days, userF, priorityF, statusF, dateF, customStart, customEnd, sortAsc, sortCol, viewMode }}
            viewType="global"
            onLoad={r => {
              const f = r.filters || {};
              if (f.selectMode    !== undefined) setSelectMode(f.selectMode);
              if (f.projectKey    !== undefined) setProjectKey(f.projectKey);
              if (f.jqlText       !== undefined) setJqlText(f.jqlText);
              if (f.secondaryVal  !== undefined) setSecondaryVal(f.secondaryVal);
              if (f.secondaryLabel!== undefined) setSecondaryLabel(f.secondaryLabel);
              if (f.days          !== undefined) { setDays(f.days); setDaysInput(String(f.days)); }
              if (f.userF         !== undefined) setUserF(f.userF);
              if (f.priorityF     !== undefined) setPriorityF(f.priorityF);
              if (f.statusF       !== undefined) setStatusF(f.statusF);
              if (f.dateF         !== undefined) setDateF(f.dateF);
              if (f.customStart   !== undefined) setCustomStart(f.customStart);
              if (f.customEnd     !== undefined) setCustomEnd(f.customEnd);
              if (f.sortAsc       !== undefined) setSortAsc(f.sortAsc);
              if (f.sortCol       !== undefined) setSortCol(f.sortCol);
              if (f.viewMode      !== undefined) setViewMode(f.viewMode);
              setPage(1);
            }}
          />
        </div>
      </div>

      {/* ── Toolbar row 2: view modes + count + date range + days + deleted toggle + export + columns ── */}
      <div className="proj-bar" style={{ flexWrap:"wrap", gap:"6px", alignItems:"center" }}>
        <div className="proj-bar-l" style={{ flexWrap:"wrap", gap:"6px", alignItems:"center" }}>
          {/* View toggles */}
          <div className="vt">
            <button className={`vt-btn${viewMode==="table" ?" on":""}`} onClick={() => setViewMode("table")}  title="Table view">&#9776;</button>
            <button className={`vt-btn${viewMode==="stream"?" on":""}`} onClick={() => setViewMode("stream")} title="Activity stream">&#931;&#931;</button>
            <button className={`vt-btn${viewMode==="chart" ?" on":""}`} onClick={() => setViewMode("chart")}  title="Chart view">&#128200;</button>
          </div>

          {!loading && (
            <span className="cnt">
              {filteredRows.length} change{filteredRows.length!==1?"s":""} &middot; {grouped.length} issue{grouped.length!==1?"s":""}
            </span>
          )}

          <button className="icon-btn" onClick={() => load()} disabled={loading} title="Refresh">
            <span className={loading?"spin-ico":""}>&#8635;</span>
          </button>

          {/* Date range */}
          <DateFilter opts={DATE_OPTS} val={dateF} label={dateBtnLabel}
            onChange={v => { setDateF(v); if (v!=="custom") { setCustomStart(""); setCustomEnd(""); } setPage(1); }}
            customStart={customStart} customEnd={customEnd}
            onCustomStart={setCustomStart} onCustomEnd={setCustomEnd}
            onOpenChange={setDatePickerOpen} />

          {/* Within last N days */}
          <span className="days-wrap">
            Within the last:
            <input className="days-inp" type="number" min="1" max="365" value={daysInput}
              onChange={e => setDaysInput(e.target.value)}
              onBlur={applyDays}
              onKeyDown={e => e.key==="Enter" && applyDays()} />
            days
          </span>
        </div>

        <div className="proj-bar-r">
          {/* Keep deleted toggle */}
          {selectMode !== "deleted" && (
            <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:"0.85em", cursor:"pointer", userSelect:"none" }}>
              <span>Keep deleted work items</span>
              <span onClick={() => setKeepDeleted(v => !v)}
                style={{ display:"inline-block", width:36, height:20, borderRadius:10, cursor:"pointer",
                  background: keepDeleted ? "#0052CC" : "#DFE1E6", position:"relative", transition:"background 0.2s" }}>
                <span style={{ position:"absolute", top:3, left: keepDeleted ? 18 : 3,
                  width:14, height:14, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
              </span>
            </label>
          )}

          {/* Export */}
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

          {/* Columns */}
          <div className="dd-wrap" ref={colPickerRef} style={{ position:"relative" }}>
            <button className="icon-btn" title="Columns" onClick={() => setShowColPicker(v => !v)}>
              &#9776; Columns
            </button>
            {showColPicker && (
              <div className="kf-panel" style={{ right:0, left:"auto", width:190 }}>
                <ul className="kf-list">
                  {[
                    { k:"date",      l:"Date of change" },
                    { k:"updater",   l:"Updated by"     },
                    { k:"key",       l:"Key"            },
                    { k:"issuetype", l:"Issue Type"     },
                    { k:"summary",   l:"Summary"        },
                    { k:"priority",  l:"Priority"       },
                    { k:"status",    l:"Status"         },
                    { k:"field",     l:"Field"          },
                    { k:"changes",   l:"Changes"        },
                  ].map(({ k, l }) => {
                    const on = visibleCols.has(k);
                    return (
                      <li key={k} className={`kf-item${on?" kf-checked":""}`}
                        onClick={() => setVisibleCols(prev => {
                          const next = new Set(prev);
                          if (next.has(k)) { if (next.size > 1) next.delete(k); } else next.add(k);
                          return next;
                        })}>
                        <span className={`kf-cb${on?" on":""}`}>{on?"✔":""}</span>
                        <span className="kf-lbl">{l}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Loading / Error / Empty ── */}
      {loading && <div className="state-box"><div className="spinner"></div><p>Loading activity…</p></div>}
      {!loading && error && (
        <div className="err-box">
          <strong>Error loading history</strong><p>{error}</p>
          <button className="prim-btn" onClick={() => load()}>Retry</button>
        </div>
      )}
      {!loading && !error && filteredRows.length === 0 && (
        <div className="state-box">
          <div className="empty-ico">&#128203;</div>
          <p className="empty-title">No activity found</p>
          <p className="empty-sub">Try increasing the days range or changing the filters.</p>
        </div>
      )}

      {/* ── Chart view ── */}
      {!loading && !error && filteredRows.length > 0 && viewMode === "chart" && (
        <div className="charts-wrap">
          <DynamicStatusChart rows={filteredRows.map(r => ({
            ts:       r.timestamp,
            issueKey: r.issueKey,
            field:    r.field,
            from:     r.from,
            to:       r.to,
            status:   r.status,
          }))} />
        </div>
      )}

      {/* ── Stream (activity) view ── */}
      {!loading && !error && filteredRows.length > 0 && viewMode === "stream" && (
        <div className="stream">
          {pagedItems.map((r, i) => (
            <div key={i} className="s-row">
              <Av name={r.author} />
              <div className="s-body">
                <div className="s-head">
                  <strong>{r.author}</strong>
                  {r.field
                    ? <span> {r.from && r.to ? "changed" : r.to ? "updated" : "cleared"} the <em>{r.field}</em> on <a className="key-link" href={`/browse/${r.issueKey}`} target="_blank" rel="noreferrer">{r.issueKey}</a></span>
                    : <span> made a change on <a className="key-link" href={`/browse/${r.issueKey}`} target="_blank" rel="noreferrer">{r.issueKey}</a></span>}
                  <span className="s-when"> {fmtDate(r.timestamp)}</span>
                </div>
                {r.summary && <div style={{ fontSize:"0.82em", color:"#5E6C84", marginBottom:2 }}>{r.summary}</div>}
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

      {/* ── Table view ── */}
      {!loading && !error && filteredRows.length > 0 && viewMode === "table" && (<>
        {glSelectedIds.size > 0 && (
          <div className="bulk-bar">
            <span className="bulk-bar-info">
              {glSelectedIds.size} row{glSelectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button className="bulk-revert-btn" onClick={() => { setGlRevertResults(null); setGlShowRevertModal(true); }}>
              &#8633; Revert Selected
            </button>
            <button className="clr-btn" onClick={() => setGlSelectedIds(new Set())}>&#10005; Clear</button>
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th className="th-cb">
                  <input
                    type="checkbox"
                    title="Select / deselect visible rows on this page"
                    checked={glAllVisiblePageRows.length > 0 && glAllVisiblePageRows.every(r => glSelectedIds.has(glRowId(r)))}
                    ref={el => { if (el) el.indeterminate = glAllVisiblePageRows.some(r => glSelectedIds.has(glRowId(r))) && !glAllVisiblePageRows.every(r => glSelectedIds.has(glRowId(r))); }}
                    onChange={e => {
                      const next = new Set(glSelectedIds);
                      glAllVisiblePageRows.forEach(r => { e.target.checked ? next.add(glRowId(r)) : next.delete(glRowId(r)); });
                      setGlSelectedIds(next);
                    }}
                  />
                </th>
                <th style={{ width:28 }}></th>
                {visibleCols.has("date")      && <th><ColSortMenu colKey="date" label="Date of change" sortCol={sortCol} sortAsc={sortAsc} isDate onSort={(col, asc) => { setSortCol(col); setSortAsc(asc); setPage(1); }} /></th>}
                {visibleCols.has("updater")   && <th><ColSortMenu colKey="updater" label="Updated by" sortCol={sortCol} sortAsc={sortAsc} onSort={(col, asc) => { setSortCol(col); setSortAsc(asc); setPage(1); }} /></th>}
                {visibleCols.has("key")       && <th><ColSortMenu colKey="key" label="Key" sortCol={sortCol} sortAsc={sortAsc} onSort={(col, asc) => { setSortCol(col); setSortAsc(asc); setPage(1); }} /></th>}
                {visibleCols.has("issuetype") && <th>Issue Type</th>}
                {visibleCols.has("summary")   && <th><ColSortMenu colKey="summary" label="Summary" sortCol={sortCol} sortAsc={sortAsc} onSort={(col, asc) => { setSortCol(col); setSortAsc(asc); setPage(1); }} /></th>}
                {visibleCols.has("priority")  && <th><ColSortMenu colKey="priority" label="Priority" sortCol={sortCol} sortAsc={sortAsc} onSort={(col, asc) => { setSortCol(col); setSortAsc(asc); setPage(1); }}><GlColHeaderFilter label="priority" opts={priorityOpts} val={priorityF} onChange={v => { setPriorityF(v); setPage(1); }} /></ColSortMenu></th>}
                {visibleCols.has("status")    && <th><ColSortMenu colKey="status" label="Status" sortCol={sortCol} sortAsc={sortAsc} onSort={(col, asc) => { setSortCol(col); setSortAsc(asc); setPage(1); }}><GlColHeaderFilter label="status" opts={statusOpts} val={statusF} onChange={v => { setStatusF(v); setPage(1); }} /></ColSortMenu></th>}
                {visibleCols.has("field")     && <th>Field</th>}
                {visibleCols.has("changes")   && <th>Changes</th>}
              </tr>
            </thead>
            <tbody>
              {pagedItems.map(group => {
                const isCollapsed = collapsedKeys.has(group.issueKey);
                const rowsToShow  = isCollapsed ? [group.rows[0]] : group.rows;
                return rowsToShow.map((r, ri) => {
                  const rid = glRowId(r);
                  const checked = glSelectedIds.has(rid);
                  return (
                    <tr key={`${group.issueKey}-${ri}`} className={`${ri > 0 ? "gl-subrow" : ""}${checked ? " tr-selected" : ""}`}>
                      <td className="td-cb">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = new Set(glSelectedIds);
                            e.target.checked ? next.add(rid) : next.delete(rid);
                            setGlSelectedIds(next);
                          }}
                        />
                      </td>
                      <td style={{ width:28, textAlign:"center", verticalAlign:"middle", paddingRight:0 }}>
                        {ri === 0 && group.rows.length > 1 && (
                          <button style={{ background:"none", border:"none", cursor:"pointer", padding:"2px 4px", color:"#42526E", fontSize:"0.7em" }}
                            title={isCollapsed?"Expand":"Collapse"}
                            onClick={() => setCollapsedKeys(prev => {
                              const next = new Set(prev);
                              next.has(group.issueKey) ? next.delete(group.issueKey) : next.add(group.issueKey);
                              return next;
                            })}>
                            {isCollapsed ? "▶" : "▼"}
                          </button>
                        )}
                      </td>
                      {visibleCols.has("date")      && <td className="td-date">{fmtDate(r.timestamp)}</td>}
                      {visibleCols.has("updater")   && <td><div className="user-cell"><Av name={r.author}/><span>{r.author}</span></div></td>}
                      {visibleCols.has("key")       && <td><a className="key-link" href={`/browse/${r.issueKey}`} target="_blank" rel="noreferrer">{r.issueKey}</a></td>}
                      {visibleCols.has("issuetype") && <td className="td-field">{group.issueType || "—"}</td>}
                      {visibleCols.has("summary")   && <td className="td-summary">{group.summary}</td>}
                      {visibleCols.has("priority")  && <td><GlPriorityBadge v={group.priority}/></td>}
                      {visibleCols.has("status")    && <td>{group.status ? <span className="status-badge" style={{ background: statusColor(group.status) }}>{group.status.toUpperCase()}</span> : "—"}</td>}
                      {visibleCols.has("field")     && <td className="td-field">{r.field || "—"}</td>}
                      {visibleCols.has("changes")   && <td><Changes from={r.from} to={r.to} field={r.field} commentBody={r.commentBody}/></td>}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      </>)}

      {/* ── Footer ── */}
      {!loading && !error && totalItems > 0 && (
        <div className="pg-footer">
          <span className="pg-updated">
            {lastUpdated ? `Last updated: ${lastUpdated}` : ""}
            {lastUpdated ? " · " : ""}Logs on this page: {logsOnPage}
          </span>
          <div className="pg-controls">
            <span className="pg-label">Work items per page:</span>
            <DDMenu opts={PAGE_SIZE_OPTS} val={pageSize} onChange={v => { setPageSize(Number(v)); setPage(1); }} alignRight />
            <button className="pg-nav" disabled={page<=1} onClick={() => setPage(p => p-1)}>&#8249;</button>
            <span className="pg-num">{page}</span>
            <button className="pg-nav" disabled={page>=totalPages} onClick={() => setPage(p => p+1)}>&#8250;</button>
            <input className="pg-jump" type="number" min="1" max={totalPages} placeholder={String(totalPages)}
              onKeyDown={e => { if (e.key==="Enter") { const v=parseInt(e.target.value); if(v>=1&&v<=totalPages){setPage(v);e.target.value="";} }}} />
            <button className="pg-go" onClick={e => { const inp=e.target.previousSibling; const v=parseInt(inp.value); if(v>=1&&v<=totalPages){setPage(v);inp.value="";} }}>Go&gt;</button>
          </div>
        </div>
      )}
      {/* Bulk Revert Confirmation Modal */}
      {glShowRevertModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setGlShowRevertModal(false); setGlRevertResults(null); } }}>
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">&#8633; Revert {glSelectedChanges.length} Change{glSelectedChanges.length !== 1 ? "s" : ""}</span>
              <button className="modal-close" onClick={() => { setGlShowRevertModal(false); setGlRevertResults(null); }}>&#10005;</button>
            </div>
            <div className="modal-body">
              {!glRevertResults ? (
                <>
                  <ul className="revert-list">
                    {glSelectedChanges.map((r, i) => (
                      <li key={i} className="revert-list-item">
                        <span className="revert-field-name">{r.issueKey} &mdash; {r.field || "\u2014"}</span>
                        <Changes from={r.to} to={r.from} field={r.field} commentBody={r.commentBody} />
                      </li>
                    ))}
                  </ul>
                  <p className="revert-warning">
                    &#9888; This will attempt to set each selected field back to its <strong>previous value</strong>. Changes span multiple work items and cannot be undone automatically.
                  </p>
                </>
              ) : (
                <ul className="revert-list">
                  {glRevertResults.map((r, i) => (
                    <li key={i} className="revert-list-item">
                      <span className="revert-field-name">{r.issueKey} &mdash; {r.field || "\u2014"}</span>
                      {r.success
                        ? <span className="revert-result-ok">&#10004; Reverted successfully</span>
                        : <span className="revert-result-err">&#10008; {r.error || "Failed"}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button className="ghost-btn" onClick={() => { setGlShowRevertModal(false); setGlRevertResults(null); }}>
                {glRevertResults ? "Close" : "Cancel"}
              </button>
              {!glRevertResults && (
                <button className="prim-btn" onClick={handleGlBulkRevert} disabled={glReverting}>
                  {glReverting ? "Reverting\u2026" : "Confirm Revert"}
                </button>
              )}
              {glRevertResults && glRevertResults.some(r => r.success) && (
                <button className="prim-btn" onClick={() => { setGlShowRevertModal(false); setGlRevertResults(null); setGlSelectedIds(new Set()); load(); }}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {datePickerOpen && <div aria-hidden="true" className="date-picker-spacer" />}
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
        const mk = ctx?.moduleKey || "";
        if (mk === "issue-history-global-page") {
          setMode("global");
        } else if (mk === "issue-history-dashboard-gadget") {
          setMode("gadget");
        } else if (ctx && ctx.extension && ctx.extension.project && !ctx.extension.issue) {
          setMode("project");
        } else {
          setMode("issue");
        }
      })
      .catch(() => setMode("issue"));
  }, []);
  if (mode === "global")  return <GlobalPageApp />;
  if (mode === "gadget")  return <DashboardGadget />;
  if (mode === "project") return <ProjectActivityApp />;
  if (mode === "issue")   return <IssueActivityApp />;
  return <div className="wih"><div className="state-box"><div className="spinner"></div></div></div>;
}

export default App;
