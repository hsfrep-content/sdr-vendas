# BRIEFING — MATCH IMOBILIÁRIO by A&L

> Cole este arquivo inteiro no Claude Code como primeira mensagem, junto com
> `match-imobiliario.html`, `setup-supabase.sql` e `COMO-PUBLICAR.md`.
> Se o projeto for versionado, salve-o na raiz como `CLAUDE.md` — assim o contexto
> é carregado automaticamente em toda sessão.

---

## 1. O QUE É

Aplicação web que conecta **corretores de imóveis entre si**. Não é portal de anúncios, não atende consumidor final, não realiza transações.

- O **corretor captador** cadastra o imóvel que tem em carteira.
- O **corretor comprador** cadastra a demanda do cliente dele.
- A equipe da **A&L Negócios Imobiliários** cruza os dois lados e apresenta os corretores.
- A A&L é remunerada com **20% sobre o valor da comissão** quando a parceria fecha.

**Produção:** `parcerias.aelimoveis.com.br`
**Backend:** Supabase (Postgres + Auth Google + Storage), projeto `imobiliario`
**Operação:** Pernambuco, Paraíba e Alagoas — apenas.

---

## 2. ESTADO ATUAL

Três arquivos já existem e funcionam. **Leia os três antes de escrever qualquer linha.**

| Arquivo | O que é |
|---|---|
| `match-imobiliario.html` | Aplicação completa em arquivo único: HTML + CSS + JS vanilla, ~1.900 linhas. SDK do Supabase via CDN. Sem build step. |
| `setup-supabase.sql` | Schema completo: 10 tabelas, índices, RLS, gatilhos, bucket de storage. Já executado. |
| `COMO-PUBLICAR.md` | Passo a passo de Supabase, Google OAuth, publicação e promoção a admin. |

### O que já funciona
- Login exclusivo por Google, com pré-cadastro obrigatório (nome, e-mail, telefone, CRECI, UF do CRECI, tipo de atuação).
- Bloqueio de UF fora de PE/PB/AL na interface **e** no banco (`check` constraint).
- Cadastro de imóvel em wizard de 3 passos, com cidades carregadas da API do IBGE.
- 5 fotos com slot de fachada fixo, compressão no cliente para WebP (~200 KB) + thumbnail de 400px, upload para Supabase Storage.
- Cadastro de demanda com código sequencial `AL-C##` (residencial) / `AL-G##` (comercial).
- Painel do corretor com métricas, status por registro e linha do tempo do fluxo.
- Painel admin (`is_admin`) com fila de verificação de CRECI e sugestões de cruzamento ranqueadas por score.
- Aceites registrados na tabela `aceites` com tipo e versão do termo.
- Exclusão de conta com remoção em cascata de registros e arquivos.

### Arquitetura de telas (roteador por hash)
`#/` landing · `#/painel` · `#/imovel` · `#/demanda` · `#/perfil` · `#/admin` · `#/ver/:tipo/:id`

### Fluxo de status
`analise` → `verificado` → `cruzamento` → `match` → `conectado`

---

## 3. REGRAS INVIOLÁVEIS

Não altere nenhum destes pontos sem confirmação explícita. Se uma tarefa parecer exigir isso, **pergunte antes**.

### 3.1 Segurança
- **A base é fechada.** Nenhum corretor pode ler registro de outro. A regra vive nas políticas de RLS do Postgres, não no JavaScript. Toda tabela nova nasce com RLS habilitado e política escrita.
- Os gatilhos `trava_campos_privilegiados` e `normaliza_novo_corretor` impedem que um corretor se promova a admin ou se autoverifique. Não os remova nem os contorne.
- A chave `anon` é pública por natureza. Nunca coloque a `service_role` no cliente.
- Toda inserção de HTML dinâmico passa pela função `esc()`. Não use `innerHTML` com dado do usuário sem escapar.

### 3.2 Produto
- Escopo geográfico travado em **PE, PB, AL**.
- **Exatamente 5 fotos** por imóvel, sendo a primeira obrigatoriamente a fachada. Não flexibilize.
- Compressão para WebP no cliente é requisito, não otimização. Sem ela, o custo de storage e o tempo de carregamento explodem.
- Os quatro disclaimers (remuneração 20%, responsabilidade civil do corretor, natureza da intermediação, LGPD) precisam continuar visíveis nos pontos onde estão. Nada de escondê-los em modal fechado por padrão.
- **Não há prazo de reserva** do imóvel após o match. Não implemente contador de expiração, bloqueio temporal ou fila de espera.
- Notificação da v1 é **só por e-mail**. WhatsApp fica para depois.

### 3.3 Decisões travadas
| Item | Decisão |
|---|---|
| Nome | Match Imobiliário by A&L |
| Formalização | Termo de Parceria breve, assinado digitalmente no momento do match, antes da liberação dos contatos |
| Prazo de reserva | Não existe |
| Notificação v1 | Somente e-mail, remetente `contato@aelimoveis.com.br` |
| Contatos públicos | contato@aelimoveis.com.br · aelimoveis.com.br · WhatsApp (81) 99803-0165 · CRECI/PE 17.931-F |

---

## 4. DESIGN SYSTEM

Referências de linguagem visual: **Stripe** (estrutura, gradiente animado, bento, marquee, precisão tipográfica) e **Klarna** (tipografia grande, blocos full-bleed, raios generosos, botões em pílula). A paleta é própria — não puxe roxo do Stripe nem rosa do Klarna.

```css
--areia:#EFE9DC       --areia-clara:#F7F4EE   --branco:#FFFFFF
--gema:#D6A93B        --gema-suave:#E8CE86    --gema-fundo:#FAF3E2   --gema-profundo:#A87F1E
--naval:#16283C       --naval-fundo:#0F1F30   --naval-claro:#2C425C
--prata:#C9CED4       --prata-clara:#E2E5E8
--cinza:#7E848C       --preto:#0E1114
--sucesso:#3E7B5E     --alerta:#B4602C
--r-xl:28px  --r-card:20px  --r-campo:12px  --r-chip:999px
```

- **Display:** Fraunces (600), tracking apertado (`-.035em`), escala grande.
- **Interface:** Inter (400/500/600).
- **Dourado só em ação primária, selo e detalhe.** Nunca em bloco grande — derruba a sofisticação.
- **Elemento de assinatura:** no hero, dois cards ("Corretor A tem" / "Corretor B procura") deslizam um em direção ao outro e o selo "Match" aparece, em loop. É a mecânica do produto acontecendo na primeira dobra. Não substitua por ilustração genérica.
- Motion: 150–350ms, `cubic-bezier(.22,.61,.36,1)`. `prefers-reduced-motion` já respeitado — mantenha.
- Landing usa header escuro (`tema-escuro`); telas internas usam header claro (`tema-claro`). A troca é automática em `mostra()`.

---

## 5. CONVENÇÕES DE CÓDIGO

- **Português nos identificadores.** Funções, variáveis, tabelas e colunas seguem o padrão já existente (`carregaPainel`, `salvaImovel`, `corretor_id`, `status_verificacao`). Não misture inglês.
- Arquivo único, vanilla JS, sem framework e sem build. **Só migre para React/Vite se eu pedir** — hoje o arquivo é publicável em qualquer host estático arrastando um arquivo.
- Sem dependências novas sem justificativa. O SDK do Supabase é a única externa.
- Copy em português, tom direto, sem emoji na interface, sem "revolucionário" ou urgência artificial. Estados vazios são convite à ação, não lamento. Erros dizem o que houve e como resolver.
- Acessibilidade é piso: contraste AA, foco visível no teclado, `aria-pressed` nos chips, labels reais.

---

## 6. BACKLOG — em ordem

### T1. Termo de Parceria com assinatura digital `prioridade máxima`
As tabelas `termos` e `termo_assinaturas` já existem, vazias.

- Ao aprovar um match no admin, gerar um termo em HTML a partir dos dados já cadastrados: nome e CRECI dos dois corretores, identificação do imóvel e da demanda, e os 20% sobre a comissão total.
- Novo status intermediário: `match` → **`termo_pendente`** → `conectado`.
- **Os contatos dos corretores só aparecem depois da assinatura das duas partes.** Essa é a trava comercial do produto — sem ela, os corretores se conectam por fora e a A&L perde a remuneração.
- Assinatura eletrônica simples com trilha de auditoria: e-mail verificado, carimbo de tempo, IP e hash do documento. Amparo: MP 2.200-2/2001 e Lei 14.063/2020. Não exige certificado ICP-Brasil.
- Tela nova para o corretor: ler o termo, assinar, e só então ver o contato do outro lado.
- Registrar versão do modelo em `termos.versao_modelo`.

**Critério de aceite:** com duas contas de teste, nenhuma consegue ver o telefone ou e-mail da outra antes das duas assinaturas — nem pela interface, nem consultando a API direto.

### T2. Notificação por e-mail no match
- Edge Function do Supabase disparando de `contato@aelimoveis.com.br`.
- Gatilhos: match encontrado, termo pendente de assinatura, CRECI verificado ou recusado.
- Template em HTML na identidade visual acima.
- **Antes de ligar:** confirmar SPF, DKIM e DMARC configurados no domínio. Com e-mail sendo o único canal da v1, mensagem em spam significa corretor concluindo que a plataforma não funciona.

### T3. Registro de IP nos aceites
A coluna `aceites.ip` existe mas chega nula — o navegador não enxerga o próprio IP. Precisa de Edge Function intermediando a inserção. É o que dá valor probatório ao aceite da declaração de responsabilidade.

### T4. Logomarca definitiva
No HTML há o comentário `SLOT DE LOGOMARCA`. Trocar a div placeholder pelo SVG (versões clara e escura), gerar favicon e imagem de compartilhamento (og:image). **Os arquivos ainda não foram entregues — me peça quando chegar nesta tarefa.**

### T5. Melhorias do motor de match
- Persistir sugestões em `matches` com status `sugerido`, em vez de recalcular tudo no cliente a cada carga do admin.
- Mover o cálculo para uma função SQL ou Edge Function quando a base passar de ~500 imóveis.
- Normalizar grafia de bairro na entrada (Boa Viagem / boa viagem / BOA VIAGEM viram o mesmo).

### T6. PWA
Manifest, service worker e ícones. O corretor cadastra do celular, em campo — instalável muda a taxa de uso.

---

## 7. COMO TRABALHAR COMIGO

- Antes de mudar arquitetura, proponha e espere resposta.
- Depois de qualquer alteração, valide a sintaxe do JS e confira que todo `id` referenciado no script existe no HTML — o arquivo é único e uma referência quebrada derruba a aplicação inteira, não só a tela afetada.
- Mudança de schema vem sempre com o SQL correspondente, pronto para colar no SQL Editor, incluindo as políticas de RLS.
- Uma tarefa por vez. Termine T1 antes de abrir T2.
- Se encontrar bug ou risco que eu não pedi para corrigir, me avise em vez de corrigir por conta própria.

**Comece por:** ler os três arquivos, confirmar que entendeu o fluxo de status e a trava de contatos, e então propor o plano de implementação da T1 antes de escrever código.
