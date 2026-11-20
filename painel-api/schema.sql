CREATE TABLE IF NOT EXISTS pedidos (
  id            TEXT PRIMARY KEY,     -- código do pedido do site, ex.: B1411-1932-K7QZ (o mesmo da mensagem do WhatsApp)
  nome          TEXT NOT NULL,
  tel           TEXT,                 -- celular com DDD, só dígitos (só quando o cliente quer o selo)
  fid           INTEGER NOT NULL DEFAULT 0,
  itens         TEXT NOT NULL,        -- JSON com preços do servidor
  total         INTEGER NOT NULL,     -- centavos
  retirada      TEXT,
  pagamento     TEXT,
  obs           TEXT,
  status        TEXT NOT NULL,        -- novo | preparo | pronto | retirado | cancelado
  ip            TEXT,                 -- resumo (hash) do IP, só para limitar abuso
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS pedidos_status ON pedidos (status, criado_em);
CREATE INDEX IF NOT EXISTS pedidos_tel ON pedidos (tel);
CREATE INDEX IF NOT EXISTS pedidos_ip ON pedidos (ip, criado_em);

-- Cada linha é um movimento no cartão: +1 (pedido ou manual), -1 (correção) ou -10 (prêmio resgatado).
CREATE TABLE IF NOT EXISTS selos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tel        TEXT NOT NULL,
  delta      INTEGER NOT NULL,
  pedido_id  TEXT UNIQUE,             -- no máximo 1 selo por pedido
  motivo     TEXT,
  criado_em  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS selos_tel ON selos (tel);

-- Consultas de selos feitas pelos clientes no site (só para limitar abuso; apagadas depois de 1 dia).
CREATE TABLE IF NOT EXISTS consultas (
  ip        TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS consultas_ip ON consultas (ip, criado_em);

-- Estoque: um item por insumo (farinha, mussarela, caixas...) e cada movimento registrado.
CREATE TABLE IF NOT EXISTS estoque_itens (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  unidade       TEXT NOT NULL,         -- kg, g, L, ml, un, cx, pct, lata, maço, botijão
  quantidade    REAL NOT NULL DEFAULT 0,
  minimo        REAL NOT NULL DEFAULT 0, -- abaixo disso aparece como "acabando"
  categoria     TEXT NOT NULL DEFAULT 'Outros',
  ativo         INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS estoque_itens_ativo ON estoque_itens (ativo, categoria, nome);

CREATE TABLE IF NOT EXISTS estoque_mov (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id   INTEGER NOT NULL,
  delta     REAL NOT NULL,             -- quanto mudou (+ entrada, - saída)
  saldo     REAL NOT NULL,             -- quanto ficou depois
  tipo      TEXT NOT NULL,             -- entrada | saida | contagem
  motivo    TEXT,
  criado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS estoque_mov_item ON estoque_mov (item_id, id);

-- Ajustes que o admin muda pelo painel (ex.: loja fechada hoje / até uma data).
CREATE TABLE IF NOT EXISTS config (
  chave         TEXT PRIMARY KEY,
  valor         TEXT NOT NULL,           -- JSON
  atualizado_em TEXT
);

-- Ficha técnica: quanto de cada item do estoque vai em UMA pizza de cada sabor
-- (sabor "_todas" = vale para qualquer pizza: caixa, massa...).
CREATE TABLE IF NOT EXISTS ficha (
  sabor   TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  qtd     REAL NOT NULL,
  PRIMARY KEY (sabor, item_id)
);

-- Pedidos que já deram baixa no estoque (no máximo 1 baixa por pedido).
CREATE TABLE IF NOT EXISTS baixas (
  pedido_id TEXT PRIMARY KEY,
  criado_em TEXT NOT NULL
);

-- ===== Acompanhamento ao vivo, telão, massas do dia e avaliações =====
-- Tabelas novas (em vez de colunas novas em "pedidos"): o deploy reaplica este arquivo inteiro
-- a cada publicação, e CREATE TABLE IF NOT EXISTS pode rodar quantas vezes for preciso.

-- Um registro por pedido feito pelo site: o link secreto do cliente e a hora de cada etapa.
CREATE TABLE IF NOT EXISTS acompanhamento (
  pedido_id    TEXT PRIMARY KEY,       -- pedidos.id
  token        TEXT NOT NULL UNIQUE,   -- aleatório (128 bits ou mais): o link do cliente é /acompanhar/?t=TOKEN
  numero       INTEGER NOT NULL,       -- número curto do dia (1, 2, 3...) para o telão e o balcão
  dia          TEXT NOT NULL,          -- AAAA-MM-DD no fuso America/Sao_Paulo
  massas       INTEGER NOT NULL DEFAULT 0, -- quantas massas o pedido usa (meia a meia = 1)
  criado_em    TEXT NOT NULL,
  massa_em     TEXT,                   -- etapa "Massa aberta" (status preparo)
  forno_em     TEXT,                   -- etapa "No forno"
  pronto_em    TEXT,
  retirado_em  TEXT,
  cancelado_em TEXT
);
CREATE INDEX IF NOT EXISTS acompanhamento_dia ON acompanhamento (dia, numero);

-- "Como estava a pizza?" — uma avaliação por pedido (o cliente pode corrigir a nota).
CREATE TABLE IF NOT EXISTS avaliacoes (
  pedido_id     TEXT PRIMARY KEY,
  nota          INTEGER NOT NULL,      -- 1 a 5
  comentario    TEXT,                  -- comentário privado (só a equipe vê no painel)
  criado_em     TEXT NOT NULL,
  atualizado_em TEXT
);
CREATE INDEX IF NOT EXISTS avaliacoes_criado ON avaliacoes (criado_em);

-- Limite de acessos por aparelho nas rotas públicas novas (janelas curtas; linhas velhas são apagadas).
CREATE TABLE IF NOT EXISTS limites (
  chave TEXT PRIMARY KEY,              -- rota:ip(hash):janela
  n     INTEGER NOT NULL,
  ate   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS limites_ate ON limites (ate);
