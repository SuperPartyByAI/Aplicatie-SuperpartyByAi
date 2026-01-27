#!/usr/bin/env node
/* eslint-disable no-console */
const admin = require('firebase-admin');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ACTIVE_ACCOUNT_ID = process.env.ACTIVE_ACCOUNT_ID || process.argv[2];
if (!ACTIVE_ACCOUNT_ID) {
  console.error('Missing ACTIVE_ACCOUNT_ID (env or arg).');
  process.exit(1);
}

function safeLoadServiceAccount() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.SERVICE_ACCOUNT_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const json = JSON.parse(raw);
      return { json, source: candidate };
    } catch (_) {
      // Ignore and continue
    }
  }
  return { json: null, source: null };
}

function initAdmin() {
  if (admin.apps.length) return { ok: true };

  try {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return { ok: true };
  } catch (_) {
    // fallback to service account path if provided
  }

  const { json } = safeLoadServiceAccount();
  if (json) {
    if (typeof json.private_key === 'string') {
      json.private_key = json.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({ credential: admin.credential.cert(json) });
    return { ok: true };
  }

  return { ok: false };
}

function toIso(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

async function getLatestDoc(query) {
  const snap = await query.limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
}

async function getLatestMessageDoc(threadRef) {
  const collection = threadRef.collection('mesaje');
  const orderFields = ['tsServer', 'tsClient', 'createdAt', 'timestamp'];
  for (const field of orderFields) {
    try {
      const doc = await getLatestDoc(collection.orderBy(field, 'desc'));
      if (doc) return { ...doc, orderField: field };
    } catch (_) {
      // ignore, try next
    }
  }
  // Fallback: get last 20 and compute by best timestamp
  const snap = await collection.limit(20).get();
  if (snap.empty) return null;
  let best = null;
  for (const d of snap.docs) {
    const data = d.data();
    const ts =
      data.tsServer ||
      data.tsClient ||
      data.createdAt ||
      data.timestamp ||
      null;
    const iso = toIso(ts);
    if (!best || (iso && iso > best.iso)) {
      best = { id: d.id, data, iso };
    }
  }
  return best ? { id: best.id, data: best.data, orderField: 'fallback' } : null;
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

async function runQuery(projectId, parentPath, structuredQuery, token) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const body = {
    parent: `projects/${projectId}/databases/(default)/documents/${parentPath}`,
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

async function main() {
  const adminInit = initAdmin();
  const resolvedProjectId = admin.apps.length
    ? admin.app().options.projectId || null
    : null;
  const projectId =
    resolvedProjectId || process.env.FIREBASE_PROJECT_ID || 'superparty-frontend';

  const result = {
    projectId,
    activeAccountId: ACTIVE_ACCOUNT_ID,
    accountExists: false,
    accountLease: {
      claimedAt: null,
      leaseUntil: null,
      updatedAt: null,
    },
    fireTopThreads: [],
    sampleThreadId: null,
    latestMessage: null,
    inboundDedupe: null,
    messageIds: null,
    otherAccountDocsInFireCount: null,
  };

  let useAdmin = adminInit.ok;
  if (useAdmin) {
    try {
      const db = admin.firestore();
      // A) conturi/<accountId>
      const accountRef = db.collection('conturi').doc(ACTIVE_ACCOUNT_ID);
      const accountSnap = await accountRef.get();
      if (accountSnap.exists) {
        const data = accountSnap.data() || {};
        result.accountExists = true;
        result.accountLease = {
          claimedAt: toIso(data.claimedAt),
          leaseUntil: toIso(data.leaseUntil),
          updatedAt: toIso(data.updatedAt),
        };
      }

      // B) top 10 threads from fire
      let threadsQuery = db.collection('fire').where('ID cont', '==', ACTIVE_ACCOUNT_ID);
      try {
        threadsQuery = threadsQuery.orderBy('ultimulMesajLa', 'desc');
      } catch (_) {
        // ignore if index missing
      }
      const threadsSnap = await threadsQuery.limit(10).get();
      const threads = [];
      for (const doc of threadsSnap.docs) {
        const data = doc.data() || {};
        threads.push({
          id: doc.id,
          ultimulMesajLa: toIso(data['ultimulMesajLa']),
          actualizatLa: toIso(data['actualizatLa'] || data['updatedAt']),
          previewStatus: data['ultimaPrevizualizare a Mesajului'] ? 'NON_EMPTY' : 'EMPTY',
        });
      }
      result.fireTopThreads = threads;
      result.sampleThreadId = threads[0] ? threads[0].id : null;

      // D) latest message in sample thread
      if (result.sampleThreadId) {
        const threadRef = db.collection('fire').doc(result.sampleThreadId);
        const latest = await getLatestMessageDoc(threadRef);
        if (latest) {
          const data = latest.data || {};
          result.latestMessage = {
            docId: latest.id,
            ts: toIso(data.tsServer || data.tsClient || data.createdAt || data.timestamp),
            fromMe: data.fromMe ?? data.direction ?? null,
            bodyStatus: data.body ? 'NON_EMPTY' : 'EMPTY',
            orderField: latest.orderField || null,
          };
        }
      }

      // E) Dedupe de intrare
      const dedupeCol = db.collection('Dedupe de intrare');
      let dedupeQuery = dedupeCol.where('ID cont', '==', ACTIVE_ACCOUNT_ID);
      try {
        dedupeQuery = dedupeQuery.orderBy('procesatLa', 'desc');
      } catch (_) {
        // ignore
      }
      const dedupeSnap = await dedupeQuery.limit(1).get();
      if (!dedupeSnap.empty) {
        const doc = dedupeSnap.docs[0];
        const data = doc.data() || {};
        result.inboundDedupe = {
          docId: doc.id,
          procesatLa: toIso(data.procesatLa),
          expiraLa: toIso(data.expiraLa),
        };
      }

      // F) ID-uri_mesaje
      const idsCol = db.collection('ID-uri_mesaje');
      let idsQuery = idsCol.where('ID cont', '==', ACTIVE_ACCOUNT_ID);
      try {
        idsQuery = idsQuery.orderBy('creatLa', 'desc');
      } catch (_) {
        // ignore
      }
      const idsSnap = await idsQuery.limit(1).get();
      if (!idsSnap.empty) {
        const doc = idsSnap.docs[0];
        const data = doc.data() || {};
        result.messageIds = {
          docId: doc.id,
          IDDocMesaj: data.IDDocMesaj || null,
          creatLa: toIso(data.creatLa),
        };
      }

      // G) count docs in fire with other accountId
      try {
        const countSnap = await db
          .collection('fire')
          .where('ID cont', '!=', ACTIVE_ACCOUNT_ID)
          .count()
          .get();
        result.otherAccountDocsInFireCount = countSnap.data().count || 0;
      } catch (_) {
        // Fallback: limited scan
        const scan = await db.collection('fire').limit(500).get();
        let count = 0;
        for (const doc of scan.docs) {
          const data = doc.data() || {};
          if (data['ID cont'] && data['ID cont'] !== ACTIVE_ACCOUNT_ID) count += 1;
        }
        result.otherAccountDocsInFireCount = count;
      }
    } catch (_) {
      useAdmin = false;
    }
  } else {
    const token = getIdToken();
    if (!token) {
      console.error('Unable to initialize Firebase Admin or get Firebase ID token.');
      process.exit(1);
    }

    // A) conturi/<accountId>
    try {
      const doc = await fetchJson(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/conturi/${ACTIVE_ACCOUNT_ID}`,
        token
      );
      const data = decodeDoc(doc);
      result.accountExists = true;
      result.accountLease = {
        claimedAt: toIso(data.claimedAt),
        leaseUntil: toIso(data.leaseUntil),
        updatedAt: toIso(data.updatedAt),
      };
    } catch (_) {
      // keep defaults
    }

    // B) top 10 threads from fire
    try {
      const query = {
        from: [{ collectionId: 'fire' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ID cont' },
            op: 'EQUAL',
            value: { stringValue: ACTIVE_ACCOUNT_ID },
          },
        },
        orderBy: [
          {
            field: { fieldPath: 'ultimulMesajLa' },
            direction: 'DESCENDING',
          },
        ],
        limit: 10,
      };
      const rows = await runQuery(projectId, '', query, token);
      const threads = [];
      for (const row of rows) {
        if (!row.document) continue;
        const docId = row.document.name.split('/').pop();
        const data = decodeDoc(row.document);
        threads.push({
          id: docId,
          ultimulMesajLa: toIso(data['ultimulMesajLa']),
          actualizatLa: toIso(data['actualizatLa'] || data['updatedAt']),
          previewStatus: data['ultimaPrevizualizare a Mesajului'] ? 'NON_EMPTY' : 'EMPTY',
        });
      }
      result.fireTopThreads = threads;
      result.sampleThreadId = threads[0] ? threads[0].id : null;
    } catch (_) {
      // keep defaults
    }

    // D) latest message in sample thread
    if (result.sampleThreadId) {
      try {
        const query = {
          from: [{ collectionId: 'mesaje' }],
          orderBy: [
            {
              field: { fieldPath: 'tsServer' },
              direction: 'DESCENDING',
            },
          ],
          limit: 1,
        };
        const rows = await runQuery(
          projectId,
          `fire/${result.sampleThreadId}`,
          query,
          token
        );
        const row = rows.find((r) => r.document);
        if (row && row.document) {
          const docId = row.document.name.split('/').pop();
          const data = decodeDoc(row.document);
          result.latestMessage = {
            docId,
            ts: toIso(data.tsServer || data.tsClient || data.createdAt || data.timestamp),
            fromMe: data.fromMe ?? data.direction ?? null,
            bodyStatus: data.body ? 'NON_EMPTY' : 'EMPTY',
            orderField: 'tsServer',
          };
        }
      } catch (_) {
        // ignore
      }
    }

    // E) Dedupe de intrare
    try {
      const query = {
        from: [{ collectionId: 'Dedupe de intrare' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ID cont' },
            op: 'EQUAL',
            value: { stringValue: ACTIVE_ACCOUNT_ID },
          },
        },
        orderBy: [
          {
            field: { fieldPath: 'procesatLa' },
            direction: 'DESCENDING',
          },
        ],
        limit: 1,
      };
      const rows = await runQuery(projectId, '', query, token);
      const row = rows.find((r) => r.document);
      if (row && row.document) {
        const docId = row.document.name.split('/').pop();
        const data = decodeDoc(row.document);
        result.inboundDedupe = {
          docId,
          procesatLa: toIso(data.procesatLa),
          expiraLa: toIso(data.expiraLa),
        };
      }
    } catch (_) {
      // ignore
    }

    // F) ID-uri_mesaje
    try {
      const query = {
        from: [{ collectionId: 'ID-uri_mesaje' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ID cont' },
            op: 'EQUAL',
            value: { stringValue: ACTIVE_ACCOUNT_ID },
          },
        },
        orderBy: [
          {
            field: { fieldPath: 'creatLa' },
            direction: 'DESCENDING',
          },
        ],
        limit: 1,
      };
      const rows = await runQuery(projectId, '', query, token);
      const row = rows.find((r) => r.document);
      if (row && row.document) {
        const docId = row.document.name.split('/').pop();
        const data = decodeDoc(row.document);
        result.messageIds = {
          docId,
          IDDocMesaj: data.IDDocMesaj || null,
          creatLa: toIso(data.creatLa),
        };
      }
    } catch (_) {
      // ignore
    }

    // G) count docs in fire with other accountId (best-effort)
    try {
      const query = {
        from: [{ collectionId: 'fire' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'ID cont' },
            op: 'NOT_EQUAL',
            value: { stringValue: ACTIVE_ACCOUNT_ID },
          },
        },
        limit: 50,
      };
      const rows = await runQuery(projectId, '', query, token);
      let count = 0;
      for (const row of rows) {
        if (row.document) count += 1;
      }
      result.otherAccountDocsInFireCount = count;
    } catch (_) {
      result.otherAccountDocsInFireCount = null;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
