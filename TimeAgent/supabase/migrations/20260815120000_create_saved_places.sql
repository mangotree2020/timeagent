-- Per-user visited places for quick destination reuse across devices.
-- RLS is enabled with no policies on purpose: only the mobility edge function
-- (service role) reads or writes, after verifying the caller's Google ID token.
create table public.saved_places (
  user_id text not null,
  place_id text not null,
  name text not null,
  road_address text not null default '',
  jibun_address text not null default '',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  last_used_at bigint not null check (last_used_at > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

alter table public.saved_places enable row level security;

create index saved_places_user_recency
  on public.saved_places (user_id, last_used_at desc);

-- One transaction for upsert + per-user cap pruning, so concurrent saves from two
-- devices can neither roll a place's recency backwards nor delete a place that was
-- refreshed between a separate read and delete. Newest last_used_at always wins.
-- Writes for one account are serialised with a transaction-scoped advisory lock so
-- concurrent saves of different places cannot leave the account above its cap. The
-- service role needs an explicit grant: revoking PUBLIC removes its execute right.
create or replace function public.remember_saved_place(
  p_user_id text,
  p_place_id text,
  p_name text,
  p_road_address text,
  p_jibun_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_last_used_at bigint,
  p_cap integer default 24
) returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('saved_places'), hashtext(p_user_id));

  insert into public.saved_places as sp
    (user_id, place_id, name, road_address, jibun_address, latitude, longitude, last_used_at)
  values
    (p_user_id, p_place_id, p_name, p_road_address, p_jibun_address, p_latitude, p_longitude, p_last_used_at)
  on conflict (user_id, place_id) do update set
    name = case when excluded.last_used_at >= sp.last_used_at then excluded.name else sp.name end,
    road_address = case when excluded.last_used_at >= sp.last_used_at then excluded.road_address else sp.road_address end,
    jibun_address = case when excluded.last_used_at >= sp.last_used_at then excluded.jibun_address else sp.jibun_address end,
    last_used_at = greatest(sp.last_used_at, excluded.last_used_at),
    updated_at = now();

  delete from public.saved_places
  where user_id = p_user_id
    and place_id not in (
      select place_id from public.saved_places
      where user_id = p_user_id
      order by last_used_at desc
      limit p_cap
    );
end;
$$;

revoke all on function public.remember_saved_place(text, text, text, text, text, double precision, double precision, bigint, integer) from public, anon, authenticated;
grant execute on function public.remember_saved_place(text, text, text, text, text, double precision, double precision, bigint, integer) to service_role;

-- This project does not grant table privileges to service_role by default, so the
-- edge function's REST and RPC calls were rejected with 42501. Only the service
-- role gets access; anon and authenticated stay locked out alongside RLS.
grant select, insert, update, delete on table public.saved_places to service_role;
