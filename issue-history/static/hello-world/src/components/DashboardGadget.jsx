import React from "react";
import { invoke, router } from "@forge/bridge";
import SavedReports from "./SavedReports";

/* ─── helpers ──────────────────────────────────────────────────────── */
function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return ts || ""; }
}
function avatarHue(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function renderChanges(field, from, to) {
  const f = (field || "").toLowerCase();
  if (f === "created" || (!from && !to)) {
    return <span className="gad-chg-created">Created</span>;
  }
  if (!from && to && /^\d{4}-/.test(String(to))) {
    return <span className="gad-chg-created">{fmtDate(to)}</span>;
  }
  const fromTxt = from != null && from !== "" ? String(from) : null;
  const toTxt   = to   != null && to   !== "" ? String(to)   : null;
  if (!fromTxt && toTxt)  return <span className="gad-chg-text"><em className="gad-chg-nil">none</em><span className="gad-chg-arr">→</span><span className="gad-chg-add">{toTxt}</span></span>;
  if (fromTxt && !toTxt)  return <span className="gad-chg-text"><span className="gad-chg-del">{fromTxt}</span><span className="gad-chg-arr">→</span><em className="gad-chg-nil">none</em></span>;
  if (fromTxt && toTxt)   return <span className="gad-chg-text"><span className="gad-chg-del">{fromTxt}</span><span className="gad-chg-arr">→</span><span className="gad-chg-add">{toTxt}</span></span>;
  return <span className="gad-chg-nil">—</span>;
}

/* ─── Key picker ────────────────────────────────────────────────────── */
function KeyPicker({ rows, keyFilter, setKeyFilter, onClose }) {
  const [search, setSearch] = React.useState("");
  const [draft,  setDraft]  = React.useState(new Set(keyFilter));
  const counts = React.useMemo(() => {
    const m = {};
    rows.forEach(r => { m[r.issueKey] = (m[r.issueKey] || 0) + 1; });
    return m;
  }, [rows]);
  const keys = Object.keys(counts)
    .filter(k => k.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => counts[b] - counts[a]);
  const allChecked = keys.length > 0 && keys.every(k => draft.has(k));
  const toggleAll = () => {
    const s = new Set(draft);
    if (allChecked) keys.forEach(k => s.delete(k)); else keys.forEach(k => s.add(k));
    setDraft(s);
  };
  const toggle = k => { const s = new Set(draft); s.has(k) ? s.delete(k) : s.add(k); setDraft(s); };
  return (
    <div className="gad-picker-pop">
      <div className="gad-picker-search-row">
        <input className="gad-picker-search" placeholder="Find work item key" value={search}
          onChange={e => setSearch(e.target.value)} autoFocus />
        <span className="gad-picker-ico">🔍</span>
      </div>
      <div className="gad-picker-list">
        <label className="gad-picker-row">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span>Any work item</span>
        </label>
        {keys.map(k => (
          <label key={k} className="gad-picker-row">
            <input type="checkbox" checked={draft.has(k)} onChange={() => toggle(k)} />
            <span>{k}</span>
            <span className="gad-picker-count">{counts[k]}</span>
          </label>
        ))}
      </div>
      <div className="gad-picker-footer">
        <button className="gad-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="gad-btn-prim" onClick={() => { setKeyFilter([...draft]); onClose(); }}>Apply</button>
      </div>
    </div>
  );
}

/* ─── Field picker ──────────────────────────────────────────────────── */
function FieldPicker({ rows, fieldFilter, setFieldFilter, onClose }) {
  const [search, setSearch] = React.useState("");
  const [draft,  setDraft]  = React.useState(new Set(fieldFilter));
  const counts = React.useMemo(() => {
    const m = {};
    rows.forEach(r => { if (r.field) m[r.field] = (m[r.field] || 0) + 1; });
    return m;
  }, [rows]);
  const fields = Object.keys(counts)
    .filter(f => f.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => counts[b] - counts[a]);
  const allChecked = fields.length > 0 && fields.every(f => draft.has(f));
  const toggleAll = () => {
    const s = new Set(draft);
    if (allChecked) fields.forEach(f => s.delete(f)); else fields.forEach(f => s.add(f));
    setDraft(s);
  };
  const toggle = f => { const s = new Set(draft); s.has(f) ? s.delete(f) : s.add(f); setDraft(s); };
  return (
    <div className="gad-picker-pop">
      <div className="gad-picker-search-row">
        <input className="gad-picker-search" placeholder="Find field" value={search}
          onChange={e => setSearch(e.target.value)} autoFocus />
        <span className="gad-picker-ico">🔍</span>
      </div>
      <div className="gad-picker-list">
        <label className="gad-picker-row">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} />
          <span>Any field</span>
        </label>
        {fields.map(f => (
          <label key={f} className="gad-picker-row">
            <input type="checkbox" checked={draft.has(f)} onChange={() => toggle(f)} />
            <span>{f}</span>
            <span className="gad-picker-count">{counts[f]}</span>
          </label>
        ))}
      </div>
      <div className="gad-picker-footer">
        <button className="gad-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="gad-btn-prim" onClick={() => { setFieldFilter([...draft]); onClose(); }}>Apply</button>
      </div>
    </div>
  );
}

/* ─── Column picker ─────────────────────────────────────────────────── */
const ALL_COLS   = ["date","key","updater","field","changes"];
const COL_LABELS = { date:"Date of change", key:"Key", updater:"Updater", field:"Field", changes:"Changes" };

function ColPicker({ visibleCols, setVisibleCols, onClose }) {
  const [draft, setDraft] = React.useState(new Set(visibleCols));
  const toggle = c => {
    const s = new Set(draft);
    if (s.has(c)) { if (s.size > 1) s.delete(c); } else s.add(c);
    setDraft(s);
  };
  return (
    <div className="gad-picker-pop gad-col-pop">
      <div className="gad-picker-pop-title">Select fields to include in the report</div>
      <div className="gad-picker-list">
        {ALL_COLS.map(c => (
          <label key={c} className="gad-picker-row">
            <input type="checkbox" checked={draft.has(c)} onChange={() => toggle(c)} />
            <span>{COL_LABELS[c]}</span>
          </label>
        ))}
      </div>
      <div className="gad-picker-footer">
        <button className="gad-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="gad-btn-prim" onClick={() => { setVisibleCols([...draft]); onClose(); }}>Apply</button>
      </div>
    </div>
  );
}

/* ─── Refresh popover ───────────────────────────────────────────────── */
const REFRESH_OPTS = [
  { value: "never", label: "Never" },
  { value: "1",     label: "Every 1 minute" },
  { value: "5",     label: "Every 5 minutes" },
  { value: "15",    label: "Every 15 minutes" },
  { value: "30",    label: "Every 30 minutes" },
];
function RefreshPop({ value, onChange, onClose }) {
  const [draft, setDraft] = React.useState(value);
  return (
    <div className="gad-refresh-pop">
      <div className="gad-refresh-row">
        <span className="gad-refresh-lbl">Refresh:</span>
        <select className="gad-refresh-sel" value={draft} onChange={e => setDraft(e.target.value)}>
          {REFRESH_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="gad-picker-footer">
        <button className="gad-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="gad-btn-prim" onClick={() => { onChange(draft); onClose(); }}>Apply</button>
      </div>
    </div>
  );
}

/* ─── Main gadget ───────────────────────────────────────────────────── */
export default function DashboardGadget() {
  const [history,   setHistory]   = React.useState([]);
  const [projects,  setProjects]  = React.useState([]);
  const [curUser,   setCurUser]   = React.useState(null);
  const [loading,   setLoading]   = React.useState(true);
  const [error,     setError]     = React.useState(null);

  // filters
  const [days,        setDays]        = React.useState(3);
  const [spaceMode,   setSpaceMode]   = React.useState("space"); // "space" | "jql"
  const [projectKey,  setProjectKey]  = React.useState("all");
  const [jqlText,     setJqlText]     = React.useState("");
  const [currentOnly, setCurrentOnly] = React.useState(false);
  const [keyFilter,   setKeyFilter]   = React.useState([]);
  const [fieldFilter, setFieldFilter] = React.useState([]);
  const [selectedUser, setSelectedUser] = React.useState(null);
  const [userSearch,   setUserSearch]   = React.useState("");
  const [sortAsc,     setSortAsc]     = React.useState(false);

  // ui open states
  const [showSpaceMenu,   setShowSpaceMenu]   = React.useState(false);
  const [showProjMenu,    setShowProjMenu]    = React.useState(false);
  const [showUserMenu,    setShowUserMenu]    = React.useState(false);
  const [showKeyPicker,   setShowKeyPicker]   = React.useState(false);
  const [showFieldPicker, setShowFieldPicker] = React.useState(false);
  const [showColPicker,   setShowColPicker]   = React.useState(false);
  const [showRefresh,     setShowRefresh]     = React.useState(false);
  const [visibleCols,     setVisibleCols]     = React.useState(new Set(ALL_COLS));
  const [refreshInterval, setRefreshInterval] = React.useState("never");

  // pagination + search
  const [pageSize,    setPageSize]    = React.useState(100);
  const [page,        setPage]        = React.useState(1);
  const [pageInput,   setPageInput]   = React.useState("");
  const [gadSearch,   setGadSearch]   = React.useState("");
  const [lastRefresh, setLastRefresh] = React.useState(null);
  const [showSearch,  setShowSearch]  = React.useState(false);

  const timerRef = React.useRef(null);

  const closeAll = React.useCallback(() => {
    setShowSpaceMenu(false); setShowProjMenu(false); setShowUserMenu(false);
    setShowKeyPicker(false); setShowFieldPicker(false); setShowColPicker(false);
    setShowRefresh(false); setUserSearch("");
  }, []);

  const load = React.useCallback(() => {
    setLoading(true); setError(null);
    invoke("fetchGadgetHistory", {
      days, projectKey, jqlMode: spaceMode, jqlText, currentUserOnly: currentOnly,
    })
      .then(res => {
        setHistory(res.history || []);
        setProjects(res.projects || []);
        setCurUser(res.currentUser || null);
        setLastRefresh(new Date());
        setPage(1);
        setLoading(false);
      })
      .catch(e => { setError(e.message || "Failed to load"); setLoading(false); });
  }, [days, projectKey, spaceMode, jqlText, currentOnly]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval !== "never") {
      timerRef.current = setInterval(load, parseInt(refreshInterval, 10) * 60000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval, load]);

  // unique authors for user search dropdown
  const uniqueUsers = React.useMemo(() => {
    const s = new Set(history.map(r => r.author).filter(Boolean));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [history]);

  // client-side filters
  const rows = React.useMemo(() => {
    let r = history;
    if (keyFilter.length > 0)   r = r.filter(x => keyFilter.includes(x.issueKey));
    if (fieldFilter.length > 0) r = r.filter(x => fieldFilter.includes(x.field));
    if (selectedUser)            r = r.filter(x => x.author === selectedUser);
    if (gadSearch.trim()) {
      const q = gadSearch.trim().toLowerCase();
      r = r.filter(x =>
        (x.issueKey||"").toLowerCase().includes(q) ||
        (x.author||"").toLowerCase().includes(q)   ||
        (x.field||"").toLowerCase().includes(q)    ||
        (x.summary||"").toLowerCase().includes(q)  ||
        (x.from||"").toLowerCase().includes(q)     ||
        (x.to||"").toLowerCase().includes(q)
      );
    }
    if (sortAsc) r = [...r].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return r;
  }, [history, keyFilter, fieldFilter, selectedUser, gadSearch, sortAsc]);

  // reset to page 1 whenever filters change
  React.useEffect(() => { setPage(1); }, [keyFilter, fieldFilter, selectedUser, gadSearch, sortAsc]);

  const totalPages  = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage    = Math.min(page, totalPages);
  const pagedRows   = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  function goToPage(p) {
    const n = Math.max(1, Math.min(totalPages, Number(p)));
    setPage(n);
  }

  function fmtRefresh(d) {
    if (!d) return "";
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60)  return "now";
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // ── Saved Reports ──────────────────────────────────────────────────────
  const currentFilters = { days, projectKey, spaceMode, jqlText, currentOnly, keyFilter, fieldFilter, selectedUser, sortAsc };

  function handleLoadReport(report) {
    const f = report.filters || {};
    if (f.days         !== undefined) setDays(f.days);
    if (f.projectKey   !== undefined) setProjectKey(f.projectKey);
    if (f.spaceMode    !== undefined) setSpaceMode(f.spaceMode);
    if (f.jqlText      !== undefined) setJqlText(f.jqlText);
    if (f.currentOnly  !== undefined) setCurrentOnly(f.currentOnly);
    if (f.keyFilter    !== undefined) setKeyFilter(f.keyFilter);
    if (f.fieldFilter  !== undefined) setFieldFilter(f.fieldFilter);
    if (f.selectedUser !== undefined) setSelectedUser(f.selectedUser);
    if (f.sortAsc      !== undefined) setSortAsc(f.sortAsc);
  }

  const exportCSV = () => {
    const header = ["Date of change","Key","Updater","Field","From","To","Summary"];
    const lines  = rows.map(r =>
      [fmtDate(r.timestamp), r.issueKey, r.author, r.field,
       (r.from||"").replace(/"/g,'""'), (r.to||"").replace(/"/g,'""'),
       (r.summary||"").replace(/"/g,'""')]
      .map(v => `"${v}"`).join(",")
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "issue-history.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const projLabel = projectKey === "all" ? "All work items" : projectKey;
  const userLabel = selectedUser ? selectedUser : (currentOnly ? (curUser?.name || "Current User") : "All users");

  if (loading && history.length === 0) return (
    <div className="gad-wrap">
      <div className="state-box"><div className="spinner"></div><p>Loading activity...</p></div>
    </div>
  );

  return (
    <div className="gad-wrap" onClick={e => { if (e.currentTarget === e.target) closeAll(); }}>

      {/* ── Top bar ── */}
      <div className="gad-top-bar">
        <span className="gad-count">{rows.length} change{rows.length !== 1 ? "s" : ""}</span>
        <div className="gad-top-acts">
          <button className="gad-btn-export" onClick={exportCSV} title="Export CSV">↧ Export</button>
          <SavedReports currentFilters={currentFilters} viewType="gadget" onLoad={handleLoadReport} />
          <div className="gad-rel">
            <button className="icon-btn" onClick={() => { closeAll(); setShowRefresh(v => !v); }} title="Refresh settings">⚙</button>
            {showRefresh && <RefreshPop value={refreshInterval} onChange={setRefreshInterval} onClose={() => setShowRefresh(false)} />}
          </div>
          <button className="icon-btn" onClick={() => { closeAll(); setShowSearch(v => !v); }} title="Search">🔍</button>
          <button className="icon-btn" onClick={load} disabled={loading} title="Refresh now">↺</button>
        </div>
      </div>

      {/* ── Search bar (shown when 🔍 toggled) ── */}
      {showSearch && (
        <div className="gad-search-row">
          <span className="srch-ico">&#128269;</span>
          <input
            className="gad-search-inp"
            placeholder="Search key, updater, field, changes…"
            value={gadSearch}
            autoFocus
            onChange={e => setGadSearch(e.target.value)}
          />
          {gadSearch && (
            <button className="gad-search-clear" onClick={() => setGadSearch("")}>✕</button>
          )}
        </div>
      )}

      {/* ── Filter row ── */}
      <div className="gad-filter-row">

        {/* Space / JQL mode */}
        <div className="gad-rel">
          <button className="gad-filter-btn" onClick={() => { closeAll(); setShowSpaceMenu(v => !v); }}>
            {spaceMode === "jql" ? "JQL" : "Space"} ▾
          </button>
          {showSpaceMenu && (
            <div className="gad-menu">
              {[{v:"space",l:"Space"},{v:"jql",l:"JQL"}].map(o => (
                <div key={o.v} className={`gad-menu-item${spaceMode===o.v?" gad-menu-on":""}`}
                  onClick={() => { setSpaceMode(o.v); setShowSpaceMenu(false); }}>{o.l}</div>
              ))}
            </div>
          )}
        </div>

        {/* Project selector or JQL input */}
        {spaceMode === "space" ? (
          <div className="gad-rel">
            <button className="gad-filter-btn gad-proj-btn" onClick={() => { closeAll(); setShowProjMenu(v => !v); }}>
              {projLabel} ▾
            </button>
            {showProjMenu && (
              <div className="gad-menu">
                <div className={`gad-menu-item${projectKey==="all"?" gad-menu-on":""}`}
                  onClick={() => { setProjectKey("all"); setShowProjMenu(false); }}>All work items</div>
                {projects.map(p => (
                  <div key={p} className={`gad-menu-item${projectKey===p?" gad-menu-on":""}`}
                    onClick={() => { setProjectKey(p); setShowProjMenu(false); }}>{p}</div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <input className="gad-jql-input" placeholder="e.g. project = KAN AND priority = High"
            value={jqlText} onChange={e => setJqlText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()} />
        )}

        {/* Updated by */}
        <div className="gad-rel">
          <div className="gad-filter-tag">
            <span className="gad-filter-tag-lbl">Updated by:</span>
            <button className="gad-filter-btn gad-filter-tag-btn"
              onClick={() => { closeAll(); setShowUserMenu(v => !v); }}>
              {userLabel} ▾
            </button>
            {(currentOnly || selectedUser) && (
              <button className="gad-tag-clear" onClick={() => { setCurrentOnly(false); setSelectedUser(null); }} title="Clear">✕</button>
            )}
          </div>
          {showUserMenu && (
            <div className="gad-menu gad-menu-user">
              <div className="gad-menu-search-row" onClick={e => e.stopPropagation()}>
                <input
                  className="gad-menu-search-inp"
                  placeholder="Search users..."
                  value={userSearch}
                  autoFocus
                  onChange={e => setUserSearch(e.target.value)}
                />
              </div>
              <div className={`gad-menu-item${!currentOnly && !selectedUser ? " gad-menu-on" : ""}`}
                onClick={() => { setCurrentOnly(false); setSelectedUser(null); setShowUserMenu(false); setUserSearch(""); }}>All users</div>
              {!userSearch.trim() && (
                <div className="gad-menu-hint">Type to search for a user</div>
              )}
              {userSearch.trim() && (() => {
                const filtered = uniqueUsers.filter(u => u.toLowerCase().includes(userSearch.toLowerCase()));
                if (filtered.length === 0) {
                  return (
                    <div className="gad-menu-no-results">
                      No users found for &ldquo;{userSearch}&rdquo;
                    </div>
                  );
                }
                return filtered.map(u => (
                  <div key={u}
                    className={`gad-menu-item${selectedUser === u || (currentOnly && curUser?.name === u) ? " gad-menu-on" : ""}`}
                    onClick={() => {
                      setSelectedUser(u); setCurrentOnly(false);
                      setShowUserMenu(false); setUserSearch("");
                    }}>
                    {u}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>

        {/* Last N days */}
        <div className="gad-filter-tag">
          <span className="gad-filter-tag-lbl">Last:</span>
          <input className="gad-days-input" type="number" min="1" max="365"
            value={days} onChange={e => setDays(Math.max(1, Number(e.target.value) || 3))} />
          <span className="gad-filter-tag-lbl">days</span>
        </div>

      </div>

      {/* ── Error ── */}
      {error && (
        <div className="gad-err">{error}
          <button className="gad-btn-ghost" onClick={load} style={{marginLeft:8}}>Retry</button>
        </div>
      )}

      {/* ── Table ── */}
      {rows.length === 0 && !loading ? (
        <div className="gad-empty-state">No changes found for the selected filters.</div>
      ) : (
        <div className="gad-table-wrap">
          <table className="gad-table">
            <thead>
              <tr>
                {visibleCols.has("date") && (
                  <th className="gad-th" onClick={() => setSortAsc(v => !v)} style={{cursor:"pointer",userSelect:"none"}}>
                    Date of change {sortAsc ? "↑" : "↓"}
                  </th>
                )}
                {visibleCols.has("key") && (
                  <th className="gad-th">
                    Key
                    <div className="gad-rel" style={{display:"inline-block",marginLeft:4}}>
                      <button className={`gad-col-btn${keyFilter.length>0?" gad-col-btn-on":""}`}
                        onClick={e => { e.stopPropagation(); closeAll(); setShowKeyPicker(v => !v); }}
                        title="Filter by key">⇅</button>
                      {showKeyPicker && (
                        <KeyPicker rows={history} keyFilter={keyFilter} setKeyFilter={v => { setKeyFilter(v); }}
                          onClose={() => setShowKeyPicker(false)} />
                      )}
                    </div>
                  </th>
                )}
                {visibleCols.has("updater") && <th className="gad-th">Updater</th>}
                {visibleCols.has("field") && (
                  <th className="gad-th">
                    Field
                    <div className="gad-rel" style={{display:"inline-block",marginLeft:4}}>
                      <button className={`gad-col-btn${fieldFilter.length>0?" gad-col-btn-on":""}`}
                        onClick={e => { e.stopPropagation(); closeAll(); setShowFieldPicker(v => !v); }}
                        title="Filter by field">⇅</button>
                      {showFieldPicker && (
                        <FieldPicker rows={history} fieldFilter={fieldFilter} setFieldFilter={v => { setFieldFilter(v); }}
                          onClose={() => setShowFieldPicker(false)} />
                      )}
                    </div>
                  </th>
                )}
                {visibleCols.has("changes") && (
                  <th className="gad-th">
                    Changes
                    <div className="gad-rel" style={{display:"inline-block",marginLeft:4}}>
                      <button className="gad-col-btn"
                        onClick={e => { e.stopPropagation(); closeAll(); setShowColPicker(v => !v); }}
                        title="Select columns">⋮⋮</button>
                      {showColPicker && (
                        <ColPicker visibleCols={[...visibleCols]}
                          setVisibleCols={v => setVisibleCols(new Set(v))}
                          onClose={() => setShowColPicker(false)} />
                      )}
                    </div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r, i) => (
                <tr key={i} className="gad-tr">
                  {visibleCols.has("date")    && <td className="gad-td gad-td-date">{fmtDate(r.timestamp)}</td>}
                  {visibleCols.has("key")     && <td className="gad-td"><a className="gad-key key-link" href={`/browse/${r.issueKey}`} onClick={e => { e.preventDefault(); router.open(`/browse/${r.issueKey}`); }}>{r.issueKey}</a></td>}
                  {visibleCols.has("updater") && (
                    <td className="gad-td">
                      <span className="av av-sm" style={{background:`hsl(${avatarHue(r.author)},55%,44%)`}}
                        title={r.author}>{initials(r.author)}</span>
                    </td>
                  )}
                  {visibleCols.has("field")   && <td className="gad-td gad-td-field">{r.field}</td>}
                  {visibleCols.has("changes") && <td className="gad-td">{renderChanges(r.field, r.from, r.to)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="gad-loading-overlay">Refreshing...</div>}
        </div>
      )}

      {/* ── Pagination footer ── */}
      {rows.length > 0 && (
        <div className="gad-pg-footer">
          <span className="gad-pg-refresh">
            &#8635; {lastRefresh ? fmtRefresh(lastRefresh) : ""}
          </span>
          <div className="gad-pg-controls">
            <span className="gad-pg-label">Logs:</span>
            <select
              className="gad-pg-size"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {[10,25,50,100].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="gad-pg-nav" onClick={() => goToPage(safePage - 1)} disabled={safePage <= 1}>&#8249;</button>
            <span className="gad-pg-num">{safePage}</span>
            <button className="gad-pg-nav" onClick={() => goToPage(safePage + 1)} disabled={safePage >= totalPages}>&#8250;</button>
            <input
              className="gad-pg-jump"
              type="number"
              min="1"
              max={totalPages}
              placeholder="#"
              value={pageInput}
              onChange={e => setPageInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { goToPage(pageInput); setPageInput(""); } }}
            />
            <button className="gad-pg-go" onClick={() => { goToPage(pageInput); setPageInput(""); }}>Go &rsaquo;</button>
          </div>
        </div>
      )}
    </div>
  );
}
