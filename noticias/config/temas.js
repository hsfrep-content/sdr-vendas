// Taxonomia de temas do Agente 1 e categorias editoriais do Agente 3.
//
// Cada tema tem palavras-chave (minúsculas, sem acento — a normalização é
// feita em src/lib/texto.js) usadas na classificação e no score.

const TEMAS = [
  { id: 'selic', nome: 'Selic', categoria: 'Selic e Juros', chaves: ['selic', 'copom', 'taxa basica', 'juros basicos', 'ata do copom'] },
  { id: 'juros-futuros', nome: 'Juros futuros', categoria: 'Selic e Juros', chaves: ['juros futuros', 'di futuro', 'curva de juros', 'treasuries', 'juro real'] },
  { id: 'inflacao', nome: 'Inflação', categoria: 'Inflação', chaves: ['inflacao', 'ipca', 'ipca-15', 'inpc', 'igp-m', 'deflacao', 'indice de precos'] },
  { id: 'focus', nome: 'Boletim Focus', categoria: 'Economia', chaves: ['boletim focus', 'focus', 'expectativas de mercado', 'projecao do mercado'] },
  { id: 'credito-imobiliario', nome: 'Crédito imobiliário', categoria: 'Crédito Imobiliário', chaves: ['credito imobiliario', 'financiamento imobiliario', 'financiamento habitacional', 'sbpe', 'poupanca', 'fgts', 'taxa de financiamento', 'home equity'] },
  { id: 'mcmv', nome: 'MCMV', categoria: 'Crédito Imobiliário', chaves: ['minha casa minha vida', 'mcmv', 'habitacao popular', 'faixa 1', 'faixa 2', 'faixa 3'] },
  { id: 'construcao-civil', nome: 'Construção civil', categoria: 'Construção Civil', chaves: ['construcao civil', 'cbic', 'insumos', 'cub', 'canteiro', 'materiais de construcao', 'sinduscon'] },
  { id: 'residencial', nome: 'Mercado de imóveis residenciais', categoria: 'Mercado Imobiliário', chaves: ['imoveis residenciais', 'apartamento', 'lancamentos', 'vendas de imoveis', 'fipezap', 'abrainc', 'secovi', 'preco dos imoveis', 'metro quadrado', 'compra de imovel'] },
  { id: 'locacao', nome: 'Mercado de locação', categoria: 'Mercado Imobiliário', chaves: ['aluguel', 'locacao', 'inquilino', 'rentabilidade do aluguel', 'aluguel residencial'] },
  { id: 'fiis', nome: 'Fundos imobiliários', categoria: 'Fundos Imobiliários', chaves: ['fundos imobiliarios', 'fii', 'ifix', 'dividend yield', 'fundo de tijolo', 'fundo de papel'] },
  { id: 'incorporadoras', nome: 'Incorporadoras', categoria: 'Mercado Imobiliário', chaves: ['incorporadora', 'cyrela', 'mrv', 'direcional', 'eztec', 'tenda', 'moura dubeux', 'cury', 'plano&plano', 'lavvi', 'trisul'] },
  { id: 'bancos', nome: 'Bancos e financiamento', categoria: 'Crédito Imobiliário', chaves: ['caixa economica', 'banco do brasil', 'itau', 'bradesco', 'santander', 'concessao de credito', 'spread bancario', 'inadimplencia'] },
  { id: 'politica-economica', nome: 'Política econômica', categoria: 'Economia', chaves: ['politica economica', 'fiscal', 'arcabouco', 'ministerio da fazenda', 'tesouro nacional', 'pib', 'atividade economica', 'desemprego', 'renda'] },
  { id: 'regional', nome: 'Indicadores regionais (Recife/PE/NE)', categoria: 'Mercado Nacional', chaves: ['recife', 'pernambuco', 'nordeste', 'boa viagem', 'pina', 'setubal', 'piedade', 'candeias', 'paiva', 'jaboatao'] },
];

const CATEGORIAS = [
  'Economia',
  'Mercado Imobiliário',
  'Crédito Imobiliário',
  'Selic e Juros',
  'Inflação',
  'Construção Civil',
  'Fundos Imobiliários',
  'Mercado Nacional',
];

// Temas de prioridade máxima (rodam na frente na seleção editorial).
const PRIORIDADE_MAXIMA = ['selic', 'focus', 'inflacao', 'credito-imobiliario', 'mcmv'];

module.exports = { TEMAS, CATEGORIAS, PRIORIDADE_MAXIMA };
