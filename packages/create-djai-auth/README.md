# create-djai-auth

After creating a CLI token in the DJAI developer console:

```bash
export DJAI_DEVELOPER_TOKEN=<one-time-token>
npx create-djai-auth \
  --name "My DJAI App" \
  --environment development \
  --callback http://localhost:3000/auth/djai/callback \
  --home http://localhost:3000/ \
  --privacy http://localhost:3000/privacy \
  --terms http://localhost:3000/terms
```

The CLI registers the confidential client, creates a protected `.env.djai`, creates the Express adapter module, and updates `.gitignore`. It refuses to overwrite generated targets.
