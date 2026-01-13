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
  // Minimal defaults (real values should come from /ai_config/global).
  systemPrompt: null,
  systemPromptAppend: null,
  eventSchema: {
    required: ['date', 'address'],
    fields: {},
  },
  rolesCatalog: {},
  policies: {
    requireConfirm: true,
    askOneQuestion: true,
  },
  uiTemplates: {},
};

function _safeString(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

function _deepMerge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch)) return patch;
  if (typeof base !== 'object' || typeof patch !== 'object') return patch;

  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (k in out) out[k] = _deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function _normalizeConfigDoc(data) {
  const d = data || {};
  const cfg = (d.config && typeof d.config === 'object') ? d.config : d;
  return {
    version: typeof d.version === 'number' ? d.version : null,
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || null,
    // NOTE: keep legacy fields for backward compatibility, but prefer config-based shape.
    config: {
      systemPrompt: _safeString(cfg.systemPrompt),
      systemPromptAppend: _safeString(cfg.systemPromptAppend),
      // Use undefined for "not set" so defaults are preserved.
      eventSchema: (cfg.eventSchema && typeof cfg.eventSchema === 'object') ? cfg.eventSchema : undefined,
      rolesCatalog: (cfg.rolesCatalog && typeof cfg.rolesCatalog === 'object') ? cfg.rolesCatalog : undefined,
      policies: (cfg.policies && typeof cfg.policies === 'object') ? cfg.policies : undefined,
      uiTemplates: (cfg.uiTemplates && typeof cfg.uiTemplates === 'object') ? cfg.uiTemplates : undefined,
    },
  };
}

function _normalizeOverrideDoc(data) {
  const d = data || {};
  const overrides = (d.overrides && typeof d.overrides === 'object') ? d.overrides : d;
  const cfg = (overrides.config && typeof overrides.config === 'object') ? overrides.config : overrides;

  return {
    version: typeof d.version === 'number' ? d.version : null,
    updatedAt: d.updatedAt || null,
    updatedBy: d.updatedBy || null,
    overrides: {
      systemPrompt: _safeString(cfg.systemPrompt),
      systemPromptAppend: _safeString(cfg.systemPromptAppend),
      eventSchema: (cfg.eventSchema && typeof cfg.eventSchema === 'object') ? cfg.eventSchema : undefined,
      rolesCatalog: (cfg.rolesCatalog && typeof cfg.rolesCatalog === 'object') ? cfg.rolesCatalog : undefined,
      policies: (cfg.policies && typeof cfg.policies === 'object') ? cfg.policies : undefined,
      uiTemplates: (cfg.uiTemplates && typeof cfg.uiTemplates === 'object') ? cfg.uiTemplates : undefined,
    },
  };
}

function _hashConfig(config) {
  const json = JSON.stringify(config || {}, null, 0);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

async function getEffectiveConfig(db, { eventId } = {}) {
  const globalSnap = await db.collection('ai_config').doc('global').get();
  const globalCfg = globalSnap.exists ? _normalizeConfigDoc(globalSnap.data()) : _normalizeConfigDoc({});

  let overrideCfg = _normalizeOverrideDoc({});
  if (eventId) {
    const overrideSnap = await db
      .collection('evenimente')
      .doc(eventId)
      .collection('ai_overrides')
      .doc('current')
      .get();
    overrideCfg = overrideSnap.exists ? _normalizeOverrideDoc(overrideSnap.data()) : _normalizeOverrideDoc({});
  }

  const effective = _deepMerge(
    _deepMerge({ ...DEFAULT_CONFIG }, globalCfg.config || {}),
    overrideCfg.overrides || {}
  );

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

