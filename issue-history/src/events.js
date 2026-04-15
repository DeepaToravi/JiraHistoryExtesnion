import { kvs } from '@forge/kvs';
import api, { route } from '@forge/api';

// ── Attachment content cache — proactively download small attachments ────────
// Forge KVS value limit is ~400 KB. We stay under that by capping raw file size
// at 280 KB (base64 overhead ≈ 33 % → ~374 KB encoded, well under the limit).
const MAX_ATT_CACHE_BYTES = 280_000;

async function cacheIssueAttachments(issueKey, projectKey) {
  try {
    const resp = await api.asApp().requestJira(
      route`/rest/api/3/issue/${issueKey}?fields=attachment`
    );
    if (resp.status !== 200) return;
    const data = await resp.json();
    const attachments = data.fields?.attachment || [];

    // Process all attachments in parallel so a slow download doesn't block others
    // and we stay well within the Forge 25-second function timeout.
    await Promise.allSettled(attachments.map(async (att) => {
      const cacheKey = `att-cache:${projectKey}:${issueKey}:${att.id}`;
      // Skip if we already have the content cached
      const existing = await kvs.get(cacheKey).catch(() => null);
      if (existing?.contentCached) return;

      const meta = {
        id:           att.id,
        filename:     att.filename  || 'unknown',
        size:         att.size      || 0,
        mimeType:     att.mimeType  || 'application/octet-stream',
        created:      att.created   || null,
        author:       att.author?.displayName || '',
        authorId:     att.author?.accountId   || '',
        issueKey,
        projectKey,
        contentCached: false,
      };

      // Attempt to download content for small files
      if (att.size && att.size <= MAX_ATT_CACHE_BYTES) {
        try {
          const contentResp = await api.asApp().requestJira(
            route`/rest/api/3/attachment/content/${att.id}`
          );
          if (contentResp.status === 200 || contentResp.ok) {
            const buf = await contentResp.arrayBuffer();
            meta.base64Content = Buffer.from(buf).toString('base64');
            meta.contentCached = true;
            console.log(`✅ Cached attachment content: ${att.id} (${att.size} bytes)`);
          } else {
            console.warn(`att cache download got ${contentResp.status} for ${att.id}`);
          }
        } catch (e) {
          console.error(`att cache download error for ${att.id}:`, e.message);
        }
      }

      try {
        await kvs.set(cacheKey, meta);
      } catch (e) {
        // KVS write failed — likely too large even with our cap; store metadata only
        if (meta.contentCached) {
          meta.contentCached = false;
          delete meta.base64Content;
          await kvs.set(cacheKey, meta).catch(() => {});
        }
      }
    }));
  } catch (e) {
    console.error('cacheIssueAttachments error:', e);
  }
}

// ── Detect attachment removals and write a deleted-attachment record ─────────
async function handleAttachmentRemovals(event) {
  const issueKey   = event.issue?.key    || '';
  const projectKey = issueKey.split('-')[0] || 'UNKNOWN';

  // Resolve actor display name — Forge events expose accountId, not displayName
  let deletedBy = event.user?.displayName || event.actor?.displayName || '';
  if (!deletedBy) {
    const actorId = event.user?.accountId || event.actor?.accountId || '';
    if (actorId) {
      try {
        const uResp = await api.asApp().requestJira(route`/rest/api/3/user?accountId=${actorId}`);
        if (uResp.status === 200) {
          const u = await uResp.json();
          deletedBy = u.displayName || actorId;
        }
      } catch (_) {}
    }
    if (!deletedBy) deletedBy = 'Unknown';
  }

  const deletedAt = new Date().toISOString();

  const removals = (event.changelog?.items || []).filter(
    item => item.field === 'Attachment' && item.from && !item.to
  );

  for (const item of removals) {
    const attachmentId = String(item.from);
    const filename     = item.fromString || 'Unknown';
    const cacheKey     = `att-cache:${projectKey}:${issueKey}:${attachmentId}`;

    let cached = null;
    try { cached = await kvs.get(cacheKey); } catch (_) {}

    // Store lightweight metadata only — base64 content stays in att-cache: key.
    // This avoids a second large KVS write (which can exceed the ~400 KB limit)
    // when multiple attachments are deleted simultaneously.
    const record = {
      id:           attachmentId,
      filename:     cached?.filename || filename,
      size:         cached?.size     ?? null,
      mimeType:     cached?.mimeType || null,
      created:      cached?.created  || null,
      uploadedBy:   cached?.author   || '',
      uploadedById: cached?.authorId || '',
      issueKey,
      projectKey,
      deletedBy,
      deletedAt,
      contentCached: cached?.contentCached || false,
      // cacheKey references att-cache: where base64 lives (NOT copied here)
      cacheKey: cached?.contentCached ? cacheKey : null,
    };

    const delKey = `deleted-att:${projectKey}:${issueKey}:${attachmentId}`;
    try {
      await kvs.set(delKey, record);
      console.log(`✅ Deleted attachment stored: ${delKey}`);
    } catch (e) {
      console.error(`Failed to store deleted-att record for ${attachmentId}:`, e.message);
    }
    // Do NOT delete att-cache: here — restore/purge resolver will clean it up
  }
}

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
  await Promise.all([
    storeIssueSnapshot(issueKey, projectKey),
    cacheIssueAttachments(issueKey, projectKey),
  ]);
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

  const projectKey = event.issue.key.split('-')[0];
  const issueKey   = event.issue.key;

  // Detect sprint changes and persist dedicated sprint-change records for project-level querying
  const sprintItems = (event.changelog?.items || []).filter(
    it => it.field && it.field.toLowerCase() === 'sprint'
  );
  for (const item of sprintItems) {
    // Use a combined timestamp + random suffix to avoid key collisions on rapid edits
    const spKey = `sprint-change:${projectKey}:${issueKey}:${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await kvs.set(spKey, {
      issueKey,
      projectKey,
      fromSprint: item.fromString || null,
      toSprint:   item.toString  || null,
      author:     record.author,
      timestamp:  record.timestamp,
      type:       'sprint',
    }).catch(e => console.error('sprint-change KVS write error:', e));
  }

  // Detect and persist deleted-attachment records BEFORE refreshing the cache
  // (so the old cached content is still available during removal detection)
  await handleAttachmentRemovals(event);

  // Keep snapshot and attachment cache fresh with latest values
  await Promise.all([
    storeIssueSnapshot(issueKey, projectKey),
    cacheIssueAttachments(issueKey, projectKey),
  ]);
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