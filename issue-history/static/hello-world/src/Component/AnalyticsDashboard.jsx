import React from "react";

export default function AnalyticsDashboard({ rows,isProject}) 
{
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
      if (r.field) {
        m[r.field] = (m[r.field] || 0) + 1;
      }
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

    const stats= React.useMemo(() => {
        const users= new Set();
        const fields= {};
        const issues= new Set();
        rows.forEach(r => {
            if(r.author) users.add(r.author);
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

  return (
    <div className="dash-wrap">

      <div className="dash-cards">
        <div className="dash-card">
          <div className="dash-title">Total Changes</div>
          <div className="dash-value">{stats.totalChanges}</div>
        </div>

        <div className="dash-card">
          <div className="dash-title">Users</div>
          <div className="dash-value">{stats.uniqueUsers}</div>
        </div>

        {isProject && (
          <div className="dash-card">
            <div className="dash-title">Issues</div>
            <div className="dash-value">{stats.uniqueIssues}</div>
          </div>
        )}
      </div>

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
    <div className="dash-section">
        <h4>Changes by User</h4>
        {changesByUser.map(([user,count]) => (
            <div key={user} className="bar-row">
                <span className="bar-label">{user}</span>
                <div className="bar"> 
                    <div className="bar-fill" style={{width: `${count * 20}px`}}></div>
                </div>
                <span className="bar-count">{count}</span>
            </div>
        ))}
    </div>  
    <div className="dash-section">
  <h4>Changes by Field</h4>
  {changesByField.map(([field, count]) => (
    <div key={field} className="bar-row">
      <span className="bar-label">{field}</span>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${count * 20}px` }}></div>
      </div>
      <span className="bar-count">{count}</span>
    </div>
  ))}
</div>

<div className="dash-section">
  <h4>Changes by Day</h4>
  {changesByDay.map(([day, count]) => (
    <div key={day} className="bar-row">
      <span className="bar-label">{day}</span>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${count * 20}px` }}></div>
      </div>
      <span className="bar-count">{count}</span>
    </div>
  ))}
</div>
    

    </div>
  );
}