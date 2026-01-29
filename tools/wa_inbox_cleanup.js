#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('child_process');

const ACTIVE_ACCOUNT_ID = process.env.ACTIVE_ACCOUNT_ID;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'superparty-frontend';
const APPLY = process.argv.includes('--apply');

if (!ACTIVE_ACCOUNT_ID) {
  console.error('Missing ACTIVE_ACCOUNT_ID env.');
  process.exit(1);
}

function getIdToken() {
  try {
    const token = execSync('firebase auth:print-identity-token', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return token || null;
  } catch (_) {
    return null;
  }
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.booleanValue !== undefined) return Boolean(value.booleanValue);
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.mapValue !== undefined) return value.mapValue;
  if (value.arrayValue !== undefined) return value.arrayValue;
  return null;
}

function decodeDoc(doc) {
  if (!doc || !doc.fields) return {};
  const out = {};
  for (const [key, val] of Object.entries(doc.fields)) {
    out[key] = decodeValue(val);
  }
  return out;
}

async function fetchJson(url, token) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function deleteDoc(path, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE ${path} failed: HTTP ${res.status}: ${text}`);
  }
}

async function listCollection(collectionPath, token) {
  const docs = [];
  let pageToken = null;
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}`
    );
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetchJson(url.toString(), token);
    if (res.documents) docs.push(...res.documents);
    pageToken = res.nextPageToken || null;
  } while (pageToken);
  return docs;
}

async function runQuery(parentPath, structuredQuery, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    parent: `projects/${PROJECT_ID}/databases/(default)/documents/${parentPath}`,
    structuredQuery,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

function normalizeDocAccountId(data) {
  return data.accountId || data.account_id || data['accountId'] || null;
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return null;
}

async function main() {
  const token = getIdToken();
  if (!token) {
    console.error('Unable to get Firebase ID token (run firebase login).');
    process.exit(1);
  }

  const summary = {
    apply: APPLY,
    activeAccountId: ACTIVE_ACCOUNT_ID,
    deleted: {
      threads: 0,
      threadMessages: 0,
      inboundDedupe: 0,
      messageIds: 0,
      waSessions: 0,
      waMetrics: 0,
    },
    otherAccountIds: new Set(),
    topThreads: [],
    duplicatesByClientJid: 0,
  };

  // threads cleanup
  const threadsDocs = await listCollection('threads', token);
  const deleteThreads = [];
  const threadsForActive = [];
  for (const doc of threadsDocs) {
    const data = decodeDoc(doc);
    const accountId = normalizeDocAccountId(data);
    if (accountId && accountId !== ACTIVE_ACCOUNT_ID) {
      summary.otherAccountIds.add(accountId);
      deleteThreads.push(doc);
      continue;
    }
    if (accountId === ACTIVE_ACCOUNT_ID) {
      threadsForActive.push({ doc, data });
    }
  }

  for (const doc of deleteThreads) {
    const docId = doc.name.split('/').pop();
    const msgDocs = await listCollection(`threads/${docId}/messages`, token);
    if (APPLY) {
      for (const msg of msgDocs) {
        const msgPath = msg.name.split(`/documents/`)[1];
        await deleteDoc(msgPath, token);
        summary.deleted.threadMessages += 1;
      }
      await deleteDoc(`threads/${docId}`, token);
    }
    summary.deleted.threads += 1;
  }

  // inboundDedupe cleanup
  const inboundDocs = await listCollection('inboundDedupe', token);
  for (const doc of inboundDocs) {
    const data = decodeDoc(doc);
    const accountId = normalizeDocAccountId(data);
    if (accountId && accountId !== ACTIVE_ACCOUNT_ID) {
      summary.otherAccountIds.add(accountId);
      if (APPLY) {
        const path = doc.name.split(`/documents/`)[1];
        await deleteDoc(path, token);
      }
      summary.deleted.inboundDedupe += 1;
    }
  }

  // message_ids cleanup
  const msgIdDocs = await listCollection('message_ids', token);
  for (const doc of msgIdDocs) {
    const data = decodeDoc(doc);
    const accountId = normalizeDocAccountId(data);
    if (accountId && accountId !== ACTIVE_ACCOUNT_ID) {
      summary.otherAccountIds.add(accountId);
      if (APPLY) {
        const path = doc.name.split(`/documents/`)[1];
        await deleteDoc(path, token);
      }
      summary.deleted.messageIds += 1;
    }
  }

  // wa_sessions cleanup
  const sessionDocs = await listCollection('wa_sessions', token);
  for (const doc of sessionDocs) {
    const data = decodeDoc(doc);
    const accountId = normalizeDocAccountId(data);
    if (accountId && accountId !== ACTIVE_ACCOUNT_ID) {
      summary.otherAccountIds.add(accountId);
      if (APPLY) {
        const path = doc.name.split(`/documents/`)[1];
        await deleteDoc(path, token);
      }
      summary.deleted.waSessions += 1;
    }
  }

  // wa_metrics cleanup
  const metricsDocs = await listCollection('wa_metrics', token);
  for (const doc of metricsDocs) {
    const data = decodeDoc(doc);
    const accountId = normalizeDocAccountId(data);
    if (accountId && accountId !== ACTIVE_ACCOUNT_ID) {
      summary.otherAccountIds.add(accountId);
      if (APPLY) {
        const path = doc.name.split(`/documents/`)[1];
        await deleteDoc(path, token);
      }
      summary.deleted.waMetrics += 1;
    }
  }

  // Top threads after cleanup
  const query = {
    from: [{ collectionId: 'threads' }],
    where: {
      fieldFilter: {
        field: { fieldPath: 'accountId' },
        op: 'EQUAL',
        value: { stringValue: ACTIVE_ACCOUNT_ID },
      },
    },
    orderBy: [
      {
        field: { fieldPath: 'lastMessageAt' },
        direction: 'DESCENDING',
      },
    ],
    limit: 5,
  };
  const rows = await runQuery('', query, token);
  for (const row of rows) {
    if (!row.document) continue;
    const docId = row.document.name.split('/').pop();
    const data = decodeDoc(row.document);
    summary.topThreads.push({
      threadId: docId,
      lastMessageAt: toIso(data.lastMessageAt),
    });
  }

  // Duplicates by clientJid (active only)
  const seen = new Map();
  for (const { doc, data } of threadsForActive) {
    const clientJid = data.clientJid || null;
    if (!clientJid) continue;
    const key = `${ACTIVE_ACCOUNT_ID}__${clientJid}`;
    if (seen.has(key)) summary.duplicatesByClientJid += 1;
    else seen.set(key, doc.name);
  }

  summary.otherAccountIds = Array.from(summary.otherAccountIds).sort();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
