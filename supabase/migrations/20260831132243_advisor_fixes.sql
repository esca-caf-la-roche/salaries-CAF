create index google_oauth_states_owner_id_idx
  on public.google_oauth_states(owner_id);

-- Explicit deny policies document the intentional server-only posture and keep
-- the Security Advisor from treating the absence of policies as accidental.
create policy google_credentials_no_client_access
  on private.google_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy google_oauth_states_no_client_access
  on public.google_oauth_states
  for all
  to anon, authenticated
  using (false)
  with check (false);
