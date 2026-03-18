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
      backgroundColor: "#0052CC"
    }]
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
      backgroundColor: ["#0052CC", "#36B37E", "#FF5630", "#FFAB00"]
    }]
  };

  // 📊 Changes by Day
  const dayMap = {};
  rows.forEach(r => {
    const d = new Date(r.ts).toLocaleDateString("en-GB");
    dayMap[d] = (dayMap[d] || 0) + 1;
  });

  const dayData = {
    labels: Object.keys(dayMap),
    datasets: [{
      label: "Changes",
      data: Object.values(dayMap),
      borderColor: "#0052CC",
      fill: false
    }]
  };

  return (
    <div className="charts-wrap">

      <div className="chart-box">
        <h4>Changes by User</h4>
<Bar 
  data={userData}
  options={{
    onClick: (event, elements) => {
      if (elements.length > 0) {
        const index = elements[0].index;
        const user = userData.labels[index];
        alert("Filter by: " + user);
      }
    }
  }}
/>      </div>

      <div className="chart-box">
        <h4>Changes by Field</h4>
        <Pie data={fieldData} />
      </div>

      <div className="chart-box">
        <h4>Changes by Day</h4>
        <Line data={dayData} />
      </div>

    </div>
  );
}