import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { issueUpdated } from './events';

const resolver = new Resolver();

resolver.define('fetchHistory', async (req) => {
  console.log('=== fetchHistory called ===');
  console.log('Context:', JSON.stringify(req.context));
  console.log('Payload:', JSON.stringify(req.payload));

  try {
    // Try all possible locations for the issue key
    let issueKey = req.context?.extension?.issue?.key
      || req.context?.issue?.key
      || req.payload?.issueKey;

    if (!issueKey) {
      console.error('No issue key found. Full context:', JSON.stringify(req.context));
      return { history: [], total: 0, error: 'No issue key found in context or payload' };
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
      const result = await kvs.query().where('key', WhereConditions.beginsWith(`history:${issueKey}:`)).getMany();
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
export const issueCreated = async () => {};