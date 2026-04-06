import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';

// ── Fetch and cache all restorable fields for an issue ──────────────────────
async function storeIssueSnapshot(issueKey, projectKey) {
  try {
    const resp = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=summary,description,issuetype,priority,status,assignee,reporter,labels,components,fixVersions`
    );
    if (resp.status !== 200) return;
    const data = await resp.json();
    const f = data.fields || {};
    await kvs.set(`snapshot:${projectKey}:${issueKey}`, {
      summary:     f.summary     || '',
      issueType:   f.issuetype?.name  || 'Task',
      priority:    f.priority?.name   || '',
      status:      f.status?.name     || '',
      assignee:    f.assignee?.displayName || '',
      assigneeId:  f.assignee?.accountId   || '',
      reporter:    f.reporter?.displayName || '',
      reporterId:  f.reporter?.accountId   || '',
      description: f.description || null,
      labels:      f.labels      || [],
      components:  (f.components  || []).map(c => c.name),
      fixVersions: (f.fixVersions || []).map(v => v.name),
    });
    console.log(`✅ Snapshot stored: ${issueKey}`);
  } catch (e) {
    console.error('storeIssueSnapshot error:', e);
  }
}

// ── issueCreated — cache full snapshot so it is available if issue is deleted ─
async function issueCreated(event) {
  console.log('=== Issue Created Event ===');
  const issueKey = event.issue?.key;
  if (!issueKey) return;
  const projectKey = issueKey.split('-')[0];
  await storeIssueSnapshot(issueKey, projectKey);
}

// ── issueUpdated — store changelog + refresh snapshot ────────────────────────
async function issueUpdated(event) {
  console.log('=== Issue Updated Event ===');

  const record = {
    issueKey:  event.issue.key,
    author:    event.user?.displayName || event.actor?.displayName || "System",
    timestamp: new Date().toISOString(),
    items:     event.changelog?.items || [],
    type:      "custom",
  };

  const key = `history:${event.issue.key}:${Date.now()}`;
  try {
    await kvs.set(key, record);
    console.log("✅ History stored:", key);
  } catch (error) {
    console.error("💥 KVS error:", error);
  }

  // Keep snapshot fresh with latest full field values
  const projectKey = event.issue.key.split('-')[0];
  await storeIssueSnapshot(event.issue.key, projectKey);
}

// ── issueDeleted — build deletion record from snapshot (preferred) + event ──
async function issueDeleted(event) {
  console.log('=== Issue Deleted Event ===');

  const issue      = event.issue  || {};
  const fields     = issue.fields || {};
  const issueKey   = issue.key    || '';
  const projectKey = fields.project?.key || issueKey.split('-')[0] || 'UNKNOWN';

  // Load pre-cached snapshot (captured via API on every create/update — most accurate)
  let snap = null;
  try { snap = await kvs.get(`snapshot:${projectKey}:${issueKey}`); } catch (_) {}

  const record = {
    issueKey,
    summary:     snap?.summary     || fields.summary               || '',
    project:     projectKey,
    issueType:   snap?.issueType   || fields.issuetype?.name       || 'Task',
    priority:    snap?.priority    || fields.priority?.name        || '',
    status:      snap?.status      || fields.status?.name          || '',
    assignee:    snap?.assignee    || fields.assignee?.displayName || '',
    assigneeId:  snap?.assigneeId  || fields.assignee?.accountId   || '',
    reporter:    snap?.reporter    || fields.reporter?.displayName || '',
    reporterId:  snap?.reporterId  || fields.reporter?.accountId   || '',
    description: snap?.description || fields.description           || null,
    labels:      snap?.labels      || fields.labels                || [],
    components:  snap?.components  || (fields.components  || []).map(c => c.name),
    fixVersions: snap?.fixVersions || (fields.fixVersions || []).map(v => v.name),
    deletedBy:   event.user?.displayName || event.actor?.displayName || 'Unknown',
    deletedAt:   new Date().toISOString(),
  };

  const kvKey = `deleted:${projectKey}:${issueKey}`;
  try {
    await kvs.set(kvKey, record);
    console.log('✅ Deleted issue stored:', kvKey);
  } catch (error) {
    console.error('💥 KVS error storing deleted issue:', error);
  }

  // Clean up snapshot — no longer needed
  try { await kvs.delete(`snapshot:${projectKey}:${issueKey}`); } catch (_) {}
}

export { issueCreated, issueUpdated, issueDeleted };