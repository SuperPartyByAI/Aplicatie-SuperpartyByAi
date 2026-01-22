const fs = require('fs');
const path = require('path');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

const readEnvFileValue = (key) => {
  const envPath = '/etc/whatsapp-backend/env';
  try {
    if (!fs.existsSync(envPath)) return null;
    const raw = fs.readFileSync(envPath, 'utf8');
    const match = raw.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (!match) return null;
    return match[1].trim();
  } catch {
    return null;
  }
};

const getAuthBaseDir = () => {
  if (process.env.SESSIONS_PATH) return process.env.SESSIONS_PATH;
  const fromFile = readEnvFileValue('SESSIONS_PATH');
  if (fromFile) return fromFile;
  if (process.env.VOLUME_MOUNT_PATH) {
    return path.join(process.env.VOLUME_MOUNT_PATH, 'baileys_auth');
  }
  return path.join(__dirname, '..', '.baileys_auth');
};

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const getSessionPath = (accountId) => {
  const baseDir = getAuthBaseDir();
  ensureDir(baseDir);
  const sessionDir = path.join(baseDir, accountId);
  ensureDir(sessionDir);
  return sessionDir;
};

const createQrSocket = async ({ accountId, loggerLevel = 'silent', browser }) => {
  const sessionPath = getSessionPath(accountId);
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: loggerLevel }),
    browser: browser || ['SuperParty', 'Chrome', '1.0.0'],
    version,
  });

  sock.ev.on('creds.update', saveCreds);

  return { sock, sessionPath, version };
};

module.exports = {
  createQrSocket,
  getSessionPath,
};
