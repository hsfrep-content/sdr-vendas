# T2 — Notificação por e-mail: como ativar

Remetente: `contato@aelimoveis.com.br`, via Resend. Cinco eventos disparam
e-mail automaticamente, direto do banco:

| Evento | Quem recebe |
|---|---|
| Match aprovado (termo gerado) | Os dois corretores |
| Primeira assinatura no termo | O corretor que ainda não assinou |
| Segunda assinatura (conexão) | Os dois corretores |
| CRECI verificado | O corretor verificado |
| CRECI recusado | O corretor recusado |

Nenhum e-mail contém telefone ou e-mail do outro corretor — sempre um link
para a plataforma, onde a trava do termo continua valendo.

---

## 1. Criar a conta no Resend e verificar o domínio

1. Crie a conta em `resend.com` (plano gratuito: 3.000 e-mails/mês).
2. Em **Domains → Add Domain**, adicione `aelimoveis.com.br`.
3. O Resend mostra os registros DNS a criar no provedor do domínio:
   - **SPF** (TXT) e **DKIM** (TXT/CNAME) — obrigatórios para verificar;
   - **DMARC** (TXT em `_dmarc`): se ainda não existir, crie com
     `v=DMARC1; p=quarantine; rua=mailto:contato@aelimoveis.com.br`.
4. Aguarde o domínio ficar **Verified** (minutos a poucas horas).
5. Em **API Keys**, crie uma chave com permissão de envio e guarde.

> Isso cumpre o requisito de SPF, DKIM e DMARC do briefing. Sem o domínio
> verificado o Resend não envia como `contato@aelimoveis.com.br`.

## 2. Publicar a Edge Function

Com a [CLI do Supabase](https://supabase.com/docs/guides/functions) logada
no projeto `imobiliario`, a partir da pasta `match-imobiliario/`:

```bash
# gere um segredo longo e aleatório (guarde para o passo 3)
openssl rand -hex 32

supabase secrets set RESEND_API_KEY=re_xxxxxxxx \
  SEGREDO_NOTIFICACOES=o-segredo-gerado-acima \
  URL_APP=https://parcerias.aelimoveis.com.br

supabase functions deploy envia-email --no-verify-jwt
```

`--no-verify-jwt` é necessário porque quem chama é o banco (pg_net), não um
usuário logado. A função rejeita qualquer chamada sem o cabeçalho
`x-segredo` correto.

## 3. Ligar os gatilhos no banco

1. **SQL Editor → New query**, cole `t2-notificacoes.sql` inteiro e rode.
   A consulta final deve listar 5 funções.
2. Descomente e rode o bloco do item 4 do arquivo, preenchendo:
   - a URL: `https://SEU-PROJETO.supabase.co/functions/v1/envia-email`;
   - o segredo: o MESMO valor de `SEGREDO_NOTIFICACOES`.

A tabela `config_notificacoes` tem RLS sem políticas: ninguém a lê pela
API — só os gatilhos.

## 4. Testar

1. Com uma conta de teste `pendente`, clique **Verificar** no painel de
   operação → deve chegar "Seu CRECI foi verificado".
2. Aprove um match de teste → os dois recebem "Match encontrado".
3. Assine com uma conta → a outra recebe "Falta só a sua assinatura".
4. Assine com a segunda → os dois recebem "Conexão realizada".
5. Verifique a caixa de spam nos primeiros envios; com SPF/DKIM/DMARC
   corretos e o domínio verificado, deve cair na entrada.

Falhas de envio não travam a aplicação: o disparo é assíncrono e qualquer
erro vira aviso no log do Postgres (`Logs → Postgres`) e no log da função
(`Edge Functions → envia-email → Logs`).
