# Central A&L — app de consulta, análise, gestão e revisão

O arquivo `index.html` desta pasta é o app completo, **autossuficiente e offline**:
não depende de internet, servidor, banco de dados ou instalação. Todo o conteúdo
dos documentos está embutido nele, e o progresso (checklists, riscos, status,
sugestões) fica salvo no navegador de quem usa (localStorage).

## Uso offline (mais simples)

1. Baixe o arquivo `index.html` para o computador (ou pen drive).
2. Dê dois cliques para abrir no navegador (Chrome, Edge ou Firefox).
3. Pronto — tudo funciona localmente, inclusive sem internet.

O progresso fica salvo **naquele navegador daquele computador**. Para levar o
progresso a outro computador, use **Revisão → Backup dos dados → Exportar
dados .json** e importe o arquivo no outro lado.

## Hospedagem em subdomínio (ex.: app.aelimoveis.com.br)

O app é um único arquivo estático — qualquer hospedagem serve:

**Opção A — hospedagem que você já tenha para aelimoveis.com.br:**
suba o `index.html` para uma pasta (ex.: `/app/`) e crie o subdomínio
apontando para ela no painel da hospedagem. No Registro.br, se o DNS é
gerenciado pela hospedagem, não precisa mudar nada; se o DNS é no próprio
Registro.br, crie um registro `A` (ou `CNAME`) para `app` apontando para a
hospedagem.

**Opção B — GitHub Pages (grátis para repositório público):**
1. No GitHub, em *Settings → Pages*, publique a pasta `/app` (ou a raiz).
2. Em *Custom domain*, informe `app.aelimoveis.com.br`.
3. No Registro.br (Serviços → DNS), crie um registro `CNAME`:
   `app` → `hsfrep-content.github.io.`
4. Aguarde a propagação (minutos a algumas horas) e ative "Enforce HTTPS".

**Opção C — Netlify/Vercel/Cloudflare Pages (grátis):** arraste o arquivo,
receba uma URL e aponte o CNAME do subdomínio para ela.

> Atenção: os dados de progresso continuam sendo por navegador mesmo com o app
> hospedado — hospedar facilita o acesso, não sincroniza dados entre pessoas.
> Para compartilhar estado, use o exportar/importar de backup.

## Atualização do conteúdo

O texto oficial dos documentos vive em `docs/al-negocios-imobiliarios/`.
Quando os documentos mudarem, o `index.html` precisa ser regenerado para
refletir a mudança (o conteúdo é embutido no arquivo).
