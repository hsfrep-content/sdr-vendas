-- =====================================================================
--  MATCH IMOBILIÁRIO by A&L — correção: promoção a admin pelo SQL Editor
--
--  Problema: o gatilho trava_campos_privilegiados revertia silenciosamente
--  o "update corretores set is_admin = true ..." documentado no
--  COMO-PUBLICAR.md, porque no SQL Editor auth.uid() é nulo e eh_admin()
--  responde falso. Ninguém conseguia virar o primeiro admin.
--
--  Correção: auth.uid() nulo = execução fora da API (SQL Editor/rotina
--  interna) e fica liberado. Toda chamada da API tem auth.uid()
--  preenchido e continua caindo na trava. Nada muda para o cliente.
--
--  Rode UMA VEZ em: painel Supabase → SQL Editor → New query → Run.
--  (Em instalações novas não é preciso: setup-supabase.sql já vem corrigido.)
-- =====================================================================

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
