-- Base aislada de clientes / carritos / descuentos (D1 CLIENTES_DB).
-- No compartir con TOKEN_KV ni con el catálogo público en GitHub.

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'vendedor', 'admin')),
  nombre TEXT NOT NULL DEFAULT '',
  telefono TEXT NOT NULL DEFAULT '',
  rut TEXT NOT NULL DEFAULT '',
  documento TEXT NOT NULL DEFAULT 'boleta' CHECK (documento IN ('boleta', 'factura')),
  razon_social TEXT NOT NULL DEFAULT '',
  giro TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  comuna TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  descuento_pct REAL NOT NULL DEFAULT 0 CHECK (descuento_pct >= 0 AND descuento_pct <= 100),
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por TEXT,
  creado_en TEXT NOT NULL,
  ultima_compra_en TEXT
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  creado_en TEXT NOT NULL,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones(usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones(expira_en);

CREATE TABLE IF NOT EXISTS carrito_items (
  usuario_id TEXT NOT NULL,
  producto_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1 CHECK (qty > 0 AND qty <= 99),
  titulo TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL DEFAULT '',
  precio_lista REAL NOT NULL DEFAULT 0,
  imagen TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  stock INTEGER,
  actualizado_en TEXT NOT NULL,
  PRIMARY KEY (usuario_id, producto_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS precios_especiales (
  usuario_id TEXT NOT NULL,
  producto_id TEXT NOT NULL,
  precio REAL NOT NULL CHECK (precio >= 0),
  PRIMARY KEY (usuario_id, producto_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_rate (
  clave TEXT PRIMARY KEY,
  contador INTEGER NOT NULL DEFAULT 0,
  ventana_en TEXT NOT NULL
);
