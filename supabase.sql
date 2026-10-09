-- =====================================================================
-- PassVital – database setup, version 3
-- Run once in Supabase > SQL Editor > New query > Run.
-- Accounts (Supabase Auth), several profiles per account, one unique
-- QR code per sleeve, photos / documents / videos, consent log,
-- and an "admin_overview" view to see everything in the Table Editor.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- 0. Remove the demo objects from versions 1 and 2 ----------
drop function if exists public.get_card(text);
drop function if exists public.get_card(text, text);
drop function if exists public.get_own_card(text, text);
drop function if exists public.save_card(text, text, jsonb);
drop function if exists public.reset_card(text, text);
drop function if exists public.sleeve_status(text);
drop table if exists public.passvital_cards;
drop table if exists public.passvital_sleeves;

-- ---------- 1. Tables ----------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Identité
  prenom text, nom text, nom_public text, photo_path text,
  telephone text, adresse text, code_postal text, ville text,
  show_adresse boolean not null default false,
  -- Contact d'urgence (ICE)
  contact_nom text, contact_lien text, contact_tel text,
  -- Allergies
  allergie_grave boolean,
  allergies text[] not null default '{}',
  allergie_reaction text,
  stylo_adrenaline boolean not null default false,
  allergie_autre text,
  -- Pathologies
  pathologies text[] not null default '{}',
  pathologie_details text,
  -- Traitements: [{"nom":"…","dosage":"…","frequence":"…"}]
  traitements jsonb not null default '[]',
  traitements_prioritaires text[] not null default '{}',
  -- Compléments
  groupe_sanguin text,
  langues text[] not null default '{}',
  infos text check (infos is null or char_length(infos) <= 300),
  -- Publication & consentement
  published boolean not null default false,
  consent_at timestamptz,
  consent_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sleeves (
  id text primary key,                 -- value inside the QR code (random, not guessable)
  label text not null unique,          -- code printed on the sleeve
  status text not null default 'available'
    check (status in ('available', 'active', 'suspended', 'revoked')),
  profile_id uuid references public.profiles (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  path text not null,
  kind text not null check (kind in ('photo', 'video', 'document')),
  name text,
  size_bytes bigint,
  show_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.consent_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  profile_id uuid references public.profiles (id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------- 2. Row Level Security: each user only sees their own data ----------
alter table public.profiles enable row level security;
alter table public.sleeves enable row level security;
alter table public.media enable row level security;
alter table public.consent_log enable row level security;

drop policy if exists "own profiles" on public.profiles;
create policy "own profiles" on public.profiles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own media" on public.media;
create policy "own media" on public.media for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()));

drop policy if exists "own consents read" on public.consent_log;
create policy "own consents read" on public.consent_log for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "own consents insert" on public.consent_log;
create policy "own consents insert" on public.consent_log for insert to authenticated
  with check (user_id = auth.uid()
    and (profile_id is null or exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid())));

drop policy if exists "own sleeves read" on public.sleeves;
create policy "own sleeves read" on public.sleeves for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()));

revoke all on public.profiles, public.sleeves, public.media, public.consent_log from anon;
grant select, insert, update, delete on public.profiles, public.media to authenticated;
grant select, insert on public.consent_log to authenticated;
grant select on public.sleeves to authenticated;

-- ---------- 3. Functions used by the page ----------
-- Public scan: anyone who scans an active sleeve sees the emergency card (no code needed).
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
    'allergie_grave', p.allergie_grave, 'allergies', p.allergies, 'allergie_reaction', p.allergie_reaction,
    'stylo_adrenaline', p.stylo_adrenaline, 'allergie_autre', p.allergie_autre,
    'pathologies', p.pathologies, 'pathologie_details', p.pathologie_details,
    'traitements', p.traitements, 'traitements_prioritaires', p.traitements_prioritaires,
    'groupe_sanguin', p.groupe_sanguin, 'langues', p.langues, 'infos', p.infos,
    'updated_at', p.updated_at, 'media', m));
end $$;

-- Link an available sleeve to one of my profiles (first authenticated owner wins).
create or replace function public.activate_sleeve(p_id text, p_profile uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s public.sleeves;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from profiles where id = p_profile and owner_id = auth.uid()) then
    raise exception 'not_your_profile';
  end if;
  select * into s from sleeves where id = p_id for update;
  if not found then raise exception 'unknown_sleeve'; end if;
  if s.status = 'available'
     or (s.profile_id is not null and exists (select 1 from profiles where id = s.profile_id and owner_id = auth.uid())) then
    update sleeves set status = 'active', profile_id = p_profile, activated_at = coalesce(activated_at, now()) where id = p_id;
    return s.label;
  end if;
  raise exception 'sleeve_taken';
end $$;

-- Suspend (lost sleeve) or re-activate one of my sleeves.
create or replace function public.set_sleeve_status(p_id text, p_status text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('active', 'suspended') then return false; end if;
  update sleeves s set status = p_status
  where s.id = p_id and exists (select 1 from profiles p where p.id = s.profile_id and p.owner_id = auth.uid());
  return found;
end $$;

revoke all on function public.scan_sleeve(text), public.activate_sleeve(text, uuid), public.set_sleeve_status(text, text) from public;
grant execute on function public.scan_sleeve(text) to anon, authenticated;
grant execute on function public.activate_sleeve(text, uuid), public.set_sleeve_status(text, text) to authenticated;

-- ---------- 4. Storage for photos, documents and videos ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('passvital-media', 'passvital-media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "pv media insert own" on storage.objects;
create policy "pv media insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'passvital-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pv media select own" on storage.objects;
create policy "pv media select own" on storage.objects for select to authenticated
  using (bucket_id = 'passvital-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pv media update own" on storage.objects;
create policy "pv media update own" on storage.objects for update to authenticated
  using (bucket_id = 'passvital-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pv media delete own" on storage.objects;
create policy "pv media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'passvital-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 5. Admin: everything in one table (Table Editor > admin_overview) ----------
create or replace view public.admin_overview with (security_invoker = true) as
select
  u.email as compte_email,
  u.created_at as compte_cree_le,
  p.*,
  (select string_agg(s.label || ' (' || s.status || ')', ', ') from public.sleeves s where s.profile_id = p.id) as manchons,
  (select count(*) from public.media m where m.profile_id = p.id) as nb_fichiers
from public.profiles p
join auth.users u on u.id = p.owner_id;
revoke all on public.admin_overview from anon, authenticated;

-- ---------- 6. Sleeves: 20 unique QR codes ----------
insert into public.sleeves (id, label) values
  ('huq3yphe4pw4', 'PV-RZVS-2K6'),
  ('ttrm9djp85sy', 'PV-Q3MX-ASH'),
  ('2gad3un3n8kg', 'PV-2CTF-Y42'),
  ('8wm8638g5dnk', 'PV-GXEW-YKK'),
  ('wvss3y2f6szn', 'PV-DMP2-BZM'),
  ('6auxwxua78pp', 'PV-U5V2-ZCU'),
  ('3g9cvvt4aghn', 'PV-XFHC-E3D'),
  ('6hsy4y7huzvz', 'PV-JE7M-PXQ'),
  ('bvsk3ekyuwgs', 'PV-ULYD-38V'),
  ('4j3bh5mdrjny', 'PV-JPV2-QVL'),
  ('rv8kxhc4vfdg', 'PV-7XNZ-259'),
  ('n35kfvd4k42c', 'PV-PJPS-CHQ'),
  ('cvyrayqbcfkp', 'PV-GMGQ-V29'),
  ('anbjqfxbyyx7', 'PV-WU5B-2SF'),
  ('g642p9hct65k', 'PV-2P7K-7WK'),
  ('bunjxafm59x5', 'PV-ADY7-EVE'),
  ('em5gquvywuej', 'PV-NEYU-3EM'),
  ('y53vprx7xkn6', 'PV-ZFGW-B8A'),
  ('42c9mch7fdhf', 'PV-7B2W-5H3'),
  ('8mjkzbwq39xg', 'PV-LK5E-KEL')
on conflict (id) do nothing;
