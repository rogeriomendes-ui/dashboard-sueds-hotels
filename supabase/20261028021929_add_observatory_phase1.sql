-- Migração aplicada no projeto SUEDS existente: 20261028021929.
-- Nenhum projeto, serviço, assinatura, cron ou acesso de usuário é criado.
begin;

insert into public.portal_environments (slug, name, description, sort_order, status)
values ('observatorio_turismo', 'Observatório de Turismo', 'Dados públicos de aviação, turismo, hotelaria e calendário. Edição restrita a administradores.', 49, 'active')
on conflict (slug) do nothing;

create table public.observatory_datasets (
  source_id text primary key check (source_id in ('airport','anac','setur','international','cadastur')),
  payload jsonb not null check (payload ?& array['sourceId','rows','sourceUrl','retrievedAt'] and jsonb_typeof(payload->'rows') = 'array' and jsonb_array_length(payload->'rows') between 1 and 5000 and octet_length(payload::text) <= 2000000),
  digest text not null check (digest ~ '^[a-f0-9]{64}$'),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check (payload->>'sourceId' = source_id)
);

create table public.observatory_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 180),
  region text not null check (region in ('Porto Seguro','Santa Cruz Cabrália','Costa do Descobrimento','Bahia','Brasil')),
  locality text not null check (length(locality) between 1 and 180),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  category text not null check (category in ('feriado','férias escolares','cultural','esportivo','congresso','show','outro')),
  status text not null check (status in ('confirmado','previsto','cancelado')),
  source_url text not null check (source_url like 'https://%' and length(source_url) <= 2000),
  notes text not null default '' check (length(notes) <= 1200),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create index observatory_events_period on public.observatory_events (starts_on, ends_on);

create table public.observatory_audit (
  id bigint generated always as identity primary key,
  source_id text,
  event_id uuid references public.observatory_events(id),
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('import','event','failure')),
  details jsonb not null default '{}'::jsonb check (octet_length(details::text) <= 12000),
  created_at timestamptz not null default now()
);
create index observatory_audit_recent on public.observatory_audit (created_at desc, id desc);

-- No browser grants. All reads/writes go through the existing authenticated
-- Portal API; it checks observatorio_turismo and admin_geral for writes.
alter table public.observatory_datasets enable row level security;
alter table public.observatory_events enable row level security;
alter table public.observatory_audit enable row level security;
revoke all on public.observatory_datasets, public.observatory_events, public.observatory_audit from public, anon, authenticated, service_role;
revoke all on sequence public.observatory_audit_id_seq from public, anon, authenticated, service_role;
grant select, insert, update on public.observatory_datasets, public.observatory_events to service_role;
grant select, insert on public.observatory_audit to service_role;
grant usage, select on sequence public.observatory_audit_id_seq to service_role;

create function public.observatory_record_change() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'observatory_datasets' then
    if TG_OP = 'UPDATE' and OLD.digest = NEW.digest then return OLD; end if;
    insert into public.observatory_audit(source_id, actor_id, action, details)
    values (NEW.source_id, NEW.updated_by, 'import', jsonb_build_object('count', jsonb_array_length(NEW.payload->'rows'), 'digest', NEW.digest, 'previous_digest', case when TG_OP = 'UPDATE' then OLD.digest else null end, 'source_url', NEW.payload->>'sourceUrl', 'retrieved_at', NEW.payload->>'retrievedAt'));
  else
    -- AFTER trigger for events ensures the audit FK references a saved event.
    insert into public.observatory_audit(event_id, actor_id, action, details)
    values (NEW.id, NEW.updated_by, 'event', jsonb_build_object('before', case when TG_OP = 'UPDATE' then to_jsonb(OLD) - 'updated_by' else null end, 'after', to_jsonb(NEW) - 'updated_by'));
  end if;
  return NEW;
end;
$$;
revoke all on function public.observatory_record_change() from public, anon, authenticated;
grant execute on function public.observatory_record_change() to service_role;

create function public.observatory_touch() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;
revoke all on function public.observatory_touch() from public, anon, authenticated;
grant execute on function public.observatory_touch() to service_role;
create trigger observatory_dataset_time before insert or update on public.observatory_datasets for each row execute function public.observatory_touch();
create trigger observatory_dataset_audit before insert or update on public.observatory_datasets for each row execute function public.observatory_record_change();
create trigger observatory_event_time before insert or update on public.observatory_events for each row execute function public.observatory_touch();
create trigger observatory_event_audit after insert or update on public.observatory_events for each row execute function public.observatory_record_change();
commit;
