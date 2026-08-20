begin;

create or replace function cleanup_expired_oidc_data(
  event_retention interval default interval '90 days',
  audit_retention interval default interval '2 years'
)
returns table(payloads_deleted bigint, events_deleted bigint, audits_deleted bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  payload_count bigint;
  event_count bigint;
  audit_count bigint;
begin
  delete from oidc_provider_payloads
  where expires_at is not null and expires_at < now();
  get diagnostics payload_count = row_count;

  delete from oidc_security_events
  where created_at < now() - event_retention;
  get diagnostics event_count = row_count;

  delete from oidc_client_audit
  where created_at < now() - audit_retention;
  get diagnostics audit_count = row_count;

  return query select payload_count, event_count, audit_count;
end;
$$;

commit;
