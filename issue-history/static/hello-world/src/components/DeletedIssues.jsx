import React from "react";
import { invoke } from "@forge/bridge";

function fmtDate(ts) {
  try {
    return new Date(ts).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch (_) { return ts || ""; }
}

export default function DeletedIssues({ projectKey }) {
  const [items,     setItems]     = React.useState([]);
  const [loading,   setLoading]   = React.useState(true);
  const [error,     setError]     = React.useState(null);
  const [restoring, setRestoring] = React.useState(null);
  const [purging,   setPurging]   = React.useState(null);
  const [toast,     setToast]     = React.useState(null);
  const [search,    setSearch]    = React.useState("");
  const [isAdmin,   setIsAdmin]   = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await invoke("fetchDeletedIssues", { projectKey });
      if (res.error && !res.issues?.length) { setError(res.error); }
      else { setItems(res.issues || []); }
      if (res.isAdmin !== undefined) setIsAdmin(res.isAdmin);
    } catch (e) {
      setError(e.message || "Failed to load deleted issues");
    } finally {
      setLoading(false);
    }
  }, [projectKey]);

  React.useEffect(() => { load(); }, [load]);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }

  async function restore(issueKey) {
    if (restoring) return;
    setRestoring(issueKey);
    try {
      const res = await invoke("restoreDeletedIssue", { issueKey });
      if (res.success) {
        showToast(`✅ Restored as ${res.newKey}`);
        setItems(prev => prev.filter(i => i.issueKey !== issueKey));
      } else {
        showToast(`❌ ${res.error || "Restore failed"}`, false);
      }
    } catch (e) {
      showToast(`❌ ${e.message}`, false);
    } finally {
      setRestoring(null);
    }
  }

  async function purge(issueKey) {
    if (purging) return;
    setPurging(issueKey);
    try {
      const res = await invoke("purgeDeletedIssue", { issueKey });
      if (res.success) {
        showToast(`🗑️ ${issueKey} permanently removed`);
        setItems(prev => prev.filter(i => i.issueKey !== issueKey));
      } else {
        showToast(`❌ ${res.error || "Purge failed"}`, false);
      }
    } catch (e) {
      showToast(`❌ ${e.message}`, false);
    } finally {
      setPurging(null);
    }
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      (i.issueKey + i.summary + i.deletedBy + i.issueType + i.status)
        .toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="del-wrap">

      {/* Toast notification */}
      {toast && (
        <div className={`del-toast${toast.ok ? " del-toast-ok" : " del-toast-err"}`}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="del-bar">
        <div className="del-bar-l">
          <span className="del-title">🗑️ Deleted Issues</span>
          {!loading && (
            <span className="cnt">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
          )}
          <button className="icon-btn" onClick={load} disabled={loading} title="Refresh">
            <span className={loading ? "spin-ico" : ""}>&#8635;</span>
          </button>
        </div>
        <div className="del-bar-r">
          <div className="srch">
            <span className="srch-ico">&#128269;</span>
            <input className="srch-inp" placeholder="Search..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="del-info">
        <span>&#9432;</span>
        Issues deleted from this project are captured here (requires the delete event to have fired after the app was installed).
        Use <strong>Restore</strong> to recreate the issue, or <strong>Purge</strong> to permanently remove the record.
      </div>

      {loading && (
        <div className="state-box">
          <div className="spinner"></div>
          <p>Loading deleted issues...</p>
        </div>
      )}

      {!loading && error && (
        <div className="err-box">
          <strong>Error loading deleted issues</strong>
          <p>{error}</p>
          <button className="prim-btn" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="state-box">
          <div className="empty-ico">✅</div>
          <p className="empty-title">No deleted issues recorded</p>
          <p className="empty-sub">When issues are deleted, they will appear here for recovery.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="state-box">
          <p className="empty-title">No results for &ldquo;{search}&rdquo;</p>
          <button className="prim-btn" onClick={() => setSearch("")}>Clear search</button>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Deleted At</th>
                <th>Issue Key</th>
                <th>Summary</th>
                <th>Type</th>
                <th>Priority</th>
                <th>Last Status</th>
                <th>Deleted By</th>
                <th style={{ textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.issueKey} className="del-row">
                  <td className="td-date">{fmtDate(item.deletedAt)}</td>
                  <td>
                    <span className="del-key">{item.issueKey}</span>
                  </td>
                  <td className="td-summary">{item.summary || "—"}</td>
                  <td>
                    <span className="del-badge del-type">{item.issueType || "—"}</span>
                  </td>
                  <td>
                    {item.priority
                      ? <span className={`del-badge del-pri del-pri-${(item.priority || "").toLowerCase()}`}>{item.priority}</span>
                      : "—"}
                  </td>
                  <td>
                    {item.status
                      ? <span className="del-badge del-status">{item.status}</span>
                      : "—"}
                  </td>
                  <td>
                    <div className="user-cell">
                      <span className="av" style={{ background: `hsl(${avatarHue(item.deletedBy)},55%,44%)` }}>
                        {initials(item.deletedBy)}
                      </span>
                      <span>{item.deletedBy}</span>
                    </div>
                  </td>
                  <td className="del-actions">
                    <button
                      className="del-btn-restore"
                      disabled={!isAdmin || restoring === item.issueKey || !!purging}
                      onClick={() => restore(item.issueKey)}
                      title={isAdmin ? "Recreate this issue in Jira" : "Only admins can restore issues"}>
                      {restoring === item.issueKey ? "Restoring…" : "↩ Restore"}
                    </button>
                    <button
                      className="del-btn-purge"
                      disabled={purging === item.issueKey || !!restoring}
                      onClick={() => purge(item.issueKey)}
                      title="Permanently remove this record (cannot be undone)">
                      {purging === item.issueKey ? "Removing…" : "🗑 Purge"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Helpers (same as App.js)
function initials(name) {
  return (name || "?").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}
function avatarHue(name) {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0;
  return h % 360;
}
