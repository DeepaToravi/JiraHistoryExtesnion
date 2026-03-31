import React from "react";
import Charts, { StatusTransitionChart, StatusTimelineChart } from "./Charts";

export default function AnalyticsDashboard({ rows, isProject }) {

  // 🔹 Stats (unchanged logic)
  const stats = React.useMemo(() => {
    const users = new Set();
    const fields = {};
    const issues = new Set();
    

    rows.forEach(r => {
      if (r.author) users.add(r.author);
      if (r.field) fields[r.field] = (fields[r.field] || 0) + 1;
      if (r.issueKey) issues.add(r.issueKey);
    });

    const topFields = Object.entries(fields)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalChanges: rows.length,
      uniqueUsers: users.size,
      uniqueIssues: issues.size,
      topFields
    };
  }, [rows]);

  // 🔹 Insights calculations (keep these)
  const changesByUser = React.useMemo(() => {
    const m = {};
    rows.forEach(r => {
      m[r.author] = (m[r.author] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const changesByField = React.useMemo(() => {
    const m = {};
    rows.forEach(r => {
      if (r.field) m[r.field] = (m[r.field] || 0) + 1;
    });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const changesByDay = React.useMemo(() => {
    const m = {};
    rows.forEach(r => {
      const d = new Date(r.ts).toLocaleDateString("en-GB");
      m[d] = (m[d] || 0) + 1;
    });
    return Object.entries(m).sort();
  }, [rows]);

  return (
    <div className="dash-wrap">

      {/* 🔹 Cards */}
      <div className="dash-cards">
        <div className="dash-card blue">
          <div>Total Changes</div>
          <strong>{stats.totalChanges}</strong>
        </div>

        <div className="dash-card green">
          <div>Users</div>
          <strong>{stats.uniqueUsers}</strong>
        </div>

        {isProject && (
          <div className="dash-card purple">
            <div>Issues</div>
            <strong>{stats.uniqueIssues}</strong>
          </div>
        )}
      </div>

      {/* 🔹 Top Changed Fields */}
      <div className="dash-section">
        <h4>Top Changed Fields</h4>
        <ul>
          {stats.topFields.map(([field, count]) => (
            <li key={field}>
              {field} ({count})
            </li>
          ))}
        </ul>
      </div>

      {/* 🔥 Charts Section */}
      <Charts rows={rows} />

      {/* 📊 Status Transition Charts */}
      <StatusTransitionChart rows={rows} />
      <StatusTimelineChart rows={rows} />

      {/* 🔹 Insights */}
      <div className="dash-section">
        <h4>Insights</h4>
        <ul>
          <li>Most active user: {changesByUser[0]?.[0] || "-"}</li>
          <li>Top field: {changesByField[0]?.[0] || "-"}</li>
          <li>Peak day: {changesByDay[changesByDay.length - 1]?.[0] || "-"}</li>
        </ul>
      </div>

    </div>
  );
}