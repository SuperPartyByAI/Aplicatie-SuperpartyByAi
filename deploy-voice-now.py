#!/usr/bin/env python3
"""
Deploy Voice AI to Railway (no secrets in git)
"""

import requests
import json
import os

TOKEN = os.environ.get("RAILWAY_TOKEN")
PROJECT_ID = os.environ.get("RAILWAY_PROJECT_ID")
SERVICE_ID = os.environ.get("RAILWAY_SERVICE_ID") or PROJECT_ID

VARIABLES = {
    "OPENAI_API_KEY": os.environ.get("OPENAI_API_KEY"),
    "TWILIO_ACCOUNT_SID": os.environ.get("TWILIO_ACCOUNT_SID"),
    "TWILIO_AUTH_TOKEN": os.environ.get("TWILIO_AUTH_TOKEN"),
    "TWILIO_PHONE_NUMBER": os.environ.get("TWILIO_PHONE_NUMBER", "+12182204425"),
    "BACKEND_URL": os.environ.get("BACKEND_URL"),
    "COQUI_API_URL": os.environ.get("COQUI_API_URL"),
    "NODE_ENV": os.environ.get("NODE_ENV", "production"),
    "PORT": os.environ.get("PORT", "5001"),
}

def railway_api(query):
    """Call Railway GraphQL API"""
    if not TOKEN:
        raise RuntimeError("Missing RAILWAY_TOKEN env var")
    response = requests.post(
        "https://backboard.railway.app/graphql/v2",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json"
        },
        json={"query": query}
    )
    return response.json()

# Basic required args validation
missing = []
if not PROJECT_ID:
    missing.append("RAILWAY_PROJECT_ID")
if not VARIABLES.get("OPENAI_API_KEY"):
    missing.append("OPENAI_API_KEY")
if not VARIABLES.get("TWILIO_ACCOUNT_SID"):
    missing.append("TWILIO_ACCOUNT_SID")
if not VARIABLES.get("TWILIO_AUTH_TOKEN"):
    missing.append("TWILIO_AUTH_TOKEN")
if missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")

# Get environment ID
print("🔍 Getting environment ID...")
query = f"""
query {{
  project(id: "{PROJECT_ID}") {{
    environments {{
      edges {{
        node {{
          id
          name
        }}
      }}
    }}
  }}
}}
"""
result = railway_api(query)
print(json.dumps(result, indent=2))

if "errors" in result:
    print("❌ Error getting environment")
    print(result["errors"])
    exit(1)

# Get first environment
env_id = result["data"]["project"]["environments"]["edges"][0]["node"]["id"]
print(f"✅ Environment ID: {env_id}")

# Add variables
print("\n🔐 Adding variables...")
for key, value in VARIABLES.items():
    print(f"  ➕ {key}...")
    query = f"""
    mutation {{
      variableUpsert(input: {{
        projectId: "{PROJECT_ID}"
        environmentId: "{env_id}"
        name: "{key}"
        value: "{value}"
      }})
    }}
    """
    result = railway_api(query)
    if "errors" in result:
        print(f"  ⚠️  Error: {result['errors']}")
    else:
        print(f"  ✅ Added")

print("\n✅ All variables added!")
print("\nAcum mergi în Railway Dashboard și:")
print("1. Găsește serviciul web-production-f0714.up.railway.app")
print("2. Settings → Source → Root Directory: voice-backend")
print("3. Save")
print("\nRailway va redeploya automat!")
