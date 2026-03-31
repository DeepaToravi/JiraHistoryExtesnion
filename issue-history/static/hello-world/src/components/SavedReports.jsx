import React from "react";
import { invoke } from "@forge/bridge";

// ── SavedReports ─────────────────────────────────────────────────────────
// Provides a "Save current view" form and a list of previously saved reports
// that can be loaded (restoring all filters + view mode), deleted, or shared.
// Backend resolvers: saveReport, getReports, deleteReport, shareReport,
//   loadSharedReport, getSharedReports (all in src/index.js).
//
// Props:
//   currentFilters  – plain object of active filter state to snapshot
//   viewType        – string identifying the current view/mode
//   onLoad(report)  – callback called with the saved report object when user clicks "Load"

export default function SavedReports({ currentFilters, viewType, onLoad }) {
  const [open,         setOpen]         = React.useState(false);
  const [tab,          setTab]          = React.useState("my");      // "my" | "shared"
  const [myReports,    setMyReports]    = React.useState([]);
  const [teamReports,  setTeamReports]  = React.useState([]);
  const [loading,      setLoading]      = React.useState(false);
  const [saving,       setSaving]       = React.useState(false);
  const [showSaveForm, setShowSaveForm] = React.useState(false);
  const [reportName,   setReportName]   = React.useState("");
  const [toast,        setToast]        = React.useState(null);
  const panelRef = React.useRef(null);

  // Close panel when clicking outside
  React.useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Load reports when panel opens or tab changes
  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    const requests = tab === "my"
      ? [invoke("getReports"), Promise.resolve(null)]
      : [Promise.resolve(null), invoke("getSharedReports")];

    Promise.all(requests)
      .then(([my, shared]) => {
        if (my     !== null) setMyReports(Array.isArray(my) ? my : []);
        if (shared !== null) setTeamReports(shared?.reports || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, tab]);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function handleSave() {
    const name = reportName.trim();
    if (!name) return;
    setSaving(true);
    invoke("saveReport", { name, filters: currentFilters, viewType })
      .then(r => {
        setMyReports(prev => [r, ...prev]);
        setReportName("");
        setShowSaveForm(false);
        showToast(`"${name}" saved`);
      })
      .catch(() => showToast("Failed to save report", false))
      .finally(() => setSaving(false));
  }

  function handleDelete(id, name) {
    invoke("deleteReport", { id })
      .then(() => {
        setMyReports(prev => prev.filter(r => r.id !== id));
        showToast(`"${name}" deleted`);
      })
      .catch(() => showToast("Failed to delete report", false));
  }

  function handleShare(id, name) {
    invoke("shareReport", { id })
      .then(res => {
        if (res.success) {
          setMyReports(prev => prev.map(r => r.id === id ? { ...r, shared: true } : r));
          showToast(`"${name}" shared with the team`);
        } else {
          showToast(res.error || "Failed to share", false);
        }
      })
      .catch(() => showToast("Failed to share report", false));
  }

  function handleLoad(report) {
    onLoad(report);
    setOpen(false);
    showToast(`Loaded "${report.name}"`);
  }

  const displayReports = tab === "my" ? myReports : teamReports;

  return (
    <div className="sr-wrap" ref={panelRef}>
      {/* Toast */}
      {toast && (
        <div className={`sr-toast${toast.ok ? " sr-toast-ok" : " sr-toast-err"}`}>
          {toast.msg}
        </div>
      )}

      {/* Trigger button */}
      <button
        className={`icon-btn sr-trigger${myReports.length > 0 ? " sr-has-reports" : ""}`}
        title="Saved Reports"
        onClick={() => setOpen(v => !v)}
      >
        &#128203;
        {myReports.length > 0 && <span className="sr-badge">{myReports.length}</span>}
      </button>

      {/* Panel */}
      {open && (
        <div className="sr-panel">
          <div className="sr-panel-header">
            <span className="sr-panel-title">Reports</span>
            <button className="sr-panel-close" onClick={() => setOpen(false)}>&#10005;</button>
          </div>

          {/* Tabs */}
          <div className="sr-tabs">
            <button
              className={`sr-tab${tab === "my" ? " sr-tab-on" : ""}`}
              onClick={() => setTab("my")}
            >
              My Reports
            </button>
            <button
              className={`sr-tab${tab === "shared" ? " sr-tab-on" : ""}`}
              onClick={() => setTab("shared")}
            >
              &#127760; Team Reports
            </button>
          </div>

          <div className="sr-panel-body">
            {loading && (
              <div className="sr-loading">
                <div className="spinner" style={{ width: 20, height: 20 }}></div>
                <span>Loading…</span>
              </div>
            )}

            {!loading && displayReports.length === 0 && (
              <p className="sr-empty">
                {tab === "my"
                  ? "No saved reports yet. Save your current filters to load them later."
                  : "No shared reports yet. Share one of your reports so the team can use it."}
              </p>
            )}

            {!loading && displayReports.map(r => (
              <div key={r.id} className="sr-row">
                <div className="sr-row-info">
                  <button
                    className="sr-load-btn"
                    onClick={() => handleLoad(r)}
                    title="Load this report"
                  >
                    {r.name}
                  </button>
                  <span className="sr-row-meta">
                    {r.viewType && <span className="sr-view-badge">{r.viewType}</span>}
                    {r.shared && <span className="sr-shared-badge">&#127760; Shared</span>}
                    {r.sharedBy && <span className="sr-by">by {r.sharedBy}</span>}
                    {new Date(r.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                {tab === "my" && (
                  <div className="sr-row-actions">
                    {!r.shared && (
                      <button
                        className="sr-share-btn"
                        onClick={() => handleShare(r.id, r.name)}
                        title="Share with team"
                      >
                        &#127760;
                      </button>
                    )}
                    <button
                      className="sr-del-btn"
                      onClick={() => handleDelete(r.id, r.name)}
                      title="Delete report"
                    >
                      &#10005;
                    </button>
                  </div>
                )}
                {tab === "shared" && (
                  <button
                    className="sr-load-action"
                    onClick={() => handleLoad(r)}
                    title="Apply this report"
                  >
                    Apply
                  </button>
                )}
              </div>
            ))}
          </div>

          {tab === "my" && (
            <div className="sr-panel-footer">
              {showSaveForm ? (
                <div className="sr-save-form">
                  <input
                    className="sr-name-inp"
                    placeholder="Enter report name…"
                    value={reportName}
                    onChange={e => setReportName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleSave();
                      if (e.key === "Escape") { setShowSaveForm(false); setReportName(""); }
                    }}
                    autoFocus
                    maxLength={80}
                  />
                  <div className="sr-save-actions">
                    <button
                      className="prim-btn"
                      onClick={handleSave}
                      disabled={saving || !reportName.trim()}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => { setShowSaveForm(false); setReportName(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="sr-save-trigger"
                  onClick={() => setShowSaveForm(true)}
                >
                  + Save current view
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
