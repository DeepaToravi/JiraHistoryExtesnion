import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs, WhereConditions } from '@forge/kvs';
import { issueUpdated, issueDeleted, issueCreated } from './events';

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

    // Fetch Jira history + comments in parallel
    let jiraHistory = [];
    let commentHistory = [];
    try {
      const [issueResp, commentsResp] = await Promise.all([
        api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}?expand=changelog`),
        api.asUser().requestJira(route`/rest/api/3/issue/${issueKey}/comment?maxResults=100&orderBy=created`),
      ]);
      const issueData = await issueResp.json();
      jiraHistory = issueData.changelog?.histories || [];
      console.log(`Jira history: ${jiraHistory.length} records`);

      // Build comment change records — detect edits (created ≠ updated)
      const commentsData = await commentsResp.json();
      (commentsData.comments || []).forEach(c => {
        const authorName = c.author?.displayName || 'System';
        const createdTs  = c.created;
        const updatedTs  = c.updated;
        const currentText = extractAdfText(c.body);
        // Always record ADDED comment
        commentHistory.push({
          timestamp: createdTs,
          author: authorName,
          items: [{ field: 'comment', fromString: '', toString: currentText || 'Comment added' }],
          type: 'comment',
          commentBody: currentText,
        });
        // Record EDITED if updated is meaningfully later than created (> 5 seconds)
        if (updatedTs && new Date(updatedTs) - new Date(createdTs) > 5000) {
          const editorName = c.updateAuthor?.displayName || authorName;
          commentHistory.push({
            timestamp: updatedTs,
            author: editorName,
            items: [{ field: 'comment', fromString: 'edited', toString: currentText || 'Comment edited' }],
            type: 'comment',
            commentBody: currentText,
          });
        }
      });
      console.log(`Comment history: ${commentHistory.length} records`);
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

    // Format Jira changelog history
    const formatted = jiraHistory.map(h => ({
      timestamp: h.created,
      author: h.author?.displayName || 'System',
      items: h.items || [],
      type: 'jira'
    }));

    // Combine all
    const all = [...formatted, ...commentHistory, ...kvsHistory].sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    console.log(`Total: ${all.length} records`);
    return { issueKey, history: all, total: all.length };
  } catch (err) {
    console.error('fetchHistory error:', err);
    return { history: [], total: 0, error: err.message };
  }
});
resolver.define("getDashboardStats", async () => {
  const data = await kvs.query("history").getMany();

  let userMap = {};
  let fieldMap = {};

  data.forEach(item => {
    userMap[item.author] = (userMap[item.author] || 0) + 1;
    fieldMap[item.field] = (fieldMap[item.field] || 0) + 1;
  });

  const topUser = Object.entries(userMap).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const topField = Object.entries(fieldMap).sort((a,b)=>b[1]-a[1])[0]?.[0];

  return {
    total: data.length,
    topUser,
    topField
  };
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
          route`/rest/api/3/issue/${key}?fields=summary,assignee,customfield_10020&expand=changelog`
        );
        const data = await resp.json();
        const summary  = data.fields?.summary || issueSummaries[key] || '';
        const assignee = data.fields?.assignee?.displayName || '';
        const sprintArr = data.fields?.customfield_10020;
        const sprint = Array.isArray(sprintArr)
          ? (sprintArr.slice(-1)[0]?.name || '')
          : (sprintArr?.name || '');
        (data.changelog?.histories || []).forEach(h => {
          if (new Date(h.created).getTime() < sinceMs) return;
          const author = h.author?.displayName || '';
          if (!author || author.toLowerCase() === 'system') return;
          (h.items || []).forEach(it => {
            const fromVal = (it.fromString !== undefined && it.fromString !== null) ? it.fromString : (it.from || '');
            const toVal   = (typeof it['toString'] === 'string') ? it['toString'] : (it.to || '');
            history.push({ timestamp: h.created, author, issueKey: key, summary, assignee, sprint, field: it.field || '', from: fromVal, to: toVal });
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

// ── Deleted issue resolvers ─────────────────────────────────────────────────

resolver.define('fetchDeletedIssues', async (req) => {
  const projectKey = req.context?.extension?.project?.key || req.payload?.projectKey;
  if (!projectKey) return { issues: [], error: 'No project key found' };

  // Check if the current user is a project admin or site admin
  let isAdmin = false;
  const isAll = projectKey === 'all';
  if (!isAll) {
    try {
      const permResp = await api.asUser().requestJira(
        route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS`
      );
      const perms = await permResp.json();
      isAdmin = perms?.permissions?.ADMINISTER_PROJECTS?.havePermission === true;
    } catch (_) {}
  } else {
    isAdmin = true; // global page — trust the caller
  }

  try {
    const prefix = isAll ? 'deleted:' : `deleted:${projectKey}:`;
    const result = await kvs.query()
      .where('key', WhereConditions.beginsWith(prefix))
      .getMany();
    const issues = (result.results || []).map(r => r.value).filter(Boolean);
    issues.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
    return { issues, total: issues.length, isAdmin };
  } catch (e) {
    console.error('fetchDeletedIssues error:', e);
    return { issues: [], error: e.message, isAdmin };
  }
});

resolver.define('restoreDeletedIssue', async (req) => {
  const { issueKey } = req.payload || {};
  if (!issueKey) return { success: false, error: 'No issue key provided' };

  const projectKey = issueKey.split('-')[0];

  // Only admins (project admin or site admin) may restore issues
  let isAdmin = false;
  try {
    const permResp = await api.asUser().requestJira(
      route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS`
    );
    const perms = await permResp.json();
    isAdmin = perms?.permissions?.ADMINISTER_PROJECTS?.havePermission === true;
  } catch (_) {}

  if (!isAdmin) return { success: false, error: 'Only admins can restore issues' };

  const kvKey = `deleted:${projectKey}:${issueKey}`;

  try {
    const record = await kvs.get(kvKey);
    if (!record) return { success: false, error: 'Deleted record not found. It may have already been restored or purged.' };

    // Build the full issue body from every stored field
    const body = {
      fields: {
        project:   { key: projectKey },
        summary:   `[Restored] ${record.summary || issueKey}`,
        issuetype: { name: record.issueType || 'Task' },
      },
    };
    if (record.priority)    body.fields.priority    = { name: record.priority };
    if (record.labels && record.labels.length) body.fields.labels = record.labels;
    if (record.description) {
      // description may be plain text or an ADF object snapshot
      if (typeof record.description === 'object') {
        body.fields.description = record.description;
      } else {
        body.fields.description = {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: String(record.description) }] }],
        };
      }
    }
    if (record.assigneeId) body.fields.assignee    = { accountId: record.assigneeId };
    if (record.reporterId) body.fields.reporter    = { id: record.reporterId };
    if (Array.isArray(record.components) && record.components.length)
      body.fields.components = record.components.map(c => (typeof c === 'string' ? { name: c } : c));
    if (Array.isArray(record.fixVersions) && record.fixVersions.length)
      body.fields.fixVersions = record.fixVersions.map(v => (typeof v === 'string' ? { name: v } : v));

    // Use asApp() so reporter and other permission-restricted fields can be set
    const response = await api.asApp().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (response.status === 201) {
      const newKey = data.key;
      // Add a comment on the new issue linking it to the original key
      try {
        await api.asApp().requestJira(route`/rest/api/3/issue/${newKey}/comment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: {
              type: 'doc', version: 1,
              content: [{ type: 'paragraph', content: [{
                type: 'text',
                text: `This issue was restored from deleted issue ${issueKey} by the Issue History app. Original deletion recorded at: ${record.deletedAt || 'unknown'}.`,
              }] }],
            },
          }),
        });
      } catch (_) { /* non-fatal */ }
      await kvs.delete(kvKey);
      console.log(`✅ Restored ${issueKey} as ${newKey}`);
      return { success: true, newKey, originalKey: issueKey };
    }
    return { success: false, error: JSON.stringify(data.errors || data) };
  } catch (e) {
    console.error('restoreDeletedIssue error:', e);
    return { success: false, error: e.message };
  }
});

resolver.define('purgeDeletedIssue', async (req) => {
  const { issueKey } = req.payload || {};
  if (!issueKey) return { success: false, error: 'No issue key provided' };

  const projectKey = issueKey.split('-')[0];
  const kvKey = `deleted:${projectKey}:${issueKey}`;

  try {
    await kvs.delete(kvKey);
    console.log(`🗑️ Purged deleted record: ${kvKey}`);
    return { success: true };
  } catch (e) {
    console.error('purgeDeletedIssue error:', e);
    return { success: false, error: e.message };
  }
});

// ── Dashboard Gadget resolver ─────────────────────────────────────────────

resolver.define('fetchGadgetHistory', async (req) => {
  const {
    days = 3,
    projectKey = 'all',
    jqlMode = 'space',
    jqlText = '',
    currentUserOnly = false,
  } = req.payload || {};

  // get current user
  let currentUser = null;
  try {
    const meResp = await api.asUser().requestJira(route`/rest/api/3/myself`);
    const me = await meResp.json();
    currentUser = { name: me.displayName || '', accountId: me.accountId || '' };
  } catch (e) {
    console.error('fetchGadgetHistory: could not get current user', e.message);
  }

  const adjDays = Math.max(1, Number(days) || 3);
  const since = new Date();
  since.setDate(since.getDate() - adjDays);
  const sinceStr = since.toISOString().slice(0, 10);
  const sinceMs  = since.getTime();

  let jql = '';
  if (jqlMode === 'jql' && jqlText.trim()) {
    // jqlText from GlobalPageApp is already a complete WHERE clause (no ORDER BY).
    // Use it directly and only append ORDER BY.
    jql = `${jqlText.trim()} ORDER BY updated DESC`;
  } else if (jqlMode === 'space' && projectKey && projectKey !== 'all') {
    jql = `project = "${projectKey}" AND updated >= "${sinceStr}" ORDER BY updated DESC`;
  } else {
    jql = `updated >= "${sinceStr}" ORDER BY updated DESC`;
  }

  const history  = [];
  const projsSet = new Set();

  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/search/jql?jql=${jql}&fields=summary,project,issuetype,priority,status&expand=changelog&maxResults=100`
    );
    const data = await resp.json();
    (data.issues || []).forEach(issue => {
      const proj = issue.fields?.project?.key || issue.key?.split('-')[0] || '';
      if (proj) projsSet.add(proj);
      (issue.changelog?.histories || []).forEach(h => {
        if (new Date(h.created).getTime() < sinceMs) return;
        const author    = h.author?.displayName || '';
        const authorId  = h.author?.accountId   || '';
        if (!author || author.toLowerCase() === 'system') return;
        if (currentUserOnly && currentUser && authorId !== currentUser.accountId) return;
        (h.items || []).forEach(it => {
          const fromVal = (it.fromString !== undefined && it.fromString !== null) ? it.fromString : (it.from || '');
          const toVal   = (typeof it['toString'] === 'string') ? it['toString'] : (it.to || '');
          history.push({
            timestamp: h.created,
            author,
            authorId,
            issueKey:  issue.key,
            summary:   issue.fields?.summary          || '',
            issueType: issue.fields?.issuetype?.name  || '',
            priority:  issue.fields?.priority?.name   || '',
            status:    issue.fields?.status?.name     || '',
            projectKey: proj,
            field:     it.field || '',
            from:      fromVal,
            to:        toVal,
          });
        });
      });
    });
  } catch (e) {
    console.error('fetchGadgetHistory error:', e.message);
    return { history: [], total: 0, currentUser, projects: [], error: e.message };
  }

  history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return {
    history,
    total:       history.length,
    currentUser,
    projects:    Array.from(projsSet).sort(),
  };
});

resolver.define('saveReport', async (req) => {
  const { name, filters, viewType } = req.payload;
  const userId = req.context.accountId;

  // Fetch display name so reports can show the author's real name
  let displayName = userId;
  try {
    const meRes = await api.asUser().requestJira(route`/rest/api/3/myself`);
    const me = await meRes.json();
    displayName = me.displayName || userId;
  } catch (_) {}

  const id = `report:${userId}:${Date.now()}`;
  const report = { id, name, userId, displayName, filters, viewType, createdAt: new Date().toISOString() };

  await kvs.set(id, report);
  return report;
});

resolver.define('getReports', async (req) => {
  const userId = req.context.accountId;
  // Use key prefix so we only scan this user's own reports
  const res = await kvs.query().where('key', WhereConditions.beginsWith(`report:${userId}:`)).getMany();
  const reports = (res.results || []).map(r => r.value).filter(Boolean);
  reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return reports;
});
resolver.define('deleteReport', async (req) => {
  await kvs.delete(req.payload.id);
});

// ── App Permissions resolvers ─────────────────────────────────────────────
// Store per-project visibility rules for the history app.
// Settings are keyed as `app_perms:{projectKey}` in KVS.

resolver.define('getAppPermissions', async (req) => {
  const projectKey = req.context?.extension?.project?.key || req.payload?.projectKey;
  if (!projectKey) return { settings: null, isAdmin: false, error: 'No project key' };

  let isAdmin = false;
  try {
    const permResp = await api.asUser().requestJira(
      route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS`
    );
    const perms = await permResp.json();
    isAdmin = perms?.permissions?.ADMINISTER_PROJECTS?.havePermission === true;
  } catch (_) {}

  const stored = await kvs.get(`app_perms:${projectKey}`).catch(() => null);
  // Clone so we can safely override fields without touching the stored value
  const settings = {
    viewHistory:   (stored?.viewHistory)   || 'all',
    viewDeleted:   (stored?.viewDeleted)   || 'all',
    exportHistory: (stored?.exportHistory) || 'all',
  };

  // ── Apply group-based permission overrides (new group-permissions system) ─
  // Per-project settings take priority; fall back to _global settings if none set for this project.
  if (!isAdmin) {
    const [projectGroupPerms, globalGroupPerms] = await Promise.all([
      projectKey !== '_global' ? kvs.get(`group_perms:${projectKey}`).catch(() => null) : Promise.resolve(null),
      kvs.get(`group_perms:_global`).catch(() => null),
    ]);
    // Per-project overrides global; if neither exists skip enforcement
    const groupPerms = projectGroupPerms || globalGroupPerms;
    if (groupPerms) {
      let userGroupNames = new Set();
      try {
        const meResp = await api.asUser().requestJira(route`/rest/api/3/myself`);
        const me = await meResp.json();
        const grpResp = await api.asUser().requestJira(
          route`/rest/api/3/user/groups?accountId=${me.accountId}`
        );
        const grpData = await grpResp.json();
        (Array.isArray(grpData) ? grpData : []).forEach(g => { if (g.name) userGroupNames.add(g.name); });
      } catch (_) {}

      // Report → viewHistory + exportHistory
      if (Array.isArray(groupPerms.report) && !groupPerms.report.some(g => userGroupNames.has(g))) {
        settings.viewHistory   = 'admins_only';
        settings.exportHistory = 'admins_only';
      }
      // Deleted Work Items → viewDeleted
      if (Array.isArray(groupPerms.deletedWorkItems) && !groupPerms.deletedWorkItems.some(g => userGroupNames.has(g))) {
        settings.viewDeleted = 'admins_only';
      }
    }
  }

  return { settings, isAdmin };
});

resolver.define('saveAppPermissions', async (req) => {
  const { projectKey, settings } = req.payload || {};
  if (!projectKey) return { success: false, error: 'No project key' };

  let isAdmin = false;
  try {
    const permResp = await api.asUser().requestJira(
      route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS`
    );
    const perms = await permResp.json();
    isAdmin = perms?.permissions?.ADMINISTER_PROJECTS?.havePermission === true;
  } catch (_) {}

  if (!isAdmin) return { success: false, error: 'Only project admins can change permissions' };

  await kvs.set(`app_perms:${projectKey}`, {
    viewHistory:   settings.viewHistory   || 'all',
    viewDeleted:   settings.viewDeleted   || 'all',
    exportHistory: settings.exportHistory || 'all',
  });
  return { success: true };
});

// ── Fetch Jira groups (for group-based permissions UI) ─────────────────────
resolver.define('fetchJiraGroups', async (req) => {
  const { query = '' } = req.payload || {};
  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/groups/picker?maxResults=100&query=${query}`
    );
    const data = await resp.json();
    const groups = (data.groups || []).map(g => g.name).filter(Boolean);
    return { groups };
  } catch (e) {
    return { groups: [], error: e.message };
  }
});

// ── Group Permissions resolvers ─────────────────────────────────────────────
// Store a group-based access control list per project.
// KVS key: `group_perms:{projectKey}`
// Value: { report: string[]|null, deletedWorkItems: string[]|null, managePermissions: string[]|null }
// null = no restriction (everyone); [] = nobody except admins; ['g1'] = specific groups + admins

resolver.define('getGroupPermissions', async (req) => {
  const projectKey = req.context?.extension?.project?.key || req.payload?.projectKey || '_global';

  let isAdmin = false;
  try {
    if (projectKey === '_global') {
      // Global page — check site-level admin permission
      const permResp = await api.asUser().requestJira(
        route`/rest/api/3/mypermissions?permissions=ADMINISTER`
      );
      const perms = await permResp.json();
      isAdmin = perms?.permissions?.ADMINISTER?.havePermission === true;
    } else {
      const permResp = await api.asUser().requestJira(
        route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS`
      );
      const perms = await permResp.json();
      isAdmin = perms?.permissions?.ADMINISTER_PROJECTS?.havePermission === true;
    }
  } catch (_) {}

  const groupPerms = await kvs.get(`group_perms:${projectKey}`).catch(() => null) || {};

  // Check if the user is in the managePermissions group (gives non-admins panel access)
  let canManagePermissions = isAdmin;
  if (!isAdmin && Array.isArray(groupPerms.managePermissions) && groupPerms.managePermissions.length > 0) {
    try {
      const meResp = await api.asUser().requestJira(route`/rest/api/3/myself`);
      const me = await meResp.json();
      const grpResp = await api.asUser().requestJira(
        route`/rest/api/3/user/groups?accountId=${me.accountId}`
      );
      const grpData = await grpResp.json();
      const userGroups = new Set((Array.isArray(grpData) ? grpData : []).map(g => g.name));
      canManagePermissions = groupPerms.managePermissions.some(g => userGroups.has(g));
    } catch (_) {}
  }

  return { groupPerms, isAdmin, canManagePermissions };
});

resolver.define('saveGroupPermissions', async (req) => {
  const { projectKey, groupPerms } = req.payload || {};
  if (!projectKey) return { success: false, error: 'No project key' };

  let isAdmin = false;
  try {
    if (projectKey === '_global') {
      const permResp = await api.asUser().requestJira(
        route`/rest/api/3/mypermissions?permissions=ADMINISTER`
      );
      const perms = await permResp.json();
      isAdmin = perms?.permissions?.ADMINISTER?.havePermission === true;
    } else {
      const permResp = await api.asUser().requestJira(
        route`/rest/api/3/mypermissions?projectKey=${projectKey}&permissions=ADMINISTER_PROJECTS`
      );
      const perms = await permResp.json();
      isAdmin = perms?.permissions?.ADMINISTER_PROJECTS?.havePermission === true;
    }
  } catch (_) {}

  // Non-admins can save only if they are in the managePermissions group
  if (!isAdmin) {
    const stored = await kvs.get(`group_perms:${projectKey}`).catch(() => null) || {};
    if (Array.isArray(stored.managePermissions) && stored.managePermissions.length > 0) {
      try {
        const meResp = await api.asUser().requestJira(route`/rest/api/3/myself`);
        const me = await meResp.json();
        const grpResp = await api.asUser().requestJira(
          route`/rest/api/3/user/groups?accountId=${me.accountId}`
        );
        const grpData = await grpResp.json();
        const userGroups = new Set((Array.isArray(grpData) ? grpData : []).map(g => g.name));
        isAdmin = stored.managePermissions.some(g => userGroups.has(g));
      } catch (_) {}
    }
    if (!isAdmin) return { success: false, error: 'Permission denied: only site admins, project admins, or members of the Permissions group can change these settings' };
  }

  // Validate and sanitise — only accept known feature keys with null or string[]
  const safe = {};
  for (const key of ['report', 'deletedWorkItems', 'managePermissions']) {
    const val = groupPerms?.[key];
    safe[key] = Array.isArray(val) ? val.map(String).filter(Boolean) : null;
  }

  await kvs.set(`group_perms:${projectKey}`, safe);
  return { success: true };
});

// ── Sharing Reports resolvers ─────────────────────────────────────────────
// A "shared" report is stored under a shared: namespace so all users can read it.
// The share token is the report id — any team member who has the id can load it.

resolver.define('shareReport', async (req) => {
  const { id } = req.payload || {};
  if (!id) return { success: false, error: 'No report id provided' };

  const report = await kvs.get(id).catch(() => null);
  if (!report) return { success: false, error: 'Report not found' };

  // Fetch sharer's display name so Team Reports can show "by <name>"
  let sharedBy = report.displayName || report.userId || 'A teammate';
  try {
    const meRes = await api.asUser().requestJira(route`/rest/api/3/myself`);
    const me = await meRes.json();
    sharedBy = me.displayName || sharedBy;
  } catch (_) {}

  const sharedReport = { ...report, shared: true, sharedBy, sharedAt: new Date().toISOString() };

  // Store under both the original key (owner still sees it) and a shared: key
  await kvs.set(id, sharedReport);
  await kvs.set(`shared:${id}`, sharedReport);

  return { success: true, shareId: id };
});

resolver.define('loadSharedReport', async (req) => {
  const { shareId } = req.payload || {};
  if (!shareId) return { report: null, error: 'No shareId provided' };

  // Try shared: namespace first, then the direct key
  const report = (await kvs.get(`shared:${shareId}`).catch(() => null))
              || (await kvs.get(shareId).catch(() => null));

  if (!report) return { report: null, error: 'Shared report not found or no longer available' };
  return { report };
});

resolver.define('getSharedReports', async () => {
  // Returns all reports that have been explicitly shared (shared: true flag)
  // so any user on the team can browse and load them.
  try {
    const res = await kvs.query().where('key', WhereConditions.beginsWith('shared:')).getMany();
    const reports = (res.results || []).map(r => r.value).filter(Boolean);
    reports.sort((a, b) => new Date(b.sharedAt || b.createdAt) - new Date(a.sharedAt || a.createdAt));
    return { reports };
  } catch (e) {
    return { reports: [], error: e.message };
  }
});

// ── Bulk Revert Changes ───────────────────────────────────────────────────────
// Accepts an array of change rows and reverts each field back to its "from" value.
// Supported fields: summary, priority, labels, status (via transitions).
// Unsupported fields return a descriptive error so the UI can show partial results.

resolver.define('revertChanges', async (req) => {
  const { issueKey, changes } = req.payload || {};
  if (!issueKey || !Array.isArray(changes) || changes.length === 0) {
    return { results: [], error: 'Missing issueKey or changes' };
  }

  // Verify the caller has edit permission on this issue
  let canEdit = false;
  try {
    const permResp = await api.asUser().requestJira(
      route`/rest/api/3/mypermissions?issueKey=${issueKey}&permissions=EDIT_ISSUES`
    );
    const perms = await permResp.json();
    canEdit = perms?.permissions?.EDIT_ISSUES?.havePermission === true;
  } catch (_) {}

  if (!canEdit) {
    return {
      results: changes.map(c => ({
        field: c.field,
        success: false,
        error: 'You do not have Edit permission for this issue',
      })),
    };
  }

  const results      = [];
  const fieldsPayload = {};
  const statusItems  = [];

  for (const change of changes) {
    const fieldName = (change.field || '').toLowerCase().trim();
    const fromVal   = change.from != null ? String(change.from) : '';

    if (fieldName === 'summary') {
      fieldsPayload['summary'] = fromVal;
      results.push({ field: change.field, success: true });
    } else if (fieldName === 'priority') {
      fieldsPayload['priority'] = fromVal ? { name: fromVal } : null;
      results.push({ field: change.field, success: true });
    } else if (fieldName === 'labels') {
      fieldsPayload['labels'] = fromVal ? fromVal.split(/[\s,]+/).filter(Boolean) : [];
      results.push({ field: change.field, success: true });
    } else if (fieldName === 'story points' || fieldName === 'story point estimate') {
      const num = parseFloat(fromVal);
      if (!isNaN(num)) {
        fieldsPayload['story_points'] = num;
        results.push({ field: change.field, success: true });
      } else {
        results.push({ field: change.field, success: false, error: 'Could not parse story point value' });
      }
    } else if (fieldName === 'status') {
      statusItems.push({ field: change.field, fromVal });
      // result pushed after transition attempt below
    } else {
      results.push({
        field: change.field,
        success: false,
        error: 'Automatic revert is not supported for this field — please update it manually in Jira.',
      });
    }
  }

  // Apply simple field updates in one PUT call
  if (Object.keys(fieldsPayload).length > 0) {
    try {
      const resp = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: fieldsPayload }),
        }
      );
      if (resp.status !== 204 && !resp.ok) {
        let errText = `HTTP ${resp.status}`;
        try {
          const d = await resp.json();
          errText = JSON.stringify(d.errors || d.errorMessages || d);
        } catch (_) {}
        // Mark the affected result entries as failed
        for (let i = 0; i < results.length; i++) {
          if (results[i].success && Object.keys(fieldsPayload).some(
            k => results[i].field?.toLowerCase().includes(k.replace('_', ' '))
          )) {
            results[i] = { ...results[i], success: false, error: errText };
          }
        }
      }
    } catch (e) {
      for (let i = 0; i < results.length; i++) {
        if (results[i].success) results[i] = { ...results[i], success: false, error: e.message };
      }
    }
  }

  // Handle status transitions individually
  for (const { field, fromVal } of statusItems) {
    if (!fromVal) {
      results.push({ field, success: false, error: 'No target status value to revert to' });
      continue;
    }
    try {
      const transResp = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}/transitions`
      );
      const transData = await transResp.json();
      const match = (transData.transitions || []).find(
        t => (t.to?.name || '').toLowerCase() === fromVal.toLowerCase()
      );
      if (!match) {
        results.push({
          field,
          success: false,
          error: `No transition to "${fromVal}" is available from the current status. You may need to revert it manually.`,
        });
        continue;
      }
      const postResp = await api.asUser().requestJira(
        route`/rest/api/3/issue/${issueKey}/transitions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transition: { id: match.id } }),
        }
      );
      const ok = postResp.status === 204 || postResp.ok;
      results.push({ field, success: ok, error: ok ? null : `HTTP ${postResp.status}` });
    } catch (e) {
      results.push({ field, success: false, error: e.message });
    }
  }

  console.log(`revertChanges for ${issueKey}: ${results.length} results`);
  return { results, issueKey };
});

// ── Search Jira users (for Assignee / Reporter pickers in global page) ────────────────
resolver.define('searchJiraUsers', async (req) => {
  const { query = '' } = req.payload || {};
  if (!query.trim()) return { users: [] };
  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/user/search?query=${query}&maxResults=20`
    );
    const data = await resp.json();
    const users = (Array.isArray(data) ? data : [])
      .map(u => ({ accountId: u.accountId, displayName: u.displayName || u.emailAddress || u.accountId }));
    return { users };
  } catch (e) {
    return { users: [], error: e.message };
  }
});

// ── Fetch current user's saved Jira filters ──────────────────────────────────────────
resolver.define('fetchSavedFilters', async () => {
  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/filter/my?expand=jql&maxResults=50`
    );
    const data = await resp.json();
    const filters = (Array.isArray(data) ? data : [])
      .map(f => ({ id: String(f.id), name: f.name, jql: f.jql || '' }));
    return { filters };
  } catch (e) {
    return { filters: [], error: e.message };
  }
});

// ── Fetch all labels used across the site ──────────────────────────────────
resolver.define('fetchJiraLabels', async () => {
  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/label?maxResults=200`
    );
    const data = await resp.json();
    const labels = (data.values || []).map(l => (typeof l === 'string' ? l : l.label || '')).filter(Boolean);
    return { labels };
  } catch (e) {
    return { labels: [], error: e.message };
  }
});

// ── Fetch all sprints accessible to the user ──────────────────────────────
resolver.define('fetchJiraSprints', async () => {
  try {
    // Get all boards first, then fetch their sprints
    const boardResp = await api.asUser().requestJira(
      route`/rest/agile/1.0/board?maxResults=50`
    );
    const boardData = await boardResp.json();
    const boards = boardData.values || [];
    const sprintSet = new Map(); // id -> {id, name, state}
    await Promise.all(boards.slice(0, 20).map(async board => {
      try {
        const sResp = await api.asUser().requestJira(
          route`/rest/agile/1.0/board/${board.id}/sprint?maxResults=100`
        );
        const sData = await sResp.json();
        (sData.values || []).forEach(s => {
          if (s.id && s.name) sprintSet.set(s.id, { id: s.id, name: s.name, state: s.state || '' });
        });
      } catch (_) {}
    }));
    const sprints = Array.from(sprintSet.values())
      .sort((a, b) => a.name.localeCompare(b.name));
    return { sprints };
  } catch (e) {
    return { sprints: [], error: e.message };
  }
});

// ── Fetch all available Jira fields (system + custom) for the field filter dropdown ──
resolver.define('fetchIssueFields', async () => {
  try {
    const response = await api.asUser().requestJira(route`/rest/api/3/field`);
    if (!response.ok) return { fields: [] };
    const data = await response.json();
    const fields = (Array.isArray(data) ? data : [])
      .filter(f => f.name && f.id)
      .map(f => ({ id: f.id, name: f.name, custom: !!f.custom }));
    return { fields };
  } catch (e) {
    console.error('fetchIssueFields error:', e);
    return { fields: [], error: e.message };
  }
});

// ── Security Scanner / PII & DLP ────────────────────────────────────────────
// Scans issue fields and change history for sensitive data patterns.
// Returns a list of findings: { issueKey, field, snippet, actualValue, pattern, severity }

const PII_PATTERNS = [
  { name: 'Email Address',      regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,         severity: 'high'     },
  { name: 'Credit Card Number', regex: /\b(?:\d[ \-]?){13,16}\b/g,                                    severity: 'critical' },
  { name: 'Phone Number',       regex: /\b(?:\+?\d[\d\s\-().]{7,}\d)\b/g,                             severity: 'medium'   },
  { name: 'IP Address',         regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,                    severity: 'medium'   },
  { name: 'SSN (US)',           regex: /\b\d{3}[\-\s]?\d{2}[\-\s]?\d{4}\b/g,                         severity: 'critical' },
  { name: 'Passport / ID',      regex: /\b[A-Z]{1,2}\d{6,9}\b/g,                                     severity: 'high'     },
  { name: 'API Key / Token',    regex: /(?:api[_\-]?key|token|secret|password|bearer)\s*[=:]\s*\S+/gi, severity: 'critical' },
  { name: 'IBAN',               regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,16})?\b/g,     severity: 'high'     },
  { name: 'ZIP / Postal Code',  regex: /\b\d{5}(?:-\d{4})?\b/g,                                      severity: 'low'      },
];

function scanText(text) {
  const findings = [];
  if (!text || typeof text !== 'string') return findings;
  for (const { name, regex, severity } of PII_PATTERNS) {
    const matches = text.match(regex);
    if (matches) {
      findings.push({
        pattern:     name,
        severity,
        actualValue: matches[0],                                                       // exact matched value
        snippet:     matches[0].slice(0, 60) + (matches[0].length > 60 ? '…' : ''),   // backward compat
        count:       matches.length,
      });
    }
  }
  return findings;
}

resolver.define('scanIssueForPII', async (req) => {
  const { issueKey, projectKey, scanScope = 'current' } = req.payload || {};
  // issueKey OR projectKey is optional — if neither given, scan all accessible issues

  const allFindings = [];

  const processIssue = async (key) => {
    try {
      const [issueResp, commentsResp] = await Promise.all([
        api.asUser().requestJira(route`/rest/api/3/issue/${key}?expand=changelog&fields=summary,description,comment,assignee,reporter,updated,created`),
        api.asUser().requestJira(route`/rest/api/3/issue/${key}/comment?maxResults=50`),
      ]);
      const issue = await issueResp.json();
      const fields = issue.fields || {};
      const summary   = fields.summary || '';
      const updater   = fields.assignee?.displayName || fields.reporter?.displayName || '';
      const firstDetected = fields.created || new Date().toISOString();

      // Scan current field values
      const currentFields = {
        Summary:     fields.summary || '',
        Description: extractAdfText(fields.description),
      };
      for (const [fieldName, value] of Object.entries(currentFields)) {
        for (const f of scanText(value)) {
          allFindings.push({ issueKey: key, summary, updater, firstDetected, field: fieldName, context: 'Current value', ...f });
        }
      }

      // Scan comments
      const commentsData = await commentsResp.json();
      (commentsData.comments || []).forEach(c => {
        const text = extractAdfText(c.body);
        const commentUpdater = c.author?.displayName || 'Unknown';
        const commentDate    = c.created || firstDetected;
        for (const f of scanText(text)) {
          allFindings.push({ issueKey: key, summary, updater: commentUpdater, firstDetected: commentDate, field: 'Comment', context: `By ${commentUpdater} on ${commentDate?.slice(0, 10)}`, ...f });
        }
      });

      // Scan changelog history (fromString / toString)
      if (scanScope === 'history') {
        (issue.changelog?.histories || []).forEach(h => {
          (h.items || []).forEach(it => {
            for (const val of [it.fromString, it.toString]) {
              for (const f of scanText(val)) {
                allFindings.push({ issueKey: key, summary, updater: h.author?.displayName || '', firstDetected: h.created || firstDetected, field: `History: ${it.field}`, context: `Changed by ${h.author?.displayName || 'Unknown'} on ${h.created?.slice(0, 10)}`, ...f });
              }
            }
          });
        });
      }
    } catch (e) {
      console.error(`PII scan error for ${key}:`, e.message);
    }
  };

  if (issueKey) {
    await processIssue(issueKey);
  } else {
    // Build JQL: if projectKey given scan that project, otherwise scan all accessible
    const since = new Date(); since.setDate(since.getDate() - 30);
    const sinceStr = since.toISOString().slice(0, 10);
    const jql = projectKey
      ? `project = "${projectKey}" AND updated >= "${sinceStr}" ORDER BY updated DESC`
      : `updated >= "${sinceStr}" ORDER BY updated DESC`;
    try {
      const searchResp = await api.asUser().requestJira(
        route`/rest/api/3/search/jql?jql=${jql}&fields=key&maxResults=50`
      );
      const searchData = await searchResp.json();
      const keys = (searchData.issues || []).map(i => i.key);
      // Process in batches of 5
      for (let i = 0; i < keys.length; i += 5) {
        await Promise.all(keys.slice(i, i + 5).map(processIssue));
      }
    } catch (e) {
      console.error('PII scan project search error:', e.message);
    }
  }

  allFindings.sort((a, b) => {
    const sev = { critical: 0, high: 1, medium: 2, low: 3 };
    return (sev[a.severity] ?? 4) - (sev[b.severity] ?? 4);
  });

  return { findings: allFindings, total: allFindings.length };
});

function extractAdfText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.text) return node.text;
  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractAdfText).join(' ');
  }
  return '';
}

// ── Fetch saved Jira filters for the project-page filter selector ─────────
// (already exists as fetchSavedFilters above; this resolver extends it to also
//  accept a projectKey hint and return recently-used filters for that project)
resolver.define('fetchProjectSavedFilters', async (req) => {
  const { projectKey } = req.payload || {};
  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/filter/my?expand=jql&maxResults=50`
    );
    const data = await resp.json();
    let filters = (Array.isArray(data) ? data : [])
      .map(f => ({ id: String(f.id), name: f.name, jql: f.jql || '' }));
    // Put filters mentioning the project first
    if (projectKey) {
      const upper = projectKey.toUpperCase();
      filters = [
        ...filters.filter(f => f.jql.toUpperCase().includes(upper)),
        ...filters.filter(f => !f.jql.toUpperCase().includes(upper)),
      ];
    }
    return { filters };
  } catch (e) {
    return { filters: [], error: e.message };
  }
});

// ── Fetch all accessible Jira projects (for Security Scanner Space dropdown) ─
resolver.define('fetchAccessibleProjects', async () => {
  try {
    const resp = await api.asUser().requestJira(
      route`/rest/api/3/project/search?maxResults=100&orderBy=name&expand=`
    );
    const data = await resp.json();
    const projects = (data.values || []).map(p => ({ key: p.key, name: p.name }));
    return { projects };
  } catch (e) {
    return { projects: [], error: e.message };
  }
});

export const handler = resolver.getDefinitions();
export { issueCreated, issueUpdated, issueDeleted };

