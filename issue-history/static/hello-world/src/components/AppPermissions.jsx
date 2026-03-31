import React from "react";
import { invoke } from "@forge/bridge";

// ── AppPermissions ────────────────────────────────────────────────────────
// Project-admin-only settings panel to control who can access each feature.
// Backend resolvers: getAppPermissions, saveAppPermissions (src/index.js).
//
// Props:
//   projectKey – the current Jira project key

const PERMISSION_OPTS = [
  { value: "all",         label: "All project members" },
  { value: "admins_only", label: "Project admins only" },
];

function PermRow({ label, description, value, onChange, disabled }) {
  return (
    <div className="ap-row">
      <div className="ap-row-info">
        <span className="ap-row-label">{label}</span>
        <span className="ap-row-desc">{description}</span>
      </div>
      <select
        className="ap-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
      >
        {PERMISSION_OPTS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function AppPermissions({ projectKey }) {
  const [settings,  setSettings]  = React.useState(null);
  const [isAdmin,   setIsAdmin]   = React.useState(false);
  const [loading,   setLoading]   = React.useState(true);
  const [saving,    setSaving]    = React.useState(false);
  const [saved,     setSaved]     = React.useState(false);
  const [error,     setError]     = React.useState(null);

  React.useEffect(() => {
    if (!projectKey) return;
    setLoading(true);
    invoke("getAppPermissions", { projectKey })
      .then(res => {
        setSettings(res.settings || {});
        setIsAdmin(!!res.isAdmin);
        if (res.error) setError(res.error);
      })
      .catch(e => setError(e.message || "Failed to load permissions"))
      .finally(() => setLoading(false));
  }, [projectKey]);

  function handleChange(key, val) {
    setSettings(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  function handleSave() {
    setSaving(true);
    setError(null);
    invoke("saveAppPermissions", { projectKey, settings })
      .then(res => {
        if (res.success) {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        } else {
          setError(res.error || "Failed to save");
        }
      })
      .catch(e => setError(e.message || "Failed to save"))
      .finally(() => setSaving(false));
  }

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
    <div className="ap-wrap">
      <div className="ap-header">
        <h3 className="ap-title">&#9881; App Permissions</h3>
        <p className="ap-subtitle">
          Control which users can access each feature of Work Item History for this project.
          {!isAdmin && <span className="ap-admin-note"> (View-only — only project admins can change these settings)</span>}
        </p>
      </div>

      {error && (
        <div className="err-box" style={{ marginBottom: 16 }}>
          <strong>Permission error</strong>
          <p>{error}</p>
        </div>
      )}

      {settings && (
        <div className="ap-card">
          <PermRow
            label="View Issue History"
            description="Who can open the history panel on issues and the project activity page"
            value={settings.viewHistory || "all"}
            onChange={v => handleChange("viewHistory", v)}
            disabled={!isAdmin || saving}
          />
          <PermRow
            label="View Deleted Issues"
            description="Who can see the Deleted Issues tab in the project activity page"
            value={settings.viewDeleted || "all"}
            onChange={v => handleChange("viewDeleted", v)}
            disabled={!isAdmin || saving}
          />
          <PermRow
            label="Export History"
            description="Who can export history to CSV, Excel, or PDF"
            value={settings.exportHistory || "all"}
            onChange={v => handleChange("exportHistory", v)}
            disabled={!isAdmin || saving}
          />
        </div>
      )}

      {isAdmin && (
        <div className="ap-footer">
          <button
            className="prim-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save permissions"}
          </button>
          {saved && <span className="ap-saved-msg">&#10003; Saved successfully</span>}
        </div>
      )}

      <div className="ap-info">
        <span className="ap-info-icon">&#8505;</span>
        <span>
          Restore and Purge actions for deleted issues always require Project Admin permission,
          regardless of the settings above.
        </span>
      </div>
    </div>
  );
}
