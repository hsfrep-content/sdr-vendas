# T3 — Registro de IP nos aceites: como ativar

O navegador não enxerga o próprio IP, então a coluna `aceites.ip` (e
`termo_assinaturas.ip`) chegava sempre nula. A Edge Function
`registra-aceite` intermedia a gravação e captura o IP real da requisição
— é o que dá valor probatório ao aceite da declaração de responsabilidade
e completa a trilha de auditoria da assinatura do termo (e-mail
verificado + carimbo de tempo + user agent + hash + **IP**).

## Ativar

Um único comando, a partir da pasta `match-imobiliario/`:

```bash
supabase functions deploy registra-aceite
```

Sem `--no-verify-jwt` desta vez: quem chama é o corretor logado, e o
gateway do Supabase já exige a sessão válida. Também não há secret manual
— `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são
injetados automaticamente no ambiente da função.

Não há SQL novo: a função usa a RPC `assinar_termo` existente (todas as
regras do banco continuam valendo) e complementa o IP com a chave de
serviço, que nunca sai do servidor.

## Como o cliente usa

O `match-imobiliario.html` já chama a função automaticamente:

- **Aceites** (cadastro e demais disclaimers) → `acao: 'aceite'`.
- **Assinatura do Termo de Parceria** → `acao: 'assinatura'` (a validação
  continua na RPC; a função só acrescenta o IP).

Se a função ainda não estiver publicada, o aplicativo **não trava**: ele
registra pelo caminho antigo (sem IP) e avisa no console. Erros de regra
de negócio (assinatura dupla, hash divergente) não caem no caminho
antigo — aparecem para o corretor normalmente.

## Testar

1. Faça um cadastro novo (ou aceite qualquer termo) e confira no SQL
   Editor: `select tipo_termo, ip from aceites order by aceito_em desc
   limit 5;` — o IP deve vir preenchido.
2. Assine um termo de teste e confira: `select corretor_id, ip,
   user_agent from termo_assinaturas order by assinado_em desc limit 5;`
