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