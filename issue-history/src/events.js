import { kvs } from '@forge/kvs';

async function issueUpdated(event) {
  console.log('=== Issue Updated Event ===');

  const record = {
    issueKey: event.issue.key,
    author: event.user?.displayName || event.actor?.displayName || "System",
    timestamp: new Date().toISOString(),
    items: event.changelog?.items || [],
    type: "custom"
  };

  const key = `history:${event.issue.key}:${Date.now()}`;

  try {
    await kvs.set(key, record);
    console.log("✅ History stored:", key);
  } catch (error) {
    console.error("💥 KVS error:", error);
  }
}

async function issueDeleted(event) {
  console.log('=== Issue Deleted Event ===');
  console.log('Event:', JSON.stringify(event));

  const issue  = event.issue  || {};
  const fields = issue.fields || {};

  const projectKey = fields.project?.key || issue.key?.split('-')[0] || 'UNKNOWN';

  const record = {
    issueKey:    issue.key  || '',
    summary:     fields.summary || '',
    project:     projectKey,
    issueType:   fields.issuetype?.name   || 'Task',
    priority:    fields.priority?.name    || '',
    status:      fields.status?.name      || '',
    assignee:    fields.assignee?.displayName  || '',
    reporter:    fields.reporter?.displayName  || '',
    labels:      fields.labels     || [],
    components:  (fields.components || []).map(c => c.name),
    deletedBy:   event.user?.displayName || event.actor?.displayName || 'Unknown',
    deletedAt:   new Date().toISOString(),
  };

  const kvKey = `deleted:${projectKey}:${record.issueKey}`;

  try {
    await kvs.set(kvKey, record);
    console.log('✅ Deleted issue stored:', kvKey);
  } catch (error) {
    console.error('💥 KVS error storing deleted issue:', error);
  }
}

export { issueUpdated, issueDeleted };