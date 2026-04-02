import React from "react";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend
);

// ── Status Transition Chart ───────────────────────────────────────────────
// Shows top status transitions (e.g. "To Do → In Progress") as a horizontal bar chart.
export function StatusTransitionChart({ rows }) {
  const statusRows = rows.filter(r => (r.field || "").toLowerCase() === "status");
  if (statusRows.length === 0) return null;

  const transMap = {};
  statusRows.forEach(r => {
    const from = r.from || "(none)";
    const to   = r.to   || "(none)";
    const key  = `${from} → ${to}`;
    transMap[key] = (transMap[key] || 0) + 1;
  });

  const sorted = Object.entries(transMap).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const COLORS = [
    "#0052CC","#36B37E","#FF5630","#FFAB00","#6554C0",
    "#00B8D9","#FF991F","#57D9A3","#00C7E6","#998DD9",
  ];

  const data = {
    labels: sorted.map(([k]) => k),
    datasets: [{
      label: "Transitions",
      data: sorted.map(([, v]) => v),
      backgroundColor: sorted.map((_, i) => COLORS[i % COLORS.length]),
      borderRadius: 3,
    }],
  };

  const options = {
    indexAxis: "y",
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.x} time${ctx.parsed.x !== 1 ? "s" : ""}` } },
    },
    scales: {
      x: { ticks: { stepSize: 1 }, grid: { color: "#F4F5F7" } },
      y: { ticks: { font: { size: 11 } }, grid: { display: false } },
    },
  };

  return (
    <div className="chart-box">
      <h4>Status Transitions</h4>
      <p className="chart-sub">Most frequent status changes across all work items</p>
      <Bar data={data} options={options} />
    </div>
  );
}

// ── Status Distribution Over Time Chart ──────────────────────────────────
// Stacked bar: each day shows how many times each status was set.
export function StatusTimelineChart({ rows }) {
  const statusRows = rows.filter(r => (r.field || "").toLowerCase() === "status");
  if (statusRows.length === 0) return null;

  const dayStatusMap = {};
  const statusSet = new Set();

  statusRows.forEach(r => {
    const day = new Date(r.ts || r.timestamp).toLocaleDateString("en-GB");
    const to  = r.to || "(none)";
    statusSet.add(to);
    if (!dayStatusMap[day]) dayStatusMap[day] = {};
    dayStatusMap[day][to] = (dayStatusMap[day][to] || 0) + 1;
  });

  const days     = Object.keys(dayStatusMap).sort((a, b) => {
    const parse = s => { const [d, m, y] = s.split("/"); return new Date(`${y}-${m}-${d}`); };
    return parse(a) - parse(b);
  });
  const statuses = Array.from(statusSet);

  const PALETTE = ["#0052CC","#36B37E","#FF5630","#6554C0","#FFAB00","#00C7E6","#FF991F"];

  const datasets = statuses.map((s, i) => ({
    label: s,
    data: days.map(d => dayStatusMap[d][s] || 0),
    backgroundColor: PALETTE[i % PALETTE.length],
    borderRadius: 2,
  }));

  const data    = { labels: days, datasets };
  const options = {
    responsive: true,
    plugins: {
      legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: { mode: "index", intersect: false },
    },
    scales: {
      x: { stacked: true, ticks: { font: { size: 11 } }, grid: { display: false } },
      y: { stacked: true, ticks: { stepSize: 1 }, grid: { color: "#F4F5F7" } },
    },
  };

  return (
    <div className="chart-box">
      <h4>Status Changes Over Time</h4>
      <p className="chart-sub">Daily volume of status updates, split by target status</p>
      <Bar data={data} options={options} />
    </div>
  );
}

// ── Dynamic Status Update Chart ──────────────────────────────────────────
// For each calendar day, shows a snapshot of how many issues were in each
// status at END of that day. Reconstructed by walking backwards from the
// current (known) status using status-change events.
export function DynamicStatusChart({ rows }) {
  const allIssueKeys = [...new Set(rows.map(r => r.issueKey).filter(Boolean))];
  if (!allIssueKeys.length) return null;

  // Collect all status-change events per issue, sorted OLDEST FIRST
  // Each event: { ts, from, to }
  const statusEvents = {};
  rows.forEach(r => {
    if ((r.field || "").toLowerCase() !== "status") return;
    const ts = new Date(r.ts || r.timestamp).getTime();
    if (isNaN(ts)) return;
    if (!statusEvents[r.issueKey]) statusEvents[r.issueKey] = [];
    statusEvents[r.issueKey].push({ ts, from: r.from || "", to: r.to || "" });
  });
  Object.values(statusEvents).forEach(arr => arr.sort((a, b) => a.ts - b.ts));

  // Date range from all rows
  const allTimes = rows.map(r => new Date(r.ts || r.timestamp).getTime()).filter(n => !isNaN(n));
  if (!allTimes.length) return null;
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);

  // One entry per calendar day (ascending)
  const days = [];
  const cur = new Date(minTime); cur.setHours(0, 0, 0, 0);
  const end = new Date(maxTime); end.setHours(23, 59, 59, 999);
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  if (!days.length) return null;

  // For each issue on each day:
  //   Filter status events where event.ts <= end-of-day
  //   If any exist → pick the latest one's "to" value
  //   If none exist → "To Do" (true initial state, not current API status)
  const statusSet       = new Set();
  const dayStatusCounts = days.map(() => ({}));

  allIssueKeys.forEach(key => {
    const events = statusEvents[key] || [];  // oldest first

    days.forEach((day, di) => {
      const dayEndMs = day.getTime() + 86399999;

      // Latest event on or before this day
      let status = "To Do";
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].ts <= dayEndMs) {
          status = events[i].to || "To Do";
          break;
        }
      }
      // If issue has events but ALL are in the future → use the first event's "from"
      // (what it was before its first recorded change)
      if (events.length > 0 && events[0].ts > dayEndMs) {
        status = events[0].from || "To Do";
      }

      statusSet.add(status);
      dayStatusCounts[di][status] = (dayStatusCounts[di][status] || 0) + 1;
    });
  });

  const STATUS_COLORS = {
    "to do":       "#42526E", "todo":        "#42526E",
    "in progress": "#0052CC", "inprogress":  "#0052CC",
    "in review":   "#6554C0", "inreview":    "#6554C0",
    "done":        "#36B37E",
    "closed":      "#36B37E", "resolved":    "#36B37E",
    "blocked":     "#FF5630",
  };
  const getColor = s => STATUS_COLORS[(s || "").toLowerCase()] || "#8993A4";

  const statuses = Array.from(statusSet);
  const labels   = days.map(d => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
  const datasets  = statuses.map(s => ({
    label:           s,
    data:            dayStatusCounts.map(dc => dc[s] || 0),
    backgroundColor: getColor(s),
    borderRadius:    2,
    stack:           "status",
  }));

  const options = {
    responsive: true,
    plugins: {
      legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 12 } },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y}` },
      },
      title: {
        display: true,
        text: "Dynamic status update",
        font: { size: 14, weight: "600" },
        padding: { bottom: 12 },
        color: "#172B4D",
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 } } },
      y: {
        stacked: true,
        ticks:   { stepSize: 1 },
        grid:    { color: "#F4F5F7" },
        title:   { display: true, text: "Work items state count", font: { size: 11 } },
      },
    },
  };

  return (
    <div className="chart-box" style={{ gridColumn: "1 / -1" }}>
      <Bar data={{ labels, datasets }} options={options} />
    </div>
  );
}

// ── Default Charts export (general analytics) ────────────────────────────
export default function Charts({ rows }) {

  // 📊 Changes by User
  const userMap = {};
  rows.forEach(r => {
    userMap[r.author] = (userMap[r.author] || 0) + 1;
  });

  const userData = {
    labels: Object.keys(userMap),
    datasets: [{
      label: "Changes",
      data: Object.values(userMap),
      backgroundColor: "#0052CC",
      borderRadius: 3,
    }],
  };

  // 📊 Changes by Field
  const fieldMap = {};
  rows.forEach(r => {
    if (r.field) fieldMap[r.field] = (fieldMap[r.field] || 0) + 1;
  });

  const fieldData = {
    labels: Object.keys(fieldMap),
    datasets: [{
      data: Object.values(fieldMap),
      backgroundColor: ["#0052CC","#36B37E","#FF5630","#FFAB00","#6554C0","#00B8D9","#FF991F"],
    }],
  };

  // 📊 Changes by Day
  const dayMap = {};
  rows.forEach(r => {
    const d = new Date(r.ts || r.timestamp).toLocaleDateString("en-GB");
    dayMap[d] = (dayMap[d] || 0) + 1;
  });

  const dayData = {
    labels: Object.keys(dayMap),
    datasets: [{
      label: "Changes",
      data: Object.values(dayMap),
      borderColor: "#0052CC",
      backgroundColor: "rgba(0,82,204,0.08)",
      fill: true,
      tension: 0.3,
      pointRadius: 3,
    }],
  };

  return (
    <div className="charts-wrap">
      <div className="chart-box">
        <h4>Changes by User</h4>
        <Bar data={userData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { stepSize: 1 }, grid: { color: "#F4F5F7" } } } }} />
      </div>

      <div className="chart-box">
        <h4>Changes by Field</h4>
        <Pie data={fieldData} options={{ responsive: true, plugins: { legend: { position: "bottom", labels: { font: { size: 11 }, boxWidth: 12 } } } }} />
      </div>

      <div className="chart-box">
        <h4>Changes by Day</h4>
        <Line data={dayData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { ticks: { stepSize: 1 }, grid: { color: "#F4F5F7" } } } }} />
      </div>

      <StatusTransitionChart rows={rows} />
      <StatusTimelineChart rows={rows} />
    </div>
  );
}