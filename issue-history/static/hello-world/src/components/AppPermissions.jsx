import React from "react";
import { invoke } from "@forge/bridge";

// ── AppPermissions ─────────────────────────────────────────────────────────
// Group-based permissions panel. Each feature column (Report, Deleted Work
// Items, Permissions) can be restricted to specific Jira groups. Admins and
// project-admins always retain access regardless of these settings.
//
// Backend resolvers used:
//   fetchJiraGroups       – list available Jira groups
//   getGroupPermissions   – load saved group-permission matrix
//   saveGroupPermissions  – persist updates (admin or managePermissions group)
//
// Props:
//   projectKey – the current Jira project key

const FEATURES = [
  { key: "report",            label: "Report",             desc: "View history logs and export reports" },
  { key: "deletedWorkItems",  label: "Deleted Work Items",  desc: "Access the Deleted Issues tab" },
  { key: "managePermissions", label: "Permissions",         desc: "Manage these app permission settings" },
];

// Returns true when the group is allowed for this feature
function isAllowed(groupPerms, feature, groupName) {
  const val = groupPerms?.[feature];
  if (val === null || val === undefined) return true; // null = everyone
  return (val || []).includes(groupName);
}

// Column header state: 'all' | 'none' | 'partial'
function colHeaderState(groupPerms, feature, groups) {
  const val = groupPerms?.[feature];
  if (val === null || val === undefined) return "all";
  if (val.length === 0) return "none";
  if (val.length >= groups.length) return "all";
  return "partial";
}

export default function AppPermissions({ projectKey }) {
  const [groups,     setGroups]     = React.useState([]);
  const [draft,      setDraft]      = React.useState({});   // working copy
  const [saved,      setSaved]      = React.useState({});   // last-saved snapshot
  const [isAdmin,    setIsAdmin]    = React.useState(false);
  const [canManage,  setCanManage]  = React.useState(false);
  const [loading,    setLoading]    = React.useState(true);
  const [saving,     setSaving]     = React.useState(false);
  const [saveOk,     setSaveOk]     = React.useState(false);
  const [error,      setError]      = React.useState(null);
  const [search,     setSearch]     = React.useState("");

  // Load groups + saved group-permission matrix
  React.useEffect(() => {
    if (!projectKey) return;
    setLoading(true);
    Promise.all([
      invoke("fetchJiraGroups"),
      invoke("getGroupPermissions", { projectKey }),
    ])
      .then(([grpRes, permRes]) => {
        const grpList = grpRes.groups || [];
        setGroups(grpList);
        const gp = permRes.groupPerms || {};
        setDraft(gp);
        setSaved(gp);
        setIsAdmin(!!permRes.isAdmin);
        setCanManage(permRes.isAdmin || !!permRes.canManagePermissions);
      })
      .catch(e => setError(e.message || "Failed to load permissions"))
      .finally(() => setLoading(false));
  }, [projectKey]);

  // Toggle a single group for a feature
  function toggleGroup(feature, groupName) {
    setDraft(prev => {
      const current = prev[feature];
      if (current === null || current === undefined) {
        // Currently everyone → remove this group
        return { ...prev, [feature]: groups.filter(g => g !== groupName) };
      }
      const set = new Set(current);
      if (set.has(groupName)) {
        set.delete(groupName);
      } else {
        set.add(groupName);
      }
      const next = Array.from(set);
      // If all groups selected, simplify to null (no restriction)
      return { ...prev, [feature]: next.length >= groups.length ? null : next };
    });
    setSaveOk(false);
  }

  // Toggle all groups for a column (header checkbox)
  function toggleColumn(feature) {
    const state = colHeaderState(draft, feature, groups);
    setDraft(prev => ({
      ...prev,
      [feature]: (state === "all") ? [] : null,
    }));
    setSaveOk(false);
  }

  function handleSave() {
    setSaving(true);
    setError(null);
    invoke("saveGroupPermissions", { projectKey, groupPerms: draft })
      .then(res => {
        if (res.success) {
          setSaved(draft);
          setSaveOk(true);
          setTimeout(() => setSaveOk(false), 3000);
        } else {
          setError(res.error || "Failed to save");
        }
      })
      .catch(e => setError(e.message || "Failed to save"))
      .finally(() => setSaving(false));
  }

  function handleCancel() {
    setDraft(saved);
    setError(null);
    setSaveOk(false);
  }

  const filteredGroups = search.trim()
    ? groups.filter(g => g.toLowerCase().includes(search.toLowerCase()))
    : groups;

  if (loading) {
    return (
      <div className="ap-wrap">
        <div className="state-box">
          <div className="spinner"></div>
          <p>Loading permission settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ap-wrap" style={{ maxWidth: 900 }}>

      {/* ── Header ── */}
      <div className="gp-header">
        <div>
          <h3 className="ap-title">&#9881;&nbsp; Permissions
            <span className="gp-title-hint">&#9432;</span>
          </h3>
          <p className="gp-note">
            Note, that site-admins have permanent access to all pages.
            {!canManage && (
              <span className="gp-readonly-tag"> View-only — only project admins or members of the Permissions group can change these settings.</span>
            )}
          </p>
        </div>
        <div className="gp-search-wrap">
          <span className="gp-search-ico">&#128269;</span>
          <input
            className="gp-search-inp"
            placeholder="Find Groups"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="err-box" style={{ marginBottom: 12 }}>
          <strong>Permission error</strong><p>{error}</p>
        </div>
      )}

      {/* ── Group × Feature table ── */}
      <div className="gp-tbl-wrap">
        <table className="gp-tbl">
          <thead>
            <tr>
              <th className="gp-th-group">
                Groups <span className="gp-sort-ico">&#8593;</span>
              </th>
              {FEATURES.map(f => {
                const state = colHeaderState(draft, f.key, groups);
                return (
                  <th key={f.key} className="gp-th-feat">
                    <label className="gp-col-label" title={f.desc}>
                      <input
                        type="checkbox"
                        className="gp-cb"
                        checked={state === "all"}
                        ref={el => { if (el) el.indeterminate = state === "partial"; }}
                        onChange={() => canManage && toggleColumn(f.key)}
                        disabled={!canManage || saving}
                      />
                      {f.label}
                    </label>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredGroups.length === 0 && (
              <tr>
                <td colSpan={FEATURES.length + 1} className="gp-empty">No groups found.</td>
              </tr>
            )}
            {filteredGroups.map(group => (
              <tr key={group} className="gp-row">
                <td className="gp-td-group">{group}</td>
                {FEATURES.map(f => {
                  const checked = isAllowed(draft, f.key, group);
                  return (
                    <td key={f.key} className="gp-td-feat">
                      <input
                        type="checkbox"
                        className="gp-cb"
                        checked={checked}
                        onChange={() => canManage && toggleGroup(f.key, group)}
                        disabled={!canManage || saving}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Save / Cancel ── */}
      <div className="gp-footer">
        {canManage && (
          <>
            <button className="prim-btn" onClick={handleSave} disabled={saving}>
              {saving ? "Saving\u2026" : "Save changes"}
            </button>
            <button className="ghost-btn" onClick={handleCancel} disabled={saving}>
              Cancel
            </button>
          </>
        )}
        {saveOk && <span className="ap-saved-msg">&#10003; Saved successfully</span>}
      </div>

      <div className="ap-info" style={{ marginTop: 16 }}>
        <span className="ap-info-icon">&#8505;</span>
        <span>
          Project-admin actions (restore / purge deleted issues, manage permissions) always
          require Project Admin permission regardless of these settings.
          When no groups are selected for a feature, only project admins can access it.
        </span>
      </div>
    </div>
  );
}
