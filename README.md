# SDR Vendas — Agente de reaproximação via WhatsApp Web

Agente de SDR que envia, a partir de uma lista de contatos, uma mensagem inicial
personalizada e amistosa perguntando se o cliente tem interesse em **vender,
alugar ou comprar** um imóvel. Quando o cliente responde demonstrando interesse,
o fluxo automático é **interrompido imediatamente** e o lead é encaminhado para
um atendente humano continuar a conversa.

## Como funciona

1. **Contatos autorizados.** A lista de contatos (`data/contacts.csv`) tem uma
   coluna `consent`. Só quem tem `consent=sim` é contatado — a filtragem por
   consentimento acontece antes de qualquer envio (`src/contacts/loadContacts.js`).
2. **Mensagem inicial.** Para cada contato autorizado, é enviada uma única
   mensagem de reaproximação com o nome do cliente, tom leve e sem pressão
   (`src/messaging/template.js`), com um intervalo aleatório entre os envios
   para não parecer disparo em massa.
3. **Aguarda a resposta.** Depois de enviar, o agente não manda mais nada para
   aquele contato até ele responder — o estado fica `awaiting_reply`
   (`src/state/conversationStore.js`).
4. **Classifica a resposta.** Quando a resposta chega, um classificador
   baseado em palavras-chave em pt-BR (`src/nlp/interestClassifier.js`)
   identifica a intenção:
   - **Interesse** → o fluxo automático é interrompido e o lead vai para a
     fila de atendimento humano (`src/handoff/humanHandoff.js`), com uma
     mensagem de transição tranquila avisando o cliente.
   - **Descadastro** (ex.: "pare de mandar mensagem") → o contato é marcado
     como `opted_out` e nunca mais é contatado, mesmo em campanhas futuras.
   - **Sem interesse** → o agente agradece e encerra a conversa com respeito,
     sem insistir.
   - **Ambíguo** → o agente faz **uma única** pergunta de esclarecimento; se a
     segunda resposta continuar pouco clara, aciona um humano em vez de ficar
     insistindo com o cliente.
5. **Atendimento humano.** Todo handoff é registrado em
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
| `AGENT_SIGNATURE_NAME` | Nome do consultor/SDR que assina a mensagem |
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

## Testes

```bash
npm test
```

Os testes (`node:test`, sem dependências externas) cobrem o template de
mensagem, o classificador de intenção, o carregamento/filtragem de contatos,
a persistência de estado e o fluxo completo do agente (envio → resposta →
handoff/opt-out/encerramento), usando um cliente de WhatsApp falso — não é
necessário estar conectado ao WhatsApp para rodar a suíte.

## Limitações e avisos importantes

- Este projeto usa [`whatsapp-web.js`](https://wwebjs.dev/), uma biblioteca
  não oficial que automatiza o WhatsApp Web via navegador headless. Ela **não
  é a API oficial do WhatsApp Business** e seu uso está sujeito aos Termos de
  Serviço do WhatsApp; números podem ser banidos por uso automatizado em
  volume. Para operação em produção/escala, avalie migrar para a
  [WhatsApp Business Platform (Cloud API)](https://developers.facebook.com/docs/whatsapp).
- O classificador de intenção é baseado em regras/palavras-chave simples em
  português. Ele cobre os casos mais comuns de resposta, mas respostas muito
  fora do padrão caem em "ambíguo" e são escaladas para um humano — por
  design, na dúvida o agente prefere pedir ajuda a insistir sozinho.
- Este agente **não fecha negócio nem qualifica profundamente o lead**: seu
  papel é só a reaproximação inicial e o encaminhamento educado para quem
  demonstrar interesse.
