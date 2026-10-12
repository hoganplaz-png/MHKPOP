"""Prints which of the permissions the order system needs the deploy account has. No secrets are printed."""
import os
import google.auth.transport.requests
from google.oauth2 import service_account
import requests

creds = service_account.Credentials.from_service_account_file(
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"], scopes=["https://www.googleapis.com/auth/cloud-platform"])
creds.refresh(google.auth.transport.requests.Request())
want = [
    "firebaserules.rulesets.test", "firebaserules.rulesets.create", "firebaserules.releases.create",
    "firebaserules.releases.update", "firebasehosting.sites.update", "datastore.databases.get",
    "firebase.clients.create", "serviceusage.services.enable",
]
r = requests.post(f"https://cloudresourcemanager.googleapis.com/v1/projects/{creds.project_id}:testIamPermissions",
                  headers={"Authorization": "Bearer " + creds.token}, json={"permissions": want}, timeout=60)
if not r.ok:
    print("::warning::Could not test permissions:", r.status_code, r.text[:300])
else:
    have = set(r.json().get("permissions", []))
    for p in want:
        print(("  has      " if p in have else "  MISSING  ") + p)
print("service account:", creds.service_account_email)
