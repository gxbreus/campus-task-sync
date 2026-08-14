create table if not exists public.web_installations (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  notion_workspace_id text not null unique,
  notion_workspace_name text,
  notion_bot_id text not null,
  notion_access_token_encrypted text not null,
  notion_refresh_token_encrypted text not null,
  calendar_url_encrypted text,
  moodle_token_encrypted text,
  notion_data_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.web_installations enable row level security;

comment on table public.web_installations is
  'Instalações web sem conta própria. Segredos são cifrados pela aplicação antes da persistência.';
