# Match Imobiliário — como colocar no ar

Três arquivos, quatro etapas. Do zero ao ar em cerca de 40 minutos.

---

## 1. Criar o projeto no Supabase

1. Acesse `supabase.com` → **New project**.
2. Nome: `imobiliario`. Região: **South America (São Paulo)** — latência menor para o Nordeste.
3. Defina uma senha forte para o banco e guarde.
4. **Comece direto no plano Pro (US$ 25/mês).** No plano Free o projeto pausa sozinho após 7 dias sem tráfego, e a plataforma sai do ar sem aviso.

## 2. Criar as tabelas

1. No projeto: **SQL Editor → New query**.
2. Cole o conteúdo inteiro de `setup-supabase.sql` e clique em **Run**.
3. Ao final, a consulta de conferência deve listar 10 tabelas com `rls_ativo = true`.

O que o script cria: as 10 tabelas, os índices, as políticas de segurança por linha, o bucket de fotos e dois gatilhos que impedem um corretor de se autopromover a administrador ou se autoverificar.

## 3. Ligar o login com Google

1. No **Google Cloud Console**, crie um projeto e vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**, tipo *Aplicativo da Web*.
2. Em **URIs de redirecionamento autorizados**, cole o endereço que o Supabase mostra em **Authentication → Providers → Google** (formato `https://SEU-PROJETO.supabase.co/auth/v1/callback`).
3. Copie **Client ID** e **Client Secret** para essa mesma tela do Supabase e ative o provedor.
4. Em **Authentication → URL Configuration**, defina:
   - *Site URL*: `https://parcerias.aelimoveis.com.br`
   - *Redirect URLs*: `https://parcerias.aelimoveis.com.br` e, para testes locais, `http://localhost:3000`

## 4. Configurar e publicar o arquivo

1. Abra `match-imobiliario.html` em um editor de texto.
2. Localize o bloco **CONFIGURAÇÃO** (perto do fim do arquivo) e preencha:
   ```js
   const SUPABASE_URL      = 'https://xxxxxxxx.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   Os dois valores estão em **Project Settings → Data API**. A chave `anon` é pública por natureza — as políticas de segurança do passo 2 são o que protege os dados.
3. Publique o arquivo. Qualquer host estático serve: Cloudflare Pages, Vercel, Netlify ou a própria hospedagem do site.
4. Aponte o subdomínio `parcerias.aelimoveis.com.br` por CNAME para o host escolhido.

## 5. Virar administrador

1. Faça o primeiro login com sua conta Google e complete o pré-cadastro.
2. Volte ao **SQL Editor** e rode, com o seu e-mail:
   ```sql
   update corretores
      set is_admin = true, status_verificacao = 'verificado'
    where email = 'seu-email@aelimoveis.com.br';
   ```
3. Recarregue a página. O item **Operação** aparece no menu — é ali que ficam a verificação de CRECI e as sugestões de cruzamento.

---

## O que já funciona

- Login com Google e pré-cadastro obrigatório com nome, e-mail, telefone e CRECI.
- Bloqueio de UF fora de PE, PB e AL, na interface e no banco.
- Cadastro de imóvel em três passos, com cidades carregadas do IBGE.
- Cinco fotos com slot de fachada fixo, compressão automática para WebP (~200 KB) e miniatura de 400px.
- Cadastro de demanda com código sequencial `AL-C##` / `AL-G##`.
- Painel do corretor com status de cada registro e linha do tempo do fluxo.
- Painel de operação com fila de verificação de CRECI e sugestões de cruzamento ranqueadas por score.
- Aceites registrados em tabela própria, com tipo e versão do termo.
- Base fechada: nenhum corretor consegue ler o registro de outro, mesmo forjando requisições — a regra está no banco, não na interface.

## O que fica para a próxima fase

- Geração e assinatura digital do Termo de Parceria (as tabelas `termos` e `termo_assinaturas` já existem).
- Disparo de e-mail no match, a partir de `contato@aelimoveis.com.br`.
- Substituição do slot de logomarca pelos arquivos definitivos — está marcado no HTML com o comentário `SLOT DE LOGOMARCA`.
- Registro de IP nos aceites, que exige uma Edge Function (o navegador não enxerga o próprio IP).

## Antes de divulgar

- Configure **SPF, DKIM e DMARC** no domínio. Com notificação por e-mail sendo o único canal da v1, aviso de match caindo em spam significa corretor concluindo que a plataforma não funciona.
- Ative os **backups diários** no Supabase (inclusos no Pro, mas precisam ser conferidos).
- Faça um teste com duas contas Google diferentes e confirme que uma não enxerga os registros da outra.
