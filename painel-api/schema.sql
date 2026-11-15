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
