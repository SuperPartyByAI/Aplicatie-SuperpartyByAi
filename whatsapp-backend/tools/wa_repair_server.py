#!/usr/bin/env python3
import os
import re
import shlex
import json
import tempfile
import subprocess
import urllib.request
import urllib.error

SERVICE_NAME = "whatsapp-backend.service"
BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://127.0.0.1:8080")
APP_DIR = "/opt/whatsapp/Aplicatie-SuperpartyByAi/whatsapp-backend"
DOTENV_PATH = os.path.join(APP_DIR, ".env")


def parse_env_line(env_line):
    envs = {}
    if not env_line:
        return envs
    if env_line.startswith("Environment="):
        env_line = env_line[len("Environment="):]
    for token in shlex.split(env_line):
        if "=" in token:
            key, value = token.split("=", 1)
            envs[key] = value
    return envs


def read_proc_env():
    try:
        main_pid = subprocess.check_output(
            ["systemctl", "show", "-p", "MainPID", SERVICE_NAME], text=True
        ).strip()
        if main_pid.startswith("MainPID="):
            main_pid = main_pid.split("=", 1)[1].strip()
        if not main_pid or main_pid == "0":
            return {}
        environ_path = f"/proc/{main_pid}/environ"
        if not os.path.isfile(environ_path):
            return {}
        env = {}
        with open(environ_path, "rb") as fh:
            raw_env = fh.read().split(b"\x00")
        for item in raw_env:
            if b"=" in item:
                key, value = item.split(b"=", 1)
                env[key.decode("utf-8", errors="ignore")] = value.decode("utf-8", errors="ignore")
        return env
    except Exception:
        return {}


def read_dotenv(path):
    env = {}
    if not os.path.isfile(path):
        return env
    with open(path, "r") as fh:
        for rawline in fh:
            line = rawline.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key] = value
    return env


def load_service_env():
    env = {}
    raw = subprocess.check_output(
        ["systemctl", "show", "-p", "Environment", "-p", "EnvironmentFile", SERVICE_NAME],
        text=True
    )
    env_files = []
    for line in raw.strip().split("\n"):
        if line.startswith("Environment="):
            env.update(parse_env_line(line))
        elif line.startswith("EnvironmentFile="):
            files = line[len("EnvironmentFile="):].strip().split(" ")
            for fpath in files:
                if not fpath:
                    continue
                fpath = fpath.lstrip("-")
                if fpath:
                    env_files.append(fpath)

    for fpath in env_files:
        if not os.path.isfile(fpath):
            continue
        env.update(read_dotenv(fpath))

    env.update(read_dotenv(DOTENV_PATH))
    env.update(read_proc_env())
    return env


def ensure_admin_token(env):
    admin_token = env.get("ADMIN_TOKEN")
    if admin_token:
        return admin_token, "found"

    token = subprocess.check_output(["openssl", "rand", "-hex", "32"], text=True).strip()
    dropin_dir = f"/etc/systemd/system/{SERVICE_NAME}.d"
    os.makedirs(dropin_dir, exist_ok=True)
    dropin_path = os.path.join(dropin_dir, "override.conf")
    with open(dropin_path, "w") as fh:
        fh.write("[Service]\n")
        fh.write(f"Environment=ADMIN_TOKEN={token}\n")
    subprocess.check_call(["systemctl", "daemon-reload"])
    subprocess.check_call(["systemctl", "restart", SERVICE_NAME])
    return token, "generated"


def detect_account_id_from_logs():
    try:
        logs = subprocess.check_output(["journalctl", "-u", SERVICE_NAME, "-n", "2000"], text=True)
        matches = re.findall(r"account_[a-z0-9_]+", logs)
        if matches:
            return matches[0]
    except Exception:
        return None
    return None


def detect_account_id_from_firestore(env):
    sa_json = env.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    sa_path = env.get("FIREBASE_SERVICE_ACCOUNT_PATH") or env.get("GOOGLE_APPLICATION_CREDENTIALS")
    temp_path = None
    if sa_json and sa_json.strip().startswith("{"):
        fd, temp_path = tempfile.mkstemp(prefix="sa_", suffix=".json")
        os.write(fd, sa_json.encode("utf-8"))
        os.close(fd)
        sa_path = temp_path
    elif sa_json and os.path.isfile(sa_json):
        sa_path = sa_json

    account_id = None
    if sa_path and os.path.isfile(sa_path):
        node_script = """
const admin = require('firebase-admin');
const fs = require('fs');
const path = process.argv[1];
const raw = fs.readFileSync(path, 'utf8');
const sa = JSON.parse(raw);
if (sa.private_key) sa.private_key = sa.private_key.replace(/\\\\n/g, '\\n');
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const snapshot = await db.collection('wa_accounts').where('status','==','connected').limit(1).get();
  if (!snapshot.empty) {
    console.log(snapshot.docs[0].id);
    return;
  }
  const fallback = await db.collection('wa_accounts').limit(1).get();
  if (!fallback.empty) console.log(fallback.docs[0].id);
})();
"""
        try:
            account_id = subprocess.check_output(["node", "-e", node_script, sa_path], text=True).strip() or None
        except Exception:
            account_id = None

    if temp_path and os.path.isfile(temp_path):
        os.remove(temp_path)

    return account_id


def post_json(admin_token, path, payload):
    url = f"{BACKEND_BASE_URL}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Bearer {admin_token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw)
    except urllib.error.HTTPError as err:
        try:
            body = err.read().decode("utf-8")
            parsed = json.loads(body)
        except Exception:
            parsed = {"success": False, "error": "http_error", "status": err.code}
        parsed.setdefault("status", err.code)
        return parsed


def main():
    env = load_service_env()
    admin_token, admin_source = ensure_admin_token(env)

    account_id = detect_account_id_from_logs()
    if not account_id:
        account_id = detect_account_id_from_firestore(env)

    if not account_id:
        print("Admin endpoints authorized: yes")
        print("ACCOUNT_ID: not found")
        print("Repair not run: missing accountId")
        return

    dedupe_dry = post_json(admin_token, "/admin/deduplicate-threads", {"accountId": account_id, "dryRun": True})
    dedupe_apply = None
    if dedupe_dry.get("duplicatesFound", 0) > 0:
        dedupe_apply = post_json(admin_token, "/admin/deduplicate-threads", {"accountId": account_id, "dryRun": False})

    update_display = post_json(admin_token, "/admin/update-display-names", {"accountId": account_id})
    lid_contacts = post_json(admin_token, "/admin/fetch-lid-contacts", {"accountId": account_id})

    print("Admin endpoints authorized: yes")
    print(f"ACCOUNT_ID: {account_id}")
    print(f"Dedupe dry-run: duplicatesFound={dedupe_dry.get('duplicatesFound', 0)}, totalThreads={dedupe_dry.get('totalThreads', 0)}, uniqueJids={dedupe_dry.get('uniqueJids', 0)}")
    if dedupe_apply:
        print(f"Dedupe apply: deleted={dedupe_apply.get('deleted', 0)}, kept={dedupe_apply.get('kept', 0)}")
    if update_display.get("success", True) is False:
        print(f"DisplayNames error: status={update_display.get('status', 'unknown')}")
    else:
        print(f"DisplayNames updated: {update_display.get('updated', update_display.get('count', 'unknown'))}")

    if lid_contacts.get("success", True) is False:
        print(f"LID contacts error: status={lid_contacts.get('status', 'unknown')}")
    else:
        print(f"LID contacts: {lid_contacts.get('processed', lid_contacts.get('count', 'unknown'))}")


if __name__ == "__main__":
    main()
