#!/usr/bin/env python3
"""
Script pentru adăugarea GitHub secrets folosind GitHub API
Necesită un Personal Access Token cu permisiuni 'repo' și 'admin:repo_hook'
"""

import os
import sys
import json
import base64
import requests
from nacl import encoding, public

REPO_OWNER = "SuperPartyByAI"
REPO_NAME = "Aplicatie-SuperpartyByAi"

def get_public_key(token):
    """Obține cheia publică a repository-ului pentru criptarea secretelor"""
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/secrets/public-key"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    return response.json()

def encrypt_secret(public_key: str, secret_value: str) -> str:
    """Criptează un secret folosind cheia publică a repository-ului"""
    public_key_obj = public.PublicKey(public_key.encode("utf-8"), encoding.Base64Encoder())
    sealed_box = public.SealedBox(public_key_obj)
    encrypted = sealed_box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

def add_secret(token, secret_name, secret_value, key_id, public_key):
    """Adaugă sau actualizează un secret în repository"""
    url = f"https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/actions/secrets/{secret_name}"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json"
    }
    
    encrypted_value = encrypt_secret(public_key, secret_value)
    
    data = {
        "encrypted_value": encrypted_value,
        "key_id": key_id
    }
    
    response = requests.put(url, headers=headers, json=data)
    response.raise_for_status()
    return response.status_code in [201, 204]

def main():
    # Verifică dacă există token
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    
    if not token:
        print("❌ Eroare: Nu există GITHUB_TOKEN sau GH_TOKEN în environment")
        print("")
        print("📋 Pentru a adăuga secretele manual:")
        print("1. Mergi la: https://github.com/SuperPartyByAI/Aplicatie-SuperpartyByAi/settings/secrets/actions")
        print("2. Click 'New repository secret'")
        print("3. Adaugă următoarele secrete:")
        print("")
        print("   KEYSTORE_BASE64:")
        with open("/tmp/keystore_base64.txt", "r") as f:
            print(f"   {f.read()[:100]}...")
        print("")
        print("   KEYSTORE_PASSWORD:")
        print("   SuperParty2024!")
        print("")
        print("   FIREBASE_SERVICE_ACCOUNT:")
        with open("/tmp/firebase_service_account.json", "r") as f:
            print(f"   {f.read()[:100]}...")
        sys.exit(1)
    
    try:
        print("🔐 Adăugare GitHub Secrets...")
        print("")
        
        # Obține cheia publică
        print("🔑 Obțin cheia publică a repository-ului...")
        key_data = get_public_key(token)
        key_id = key_data["key_id"]
        public_key = key_data["key"]
        print(f"✅ Cheie publică obținută (ID: {key_id})")
        print("")
        
        # 1. KEYSTORE_BASE64
        print("📦 Adăugare KEYSTORE_BASE64...")
        with open("/tmp/keystore_base64.txt", "r") as f:
            keystore_base64 = f.read().strip()
        add_secret(token, "KEYSTORE_BASE64", keystore_base64, key_id, public_key)
        print("✅ KEYSTORE_BASE64 adăugat")
        
        # 2. KEYSTORE_PASSWORD
        print("🔑 Adăugare KEYSTORE_PASSWORD...")
        add_secret(token, "KEYSTORE_PASSWORD", "SuperParty2024!", key_id, public_key)
        print("✅ KEYSTORE_PASSWORD adăugat")
        
        # 3. FIREBASE_SERVICE_ACCOUNT
        print("🔥 Adăugare FIREBASE_SERVICE_ACCOUNT...")
        with open("/tmp/firebase_service_account.json", "r") as f:
            firebase_sa = f.read().strip()
        add_secret(token, "FIREBASE_SERVICE_ACCOUNT", firebase_sa, key_id, public_key)
        print("✅ FIREBASE_SERVICE_ACCOUNT adăugat")
        
        print("")
        print("✅ Toate secretele au fost adăugate cu succes!")
        
    except requests.exceptions.HTTPError as e:
        print(f"❌ Eroare HTTP: {e}")
        print(f"Response: {e.response.text}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Eroare: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
