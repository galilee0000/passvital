-- =====================================================================
-- PassVital – e-mail alert to the emergency contact when a sleeve is scanned
-- Run once in Supabase > SQL Editor > New query > Run
-- (after supabase.sql and supabase-support.sql).
-- =====================================================================

-- 1. New fields on the profile
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles add column if not exists alerte_scan boolean not null default true;
alter table public.profiles add column if not exists alert_lang text not null default 'fr'
  check (alert_lang in ('fr', 'en', 'es', 'de'));

-- 2. Log of scans by other people (Table Editor > scan_events)
create table if not exists public.scan_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sleeve_id text not null references public.sleeves (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  lat double precision,
  lng double precision,
  accuracy_m integer,
  adresse_approx text,
  email_status text not null default 'pending',   -- sent, location_sent, no_email, disabled, failed
  location_at timestamptz
);
create index if not exists scan_events_sleeve_idx on public.scan_events (sleeve_id, created_at desc);

alter table public.scan_events enable row level security;
revoke all on public.scan_events from anon, authenticated;
grant select on public.scan_events to authenticated;
drop policy if exists "own scan events" on public.scan_events;
create policy "own scan events" on public.scan_events for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()));
-- Only the Edge Function "scan-alert" (service role) writes into this table.

-- 3. The public card now says whether the contact is alerted (never the e-mail itself)
create or replace function public.scan_sleeve(p_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.sleeves; p public.profiles; m jsonb;
begin
  select * into s from sleeves where id = p_id;
  if not found then return jsonb_build_object('status', 'unknown'); end if;
  if s.status <> 'active' or s.profile_id is null then
    return jsonb_build_object('status', s.status, 'label', s.label);
  end if;
  select * into p from profiles where id = s.profile_id and published;
  if not found then return jsonb_build_object('status', 'pending', 'label', s.label); end if;
  select coalesce(jsonb_agg(jsonb_build_object('path', path, 'kind', kind, 'name', name) order by created_at), '[]')
    into m from media where profile_id = p.id and show_public;
  return jsonb_build_object('status', 'active', 'label', s.label, 'card', jsonb_build_object(
    'nom_public', coalesce(nullif(p.nom_public, ''), p.prenom),
    'initiales', upper(left(coalesce(p.prenom, ''), 1) || left(coalesce(p.nom, ''), 1)),
    'photo_path', p.photo_path,
    'adresse', case when p.show_adresse then concat_ws(', ', nullif(p.adresse, ''), nullif(concat_ws(' ', p.code_postal, p.ville), '')) end,
    'contact_nom', p.contact_nom, 'contact_lien', p.contact_lien, 'contact_tel', p.contact_tel,
    'alerte', (p.alerte_scan and coalesce(p.contact_email, '') <> ''),
    'allergie_grave', p.allergie_grave, 'allergies', p.allergies, 'allergie_reaction', p.allergie_reaction,
    'stylo_adrenaline', p.stylo_adrenaline, 'allergie_autre', p.allergie_autre,
    'pathologies', p.pathologies, 'pathologie_details', p.pathologie_details,
    'traitements', p.traitements, 'traitements_prioritaires', p.traitements_prioritaires,
    'groupe_sanguin', p.groupe_sanguin, 'langues', p.langues, 'infos', p.infos,
    'updated_at', p.updated_at, 'media', m));
end $$;
revoke all on function public.scan_sleeve(text) from public;
grant execute on function public.scan_sleeve(text) to anon, authenticated;
