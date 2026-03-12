import { KVS } from '@forge/kvs';

async function issueUpdated(event) {
  console.log('=== Issue Updated Event ===');
  console.log('Event:', event);
  
  const kvs = new KVS();

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

export { issueUpdated };