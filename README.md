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

## Executando

```bash
npm start
```

Na primeira execução, um QR code aparece no terminal — escaneie com o
WhatsApp do número que vai atuar como agente (Configurações → Aparelhos
conectados → Conectar um aparelho). A sessão fica salva em
`WHATSAPP_SESSION_PATH` (`.wwebjs_auth` por padrão) para não pedir o QR code
de novo a cada execução.

Depois de conectado, o agente envia a mensagem inicial para os contatos
autorizados ainda não contatados e passa a escutar as respostas.

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

Escaneie o QR code que aparece no terminal com o WhatsApp do número que vai
atuar como agente (Configurações → Aparelhos conectados → Conectar um
aparelho). Depois que aparecer "WhatsApp conectado...", pare o processo
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
