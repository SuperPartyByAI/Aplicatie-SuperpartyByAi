#!/usr/bin/env python3
"""
Deploy Voice AI to Railway with all credentials
"""

import requests
import json

TOKEN = "998d4e46-c67c-47e2-9eaa-ae4cc806aab1"
PROJECT_ID = "1931479e-da65-4d3a-8c5b-77c4b8fb3e31"
SERVICE_ID = "1931479e-da65-4d3a-8c5b-77c4b8fb3e31"  # Same as project for now

VARIABLES = {
    "OPENAI_API_KEY": "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",
    "TWILIO_ACCOUNT_SID": "AC17c88873d670aab4aa4a50fae230d2df",
    "TWILIO_AUTH_TOKEN": "5c6670d39a1dbf46d47ecdaa244b91d9",
    "TWILIO_PHONE_NUMBER": "+12182204425",
    "BACKEND_URL": "https://web-production-f0714.up.railway.app",
    "COQUI_API_URL": "https://web-production-00dca9.up.railway.app",
    "NODE_ENV": "production",
    "PORT": "5001"
}

def railway_api(query):
    """Call Railway GraphQL API"""
    response = requests.post(
        "https://backboard.railway.app/graphql/v2",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json"
        },
        json={"query": query}
    )
    return response.json()

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
