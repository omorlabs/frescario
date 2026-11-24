'use strict';
/*
 * Frescario - servidor del add-on de Home Assistant
 * Datos en /data/frescario.json (entra en las copias de seguridad de HA).
 * El acceso solo llega a traves del Ingress de HA, que identifica al usuario.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '8099', 10);
const DEV = process.env.FRESCARIO_DEV === '1';
const DATA_DIR = process.env.FRESCARIO_DATA || '/data';
const DATA_FILE = path.join(DATA_DIR, 'frescario.json');
const OPTIONS_FILE = path.join(DATA_DIR, 'options.json');
const INGRESS_IP = '172.30.32.2';

/* ---------- utilidades ---------- */
const nuevoId = () => crypto.randomBytes(8).toString('hex');
const ahora = () => new Date().toISOString();
const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 120);
const num = (v, def) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : def; };
const fecha = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) ? v : null;
const COLORES = ['rojo', 'amar', 'verde', 'azul', 'uva', 'gris'];
const ICONOS = ['despensa', 'nevera', 'congelador', 'limpieza', 'botiquin', 'bebidas', 'caja'];
const ROLES = ['admin', 'familia', 'lector'];
const ACENTOS = ['tomate', 'menta', 'uva', 'mar'];
const TEMAS = ['claro', 'oscuro', 'auto'];
const WIDGETS = ['usalo', 'compra', 'semana', 'almacenes', 'resumen'];
const TAMANOS = [4, 6, 8, 12];
const UNIDADES = ['uds', 'kg', 'g', 'L', 'ml', 'paquetes', 'bricks', 'botes', 'bolsas', 'latas', 'botellas', 'bandejas', 'docenas'];

const SING = { uds: 'ud', paquetes: 'paquete', bricks: 'brick', botes: 'bote', bolsas: 'bolsa', latas: 'lata', botellas: 'botella', bandejas: 'bandeja', docenas: 'docena' };
const CATEGORIAS_BASE = ['Lácteos y huevos', 'Carne', 'Pescado', 'Fruta y verdura', 'Panadería', 'Conservas', 'Congelados', 'Bebidas', 'Pasta, arroz y legumbres', 'Desayuno', 'Salsas y especias', 'Snacks y dulces', 'Limpieza', 'Higiene', 'Otros'];

const widgetsPorDefecto = () => [
  { k: 'usalo', on: true, t: 8 },
  { k: 'compra', on: true, t: 4 },
  { k: 'semana', on: true, t: 8 },
  { k: 'almacenes', on: true, t: 4 },
  { k: 'resumen', on: false, t: 6 }
];

function datosIniciales() {
  return {
    version: 1,
    creado: ahora(),
    ajustes: { diasAviso: 3 },
    almacenes: [
      { id: nuevoId(), nombre: 'Despensa', icono: 'despensa', color: 'azul', orden: 0 },
      { id: nuevoId(), nombre: 'Nevera', icono: 'nevera', color: 'verde', orden: 1 },
      { id: nuevoId(), nombre: 'Congelador', icono: 'congelador', color: 'amar', orden: 2 }
    ],
    categorias: CATEGORIAS_BASE.slice(),
    productos: [],
    compra: [],
    usuarios: {},
    historial: []
  };
}

/* ---------- persistencia atómica ---------- */
let db;
function cargar() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
      db = datosIniciales();
      guardarYa();
    }
  } catch (e) {
    console.error('[frescario] No se pudo leer el archivo de datos:', e.message);
    if (fs.existsSync(DATA_FILE)) {
      const copia = DATA_FILE + '.corrupto-' + Date.now();
      try { fs.copyFileSync(DATA_FILE, copia); } catch (_) {}
      console.error('[frescario] Copia del archivo dañado guardada en', copia);
    }
    db = datosIniciales();
    guardarYa();
  }
  const base = datosIniciales();
  for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k];
}
function guardarYa() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DATA_FILE);
}
let tGuardar = null;
function guardar() {
  clearTimeout(tGuardar);
  tGuardar = setTimeout(() => { try { guardarYa(); } catch (e) { console.error('[frescario] Error al guardar:', e.message); } }, 150);
}
function guardarYAvisar(origen) { guardar(); emitir(origen); }

function leerOpciones() {
  try { return JSON.parse(fs.readFileSync(OPTIONS_FILE, 'utf8')); } catch (_) { return {}; }
}

/* ---------- tiempo real (SSE) ---------- */
const clientes = new Set();
function emitir(origen) {
  const msg = 'event: cambio\ndata: ' + JSON.stringify({ t: Date.now(), por: origen || '' }) + '\n\n';
  for (const res of clientes) { try { res.write(msg); } catch (_) {} }
}
setInterval(() => { for (const res of clientes) { try { res.write(': ping\n\n'); } catch (_) {} } }, 25000);

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', false);
app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Solo se acepta tráfico que viene del Ingress de Home Assistant
app.use((req, res, next) => {
  if (DEV) return next();
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  if (ip !== INGRESS_IP) return res.status(403).end();
  next();
});

function usuarioDe(req) {
  let id = req.get('x-remote-user-id');
  let usuario = req.get('x-remote-user-name');
  let nombre = req.get('x-remote-user-display-name');
  if (DEV && !id) { id = req.get('x-dev-user') || 'dev-admin'; usuario = id; nombre = id === 'dev-admin' ? 'Oscar' : id; }
  if (!id) return null;
  id = txt(id, 64);
  let u = db.usuarios[id];
  const admins = (leerOpciones().administradores || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  if (!u) {
    const hayAdmin = Object.values(db.usuarios).some((x) => x.rol === 'admin');
    let rol = 'familia';
    if (admins.length ? admins.includes(String(usuario || '').toLowerCase()) : !hayAdmin) rol = 'admin';
    u = db.usuarios[id] = {
      id, usuario: txt(usuario, 64), nombre: txt(nombre || usuario || 'Usuario', 64), rol,
      prefs: { tema: 'claro', acento: 'tomate', widgets: widgetsPorDefecto() },
      alta: ahora(), ultimo: ahora()
    };
    guardar();
  } else {
    if (nombre && u.nombre !== txt(nombre, 64)) u.nombre = txt(nombre, 64);
    if (usuario && u.usuario !== txt(usuario, 64)) u.usuario = txt(usuario, 64);
    if (admins.length && admins.includes(String(u.usuario).toLowerCase()) && u.rol !== 'admin') u.rol = 'admin';
    const hoy = ahora();
    if (!u.ultimo || hoy.slice(0, 13) !== u.ultimo.slice(0, 13)) { u.ultimo = hoy; guardar(); }
  }
  return u;
}

function auth(req, res, next) {
  const u = usuarioDe(req);
  if (!u) return res.status(401).json({ error: 'Abre Frescario desde Home Assistant.' });
  req.u = u;
  next();
}
const puedeEditar = (req, res, next) => (req.u.rol === 'lector' ? res.status(403).json({ error: 'Tu usuario solo puede consultar.' }) : next());
const soloAdmin = (req, res, next) => (req.u.rol !== 'admin' ? res.status(403).json({ error: 'Solo el administrador puede hacer esto.' }) : next());

function registrar(u, accion, p, cant) {
  db.historial.unshift({ t: ahora(), u: u.nombre, accion, producto: p ? p.nombre : '', cant: cant == null ? null : cant });
  if (db.historial.length > 500) db.historial.length = 500;
}

function vistaUsuario(u) {
  return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, prefs: u.prefs };
}

/* ---------- API ---------- */
const api = express.Router();
api.use(auth);

api.get('/estado', (req, res) => {
  const out = {
    yo: vistaUsuario(req.u),
    ajustes: db.ajustes,
    almacenes: db.almacenes.slice().sort((a, b) => a.orden - b.orden),
    categorias: db.categorias,
    unidades: UNIDADES,
    productos: db.productos,
    compra: db.compra,
    historial: db.historial.slice(0, 30)
  };
  if (req.u.rol === 'admin') {
    out.usuarios = Object.values(db.usuarios).map((u) => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, ultimo: u.ultimo }));
  }
  res.json(out);
});

api.get('/eventos', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders && res.flushHeaders();
  res.write('retry: 5000\n\n');
  clientes.add(res);
  req.on('close', () => clientes.delete(res));
});

/* preferencias del usuario */
api.put('/yo/prefs', (req, res) => {
  const b = req.body || {};
  const p = req.u.prefs || {};
  if (TEMAS.includes(b.tema)) p.tema = b.tema;
  if (ACENTOS.includes(b.acento)) p.acento = b.acento;
  if (Array.isArray(b.widgets)) {
    const vistos = new Set();
    const w = [];
    for (const x of b.widgets) {
      if (!x || !WIDGETS.includes(x.k) || vistos.has(x.k)) continue;
      vistos.add(x.k);
      w.push({ k: x.k, on: !!x.on, t: TAMANOS.includes(+x.t) ? +x.t : 6 });
    }
    for (const d of widgetsPorDefecto()) if (!vistos.has(d.k)) w.push(Object.assign({}, d, { on: false }));
    p.widgets = w;
  }
  req.u.prefs = p;
  guardar();
  res.json({ ok: true, prefs: p });
});

/* productos */
function limpiarProducto(b, prev) {
  const p = prev ? Object.assign({}, prev) : { id: nuevoId(), creado: ahora() };
  if (b.nombre !== undefined) p.nombre = txt(b.nombre, 80);
  if (b.almacenId !== undefined) p.almacenId = db.almacenes.some((a) => a.id === b.almacenId) ? b.almacenId : (db.almacenes[0] || {}).id;
  if (b.cantidad !== undefined) p.cantidad = Math.max(0, num(b.cantidad, 0));
  if (b.unidad !== undefined) p.unidad = UNIDADES.includes(b.unidad) ? b.unidad : 'uds';
  if (b.minimo !== undefined) p.minimo = Math.max(0, num(b.minimo, 0));
  if (b.caducidad !== undefined) p.caducidad = fecha(b.caducidad);
  if (b.categoria !== undefined) p.categoria = db.categorias.includes(b.categoria) ? b.categoria : 'Otros';
  if (b.nota !== undefined) p.nota = txt(b.nota, 300);
  if (b.codigo !== undefined) p.codigo = txt(b.codigo, 32).replace(/[^0-9A-Za-z]/g, '');
  if (!p.almacenId) p.almacenId = (db.almacenes[0] || {}).id;
  if (p.cantidad === undefined) p.cantidad = 1;
  if (!p.unidad) p.unidad = 'uds';
  if (p.minimo === undefined) p.minimo = 0;
  if (!p.categoria) p.categoria = 'Otros';
  p.actualizado = ahora();
  return p;
}

api.post('/productos', puedeEditar, (req, res) => {
  const b = req.body || {};
  if (!txt(b.nombre)) return res.status(400).json({ error: 'Ponle un nombre al producto.' });
  const p = limpiarProducto(b, null);
  db.productos.push(p);
  registrar(req.u, 'alta', p, p.cantidad);
  guardarYAvisar(req.u.id);
  res.json(p);
});

api.put('/productos/:id', puedeEditar, (req, res) => {
  const i = db.productos.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Ese producto ya no existe.' });
  const b = req.body || {};
  if (b.nombre !== undefined && !txt(b.nombre)) return res.status(400).json({ error: 'El nombre no puede quedar vacío.' });
  db.productos[i] = limpiarProducto(b, db.productos[i]);
  registrar(req.u, 'edicion', db.productos[i], null);
  guardarYAvisar(req.u.id);
  res.json(db.productos[i]);
});

api.post('/productos/:id/mover', puedeEditar, (req, res) => {
  const p = db.productos.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Ese producto ya no existe.' });
  const delta = num((req.body || {}).delta, 0);
  const motivo = ['consumo', 'tirado', 'ajuste', 'compra'].includes((req.body || {}).motivo) ? req.body.motivo : 'ajuste';
  if (!delta) return res.json(p);
  p.cantidad = Math.max(0, Math.round((p.cantidad + delta) * 1000) / 1000);
  p.actualizado = ahora();
  registrar(req.u, motivo, p, delta);
  guardarYAvisar(req.u.id);
  res.json(p);
});

api.delete('/productos/:id', puedeEditar, (req, res) => {
  const i = db.productos.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Ese producto ya no existe.' });
  const [p] = db.productos.splice(i, 1);
  registrar(req.u, 'baja', p, null);
  guardarYAvisar(req.u.id);
  res.json({ ok: true });
});

/* lista de la compra */
api.post('/compra', puedeEditar, (req, res) => {
  const b = req.body || {};
  const nombre = txt(b.nombre, 80);
  if (!nombre) return res.status(400).json({ error: 'Escribe qué hay que comprar.' });
  const ya = db.compra.find((c) => !c.hecho && c.nombre.toLowerCase() === nombre.toLowerCase());
  if (ya) return res.json(Object.assign({ repetido: true }, ya));
  const prod = b.productoId ? db.productos.find((p) => p.id === b.productoId) : db.productos.find((p) => p.nombre.toLowerCase() === nombre.toLowerCase());
  const c = { id: nuevoId(), nombre, cantidad: txt(b.cantidad, 20), productoId: prod ? prod.id : null, categoria: prod ? prod.categoria : (db.categorias.includes(b.categoria) ? b.categoria : 'Otros'), hecho: false, por: req.u.nombre, creado: ahora() };
  db.compra.push(c);
  guardarYAvisar(req.u.id);
  res.json(c);
});

api.put('/compra/:id', puedeEditar, (req, res) => {
  const c = db.compra.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Ese producto ya no está en la lista.' });
  const b = req.body || {};
  if (b.hecho !== undefined) c.hecho = !!b.hecho;
  if (b.nombre !== undefined && txt(b.nombre, 80)) c.nombre = txt(b.nombre, 80);
  if (b.cantidad !== undefined) c.cantidad = txt(b.cantidad, 20);
  guardarYAvisar(req.u.id);
  res.json(c);
});

api.delete('/compra/:id', puedeEditar, (req, res) => {
  db.compra = db.compra.filter((x) => x.id !== req.params.id);
  guardarYAvisar(req.u.id);
  res.json({ ok: true });
});

api.post('/compra/faltantes', puedeEditar, (req, res) => {
  let n = 0;
  for (const p of db.productos) {
    if (p.minimo > 0 && p.cantidad < p.minimo && !db.compra.some((c) => !c.hecho && (c.productoId === p.id || c.nombre.toLowerCase() === p.nombre.toLowerCase()))) {
      const falta = Math.round((p.minimo - p.cantidad) * 1000) / 1000;
      db.compra.push({ id: nuevoId(), nombre: p.nombre, cantidad: falta + ' ' + (falta === 1 && SING[p.unidad] ? SING[p.unidad] : p.unidad), productoId: p.id, categoria: p.categoria, hecho: false, por: req.u.nombre, creado: ahora() });
      n++;
    }
  }
  if (n) guardarYAvisar(req.u.id);
  res.json({ ok: true, anadidos: n });
});

api.post('/compra/terminar', puedeEditar, (req, res) => {
  // Lo marcado como comprado que esté ligado a un producto suma 1 unidad al almacén si se pide
  const sumar = !!(req.body || {}).sumarAlAlmacen;
  const hechos = db.compra.filter((c) => c.hecho);
  if (sumar) {
    for (const c of hechos) {
      const p = c.productoId && db.productos.find((x) => x.id === c.productoId);
      if (p) {
        const n = parseFloat(String(c.cantidad).replace(',', '.'));
        const d = Number.isFinite(n) && n > 0 ? n : 1;
        p.cantidad = Math.round((p.cantidad + d) * 1000) / 1000;
        p.actualizado = ahora();
        registrar(req.u, 'compra', p, d);
      }
    }
  }
  db.compra = db.compra.filter((c) => !c.hecho);
  guardarYAvisar(req.u.id);
  res.json({ ok: true, quitados: hechos.length });
});

/* administración */
api.put('/ajustes', soloAdmin, (req, res) => {
  const b = req.body || {};
  if (b.diasAviso !== undefined) db.ajustes.diasAviso = Math.min(30, Math.max(1, Math.round(num(b.diasAviso, 3))));
  guardarYAvisar(req.u.id);
  res.json(db.ajustes);
});

api.post('/almacenes', soloAdmin, (req, res) => {
  const b = req.body || {};
  const nombre = txt(b.nombre, 40);
  if (!nombre) return res.status(400).json({ error: 'Ponle un nombre al almacén.' });
  const a = { id: nuevoId(), nombre, icono: ICONOS.includes(b.icono) ? b.icono : 'caja', color: COLORES.includes(b.color) ? b.color : 'gris', orden: db.almacenes.length };
  db.almacenes.push(a);
  guardarYAvisar(req.u.id);
  res.json(a);
});

api.put('/almacenes/:id', soloAdmin, (req, res) => {
  const a = db.almacenes.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Ese almacén ya no existe.' });
  const b = req.body || {};
  if (b.nombre !== undefined && txt(b.nombre, 40)) a.nombre = txt(b.nombre, 40);
  if (ICONOS.includes(b.icono)) a.icono = b.icono;
  if (COLORES.includes(b.color)) a.color = b.color;
  if (b.mover === -1 || b.mover === 1) {
    const lista = db.almacenes.sort((x, y) => x.orden - y.orden);
    const i = lista.indexOf(a); const j = i + b.mover;
    if (j >= 0 && j < lista.length) { const t = lista[i].orden; lista[i].orden = lista[j].orden; lista[j].orden = t; }
    lista.sort((x, y) => x.orden - y.orden).forEach((x, k) => { x.orden = k; });
  }
  guardarYAvisar(req.u.id);
  res.json(a);
});

api.delete('/almacenes/:id', soloAdmin, (req, res) => {
  if (db.almacenes.length <= 1) return res.status(400).json({ error: 'Tiene que quedar al menos un almacén.' });
  const a = db.almacenes.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Ese almacén ya no existe.' });
  const destino = db.almacenes.find((x) => x.id === (req.body || {}).destino && x.id !== a.id) || db.almacenes.find((x) => x.id !== a.id);
  db.productos.forEach((p) => { if (p.almacenId === a.id) p.almacenId = destino.id; });
  db.almacenes = db.almacenes.filter((x) => x.id !== a.id);
  db.almacenes.sort((x, y) => x.orden - y.orden).forEach((x, k) => { x.orden = k; });
  guardarYAvisar(req.u.id);
  res.json({ ok: true, movidosA: destino.nombre });
});

api.post('/categorias', soloAdmin, (req, res) => {
  const n = txt((req.body || {}).nombre, 40);
  if (!n) return res.status(400).json({ error: 'Escribe el nombre de la categoría.' });
  if (!db.categorias.some((c) => c.toLowerCase() === n.toLowerCase())) db.categorias.splice(Math.max(0, db.categorias.length - 1), 0, n);
  guardarYAvisar(req.u.id);
  res.json(db.categorias);
});

api.delete('/categorias', soloAdmin, (req, res) => {
  const n = txt((req.body || {}).nombre, 40);
  if (n === 'Otros') return res.status(400).json({ error: 'La categoría Otros no se puede borrar.' });
  db.categorias = db.categorias.filter((c) => c !== n);
  db.productos.forEach((p) => { if (p.categoria === n) p.categoria = 'Otros'; });
  guardarYAvisar(req.u.id);
  res.json(db.categorias);
});

api.put('/usuarios/:id', soloAdmin, (req, res) => {
  const u = db.usuarios[req.params.id];
  if (!u) return res.status(404).json({ error: 'Ese usuario no existe.' });
  const rol = (req.body || {}).rol;
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol no válido.' });
  if (u.rol === 'admin' && rol !== 'admin' && Object.values(db.usuarios).filter((x) => x.rol === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Tiene que quedar al menos un administrador.' });
  }
  u.rol = rol;
  guardarYAvisar(req.u.id);
  res.json({ ok: true });
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));

app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0, etag: true }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[frescario] Error:', err && err.message);
  if (res.headersSent) return;
  res.status(err && err.type === 'entity.parse.failed' ? 400 : 500).json({ error: 'Algo ha fallado. Vuelve a intentarlo.' });
});

cargar();
const server = app.listen(PORT, () => console.log('[frescario] Listo en el puerto ' + PORT + (DEV ? ' (modo desarrollo)' : '')));

function apagar() {
  try { clearTimeout(tGuardar); guardarYa(); } catch (_) {}
  for (const r of clientes) { try { r.end(); } catch (_) {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
