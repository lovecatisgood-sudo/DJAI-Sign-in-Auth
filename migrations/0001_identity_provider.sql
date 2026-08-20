begin;

create table if not exists oidc_provider_payloads (
  model text not null,
  id text not null,
  payload jsonb not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (model, id)
);

create index if not exists oidc_provider_payloads_expiry_idx
  on oidc_provider_payloads (expires_at)
  where expires_at is not null;

create index if not exists oidc_provider_payloads_uid_idx
  on oidc_provider_payloads (model, (payload ->> 'uid'))
  where payload ? 'uid';

create index if not exists oidc_provider_payloads_user_code_idx
  on oidc_provider_payloads (model, (payload ->> 'userCode'))
  where payload ? 'userCode';

create index if not exists oidc_provider_payloads_grant_idx
  on oidc_provider_payloads ((payload ->> 'grantId'))
  where payload ? 'grantId';

create table if not exists oidc_clients (
  client_id text primary key,
  display_name text not null,
  environment text not null check (environment in ('development', 'staging', 'production')),
  metadata jsonb not null,
  secret_ciphertext text not null,
  active boolean not null default true,
  owner_email text not null,
  security_contact text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists oidc_client_audit (
  id bigint generated always as identity primary key,
  client_id text not null,
  action text not null,
  actor text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists oidc_client_audit_client_idx
  on oidc_client_audit (client_id, created_at desc);

create table if not exists oidc_confirmations (
  account_id uuid not null,
  client_id text not null references oidc_clients(client_id) on delete cascade,
  grant_id text not null,
  confirmed_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  primary key (account_id, client_id)
);

create table if not exists oidc_security_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  client_id text,
  account_id uuid,
  correlation_id text,
  ip_hash text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists oidc_security_events_created_idx
  on oidc_security_events (created_at desc);

create index if not exists oidc_security_events_account_idx
  on oidc_security_events (account_id, created_at desc)
  where account_id is not null;

commit;
