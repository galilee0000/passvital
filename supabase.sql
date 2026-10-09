-- PassVital demo – database setup (run once in Supabase > SQL Editor)
-- Version 2: protected card. Anyone scanning must type the sleeve's access code.

-- 1. Sleeves: one row per physical sleeve (id in the QR code, access code engraved on the sleeve)
create table if not exists public.passvital_sleeves (
  id text primary key,
  access_code text not null
);
alter table public.passvital_sleeves enable row level security;
revoke all on public.passvital_sleeves from anon, authenticated;
insert into public.passvital_sleeves (id, access_code)
values ('a7f3k9q2', 'PV-7K2Q-9XA')
on conflict (id) do nothing;

-- 2. Cards (created in version 1). The "code" column now holds the sleeve id.
create table if not exists public.passvital_cards (
  code text primary key,
  data jsonb not null,
  edit_token_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.passvital_cards enable row level security;
revoke all on public.passvital_cards from anon, authenticated;
delete from public.passvital_cards where code not in (select id from public.passvital_sleeves);

-- 3. Remove version 1 functions (the old get_card returned a card without a code)
drop function if exists public.get_card(text);
drop function if exists public.save_card(text, text, jsonb);
drop function if exists public.reset_card(text, text);

-- 4. Functions used by the page
create or replace function public.sleeve_status(p_id text)
returns text language sql security definer set search_path = public as $$
  select case
    when not exists (select 1 from passvital_sleeves where id = p_id) then 'unknown'
    when exists (select 1 from passvital_cards where code = p_id) then 'active'
    else 'available' end;
$$;

create or replace function public.get_card(p_id text, p_access text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('data', c.data, 'updated_at', c.updated_at)
  from passvital_cards c join passvital_sleeves s on s.id = c.code
  where c.code = p_id
    and regexp_replace(upper(coalesce(p_access, '')), '[^A-Z0-9]', '', 'g')
      = regexp_replace(upper(s.access_code), '[^A-Z0-9]', '', 'g');
$$;

create or replace function public.get_own_card(p_id text, p_token text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('data', c.data, 'updated_at', c.updated_at, 'access_code', s.access_code)
  from passvital_cards c join passvital_sleeves s on s.id = c.code
  where c.code = p_id
    and c.edit_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
$$;

create or replace function public.save_card(p_id text, p_token text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  h text := encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  ac text;
begin
  select access_code into ac from passvital_sleeves where id = p_id;
  if ac is null or length(coalesce(p_token, '')) < 20 or pg_column_size(p_data) > 8000 then
    return null;
  end if;
  insert into passvital_cards (code, data, edit_token_hash) values (p_id, p_data, h)
  on conflict (code) do update set data = excluded.data, updated_at = now()
    where passvital_cards.edit_token_hash = h;
  if not found then return null; end if;
  return jsonb_build_object('ok', true, 'access_code', ac);
end $$;

create or replace function public.reset_card(p_id text, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from passvital_cards
  where code = p_id
    and edit_token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex');
  return found;
end $$;

revoke all on function public.sleeve_status(text), public.get_card(text, text), public.get_own_card(text, text),
  public.save_card(text, text, jsonb), public.reset_card(text, text) from public;
grant execute on function public.sleeve_status(text), public.get_card(text, text), public.get_own_card(text, text),
  public.save_card(text, text, jsonb), public.reset_card(text, text) to anon, authenticated;
