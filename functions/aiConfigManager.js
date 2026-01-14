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
const Ajv = require('ajv');

const DEFAULT_CONFIG = {
  // Minimal safe defaults. Real values should come from Firestore.
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
  // Private/system prompt fields (should be loaded from ai_config_private/*)
  systemPrompt: null,
  systemPromptAppend: null,
};

const CONFIG_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['eventSchema', 'rolesCatalog', 'policies'],
  properties: {
    eventSchema: {
      type: 'object',
      additionalProperties: true,
      required: ['required', 'fields'],
      properties: {
        required: { type: 'array', items: { type: 'string' } },
        fields: { type: 'object', additionalProperties: true },
      },
    },
    rolesCatalog: { type: 'object', additionalProperties: true },
    policies: {
      type: 'object',
      additionalProperties: true,
      properties: {
        requireConfirm: { type: 'boolean' },
        askOneQuestion: { type: 'boolean' },
      },
    },
    uiTemplates: { type: 'object', additionalProperties: true },
    systemPrompt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    systemPromptAppend: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateConfig = ajv.compile(CONFIG_SCHEMA);

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
  // Global (public + private)
  const [globalPublicSnap, globalPrivateSnap] = await Promise.all([
    db.collection('ai_config').doc('global').get(),
    db.collection('ai_config_private').doc('global').get(),
  ]);

  const globalPublicCfg = globalPublicSnap.exists ? _normalizeConfigDoc(globalPublicSnap.data()) : _normalizeConfigDoc({});
  const globalPrivateCfg = globalPrivateSnap.exists ? _normalizeConfigDoc(globalPrivateSnap.data()) : _normalizeConfigDoc({});

  // Overrides (public + private), plus legacy per-event override (subcollection) for backward compatibility
  let overridePublicCfg = _normalizeOverrideDoc({});
  let overridePrivateCfg = _normalizeOverrideDoc({});
  let legacyOverrideCfg = _normalizeOverrideDoc({});

  if (eventId) {
    const [oPub, oPriv, legacy] = await Promise.all([
      db.collection('ai_config_overrides').doc(eventId).get(),
      db.collection('ai_config_overrides_private').doc(eventId).get(),
      db.collection('evenimente').doc(eventId).collection('ai_overrides').doc('current').get(),
    ]);

    overridePublicCfg = oPub.exists ? _normalizeOverrideDoc(oPub.data()) : _normalizeOverrideDoc({});
    overridePrivateCfg = oPriv.exists ? _normalizeOverrideDoc(oPriv.data()) : _normalizeOverrideDoc({});
    legacyOverrideCfg = legacy.exists ? _normalizeOverrideDoc(legacy.data()) : _normalizeOverrideDoc({});
  }

  const merged = _deepMerge(
    _deepMerge(
      _deepMerge(
        _deepMerge({ ...DEFAULT_CONFIG }, globalPublicCfg.config || {}),
        globalPrivateCfg.config || {}
      ),
      overridePublicCfg.overrides || {}
    ),
    _deepMerge(overridePrivateCfg.overrides || {}, legacyOverrideCfg.overrides || {})
  );

  const ok = validateConfig(merged);
  const effective = ok ? merged : { ...DEFAULT_CONFIG };
  const validationErrors = ok ? null : (validateConfig.errors || null);

  const meta = {
    global: {
      public: {
        version: globalPublicCfg.version,
        updatedAt: globalPublicCfg.updatedAt || null,
        updatedBy: globalPublicCfg.updatedBy || null,
      },
      private: {
        version: globalPrivateCfg.version,
        updatedAt: globalPrivateCfg.updatedAt || null,
        updatedBy: globalPrivateCfg.updatedBy || null,
      },
    },
    override: eventId
      ? {
          public: {
            version: overridePublicCfg.version,
            updatedAt: overridePublicCfg.updatedAt || null,
            updatedBy: overridePublicCfg.updatedBy || null,
          },
          private: {
            version: overridePrivateCfg.version,
            updatedAt: overridePrivateCfg.updatedAt || null,
            updatedBy: overridePrivateCfg.updatedBy || null,
          },
          legacy: {
            version: legacyOverrideCfg.version,
            updatedAt: legacyOverrideCfg.updatedAt || null,
            updatedBy: legacyOverrideCfg.updatedBy || null,
          },
        }
      : null,
    hash: _hashConfig(effective),
    isFallback: !ok,
    validationErrors,
  };

  return { effective, meta };
}

module.exports = {
  DEFAULT_CONFIG,
  getEffectiveConfig,
};

