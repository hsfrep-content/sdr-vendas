-- =====================================================================
--  MATCH IMOBILIÁRIO by A&L — configuração do banco
--  Projeto Supabase sugerido: "imobiliario"
--  Rode UMA VEZ em: painel Supabase → SQL Editor → New query → Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

create table if not exists corretores (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  nome                text not null,
  email               text not null,
  telefone            text not null,
  creci               text not null,
  creci_uf            text not null,
  tipo_atuacao        text not null default 'autonomo',
  status_verificacao  text not null default 'pendente',   -- pendente | verificado | recusado
  is_admin            boolean not null default false,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create table if not exists imoveis (
  id                  uuid primary key default gen_random_uuid(),
  corretor_id         uuid not null references corretores(id) on delete cascade,
  finalidade          text not null,          -- venda | locacao | ambos
  tipo                text not null,
  valor               bigint,
  valor_sob_consulta  boolean not null default false,
  uf                  text not null check (uf in ('PE','PB','AL')),
  cidade              text not null,
  bairro              text not null,
  rua                 text not null,
  numero              text,
  complemento         text,
  edificio            text,
  metragem            integer not null,
  area_total          integer,
  quartos             smallint not null,
  suites              smallint not null,
  vagas               smallint not null,
  condominio          bigint,
  iptu                bigint,
  comissao_pct        numeric(4,2),
  aceita_permuta      boolean not null default false,
  exclusividade       boolean not null default false,
  observacoes         text check (char_length(observacoes) <= 280),
  status              text not null default 'analise',  -- analise|verificado|cruzamento|match|conectado
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create table if not exists imovel_lazer (
  id          bigserial primary key,
  imovel_id   uuid not null references imoveis(id) on delete cascade,
  item        text not null,
  custom      boolean not null default false
);

create table if not exists imovel_fotos (
  id          bigserial primary key,
  imovel_id   uuid not null references imoveis(id) on delete cascade,
  ordem       smallint not null check (ordem between 0 and 4),
  is_fachada  boolean not null default false,
  url         text not null,
  thumb_url   text not null,
  bytes       integer,
  criado_em   timestamptz not null default now(),
  unique (imovel_id, ordem)
);

create table if not exists demandas (
  id            uuid primary key default gen_random_uuid(),
  corretor_id   uuid not null references corretores(id) on delete cascade,
  codigo        text,
  finalidade    text not null,
  tipo          text not null,
  uf            text not null check (uf in ('PE','PB','AL')),
  cidade        text not null,
  bairros       text[] not null default '{}',
  valor_min     bigint,
  valor_max     bigint,
  metragem_min  integer,
  quartos_min   smallint,
  suites_min    smallint,
  vagas_min     smallint,
  urgencia      text default 'sem_prazo',
  observacoes   text check (char_length(observacoes) <= 280),
  status        text not null default 'analise',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists demanda_lazer (
  id          bigserial primary key,
  demanda_id  uuid not null references demandas(id) on delete cascade,
  item        text not null
);

create table if not exists matches (
  id                uuid primary key default gen_random_uuid(),
  imovel_id         uuid not null references imoveis(id) on delete cascade,
  demanda_id        uuid not null references demandas(id) on delete cascade,
  score             integer not null default 0,
  status            text not null default 'sugerido',  -- sugerido|aprovado|termo_pendente|conectado|descartado
  aprovado_por      uuid references corretores(id),
  termo_id          uuid,
  comissao_prevista bigint,
  conectado_em      timestamptz,
  criado_em         timestamptz not null default now(),
  unique (imovel_id, demanda_id)
);

-- Termos de parceria (assinatura digital no momento do match).
-- Estrutura pronta; a geração do PDF entra na fase seguinte.
create table if not exists termos (
  id             uuid primary key default gen_random_uuid(),
  match_id       uuid not null references matches(id) on delete cascade,
  versao_modelo  text not null default 'v1',
  pdf_url        text,
  hash_documento text,
  status         text not null default 'pendente',  -- pendente|parcial|assinado|cancelado
  gerado_em      timestamptz not null default now()
);

create table if not exists termo_assinaturas (
  id           bigserial primary key,
  termo_id     uuid not null references termos(id) on delete cascade,
  corretor_id  uuid not null references corretores(id) on delete cascade,
  assinado_em  timestamptz not null default now(),
  ip           text,
  user_agent   text,
  unique (termo_id, corretor_id)
);

-- Prova de que cada disclaimer foi apresentado e aceito.
create table if not exists aceites (
  id            bigserial primary key,
  corretor_id   uuid not null references corretores(id) on delete cascade,
  tipo_termo    text not null,
  versao_termo  text not null default 'v1',
  aceito_em     timestamptz not null default now(),
  ip            text
);

-- índices de consulta
create index if not exists ix_imoveis_corretor  on imoveis(corretor_id);
create index if not exists ix_imoveis_local     on imoveis(uf, cidade, bairro);
create index if not exists ix_imoveis_status    on imoveis(status);
create index if not exists ix_demandas_corretor on demandas(corretor_id);
create index if not exists ix_demandas_local    on demandas(uf, cidade);
create index if not exists ix_fotos_imovel      on imovel_fotos(imovel_id);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES
--    SECURITY DEFINER evita recursão infinita nas políticas de RLS.
-- ---------------------------------------------------------------------

create or replace function eh_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from corretores where user_id = auth.uid()), false);
$$;

create or replace function meu_corretor_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from corretores where user_id = auth.uid();
$$;

-- Impede que o próprio corretor se promova a admin ou se autoverifique.
-- auth.uid() nulo = execução fora da API (SQL Editor / rotina interna):
-- é o caminho documentado de promoção da equipe, e fica liberado.
-- Toda chamada vinda da API tem auth.uid() preenchido e cai na trava.
create or replace function trava_campos_privilegiados()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not (eh_admin() or auth.uid() is null) then
    new.is_admin := old.is_admin;
    new.status_verificacao := old.status_verificacao;
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists tg_trava_corretores on corretores;
create trigger tg_trava_corretores
  before update on corretores
  for each row execute function trava_campos_privilegiados();

-- Novo cadastro nunca nasce admin nem verificado.
create or replace function normaliza_novo_corretor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_admin := false;
  new.status_verificacao := 'pendente';
  return new;
end;
$$;

drop trigger if exists tg_novo_corretor on corretores;
create trigger tg_novo_corretor
  before insert on corretores
  for each row execute function normaliza_novo_corretor();

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--    Regra central: cada corretor enxerga apenas os próprios registros.
--    A base NÃO é navegável entre corretores — só a equipe A&L vê tudo.
-- ---------------------------------------------------------------------

alter table corretores       enable row level security;
alter table imoveis          enable row level security;
alter table imovel_lazer     enable row level security;
alter table imovel_fotos     enable row level security;
alter table demandas         enable row level security;
alter table demanda_lazer    enable row level security;
alter table matches          enable row level security;
alter table termos           enable row level security;
alter table termo_assinaturas enable row level security;
alter table aceites          enable row level security;

-- corretores
drop policy if exists p_corretores_ler on corretores;
create policy p_corretores_ler on corretores for select to authenticated
  using (user_id = auth.uid() or eh_admin());

drop policy if exists p_corretores_criar on corretores;
create policy p_corretores_criar on corretores for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists p_corretores_editar on corretores;
create policy p_corretores_editar on corretores for update to authenticated
  using (user_id = auth.uid() or eh_admin());

drop policy if exists p_corretores_apagar on corretores;
create policy p_corretores_apagar on corretores for delete to authenticated
  using (user_id = auth.uid() or eh_admin());

-- imóveis
drop policy if exists p_imoveis_ler on imoveis;
create policy p_imoveis_ler on imoveis for select to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_imoveis_criar on imoveis;
create policy p_imoveis_criar on imoveis for insert to authenticated
  with check (corretor_id = meu_corretor_id());

drop policy if exists p_imoveis_editar on imoveis;
create policy p_imoveis_editar on imoveis for update to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_imoveis_apagar on imoveis;
create policy p_imoveis_apagar on imoveis for delete to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

-- lazer e fotos seguem o dono do imóvel
drop policy if exists p_lazer_tudo on imovel_lazer;
create policy p_lazer_tudo on imovel_lazer for all to authenticated
  using (exists (select 1 from imoveis i where i.id = imovel_id and (i.corretor_id = meu_corretor_id() or eh_admin())))
  with check (exists (select 1 from imoveis i where i.id = imovel_id and i.corretor_id = meu_corretor_id()));

drop policy if exists p_fotos_tudo on imovel_fotos;
create policy p_fotos_tudo on imovel_fotos for all to authenticated
  using (exists (select 1 from imoveis i where i.id = imovel_id and (i.corretor_id = meu_corretor_id() or eh_admin())))
  with check (exists (select 1 from imoveis i where i.id = imovel_id and i.corretor_id = meu_corretor_id()));

-- demandas
drop policy if exists p_demandas_ler on demandas;
create policy p_demandas_ler on demandas for select to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_demandas_criar on demandas;
create policy p_demandas_criar on demandas for insert to authenticated
  with check (corretor_id = meu_corretor_id());

drop policy if exists p_demandas_editar on demandas;
create policy p_demandas_editar on demandas for update to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_demandas_apagar on demandas;
create policy p_demandas_apagar on demandas for delete to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_dlazer_tudo on demanda_lazer;
create policy p_dlazer_tudo on demanda_lazer for all to authenticated
  using (exists (select 1 from demandas d where d.id = demanda_id and (d.corretor_id = meu_corretor_id() or eh_admin())))
  with check (exists (select 1 from demandas d where d.id = demanda_id and d.corretor_id = meu_corretor_id()));

-- matches: o corretor vê os que envolvem registro seu; só a A&L cria e edita
drop policy if exists p_matches_ler on matches;
create policy p_matches_ler on matches for select to authenticated
  using (
    eh_admin()
    or exists (select 1 from imoveis  i where i.id = imovel_id  and i.corretor_id = meu_corretor_id())
    or exists (select 1 from demandas d where d.id = demanda_id and d.corretor_id = meu_corretor_id())
  );

drop policy if exists p_matches_escrever on matches;
create policy p_matches_escrever on matches for all to authenticated
  using (eh_admin()) with check (eh_admin());

-- termos
drop policy if exists p_termos_ler on termos;
create policy p_termos_ler on termos for select to authenticated
  using (
    eh_admin()
    or exists (
      select 1 from matches m
      left join imoveis  i on i.id = m.imovel_id
      left join demandas d on d.id = m.demanda_id
      where m.id = match_id
        and (i.corretor_id = meu_corretor_id() or d.corretor_id = meu_corretor_id())
    )
  );

drop policy if exists p_termos_escrever on termos;
create policy p_termos_escrever on termos for all to authenticated
  using (eh_admin()) with check (eh_admin());

drop policy if exists p_assinaturas_ler on termo_assinaturas;
create policy p_assinaturas_ler on termo_assinaturas for select to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_assinaturas_criar on termo_assinaturas;
create policy p_assinaturas_criar on termo_assinaturas for insert to authenticated
  with check (corretor_id = meu_corretor_id());

-- aceites
drop policy if exists p_aceites_ler on aceites;
create policy p_aceites_ler on aceites for select to authenticated
  using (corretor_id = meu_corretor_id() or eh_admin());

drop policy if exists p_aceites_criar on aceites;
create policy p_aceites_criar on aceites for insert to authenticated
  with check (corretor_id = meu_corretor_id());

-- ---------------------------------------------------------------------
-- 4. STORAGE — bucket das fotos
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('imoveis', 'imoveis', true)
on conflict (id) do nothing;

drop policy if exists p_fotos_ver on storage.objects;
create policy p_fotos_ver on storage.objects for select
  using (bucket_id = 'imoveis');

drop policy if exists p_fotos_enviar on storage.objects;
create policy p_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'imoveis' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists p_fotos_atualizar on storage.objects;
create policy p_fotos_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'imoveis' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists p_fotos_remover on storage.objects;
create policy p_fotos_remover on storage.objects for delete to authenticated
  using (bucket_id = 'imoveis' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- 5. PROMOVER A EQUIPE A&L A ADMINISTRADORES
--    Rode DEPOIS que cada pessoa da equipe fizer o primeiro login.
--    Troque os e-mails pelos reais.
-- ---------------------------------------------------------------------

-- update corretores
--   set is_admin = true, status_verificacao = 'verificado'
--   where email in ('contato@aelimoveis.com.br');

-- ---------------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ---------------------------------------------------------------------

select table_name, row_security_active(table_name::regclass) as rls_ativo
from information_schema.tables
where table_schema = 'public'
  and table_name in ('corretores','imoveis','imovel_lazer','imovel_fotos','demandas',
                     'demanda_lazer','matches','termos','termo_assinaturas','aceites')
order by table_name;
