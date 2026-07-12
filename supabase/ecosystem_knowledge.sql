-- Núcleo da Central de Conhecimento do Ecossistema Sueds Hotels.
-- Execute em um ambiente de homologação antes de aplicar em produção.

create table if not exists public.ecosystem_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ecosystem_properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ecosystem_organizations(id),
  slug text not null,
  name text not null,
  property_type text not null default 'hotel',
  city text,
  state text,
  country_code text not null default 'BR',
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  external_ids jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ecosystem_organizations(id),
  property_id uuid references public.ecosystem_properties(id),
  slug text not null,
  title text not null,
  module text not null,
  document_type text not null,
  scope_type text not null check (scope_type in ('global', 'brand', 'property', 'department', 'audience')),
  visibility text not null check (visibility in ('public', 'partner', 'internal', 'restricted', 'confidential')),
  status text not null default 'draft' check (status in ('draft', 'review', 'published', 'archived')),
  owner_key text not null,
  valid_from date,
  valid_until date,
  review_at date,
  published_version integer,
  source_system text not null default 'ecosystem',
  source_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (
    (scope_type = 'property' and property_id is not null)
    or (scope_type <> 'property' and property_id is null)
  )
);

create unique index if not exists knowledge_documents_scope_slug_idx
  on public.knowledge_documents (
    organization_id,
    scope_type,
    coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid),
    slug
  );

create table if not exists public.knowledge_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  version integer not null,
  title text not null,
  summary text,
  content_markdown text not null,
  change_note text,
  content_hash text,
  author_email text not null,
  reviewed_by text,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('portuguese', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content_markdown, ''))
  ) stored,
  unique (document_id, version)
);

create index if not exists knowledge_versions_search_idx
  on public.knowledge_document_versions using gin (search_vector);

create index if not exists knowledge_documents_lookup_idx
  on public.knowledge_documents (organization_id, module, status, visibility, valid_from, valid_until);

create table if not exists public.knowledge_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ecosystem_organizations(id),
  slug text not null,
  label text not null,
  category text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.knowledge_document_tags (
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  tag_id uuid not null references public.knowledge_tags(id) on delete cascade,
  primary key (document_id, tag_id)
);

create table if not exists public.knowledge_relations (
  source_document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  target_document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  relation_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (source_document_id, target_document_id, relation_type),
  check (source_document_id <> target_document_id)
);

create table if not exists public.knowledge_consumers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.ecosystem_organizations(id),
  consumer_key text not null,
  name text not null,
  consumer_type text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  unique (organization_id, consumer_key)
);

create table if not exists public.knowledge_document_consumers (
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  consumer_id uuid not null references public.knowledge_consumers(id) on delete cascade,
  delivery_config jsonb not null default '{}'::jsonb,
  primary key (document_id, consumer_id)
);

create table if not exists public.knowledge_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.ecosystem_organizations(id),
  document_id uuid references public.knowledge_documents(id) on delete set null,
  actor_email text not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

alter table public.ecosystem_organizations enable row level security;
alter table public.ecosystem_properties enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_document_versions enable row level security;
alter table public.knowledge_tags enable row level security;
alter table public.knowledge_document_tags enable row level security;
alter table public.knowledge_relations enable row level security;
alter table public.knowledge_consumers enable row level security;
alter table public.knowledge_document_consumers enable row level security;
alter table public.knowledge_audit_log enable row level security;

-- As políticas de leitura por público serão adicionadas junto da autenticação.
-- Até lá, somente o backend com service role deve acessar estas tabelas.
