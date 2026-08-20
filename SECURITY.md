# Security policy

Do not open a public issue for a suspected vulnerability, leaked credential, unsafe callback, or account-takeover path. Report it privately to the DJAI security owner recorded in the production operations system.

Include the affected issuer/client, reproduction steps, impact, and whether any credential may have been exposed. Never include passwords, authorization codes, ID tokens, client secrets, Supabase credentials, private signing keys, or production cookies.

Operators should immediately deactivate a compromised client, rotate exposed credentials, preserve redacted evidence, and follow [docs/incident-response.md](docs/incident-response.md).
