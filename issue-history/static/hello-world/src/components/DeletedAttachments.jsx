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

function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Simple file-type icon based on extension / mime type
function FileIcon({ filename, mimeType }) {
  const ext = (filename || "").split(".").pop().toLowerCase();
  const mime = (mimeType || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext) || mime.startsWith("image/"))
    return <span className="att-icon att-icon-img" title="Image">🖼️</span>;
  if (["pdf"].includes(ext) || mime === "application/pdf")
    return <span className="att-icon att-icon-pdf" title="PDF">📄</span>;
  if (["xls", "xlsx", "csv"].includes(ext) || mime.includes("spreadsheet") || mime.includes("excel"))
    return <span className="att-icon att-icon-xls" title="Spreadsheet">📊</span>;
  if (["doc", "docx"].includes(ext) || mime.includes("word"))
    return <span className="att-icon att-icon-doc" title="Document">📝</span>;
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext) || mime.includes("zip") || mime.includes("compressed"))
    return <span className="att-icon att-icon-zip" title="Archive">🗜️</span>;
  if (["mp4", "mov", "avi", "mkv"].includes(ext) || mime.startsWith("video/"))
    return <span className="att-icon att-icon-vid" title="Video">🎬</span>;
  if (["mp3", "wav", "ogg"].includes(ext) || mime.startsWith("audio/"))
    return <span className="att-icon att-icon-aud" title="Audio">🎵</span>;
  return <span className="att-icon" title="File">📎</span>;
}

export default function DeletedAttachments({ projectKey, issueKey }) {
  const [items,     setItems]     = React.useState([]);
  const [loading,   setLoading]   = React.useState(true);
  const [error,     setError]     = React.useState(null);
  const [restoring, setRestoring] = React.useState(null); // recordKey being restored
  const [purging,   setPurging]   = React.useState(null); // recordKey being purged
  const [toast,     setToast]     = React.useState(null);
  const [search,    setSearch]    = React.useState("");
  const [isAdmin,   setIsAdmin]   = React.useState(false);
  const [restoreTarget, setRestoreTarget] = React.useState({}); // recordKey -> issue key override

  const load = React.useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await invoke("fetchDeletedAttachments", { projectKey, issueKey });
      if (res.error && !res.attachments?.length) setError(res.error);
      else setItems(res.attachments || []);
      if (res.isAdmin !== undefined) setIsAdmin(res.isAdmin);
    } catch (e) {
      setError(e.message || "Failed to load deleted attachments");
    } finally {
      setLoading(false);
    }
  }, [projectKey, issueKey]);

  React.useEffect(() => { load(); }, [load]);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4500);
  }

  async function restore(item) {
    if (restoring) return;
    const key = item._recordKey;
    const target = restoreTarget[key] || item.issueKey || "";
    if (!target) {
      showToast("❌ Enter the issue key to restore this attachment to.", false);
      return;
    }
    setRestoring(key);
    try {
      const res = await invoke("restoreDeletedAttachment", {
        recordKey: key,
        targetIssueKey: target,
      });
      if (res.success) {
        showToast(`✅ "${item.filename}" restored to ${target}`);
        setItems(prev => prev.filter(i => i._recordKey !== key));
      } else {
        showToast(`❌ ${res.error || "Restore failed"}`, false);
      }
    } catch (e) {
      showToast(`❌ ${e.message}`, false);
    } finally {
      setRestoring(null);
    }
  }

  async function purge(item) {
    if (purging) return;
    const key = item._recordKey;
    setPurging(key);
    try {
      const res = await invoke("purgeDeletedAttachment", { recordKey: key });
      if (res.success) {
        showToast(`🗑️ Record for "${item.filename}" removed`);
        setItems(prev => prev.filter(i => i._recordKey !== key));
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
      (i.filename + (i.issueKey || "") + (i.deletedBy || "") + (i.uploadedBy || ""))
        .toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="del-wrap">

      {/* Toast */}
      {toast && (
        <div className={`del-toast${toast.ok ? " del-toast-ok" : " del-toast-err"}`}>
          {toast.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="del-bar">
        <div className="del-bar-l">
          <span className="del-title">📎 Deleted Attachments</span>
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
        Attachments removed from issues are recorded here. Files ≤280 KB were automatically
        cached and can be <strong>Restored</strong> back to any issue. Larger files show metadata only.
        Use <strong>Purge</strong> to permanently delete the audit record.
        <br />
        <em style={{ fontSize: "11px", opacity: 0.75 }}>
          Note: Only attachments removed after this app was installed (and after the issue was first created/updated) are captured.
        </em>
      </div>

      {/* States */}
      {loading && (
        <div className="state-box">
          <div className="spinner"></div>
          <p>Loading deleted attachments...</p>
        </div>
      )}

      {!loading && error && (
        <div className="err-box">
          <strong>Error loading deleted attachments</strong>
          <p>{error}</p>
          <button className="prim-btn" onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="state-box">
          <div className="empty-ico">✅</div>
          <p className="empty-title">No deleted attachments recorded</p>
          <p className="empty-sub">When attachments are removed from issues, they will appear here.</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="state-box">
          <p className="empty-title">No results for &ldquo;{search}&rdquo;</p>
          <button className="prim-btn" onClick={() => setSearch("")}>Clear search</button>
        </div>
      )}

      {/* Table */}
      {!loading && !error && filtered.length > 0 && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>File</th>
                {!issueKey && <th>Issue</th>}
                <th>Uploaded by</th>
                <th>Deleted by</th>
                <th>Deleted at</th>
                <th>Size</th>
                <th>Cached</th>
                {isAdmin && <th style={{ minWidth: 220 }}>Restore to</th>}
                {isAdmin && <th style={{ width: 140 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, i) => {
                const key      = item._recordKey;
                const isRest   = restoring === key;
                const isPurge  = purging   === key;
                const canRestore = item.contentCached;
                return (
                  <tr key={i}>
                    <td style={{ textAlign: "center" }}>
                      <FileIcon filename={item.filename} mimeType={item.mimeType} />
                    </td>
                    <td className="td-field" title={item.filename}>
                      {item.filename || "—"}
                    </td>
                    {!issueKey && (
                      <td>
                        <span className="att-issue-key">{item.issueKey || "—"}</span>
                      </td>
                    )}
                    <td>{item.uploadedBy || "—"}</td>
                    <td>{item.deletedBy  || "—"}</td>
                    <td className="td-date">{fmtDate(item.deletedAt)}</td>
                    <td>{item.size ? fmtSize(item.size) : "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      {canRestore
                        ? <span className="att-cached-yes" title="Content cached — can be restored">✓</span>
                        : <span className="att-cached-no"  title="File too large to cache (>280 KB) — metadata only">✗</span>}
                    </td>
                    {isAdmin && (
                      <td>
                        {canRestore ? (
                          <input
                            className="att-restore-input"
                            placeholder={item.issueKey || "e.g. PROJ-42"}
                            value={restoreTarget[key] !== undefined ? restoreTarget[key] : (item.issueKey || "")}
                            onChange={e => setRestoreTarget(prev => ({ ...prev, [key]: e.target.value }))}
                            disabled={isRest || isPurge}
                            title="Issue key to restore attachment to"
                          />
                        ) : (
                          <span className="att-no-restore-hint">Re-upload manually</span>
                        )}
                      </td>
                    )}
                    {isAdmin && (
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {canRestore && (
                            <button
                              className="prim-btn att-btn-sm"
                              disabled={isRest || isPurge}
                              onClick={() => restore(item)}
                              title="Re-upload cached file to the issue"
                            >
                              {isRest ? "Restoring…" : "↩ Restore"}
                            </button>
                          )}
                          <button
                            className="del-purge-btn att-btn-sm"
                            disabled={isRest || isPurge}
                            onClick={() => purge(item)}
                            title="Remove audit record permanently"
                          >
                            {isPurge ? "Purging…" : "🗑️ Purge"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
