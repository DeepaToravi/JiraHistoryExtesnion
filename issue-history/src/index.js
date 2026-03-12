import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { KVS } from '@forge/kvs';
import { issueUpdated } from './events';

const resolver = new Resolver();

resolver.define('fetchHistory', async (req) => {
  console.log('=== fetchHistory called ===');
  console.log('Context:', req.context);
  
  try {
    // Get issue key from context
    let issueKey = req.context?.issue?.key;
    
    if (!issueKey) {
      console.error('No issue key found');
      return { history: [], total: 0, error: 'No issue key' };
    }
    
    console.log(`Issue: ${issueKey}`);

    // Fetch Jira history
    let jiraHistory = [];
    try {
      const response = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}?expand=changelog`
      );
      const data = await response.json();
      jiraHistory = data.changelog?.histories || [];
      console.log(`Jira history: ${jiraHistory.length} records`);
    } catch (e) {
      console.error('Error fetching Jira history:', e);
    }

    // Fetch KVS history
    let kvsHistory = [];
    try {
      const kvs = new KVS();
      const result = await kvs.query({ prefix: `history:${issueKey}:` });
      kvsHistory = result.results?.map(r => r.value) || [];
      console.log(`KVS history: ${kvsHistory.length} records`);
    } catch (e) {
      console.error('Error fetching KVS history:', e);
    }

    // Format Jira history
    const formatted = jiraHistory.map(h => ({
      timestamp: h.created,
      author: h.author?.displayName || 'System',
      items: h.items || [],
      type: 'jira'
    }));

    // Combine all
    const all = [...formatted, ...kvsHistory].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    console.log(`Total: ${all.length} records`);
    return { issueKey, history: all, total: all.length };
  } catch (err) {
    console.error('fetchHistory error:', err);
    return { history: [], total: 0, error: err.message };
  }
});

export const handler = resolver.getDefinitions();
export { issueUpdated };