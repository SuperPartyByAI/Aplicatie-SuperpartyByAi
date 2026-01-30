#!/usr/bin/env node
/**
 * Provision a user as admin + employee (staffProfiles) for Inbox / Manage Accounts.
 * Runs set_admin_claims.mjs with --admin --employee. Refuses admin unless email == ADMIN_EMAIL (see _config.mjs) or --force.
 *
 * Usage:
 *   node scripts/provision_staff_admin.mjs --project superparty-frontend --email <EMAIL>
 *   node scripts/provision_staff_admin.mjs --project superparty-frontend --uid <UID>
 *   node scripts/provision_staff_admin.mjs --project superparty-frontend --email <OTHER> --force
 *
 * Then re-login in the app.
 */

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { ADMIN_EMAIL } from './_config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'set_admin_claims.mjs');

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log(`
Usage: node scripts/provision_staff_admin.mjs --project <ID> (--uid <UID> | --email <EMAIL>) [--force]

  Provisions user as admin + employee: users.role, custom claim admin, staffProfiles with role=admin.
  Admin allowed only for ${ADMIN_EMAIL} unless --force. Credentials: GOOGLE_APPLICATION_CREDENTIALS or gcloud ADC.
`);
  process.exit(args.includes('--help') ? 0 : 1);
}

const out = spawnSync(
  process.execPath,
  [script, ...args, '--admin', '--employee'],
  { stdio: 'inherit', cwd: path.resolve(__dirname, '..') }
);
process.exit(out.status ?? 1);
