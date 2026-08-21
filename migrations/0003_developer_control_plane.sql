begin;

alter table oidc_clients
  add column if not exists created_by_subject uuid;

create index if not exists oidc_clients_developer_idx
  on oidc_clients (created_by_subject, created_at desc)
  where created_by_subject is not null;

create table if not exists oidc_developers (
  subject uuid primary key,
  email text not null,
  active boolean not null default true,
  can_production boolean not null default true,
  approved_by text not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists oidc_developer_tokens (
  id uuid primary key,
  developer_subject uuid not null references oidc_developers(subject) on delete cascade,
  name text not null,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists oidc_developer_tokens_subject_idx
  on oidc_developer_tokens (developer_subject, created_at desc);

create table if not exists oidc_developer_audit (
  id bigint generated always as identity primary key,
  developer_subject uuid not null,
  action text not null,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists oidc_developer_audit_subject_idx
  on oidc_developer_audit (developer_subject, created_at desc);

create or replace function cleanup_expired_developer_data(
  token_retention interval default interval '90 days',
  audit_retention interval default interval '2 years'
)
returns table (developer_tokens bigint, developer_audit bigint)
language plpgsql
as $$
declare
  token_count bigint;
  audit_count bigint;
begin
  delete from oidc_developer_tokens
    where (expires_at < now() - token_retention)
       or (revoked_at is not null and revoked_at < now() - token_retention);
  get diagnostics token_count = row_count;

  delete from oidc_developer_audit where created_at < now() - audit_retention;
  get diagnostics audit_count = row_count;

  return query select token_count, audit_count;
end;
$$;

commit;
