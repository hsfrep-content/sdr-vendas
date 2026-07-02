# SDR Vendas — Agente de reaproximação via WhatsApp Web

Agente de SDR que envia, a partir de uma lista de contatos, uma mensagem inicial
personalizada e amistosa perguntando se o cliente tem interesse em **vender,
alugar ou adquirir** um imóvel. Quando o cliente responde demonstrando interesse,
o fluxo automático é **interrompido imediatamente** e o lead é encaminhado para
um atendente humano continuar a conversa.

## Como funciona

1. **Contatos autorizados.** A lista de contatos (`data/contacts.csv`) tem uma
   coluna `consent`. Só quem tem `consent=sim` é contatado — a filtragem por
   consentimento acontece antes de qualquer envio (`src/contacts/loadContacts.js`).
2. **Mensagem inicial.** Para cada contato autorizado, é enviada uma única
   mensagem de reaproximação com o nome do cliente, tom leve e sem pressão
   (`src/messaging/template.js`), com um intervalo aleatório entre os envios
   para não parecer disparo em massa. Texto padrão:

   > Oi, Maria! Tudo bem? 😊
   >
   > Aqui é o *Linhares*, corretor de imóveis e gestor de negócios da A&L
   > Negócios Imobiliários. Faz um tempo desde a última vez que tivemos
   > contato e eu estou retomando esse para te perguntar:
   >
   > Você tem pensado em vender, alugar ou adquirir algum imóvel ultimamente?
   >
   > Se sim, me conta o que você busca nesse momento, vai ser um prazer te ajudar!

3. **Aguarda a resposta.** Depois de enviar, o agente não manda mais nada para
   aquele contato até ele responder — o estado fica `awaiting_reply`
   (`src/state/conversationStore.js`).
4. **Caixa de seleção.** Assim que o cliente responde qualquer coisa (ex.:
   "oi", "tenho sim"), o agente envia uma lista de seleção com três opções
   fixas (`src/messaging/selectionMenu.js`), para deixar a resposta do
   cliente estruturada e fácil de interpretar:
   1. *Sim, tenho interesse em vender*
   2. *Não tenho interesse, obrigado*
   3. *Favor parar de enviar mensagens.*
5. **A escolha decide o próximo passo:**
   - **Opção 1 (interesse)** → o fluxo automático é interrompido e o lead vai
     para a fila de atendimento humano (`src/handoff/humanHandoff.js`), com a
     mensagem: *"Perfeito, [nome]! Vou te conectar agora com o meu time de
     atendimento para avançarmos com o teu atendimento."*
   - **Opção 3 (descadastro)** → o contato é marcado como `opted_out` e nunca
     mais é contatado, mesmo em campanhas futuras.
   - **Opção 2 (sem interesse)** → o agente agradece e encerra a conversa com
     respeito, sem insistir.
   - **Qualquer outra resposta** (cliente não usa o menu, ex.: "Oi, tudo
     bem?") → tratado como fora do roteiro: o agente não insiste nem repete o
     menu, aciona direto o atendimento humano para não deixar o cliente sem
     resposta.
   - O cliente também pode responder digitando o número (`1`, `2` ou `3`) ou
     escrevendo com as próprias palavras (ex.: "quero vender meu apê") em vez
     de tocar na lista — o agente reconhece os dois formatos.
6. **Atendimento humano.** Todo handoff é registrado em
   `data/handoff-queue.json` e, opcionalmente, notificado em tempo real para
   um número/grupo interno via `HANDOFF_NOTIFY_NUMBER`.

## Privacidade e consentimento

- O agente **só contata quem autorizou previamente** (coluna `consent` no CSV).
- Pedidos de descadastro são respeitados permanentemente: o estado
  `opted_out` é persistido e checado antes de qualquer nova campanha.
- O tom da mensagem é sempre respeitoso e sem pressão ("sem compromisso
  nenhum"), e o agente nunca insiste além de uma tentativa de esclarecimento.
- Trate `data/contacts.csv`, `data/state.json` e `data/handoff-queue.json`
  como dados pessoais sensíveis (LGPD): eles ficam fora do controle de
  versão (`.gitignore`) e devem ser protegidos como qualquer outra base de
  clientes.

## Configuração

```bash
npm install
cp .env.example .env      # ajuste os valores conforme necessário
cp data/contacts.example.csv data/contacts.csv   # edite com seus contatos reais
```

Principais variáveis de ambiente (ver `.env.example` para a lista completa):

| Variável | Descrição |
|---|---|
| `AGENT_COMPANY_NAME` | Nome da imobiliária exibido na mensagem |
| `AGENT_SIGNATURE_NAME` | Nome do consultor/SDR que assina a mensagem (em negrito) |
| `AGENT_ROLE` | Cargo exibido junto ao nome do consultor |
| `CONTACTS_FILE` | Caminho do CSV de contatos |
| `MESSAGE_MIN_DELAY_MS` / `MESSAGE_MAX_DELAY_MS` | Intervalo entre envios |
| `HANDOFF_NOTIFY_NUMBER` | Número interno avisado quando um lead esquenta |

### Formato do CSV de contatos

```csv
name,phone,consent
Maria Silva,11999990000,sim
João Pereira,11988887777,sim
Ana Souza,11977776666,nao
```

- `phone` pode ter ou não o DDI; se faltar, `DEFAULT_COUNTRY_CODE` (padrão
  `55`) é adicionado automaticamente.
- `consent` aceita `sim`/`true`/`1`/`yes`; qualquer outro valor é tratado como
  "não autorizado" e o contato é ignorado.
- Esse arquivo pode ser trocado tanto copiando manualmente para
  `data/contacts.csv` quanto pelo formulário de upload no painel web (ver
  seção "Painel de visualização" abaixo) — os dois caminhos passam pela
  mesma validação.

## Executando

```bash
npm start
```

Isso sobe duas coisas ao mesmo tempo: a conexão com o WhatsApp Web e um
**painel visual** em `http://127.0.0.1:3000` (ver seção abaixo) — é lá que
você escaneia o QR code e envia a planilha de contatos, sem precisar mexer
em terminal ou editar arquivo à mão.

A sessão autenticada fica salva em `WHATSAPP_SESSION_PATH` (`.wwebjs_auth`
por padrão), então não pede o QR code de novo a cada reinício. Depois de
conectado, o agente envia a mensagem inicial para os contatos autorizados
ainda não contatados e passa a escutar as respostas.

## Painel de visualização (escanear o QR code e enviar a planilha pelo navegador)

Com o `npm start` (ou o serviço systemd) rodando, abra no navegador **do
mesmo computador** onde o processo está rodando:

```
http://localhost:3000
```

Nessa página você encontra, nessa ordem:

1. **QR code para escanear** — aparece automaticamente como imagem enquanto
   o WhatsApp não estiver conectado. A página se atualiza sozinha a cada
   15s, então o QR code (que o WhatsApp troca a cada ~20s) sempre aparece
   atualizado. Depois de escanear, o status muda para "Conectado".
2. **Envio da planilha de contatos** — um botão "Escolher arquivo" para
   selecionar o CSV (colunas `name,phone,consent`) direto do computador, e
   um botão "Enviar planilha". O painel valida o arquivo antes de salvar
   (se as colunas estiverem erradas, mostra um aviso e não sobrescreve a
   planilha anterior) e mostra quantos contatos foram lidos e quantos estão
   autorizados.
3. **Botão para disparar o envio** — depois de subir uma planilha nova
   (inclusive para adicionar contatos a qualquer momento, sem reiniciar o
   processo), clique em "Enviar mensagens para os contatos novos agora".
   Contatos que já foram contatados antes nunca recebem a mensagem de novo.
4. **Andamento das conversas e fila de atendimento humano** — quantos
   contatos estão em cada etapa, e a lista de leads que demonstraram
   interesse (ou saíram do roteiro) e estão esperando um humano assumir.

### Acessando de outro computador da rede (opcional)

Por padrão o painel só aceita conexões da própria máquina
(`DASHBOARD_HOST=127.0.0.1`), de propósito: a página mostra o QR code de
autenticação e recebe upload de dados de clientes, então não deve ficar
aberta para qualquer um. Se precisar acessar de outro computador do
escritório:

1. Defina `DASHBOARD_HOST=0.0.0.0` no `.env`.
2. Defina também `DASHBOARD_TOKEN=<algo-secreto>` no `.env` — com isso o
   painel passa a exigir `http://<ip-da-máquina>:3000/?token=<algo-secreto>`
   para carregar.
3. Reinicie o processo (`sudo systemctl restart sdr-vendas` se estiver
   usando o serviço).

Evite expor essa porta na internet; se precisar de acesso remoto, prefira um
túnel SSH (`ssh -L 3000:localhost:3000 usuario@ip-da-maquina`) em vez de
abrir a porta publicamente.

## Deploy em produção (computador do escritório, Linux, sempre ligado)

Esses passos deixam o agente rodando permanentemente na máquina do
escritório, reiniciando sozinho se cair ou se o computador reiniciar.

**1. Instalar o Node.js 18+ (se ainda não tiver):**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # confirme que é 18 ou superior
```

**2. Copiar o projeto para a máquina e instalar as dependências:**

```bash
sudo mkdir -p /opt/sdr-vendas
sudo chown $USER:$USER /opt/sdr-vendas
git clone <url-do-repositorio> /opt/sdr-vendas
cd /opt/sdr-vendas
npm ci --omit=dev
```

**3. Configurar:**

```bash
cp .env.example .env              # ajuste HANDOFF_NOTIFY_NUMBER e demais variáveis
cp data/contacts.example.csv data/contacts.csv   # substitua pelos contatos reais autorizados
```

**4. Rodar uma vez manualmente para escanear o QR code:**

```bash
npm start
```

Abra `http://localhost:3000` num navegador **nessa mesma máquina** (se for
acesso remoto por SSH, veja "Acessando de outro computador da rede" acima) e
escaneie o QR code exibido na página com o WhatsApp do número que vai atuar
como agente. Depois que o status mudar para "Conectado", pare o processo
(`Ctrl+C`) — a sessão já ficou salva em `.wwebjs_auth/` e não vai pedir o QR
code de novo.

**5. Instalar como serviço do sistema (systemd), para rodar sempre e
reiniciar sozinho:**

```bash
sudo useradd -r -m -d /opt/sdr-vendas sdr        # usuário dedicado (não usar root)
sudo chown -R sdr:sdr /opt/sdr-vendas
sudo cp deploy/sdr-vendas.service /etc/systemd/system/sdr-vendas.service
sudo systemctl daemon-reload
sudo systemctl enable --now sdr-vendas
```

Edite `/etc/systemd/system/sdr-vendas.service` antes de ativar se o caminho
do projeto (`WorkingDirectory`) ou o usuário (`User`/`Group`) forem
diferentes de `/opt/sdr-vendas` e `sdr`.

**Comandos úteis depois de instalado:**

```bash
sudo systemctl status sdr-vendas     # ver se está rodando
journalctl -u sdr-vendas -f          # acompanhar os logs em tempo real
sudo systemctl restart sdr-vendas    # reiniciar manualmente
sudo systemctl stop sdr-vendas       # parar
```

Se o Chromium do puppeteer falhar ao abrir por falta de bibliotecas do
sistema (comum em instalações Linux bem enxutas), instale as dependências
comuns do Chrome headless:

```bash
sudo apt-get install -y libnss3 libatk-bridge2.0-0 libx11-xcb1 libxcomposite1 \
  libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libasound2
```

## Testes

```bash
npm test
```

Os testes (`node:test`, sem dependências externas) cobrem o template de
mensagem, o classificador de intenção, o carregamento/filtragem de contatos,
a persistência de estado e o fluxo completo do agente (envio → resposta →
caixa de seleção → handoff/opt-out/encerramento), usando um cliente de
WhatsApp falso — não é necessário estar conectado ao WhatsApp para rodar a
suíte.

## Limitações e avisos importantes

- Este projeto usa [`whatsapp-web.js`](https://wwebjs.dev/), uma biblioteca
  não oficial que automatiza o WhatsApp Web via navegador headless. Ela **não
  é a API oficial do WhatsApp Business** e seu uso está sujeito aos Termos de
  Serviço do WhatsApp; números podem ser banidos por uso automatizado em
  volume. Para operação em produção/escala, avalie migrar para a
  [WhatsApp Business Platform (Cloud API)](https://developers.facebook.com/docs/whatsapp).
- **A caixa de seleção usa mensagens de lista interativa do WhatsApp**
  (o mesmo recurso usado por contas comerciais para mostrar um botão "Ver
  opções" que abre uma lista). O WhatsApp restringiu esse tipo de mensagem
  fora da API oficial de empresas nos últimos anos, então ela pode não
  aparecer para alguns clientes dependendo da versão do WhatsApp deles. Por
  segurança, se o envio da lista falhar, o agente cai automaticamente para um
  menu em **texto simples** com as mesmas três opções numeradas — o cliente
  nunca fica sem receber a pergunta, só pode variar a aparência.
- O reconhecimento de texto livre (quando o cliente digita em vez de
  selecionar) é baseado em regras/palavras-chave em português. Ele cobre os
  casos mais comuns, mas qualquer resposta fora do esperado é tratada como
  "quero falar com alguém" e escalada direto para um humano — por design, na
  dúvida o agente prefere pedir ajuda a insistir sozinho.
- Este agente **não fecha negócio nem qualifica profundamente o lead**: seu
  papel é só a reaproximação inicial e o encaminhamento educado para quem
  demonstrar interesse.
