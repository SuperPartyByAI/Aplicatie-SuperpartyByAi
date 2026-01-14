'use strict';

/**
 * Express middleware for protecting HTTP (onRequest) endpoints.
 *
 * SECURITY:
 * - onRequest endpoints do NOT get Firebase callable auth automatically.
 * - We require a Firebase ID token and enforce SUPER-ADMIN email allowlist.
 */

const { isSuperAdminEmail } = require('./authGuards');

function extractBearerToken(req) {
  const h = (req.headers?.authorization || req.headers?.Authorization || '').toString();
  if (h.toLowerCase().startsWith('bearer ')) return h.slice(7).trim();
  return '';
}

function makeRequireSuperAdminExpress({ verifyIdToken }) {
  if (typeof verifyIdToken !== 'function') {
    throw new Error('verifyIdToken must be a function');
  }

  return async function requireSuperAdminExpress(req, res, next) {
    try {
      const token = extractBearerToken(req) || (req.query?.token || '').toString().trim();
      if (!token) {
        return res.status(401).json({ success: false, error: 'missing_auth_token' });
      }

      const decoded = await verifyIdToken(token);
      const email = (decoded?.email || decoded?.token?.email || '').toString();

      if (!isSuperAdminEmail(email)) {
        return res.status(403).json({ success: false, error: 'super_admin_only' });
      }

      req.user = decoded;
      return next();
    } catch (e) {
      return res.status(401).json({ success: false, error: 'invalid_auth_token' });
    }
  };
}

module.exports = {
  makeRequireSuperAdminExpress,
  extractBearerToken,
};

