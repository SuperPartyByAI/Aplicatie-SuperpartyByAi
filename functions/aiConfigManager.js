/**
 * aiConfigManager.js
 *
 * Loads and merges AI logic config:
 * - Global: /ai_config/global
 * - Per-event override: /evenimente/{eventId}/ai_overrides/current
 *
 * Returned config is used by chatEventOpsV2 to build prompts and to log meta.
 */
'use strict';

const crypto = require('crypto');

const DEFAULT_CONFIG = {
  // If present in Firestore, these can override the prompt completely/partially.
  systemPrompt: null,
  systemPromptAppend: null,
  requiredFields: ['date', 'address', 'rolesDraft'],
};

function _safeString(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

function _normalizeConfigDoc(data) {
  const d = data || {};
  return {
    version: typeof d.version === 'number' ? d.version : null,
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || null,
    systemPrompt: _safeString(d.systemPrompt),
    systemPromptAppend: _safeString(d.systemPromptAppend),
    requiredFields: Array.isArray(d.requiredFields) ? d.requiredFields.map(String) : null,
  };
}

function _mergeConfig(globalCfg, overrideCfg) {
  const out = { ...DEFAULT_CONFIG };

  const g = globalCfg || {};
  const o = overrideCfg || {};

  out.systemPrompt = o.systemPrompt ?? g.systemPrompt ?? DEFAULT_CONFIG.systemPrompt;
  out.systemPromptAppend = o.systemPromptAppend ?? g.systemPromptAppend ?? DEFAULT_CONFIG.systemPromptAppend;
  out.requiredFields = o.requiredFields ?? g.requiredFields ?? DEFAULT_CONFIG.requiredFields;

  return out;
}

function _hashConfig(config) {
  const json = JSON.stringify(
    {
      systemPrompt: config.systemPrompt || null,
      systemPromptAppend: config.systemPromptAppend || null,
      requiredFields: config.requiredFields || [],
    },
    null,
    0
  );
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

async function getEffectiveConfig(db, { eventId } = {}) {
  const globalSnap = await db.collection('ai_config').doc('global').get();
  const globalCfg = globalSnap.exists ? _normalizeConfigDoc(globalSnap.data()) : _normalizeConfigDoc({});

  let overrideCfg = _normalizeConfigDoc({});
  if (eventId) {
    const overrideSnap = await db
      .collection('evenimente')
      .doc(eventId)
      .collection('ai_overrides')
      .doc('current')
      .get();
    overrideCfg = overrideSnap.exists ? _normalizeConfigDoc(overrideSnap.data()) : _normalizeConfigDoc({});
  }

  const effective = _mergeConfig(globalCfg, overrideCfg);

  const meta = {
    global: {
      version: globalCfg.version,
      updatedAt: globalCfg.updatedAt || null,
      updatedBy: globalCfg.updatedBy || null,
    },
    override: eventId
      ? {
          version: overrideCfg.version,
          updatedAt: overrideCfg.updatedAt || null,
          updatedBy: overrideCfg.updatedBy || null,
        }
      : null,
    hash: _hashConfig(effective),
  };

  return { effective, meta };
}

module.exports = {
  DEFAULT_CONFIG,
  getEffectiveConfig,
};

