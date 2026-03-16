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

resolver.define('fetchProjectHistory', async (req) => {
  console.log('=== fetchProjectHistory called ===');
  const projectKey = req.context?.extension?.project?.key || req.payload?.projectKey;
  const days = Number(req.payload?.days) || 8;

  if (!projectKey) {
    return { history: [], total: 0, error: 'No project key found in context or payload' };
  }

  console.log(`Project: ${projectKey}, Days: ${days}`);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceMs = since.getTime();
  const y = since.getFullYear();
  const mo = String(since.getMonth() + 1).padStart(2, '0');
  const d = String(since.getDate()).padStart(2, '0');
  const sinceStr = `${y}-${mo}-${d}`;

  // Collect issue keys from two sources; neither is fatal
  const issueKeys = new Set();
  const issueSummaries = {};

  // Source 1: KVS — issues already tracked by this app
  try {
    const kvsResult = await kvs.query()
      .where('key', WhereConditions.beginsWith(`history:${projectKey}-`))
      .getMany();
    (kvsResult.results || []).forEach(r => {
      if (r.value?.issueKey) issueKeys.add(r.value.issueKey);
    });
    console.log(`KVS found ${issueKeys.size} issue keys`);
  } catch (e) {
    console.error('KVS scan error (non-fatal):', e.message);
  }

  // Source 2: Jira search via GET (route tag URL-encodes the jql value safely)
  const jql = `project = "${projectKey}" AND updated >= "${sinceStr}" ORDER BY updated DESC`;
  console.log(`JQL: ${jql}`);
  try {
    const searchResp = await api.asUser().requestJira(
      route`/rest/api/3/search/jql?jql=${jql}&fields=summary&maxResults=100`
    );
    const searchData = await searchResp.json();
    if (searchData.errorMessages?.length) {
      console.error('Search returned errors (non-fatal):', JSON.stringify(searchData.errorMessages));
    } else {
      (searchData.issues || []).forEach(issue => {
        issueKeys.add(issue.key);
        issueSummaries[issue.key] = issue.fields?.summary || '';
      });
      console.log(`Search found ${searchData.issues?.length || 0} issues`);
    }
  } catch (e) {
    console.error('Search API error (non-fatal):', e.message);
  }

  console.log(`Total unique issue keys: ${issueKeys.size}`);
  if (issueKeys.size === 0) {
    return { history: [], total: 0, projectKey };
  }

  // Fetch changelog for each known issue in parallel batches
  const issueKeysList = Array.from(issueKeys).slice(0, 50);
  const history = [];
  const batchSize = 5;

  for (let i = 0; i < issueKeysList.length; i += batchSize) {
    const batch = issueKeysList.slice(i, i + batchSize);
    await Promise.all(batch.map(async (key) => {
      try {
        const resp = await api.asUser().requestJira(
          route`/rest/api/3/issue/${key}?fields=summary&expand=changelog`
        );
        const data = await resp.json();
        const summary = data.fields?.summary || issueSummaries[key] || '';
        (data.changelog?.histories || []).forEach(h => {
          if (new Date(h.created).getTime() < sinceMs) return;
          const author = h.author?.displayName || '';
          if (!author || author.toLowerCase() === 'system') return;
          (h.items || []).forEach(it => {
            const fromVal = (it.fromString !== undefined && it.fromString !== null) ? it.fromString : (it.from || '');
            const toVal   = (typeof it['toString'] === 'string') ? it['toString'] : (it.to || '');
            history.push({ timestamp: h.created, author, issueKey: key, summary, field: it.field || '', from: fromVal, to: toVal });
          });
        });
      } catch (e) {
        console.error(`Changelog error for ${key}:`, e.message);
      }
    }));
  }

  history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  console.log(`Project history total: ${history.length} records`);
  return { history, total: history.length, projectKey };
});

export const handler = resolver.getDefinitions();
export { issueUpdated };
export const issueCreated = async () => {};