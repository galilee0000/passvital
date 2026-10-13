-- =====================================================================
-- PassVital – support requests (assistant "Besoin d'aide ?")
-- Run once in Supabase > SQL Editor > New query > Run.
-- Requests appear in Table Editor > support_requests.
-- Change the "status" column to: nouveau, en_cours or resolu.
-- =====================================================================

create table if not exists public.support_requests (
  id bigint generated always as identity primary key,
  ref text not null unique,                       -- number shown to the customer, e.g. S-7K2F9A
  created_at timestamptz not null default now(),
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'resolu')),
  email text not null,
  sujet text not null,
  manchon text,                                   -- sleeve code, e.g. PV-2CTF-Y42
  message text not null check (char_length(message) between 10 and 2000),
  user_id uuid references auth.users (id) on delete set null,
  page text,                                      -- screen the customer was on
  note_interne text,                              -- your own notes (never shown to the customer)
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_requests_status_idx on public.support_requests (status, created_at desc);

create or replace function public.support_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.status = 'resolu' and old.status is distinct from 'resolu' then new.resolved_at = now(); end if;
  if new.status <> 'resolu' then new.resolved_at = null; end if;
  return new;
end $$;
drop trigger if exists support_touch on public.support_requests;
create trigger support_touch before update on public.support_requests
  for each row execute function public.support_touch();

-- Nobody can read or change the table from the web page: only through the function below.
alter table public.support_requests enable row level security;
revoke all on public.support_requests from anon, authenticated;

create or replace function public.create_support_request(
  p_email text, p_sujet text, p_sleeve text, p_message text, p_page text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_ref text;
  v_sleeve text := nullif(upper(left(trim(coalesce(p_sleeve, '')), 20)), '');
  v_msg text := trim(coalesce(p_message, ''));
begin
  -- A logged-in customer's e-mail is taken from the account, not from the form.
  select u.email into v_email from auth.users u where u.id = auth.uid();
  v_email := lower(trim(coalesce(v_email, p_email, '')));
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 254 then raise exception 'invalid_email'; end if;
  if char_length(v_msg) < 10 or char_length(v_msg) > 2000 then raise exception 'invalid_message'; end if;
  if p_sujet is null or p_sujet not in ('Activation du manchon', 'Manchon perdu ou volé', 'Ma fiche d’urgence', 'Mon compte et connexion', 'Autre demande') then
    p_sujet := 'Autre demande';
  end if;
  -- Simple anti-spam: at most 5 requests per e-mail per hour.
  if (select count(*) from support_requests where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many';
  end if;
  loop
    v_ref := 'S-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from support_requests where ref = v_ref);
  end loop;
  insert into support_requests (ref, email, sujet, manchon, message, user_id, page)
  values (v_ref, v_email, p_sujet, v_sleeve, v_msg, auth.uid(), left(p_page, 40));
  return v_ref;
end $$;

revoke all on function public.create_support_request(text, text, text, text, text) from public;
grant execute on function public.create_support_request(text, text, text, text, text) to anon, authenticated;
