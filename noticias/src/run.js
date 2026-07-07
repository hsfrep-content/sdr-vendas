#!/usr/bin/env node
// Ponto de entrada: `node src/run.js [manha|noite]`
// Sem argumento, a rodada é inferida pelo horário de Brasília.

require('dotenv').config({ quiet: true });
const { executarRodada } = require('./pipeline');

const rodada = process.argv[2];
if (rodada && !['manha', 'noite'].includes(rodada)) {
  console.error('Uso: node src/run.js [manha|noite]');
  process.exit(1);
}

executarRodada(rodada)
  .then((rel) => {
    console.log(`\nRodada concluída: ${rel.data} (${rel.rodada}) — status: ${rel.status_final}`);
  })
  .catch((e) => {
    console.error('Falha na rodada:', e);
    process.exit(1);
  });
