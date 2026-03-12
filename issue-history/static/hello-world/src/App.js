import React from 'react';
import { invoke, view } from '@forge/bridge';
import './App.css';

function App() {
  const [history, setHistory] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const fetchHistoryData = async () => {
    try {
      console.log('📱 Fetching history...');
      setLoading(true);
      const data = await invoke('fetchHistory');
      console.log('✅ Got data:', data);
      setHistory(data);
      setError(null);
    } catch (err) {
      console.error('💥 Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    // Initial load
    fetchHistoryData();

    // Subscribe to issue changes for real-time updates
    try {
      const unsubscribe = view.subscribe('JIRA_ISSUE_CHANGED', async () => {
        console.log('🔄 Issue changed, refreshing history...');
        fetchHistoryData();
      });

      // Cleanup subscription
      return () => {
        if (unsubscribe) unsubscribe();
      };
    } catch (e) {
      console.warn('Could not subscribe to changes:', e);
    }
  }, []);

  if (loading) {
    return (
      <div className="history-container">
        <h3>Workitem History</h3>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="history-container">
        <div className="error-message">
          <strong>Error:</strong>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!history || !history.history || history.history.length === 0) {
    return (
      <div className="history-container">
        <h3>Workitem History</h3>
        <div className="empty-state">
          <p>No changes recorded for this workitem yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="history-container">
      <h3>Workitem History ({history.total})</h3>
      <div className="history-list">
        {history.history.map((entry, idx) => (
          <div key={idx} className="history-entry">
            <div className="entry-header">
              <span className="author">{entry.author}</span>
              <span className="timestamp">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </div>

            {entry.items && entry.items.length > 0 && (
              <div className="entry-items">
                {entry.items.map((item, idx) => (
                  <div key={idx} className="item">
                    <strong>{item.field}:</strong>{' '}
                    {item.fromString || item.from || '-'} →{' '}
                    {item.toString || item.to || '-'}
                  </div>
                ))}
              </div>
            )}
            {(!entry.items || entry.items.length === 0) && (
              <div className="entry-items no-changes">
                <em>Issue updated</em>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;

