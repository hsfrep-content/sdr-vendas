-- =====================================================================
--  MATCH IMOBILIÁRIO by A&L — T1: Termo de Parceria com assinatura
--  Rode UMA VEZ em: painel Supabase → SQL Editor → New query → Run
--  Pré-requisito: setup-supabase.sql já executado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. QUEM PODE ASSINAR
--    O corretor só assina termo de match do qual é parte, e só enquanto
--    o termo ainda está pendente ou parcial.
-- ---------------------------------------------------------------------

create or replace function pode_assinar_termo(p_termo_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from termos t
    join matches m on m.id = t.match_id
    left join imoveis  i on i.id = m.imovel_id
    left join demandas d on d.id = m.demanda_id
    where t.id = p_termo_id
      and t.status in ('pendente','parcial')
      and (i.corretor_id = (select id from corretores where user_id = auth.uid())
        or d.corretor_id = (select id from corretores where user_id = auth.uid()))
  );
$$;

-- Endurece a política original: além de assinar como si mesmo,
-- o corretor precisa ser parte do match do termo.
drop policy if exists p_assinaturas_criar on termo_assinaturas;
create policy p_assinaturas_criar on termo_assinaturas for insert to authenticated
  with check (corretor_id = meu_corretor_id() and pode_assinar_termo(termo_id));

-- ---------------------------------------------------------------------
-- 2. TRANSIÇÃO DE STATUS NO BANCO
--    1ª assinatura → termo 'parcial'.
--    2ª assinatura → termo 'assinado', match/imóvel/demanda 'conectado'.
--    A regra vive aqui: o cliente não consegue forjar a conexão.
-- ---------------------------------------------------------------------

create or replace function avalia_assinaturas()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_match uuid;
begin
  select count(*) into v_total from termo_assinaturas where termo_id = new.termo_id;
  select match_id into v_match from termos where id = new.termo_id;

  if v_total >= 2 then
    update termos set status = 'assinado' where id = new.termo_id;
    update matches set status = 'conectado', conectado_em = now() where id = v_match;
    update imoveis  set status = 'conectado'
      where id = (select imovel_id from matches where id = v_match);
    update demandas set status = 'conectado'
      where id = (select demanda_id from matches where id = v_match);
  else
    update termos set status = 'parcial' where id = new.termo_id;
  end if;
  return new;
end;
$$;

drop trigger if exists tg_avalia_assinaturas on termo_assinaturas;
create trigger tg_avalia_assinaturas
  after insert on termo_assinaturas
  for each row execute function avalia_assinaturas();

-- ---------------------------------------------------------------------
-- 3. RPC: DADOS DO TERMO
--    Devolve o que o documento exibe ANTES da assinatura: nome e CRECI
--    das duas partes, resumo do imóvel e da demanda, e os 20%.
--    Telefone e e-mail ficam de fora — só saem pela contato_do_parceiro.
-- ---------------------------------------------------------------------

create or replace function dados_do_termo(p_termo_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  r jsonb;
begin
  select jsonb_build_object(
    'termo_id',       t.id,
    'status',         t.status,
    'versao_modelo',  t.versao_modelo,
    'hash_documento', t.hash_documento,
    'gerado_em',      t.gerado_em,
    'match_id',       m.id,
    'match_status',   m.status,
    'meu_corretor_id', (select id from corretores where user_id = auth.uid()),
    'captador',   jsonb_build_object('id', ci.id, 'nome', ci.nome, 'creci', ci.creci, 'creci_uf', ci.creci_uf),
    'demandante', jsonb_build_object('id', cd.id, 'nome', cd.nome, 'creci', cd.creci, 'creci_uf', cd.creci_uf),
    'imovel', jsonb_build_object(
      'id', i.id, 'tipo', i.tipo, 'finalidade', i.finalidade,
      'bairro', i.bairro, 'cidade', i.cidade, 'uf', i.uf,
      'metragem', i.metragem, 'valor', i.valor, 'valor_sob_consulta', i.valor_sob_consulta),
    'demanda', jsonb_build_object(
      'id', d.id, 'codigo', d.codigo, 'tipo', d.tipo, 'finalidade', d.finalidade,
      'cidade', d.cidade, 'uf', d.uf, 'valor_max', d.valor_max),
    'assinaturas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'corretor_id', a.corretor_id, 'assinado_em', a.assinado_em) order by a.assinado_em), '[]'::jsonb)
      from termo_assinaturas a where a.termo_id = t.id)
  ) into r
  from termos t
  join matches m    on m.id = t.match_id
  join imoveis i    on i.id = m.imovel_id
  join demandas d   on d.id = m.demanda_id
  join corretores ci on ci.id = i.corretor_id
  join corretores cd on cd.id = d.corretor_id
  where t.id = p_termo_id
    and (eh_admin() or ci.user_id = auth.uid() or cd.user_id = auth.uid());

  if r is null then
    raise exception 'Termo não encontrado ou acesso negado.';
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC: ASSINAR TERMO
--    Grava a assinatura com user_agent e fixa o hash do documento na
--    primeira assinatura; a segunda só entra se o hash for idêntico.
--    O IP fica nulo até a T3 (Edge Function).
-- ---------------------------------------------------------------------

create or replace function assinar_termo(p_termo_id uuid, p_hash text, p_user_agent text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_meu  uuid;
  v_hash text;
begin
  select id into v_meu from corretores where user_id = auth.uid();
  if v_meu is null then
    raise exception 'Cadastro de corretor não encontrado.';
  end if;
  if not pode_assinar_termo(p_termo_id) then
    raise exception 'Este termo não está disponível para sua assinatura.';
  end if;
  if p_hash is null or length(p_hash) <> 64 then
    raise exception 'Hash do documento inválido.';
  end if;

  select hash_documento into v_hash from termos where id = p_termo_id;
  if v_hash is null then
    update termos set hash_documento = p_hash where id = p_termo_id;
  elsif v_hash <> p_hash then
    raise exception 'O conteúdo do termo divergiu do documento assinado pela outra parte.';
  end if;

  insert into termo_assinaturas (termo_id, corretor_id, user_agent)
  values (p_termo_id, v_meu, left(p_user_agent, 400));
exception
  when unique_violation then
    raise exception 'Você já assinou este termo.';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC: CONTATO DO PARCEIRO
--    Única porta de saída do contato. Só responde se o chamador é parte
--    do match E o termo está assinado pelas duas partes.
-- ---------------------------------------------------------------------

create or replace function contato_do_parceiro(p_match_id uuid)
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  v_meu uuid;
  r jsonb;
begin
  select id into v_meu from corretores where user_id = auth.uid();
  if v_meu is null then
    raise exception 'Cadastro de corretor não encontrado.';
  end if;

  select jsonb_build_object(
    'nome', c.nome, 'email', c.email, 'telefone', c.telefone,
    'creci', c.creci, 'creci_uf', c.creci_uf, 'tipo_atuacao', c.tipo_atuacao)
  into r
  from matches m
  join termos t   on t.match_id = m.id and t.status = 'assinado'
  join imoveis i  on i.id = m.imovel_id
  join demandas d on d.id = m.demanda_id
  join corretores c on c.id = case when i.corretor_id = v_meu then d.corretor_id else i.corretor_id end
  where m.id = p_match_id
    and (i.corretor_id = v_meu or d.corretor_id = v_meu);

  if r is null then
    raise exception 'O contato é liberado após a assinatura das duas partes.';
  end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ---------------------------------------------------------------------

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('pode_assinar_termo','avalia_assinaturas','dados_do_termo','assinar_termo','contato_do_parceiro')
order by routine_name;
