'use strict';
/*
 * Frescario - servidor del add-on de Home Assistant
 * Datos en /data/frescario.json (entra en las copias de seguridad de HA).
 * El acceso solo llega a través del Ingress de HA, que identifica al usuario.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ha = require('./ha');
const ext = require('./externos');

const VERSION = '1.3.1';
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
const hora = (v) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)) ? v : null;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const COLORES = ['rojo', 'amar', 'verde', 'azul', 'uva', 'gris'];
const ICONOS = ['despensa', 'nevera', 'congelador', 'limpieza', 'botiquin', 'bebidas', 'caja'];
const ROLES = ['admin', 'familia', 'lector'];
const ACENTOS = ['tomate', 'menta', 'uva', 'mar'];
const TEMAS = ['claro', 'oscuro', 'auto'];
const WIDGETS = ['usalo', 'compra', 'semana', 'prevision', 'almacenes', 'gasto', 'resumen'];
const TAMANOS = [4, 6, 8, 12];
const UNIDADES = ['uds', 'kg', 'g', 'L', 'ml', 'paquetes', 'bricks', 'botes', 'bolsas', 'latas', 'botellas', 'bandejas', 'docenas'];
const SING = { uds: 'ud', paquetes: 'paquete', bricks: 'brick', botes: 'bote', bolsas: 'bolsa', latas: 'lata', botellas: 'botella', bandejas: 'bandeja', docenas: 'docena' };
const uni = (n, u) => (n === 1 && SING[u] ? SING[u] : u);

const CATEGORIAS_BASE = ['Fruta y verdura', 'Panadería', 'Carne', 'Pescado', 'Lácteos y huevos', 'Desayuno', 'Pasta, arroz y legumbres', 'Conservas', 'Salsas y especias', 'Snacks y dulces', 'Bebidas', 'Congelados', 'Limpieza', 'Higiene', 'Otros'];

const widgetsPorDefecto = () => [
  { k: 'usalo', on: true, t: 8 }, { k: 'compra', on: true, t: 4 },
  { k: 'semana', on: true, t: 8 }, { k: 'prevision', on: true, t: 4 },
  { k: 'almacenes', on: true, t: 6 }, { k: 'gasto', on: true, t: 6 },
  { k: 'resumen', on: false, t: 6 }
];
const avisosPorDefecto = () => ({ dispositivos: [], caducidad: true, bajoMinimo: false, lista: false });

function datosIniciales() {
  return {
    version: 2, creado: ahora(),
    ajustes: { diasAviso: 3, avisos: { hora: '09:00', hora2: '', antelacion: 1, incluirCaducados: true } },
    almacenes: [
      { id: nuevoId(), nombre: 'Despensa', icono: 'despensa', color: 'azul', orden: 0 },
      { id: nuevoId(), nombre: 'Nevera', icono: 'nevera', color: 'verde', orden: 1 },
      { id: nuevoId(), nombre: 'Congelador', icono: 'congelador', color: 'amar', orden: 2 }
    ],
    categorias: CATEGORIAS_BASE.slice(),
    supers: [],
    productos: [], compra: [], tickets: [], usuarios: {}, historial: [], haSync: { uids: {} }
  };
}

/* ---------- persistencia atómica ---------- */
let db;
function migrar() {
  const base = datosIniciales();
  for (const k of Object.keys(base)) if (db[k] === undefined) db[k] = base[k];
  if (!db.ajustes.avisos) db.ajustes.avisos = base.ajustes.avisos;
  for (const u of Object.values(db.usuarios)) {
    u.prefs = u.prefs || {};
    if (!u.prefs.avisos) u.prefs.avisos = avisosPorDefecto();
    const w = Array.isArray(u.prefs.widgets) ? u.prefs.widgets.filter((x) => WIDGETS.includes(x.k)) : [];
    for (const d of widgetsPorDefecto()) if (!w.some((x) => x.k === d.k)) w.push(d);
    u.prefs.widgets = w;
  }
  for (const p of db.productos) if (!Array.isArray(p.precios)) p.precios = [];
  db.version = 2;
}
function cargar() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    else { db = datosIniciales(); guardarYa(); }
  } catch (e) {
    console.error('[frescario] No se pudo leer el archivo de datos:', e.message);
    if (fs.existsSync(DATA_FILE)) { try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.corrupto-' + Date.now()); } catch (_) {} }
    db = datosIniciales(); guardarYa();
  }
  migrar(); guardarYa();
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
function guardarYAvisar(origen) { guardar(); emitir(origen); ha.sensoresPronto(); }
function leerOpciones() { try { return JSON.parse(fs.readFileSync(OPTIONS_FILE, 'utf8')); } catch (_) { return {}; } }

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
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
app.use((req, res, next) => {
  if (DEV) return next();
  const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
  if (ip !== INGRESS_IP) return res.status(403).end();
  next();
});
app.use('/api/ticket/leer', express.json({ limit: '24mb' }));
app.use('/api/copia', express.json({ limit: '20mb' }));
app.use(express.json({ limit: '256kb' }));

function usuarioDe(req) {
  let id = req.get('x-remote-user-id');
  let usuario = req.get('x-remote-user-name');
  let nombre = req.get('x-remote-user-display-name');
  if (DEV && !id) { id = req.get('x-dev-user') || 'dev-admin'; usuario = id; nombre = id === 'dev-admin' ? 'Oscar' : id.charAt(0).toUpperCase() + id.slice(1); }
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
      prefs: { tema: 'claro', acento: 'tomate', widgets: widgetsPorDefecto(), avisos: avisosPorDefecto() },
      alta: ahora(), ultimo: ahora()
    };
    guardar();
  } else {
    if (nombre && u.nombre !== txt(nombre, 64)) u.nombre = txt(nombre, 64);
    if (usuario && u.usuario !== txt(usuario, 64)) u.usuario = txt(usuario, 64);
    if (admins.length && admins.includes(String(u.usuario).toLowerCase()) && u.rol !== 'admin') u.rol = 'admin';
    const t = ahora();
    if (!u.ultimo || t.slice(0, 13) !== u.ultimo.slice(0, 13)) { u.ultimo = t; guardar(); }
  }
  return u;
}
function auth(req, res, next) {
  const u = usuarioDe(req);
  if (!u) return res.status(401).json({ error: 'Abre Frescario desde Home Assistant.' });
  req.u = u; next();
}
const puedeEditar = (req, res, next) => (req.u.rol === 'lector' ? res.status(403).json({ error: 'Tu usuario solo puede consultar.' }) : next());
const soloAdmin = (req, res, next) => (req.u.rol !== 'admin' ? res.status(403).json({ error: 'Solo el administrador puede hacer esto.' }) : next());

function registrar(u, accion, p, cant, extra) {
  db.historial.unshift(Object.assign({ t: ahora(), u: u.nombre, accion, pid: p ? p.id : null, producto: p ? p.nombre : '', cant: cant == null ? null : cant }, extra || {}));
  if (db.historial.length > 4000) db.historial.length = 4000;
}

/* ---------- supermercados ---------- */
function limpiaSuper(nombre) {
  const n = txt(nombre, 40).replace(/\b(s\.?\s?a\.?\s?u?\.?|s\.?\s?l\.?\s?u?\.?|supermercados?|hipermercados?|distribucion|alimentacion)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  const k = norm(n);
  const ya = db.supers.find((s) => norm(s) === k || norm(s).split(' ')[0] === k.split(' ')[0]);
  return ya || n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
function canonSuper(nombre) {
  let n = txt(nombre, 40).replace(/\b(s\.?\s?a\.?\s?u?\.?|s\.?\s?l\.?\s?u?\.?|supermercados?|hipermercados?|distribucion|alimentacion)(?=\s|$)/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return '';
  const k = norm(n);
  const ya = db.supers.find((s) => norm(s) === k || norm(s).split(' ')[0] === k.split(' ')[0]);
  if (ya) return ya;
  n = n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  db.supers.push(n);
  return n;
}

/* ---------- consumo y previsión ---------- */
function ritmoConsumo(p) {
  const desde = Date.now() - 60 * 86400000;
  let total = 0, primero = null;
  for (const h of db.historial) {
    if (h.pid !== p.id || h.accion !== 'consumo') continue;
    const t = Date.parse(h.t); if (t < desde) break;
    total += Math.abs(h.cant || 0); primero = t;
  }
  if (!total || !primero) return null;
  const diasObs = Math.max(7, (Date.now() - primero) / 86400000);
  return total / diasObs;
}

function vistaUsuario(u) { return { id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, prefs: u.prefs, alta: u.alta }; }

const PISTAS = [
  [/(leche|yogur|queso|huevo|mantequilla|nata|kefir)/, 'Lácteos y huevos'], [/(pollo|ternera|cerdo|carne|jamon|chorizo|salchich|pavo|lomo|hamburgues|embutido)/, 'Carne'],
  [/(merluza|salmon|atun|bacalao|gamba|pescado|sardina|calamar|mejillon)/, 'Pescado'], [/(manzana|platano|naranja|pera|tomate|lechuga|cebolla|patata|zanahoria|pimiento|fruta|verdura|ajo|limon|fresa|uva|aguacate|espinaca|calabacin|pepino)/, 'Fruta y verdura'],
  [/(pan |baguette|bolleria|croissant|tostada|pan$|^pan)/, 'Panadería'], [/(lata|conserva|bote)/, 'Conservas'], [/(congelad|helado|pizza)/, 'Congelados'],
  [/(agua|zumo|refresco|cerveza|vino|cola|bebida)/, 'Bebidas'], [/(arroz|pasta|macarron|espagueti|lenteja|garbanzo|alubia|harina|fideo)/, 'Pasta, arroz y legumbres'],
  [/(cafe|cacao|cereal|galleta| te |infusion|mermelada|azucar)/, 'Desayuno'], [/(aceite|vinagre| sal |salsa|especia|ketchup|mayonesa|oregano|pimienta)/, 'Salsas y especias'],
  [/(chocolate|patatas fritas|snack|chuche|dulce|frutos secos)/, 'Snacks y dulces'], [/(detergente|lejia|friegasuelos|suavizante|lavavajillas|bayeta|estropajo|papel de cocina|bolsas de basura)/, 'Limpieza'],
  [/(champu|gel|pasta de dientes|desodorante|papel higienico|compresa|maquinilla|crema)/, 'Higiene']
];
function adivinarCategoria(nombre) {
  const n = ' ' + norm(nombre) + ' ';
  for (const [re, c] of PISTAS) if (re.test(n) && db.categorias.includes(c)) return c;
  return 'Otros';
}
function nuevoItemCompra(nombre, por, extra) {
  const prod = db.productos.find((p) => norm(p.nombre) === norm(nombre));
  const c = Object.assign({ id: nuevoId(), nombre: txt(nombre, 80), cantidad: '', productoId: prod ? prod.id : null, categoria: prod ? prod.categoria : adivinarCategoria(nombre), hecho: false, por: por || '', creado: ahora() }, extra || {});
  db.compra.push(c);
  return c;
}

/* ---------- API ---------- */
const api = express.Router();
api.use(auth);

api.get('/estado', (req, res) => {
  const ritmo = {};
  for (const p of db.productos) { const r = ritmoConsumo(p); if (r) ritmo[p.id] = Math.round(r * 1000) / 1000; }
  const out = {
    version: VERSION, yo: vistaUsuario(req.u), ajustes: db.ajustes,
    almacenes: db.almacenes.slice().sort((a, b) => a.orden - b.orden),
    categorias: db.categorias, unidades: UNIDADES, supers: db.supers,
    productos: db.productos, compra: db.compra, ritmo,
    tickets: db.tickets.slice(0, 120).map((t) => ({ id: t.id, fecha: t.fecha, comercio: t.comercio, total: t.total, n: (t.articulos || []).length, por: t.por })),
    historial: db.historial.slice(0, 600),
    ha: { disponible: ha.disponible(), tickets: !!String(leerOpciones().gemini_api_key || '').trim(), lista: ha.estado().lista }
  };
  if (req.u.rol === 'admin') {
    out.usuarios = Object.values(db.usuarios).map((u) => ({ id: u.id, nombre: u.nombre, usuario: u.usuario, rol: u.rol, ultimo: u.ultimo }));
    out.haEstado = ha.estado();
  }
  res.json(out);
});

api.get('/eventos', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (res.flushHeaders) res.flushHeaders();
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
  if (b.kofi === 'si' || b.kofi === 'no') p.kofi = b.kofi;
  if (['auto', 'es', 'en'].includes(b.idioma)) p.idioma = b.idioma;
  if (['es', 'en'].includes(b.idiomaReal)) p.idiomaReal = b.idiomaReal;
  if (Array.isArray(b.widgets)) {
    const vistos = new Set(); const w = [];
    for (const x of b.widgets) {
      if (!x || !WIDGETS.includes(x.k) || vistos.has(x.k)) continue;
      vistos.add(x.k); w.push({ k: x.k, on: !!x.on, t: TAMANOS.includes(+x.t) ? +x.t : 6 });
    }
    for (const d of widgetsPorDefecto()) if (!vistos.has(d.k)) w.push(Object.assign({}, d, { on: false }));
    p.widgets = w;
  }
  if (b.avisos && typeof b.avisos === 'object') {
    const a = p.avisos || avisosPorDefecto();
    if (Array.isArray(b.avisos.dispositivos)) a.dispositivos = b.avisos.dispositivos.filter((d) => /^mobile_app_[a-z0-9_]+$/.test(d)).slice(0, 10);
    ['caducidad', 'bajoMinimo', 'lista'].forEach((k) => { if (b.avisos[k] !== undefined) a[k] = !!b.avisos[k]; });
    p.avisos = a;
  }
  req.u.prefs = p; guardar();
  res.json({ ok: true, prefs: p });
});
api.get('/yo/dispositivos', async (req, res) => { res.json({ dispositivos: await ha.servicioNotify(), conectado: ha.estado().conectado }); });
api.post('/yo/probar-aviso', async (req, res) => {
  const av = (req.u.prefs && req.u.prefs.avisos) || {};
  if (!(av.dispositivos || []).length) return res.status(400).json({ error: 'Elige primero en qué móvil quieres los avisos.' });
  if (!ha.estado().conectado) return res.status(503).json({ error: 'Ahora mismo no hay conexión con Home Assistant.' });
  const n = await ha.avisoCaducidades([req.u], true);
  if (!n) return res.status(502).json({ error: 'Home Assistant no ha podido enviar el aviso a ese móvil.' });
  res.json({ ok: true, enviados: n });
});

/* productos */
function limpiarProducto(b, prev) {
  const p = prev ? Object.assign({}, prev) : { id: nuevoId(), creado: ahora(), precios: [] };
  if (b.nombre !== undefined) p.nombre = txt(b.nombre, 80);
  if (b.almacenId !== undefined) p.almacenId = db.almacenes.some((a) => a.id === b.almacenId) ? b.almacenId : (db.almacenes[0] || {}).id;
  if (b.cantidad !== undefined) p.cantidad = Math.max(0, num(b.cantidad, 0));
  if (b.unidad !== undefined) p.unidad = UNIDADES.includes(b.unidad) ? b.unidad : 'uds';
  if (b.minimo !== undefined) p.minimo = Math.max(0, num(b.minimo, 0));
  if (b.caducidad !== undefined) p.caducidad = fecha(b.caducidad);
  if (b.categoria !== undefined) p.categoria = db.categorias.includes(b.categoria) ? b.categoria : 'Otros';
  if (b.nota !== undefined) p.nota = txt(b.nota, 300);
  if (b.codigo !== undefined) p.codigo = txt(b.codigo, 32).replace(/[^0-9A-Za-z]/g, '');
  if (b.imagen !== undefined) p.imagen = /^https:\/\/[a-z0-9.-]*openfoodfacts\.(org|net)\/[^\s"'<>]+$/i.test(b.imagen) ? b.imagen : '';
  if (!p.almacenId) p.almacenId = (db.almacenes[0] || {}).id;
  if (p.cantidad === undefined) p.cantidad = 1;
  if (!p.unidad) p.unidad = 'uds';
  if (p.minimo === undefined) p.minimo = 0;
  if (!p.categoria) p.categoria = 'Otros';
  if (!Array.isArray(p.precios)) p.precios = [];
  p.actualizado = ahora();
  return p;
}
function avisarSiBajo(p, antes) { if (p.minimo > 0 && antes >= p.minimo && p.cantidad < p.minimo) ha.eventoBajoMinimo(p); }

api.post('/productos', puedeEditar, (req, res) => {
  const b = req.body || {};
  if (!txt(b.nombre)) return res.status(400).json({ error: 'Ponle un nombre al producto.' });
  const p = limpiarProducto(b, null);
  if (b.precio !== undefined && num(b.precio, 0) > 0) p.precios.unshift({ f: ahora().slice(0, 10), precio: num(b.precio, 0), super: canonSuper(b.super || '') });
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
  const antes = db.productos[i].cantidad;
  db.productos[i] = limpiarProducto(b, db.productos[i]);
  avisarSiBajo(db.productos[i], antes);
  registrar(req.u, 'edicion', db.productos[i], null);
  guardarYAvisar(req.u.id);
  res.json(db.productos[i]);
});
api.post('/productos/:id/mover', puedeEditar, (req, res) => {
  const p = db.productos.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Ese producto ya no existe.' });
  const b = req.body || {};
  const delta = num(b.delta, 0);
  const motivo = ['consumo', 'tirado', 'ajuste', 'compra'].includes(b.motivo) ? b.motivo : 'ajuste';
  if (!delta) return res.json(p);
  const antes = p.cantidad;
  p.cantidad = Math.max(0, Math.round((p.cantidad + delta) * 1000) / 1000);
  const real = Math.round((p.cantidad - antes) * 1000) / 1000;
  p.actualizado = ahora();
  const precio = p.precios && p.precios[0] ? p.precios[0].precio : null;
  registrar(req.u, motivo, p, real, motivo === 'tirado' && precio ? { valor: Math.round(Math.abs(real) * precio * 100) / 100 } : null);
  if (motivo !== 'compra') avisarSiBajo(p, antes);
  guardarYAvisar(req.u.id);
  res.json(p);
});
api.post('/productos/:id/precio', puedeEditar, (req, res) => {
  const p = db.productos.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'Ese producto ya no existe.' });
  const b = req.body || {};
  const precio = num(b.precio, 0);
  if (!(precio > 0)) return res.status(400).json({ error: 'Pon un precio válido.' });
  p.precios.unshift({ f: fecha(b.fecha) || ahora().slice(0, 10), precio, super: canonSuper(b.super || '') });
  p.precios = p.precios.slice(0, 30);
  guardarYAvisar(req.u.id);
  res.json(p);
});
api.delete('/productos/:id', puedeEditar, (req, res) => {
  const i = db.productos.findIndex((p) => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ error: 'Ese producto ya no existe.' });
  const [p] = db.productos.splice(i, 1);
  db.compra.forEach((c) => { if (c.productoId === p.id) c.productoId = null; });
  registrar(req.u, 'baja', p, null);
  guardarYAvisar(req.u.id);
  res.json({ ok: true });
});

/* códigos de barras */
api.get('/codigo/:codigo', async (req, res) => {
  const codigo = String(req.params.codigo || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
  if (!codigo) return res.status(400).json({ error: 'Código no válido.' });
  const ya = db.productos.find((p) => p.codigo === codigo);
  if (ya) return res.json({ existe: true, producto: ya });
  try { res.json({ existe: false, codigo, datos: await ext.buscarCodigo(codigo, db.categorias) }); }
  catch (e) { res.json({ existe: false, codigo, datos: null }); }
});

/* tickets */
function parecido(a, b) {
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 2)), B = new Set(norm(b).split(' ').filter((w) => w.length > 2));
  if (!A.size || !B.size) return 0;
  let c = 0; A.forEach((w) => { if (B.has(w)) c++; });
  return c / Math.min(A.size, B.size);
}
api.post('/ticket/leer', puedeEditar, async (req, res) => {
  const clave = String(leerOpciones().gemini_api_key || process.env.FRESCARIO_GEMINI_KEY || '').trim();
  if (!clave) return res.status(400).json({ error: 'La lectura de tickets no está activada. Pídeselo al administrador de la casa.' });
  const b = req.body || {};
  const crudas = Array.isArray(b.imagenes) ? b.imagenes.slice(0, 4) : (b.imagen ? [b.imagen] : []);
  const imgs = [];
  for (const x of crudas) {
    const m = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(x || ''));
    if (m) imgs.push({ mime: m[1], data: m[3] });
  }
  if (!imgs.length) return res.status(400).json({ error: 'No me ha llegado bien la foto. Prueba otra vez.' });
  try {
    const d = await ext.leerTicket(clave, imgs, db.categorias);
    const arts = (d.articulos || []).slice(0, 80).map((a) => {
      const nombre = txt(a.nombre, 80);
      let mejor = null, score = 0;
      for (const p of db.productos) { const s = parecido(nombre, p.nombre); if (s > score) { score = s; mejor = p; } }
      return {
        nombre, cantidad: Math.max(0, num(a.cantidad, 1)) || 1, precio: Math.max(0, num(a.precio, 0)),
        categoria: db.categorias.includes(a.categoria) ? a.categoria : adivinarCategoria(nombre),
        productoId: score >= 0.6 && mejor ? mejor.id : null
      };
    }).filter((a) => a.nombre);
    res.json({ comercio: limpiaSuper(d.comercio), fecha: fecha(d.fecha) || ahora().slice(0, 10), total: num(d.total, 0), articulos: arts });
  } catch (e) { res.status(e.status || 500).json({ error: e.message || 'No se pudo leer el ticket.' }); }
});
api.post('/ticket/aplicar', puedeEditar, (req, res) => {
  const b = req.body || {};
  const sup = canonSuper(b.comercio || '');
  const f = fecha(b.fecha) || ahora().slice(0, 10);
  const arts = Array.isArray(b.articulos) ? b.articulos.slice(0, 80) : [];
  let nuevos = 0, sumados = 0, quitadosLista = 0;
  const guardados = [];
  for (const a of arts) {
    if (!a || a.incluir === false) continue;
    const nombre = txt(a.nombre, 80); if (!nombre) continue;
    const cant = Math.max(0, num(a.cantidad, 1)) || 1;
    const precio = Math.max(0, num(a.precio, 0));
    let p = a.productoId && db.productos.find((x) => x.id === a.productoId);
    if (p) {
      p.cantidad = Math.round((p.cantidad + cant) * 1000) / 1000; p.actualizado = ahora();
      if (fecha(a.caducidad)) p.caducidad = a.caducidad;
      registrar(req.u, 'compra', p, cant); sumados++;
    } else {
      p = limpiarProducto({ nombre, cantidad: cant, unidad: Number.isInteger(cant) ? 'uds' : 'kg', almacenId: a.almacenId, categoria: db.categorias.includes(a.categoria) ? a.categoria : adivinarCategoria(nombre), caducidad: fecha(a.caducidad) }, null);
      db.productos.push(p); registrar(req.u, 'alta', p, cant); nuevos++;
    }
    if (precio > 0) { p.precios.unshift({ f, precio: Math.round(precio / cant * 100) / 100, super: sup }); p.precios = p.precios.slice(0, 30); }
    const quitar = db.compra.filter((c) => !c.hecho && (c.productoId === p.id || norm(c.nombre) === norm(p.nombre)));
    if (quitar.length) { ha.listaQuitar(quitar).catch(() => {}); db.compra = db.compra.filter((c) => !quitar.includes(c)); quitadosLista += quitar.length; }
    guardados.push({ nombre, cantidad: cant, precio, pid: p.id });
  }
  const total = num(b.total, 0) || Math.round(guardados.reduce((s, x) => s + x.precio, 0) * 100) / 100;
  db.tickets.unshift({ id: nuevoId(), fecha: f, comercio: sup, total, articulos: guardados, por: req.u.nombre, creado: ahora() });
  db.tickets = db.tickets.slice(0, 500);
  guardarYAvisar(req.u.id);
  res.json({ ok: true, nuevos, sumados, quitadosLista });
});
api.delete('/tickets/:id', soloAdmin, (req, res) => {
  db.tickets = db.tickets.filter((t) => t.id !== req.params.id);
  guardarYAvisar(req.u.id); res.json({ ok: true });
});

/* lista de la compra */
api.post('/compra', puedeEditar, (req, res) => {
  const b = req.body || {};
  const nombre = txt(b.nombre, 80);
  if (!nombre) return res.status(400).json({ error: 'Escribe qué hay que comprar.' });
  const ya = db.compra.find((c) => !c.hecho && norm(c.nombre) === norm(nombre));
  if (ya) return res.json(Object.assign({ repetido: true }, ya));
  const extra = { cantidad: txt(b.cantidad, 20) };
  if (b.productoId) { const p = db.productos.find((x) => x.id === b.productoId); if (p) { extra.productoId = p.id; extra.categoria = p.categoria; } }
  if (b.categoria && db.categorias.includes(b.categoria)) extra.categoria = b.categoria;
  const c = nuevoItemCompra(nombre, req.u.nombre, extra);
  guardarYAvisar(req.u.id);
  ha.listaAnadir(c).catch(() => {});
  ha.eventoLista(c.nombre, req.u);
  res.json(c);
});
api.put('/compra/:id', puedeEditar, (req, res) => {
  const c = db.compra.find((x) => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Ese producto ya no está en la lista.' });
  const b = req.body || {};
  const antes = c.hecho;
  if (b.hecho !== undefined) c.hecho = !!b.hecho;
  if (b.nombre !== undefined && txt(b.nombre, 80)) c.nombre = txt(b.nombre, 80);
  if (b.cantidad !== undefined) c.cantidad = txt(b.cantidad, 20);
  if (b.categoria !== undefined && db.categorias.includes(b.categoria)) c.categoria = b.categoria;
  guardarYAvisar(req.u.id);
  if (antes !== c.hecho) ha.listaMarcar(c).catch(() => {});
  res.json(c);
});
api.delete('/compra/:id', puedeEditar, (req, res) => {
  const c = db.compra.find((x) => x.id === req.params.id);
  db.compra = db.compra.filter((x) => x.id !== req.params.id);
  if (c) ha.listaQuitar([c]).catch(() => {});
  guardarYAvisar(req.u.id);
  res.json({ ok: true });
});
api.post('/compra/faltantes', puedeEditar, (req, res) => {
  const nuevos = [];
  const lista = Array.isArray((req.body || {}).ids) ? req.body.ids : null;
  for (const p of db.productos) {
    const falta = p.minimo > 0 && p.cantidad < p.minimo;
    if (lista ? !lista.includes(p.id) : !falta) continue;
    if (db.compra.some((c) => !c.hecho && (c.productoId === p.id || norm(c.nombre) === norm(p.nombre)))) continue;
    const n = falta ? Math.round((p.minimo - p.cantidad) * 1000) / 1000 : 1;
    nuevos.push(nuevoItemCompra(p.nombre, req.u.nombre, { cantidad: n + ' ' + uni(n, p.unidad), productoId: p.id, categoria: p.categoria }));
  }
  if (nuevos.length) { guardarYAvisar(req.u.id); nuevos.forEach((c) => ha.listaAnadir(c).catch(() => {})); }
  res.json({ ok: true, anadidos: nuevos.length });
});
api.post('/compra/terminar', puedeEditar, (req, res) => {
  const b = req.body || {};
  const hechos = db.compra.filter((c) => c.hecho);
  if (b.sumarAlAlmacen) {
    for (const c of hechos) {
      const p = c.productoId && db.productos.find((x) => x.id === c.productoId);
      if (!p) continue;
      const n = parseFloat(String(c.cantidad).replace(',', '.'));
      const d = Number.isFinite(n) && n > 0 ? n : 1;
      p.cantidad = Math.round((p.cantidad + d) * 1000) / 1000; p.actualizado = ahora();
      registrar(req.u, 'compra', p, d);
    }
  }
  const importe = num(b.importe, 0);
  if (importe > 0) {
    db.tickets.unshift({ id: nuevoId(), fecha: ahora().slice(0, 10), comercio: canonSuper(b.super || ''), total: importe, articulos: hechos.map((c) => ({ nombre: c.nombre, cantidad: 1, precio: 0, pid: c.productoId })), por: req.u.nombre, creado: ahora(), manual: true });
  }
  ha.listaQuitar(hechos).catch(() => {});
  db.compra = db.compra.filter((c) => !c.hecho);
  guardarYAvisar(req.u.id);
  res.json({ ok: true, quitados: hechos.length });
});

/* administración */
api.put('/ajustes', soloAdmin, (req, res) => {
  const b = req.body || {};
  if (b.diasAviso !== undefined) db.ajustes.diasAviso = Math.min(30, Math.max(1, Math.round(num(b.diasAviso, 3))));
  if (b.avisos && typeof b.avisos === 'object') {
    const a = db.ajustes.avisos;
    if (hora(b.avisos.hora)) a.hora = b.avisos.hora;
    if (b.avisos.hora2 !== undefined) a.hora2 = hora(b.avisos.hora2) || '';
    if (b.avisos.antelacion !== undefined) a.antelacion = Math.min(7, Math.max(1, Math.round(num(b.avisos.antelacion, 1))));
    if (b.avisos.incluirCaducados !== undefined) a.incluirCaducados = !!b.avisos.incluirCaducados;
  }
  guardarYAvisar(req.u.id);
  res.json(db.ajustes);
});
api.post('/almacenes', soloAdmin, (req, res) => {
  const b = req.body || {};
  const nombre = txt(b.nombre, 40);
  if (!nombre) return res.status(400).json({ error: 'Ponle un nombre al almacén.' });
  const a = { id: nuevoId(), nombre, icono: ICONOS.includes(b.icono) ? b.icono : 'caja', color: COLORES.includes(b.color) ? b.color : 'gris', orden: db.almacenes.length };
  db.almacenes.push(a);
  guardarYAvisar(req.u.id); res.json(a);
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
  guardarYAvisar(req.u.id); res.json(a);
});
api.delete('/almacenes/:id', soloAdmin, (req, res) => {
  if (db.almacenes.length <= 1) return res.status(400).json({ error: 'Tiene que quedar al menos un almacén.' });
  const a = db.almacenes.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Ese almacén ya no existe.' });
  const destino = db.almacenes.find((x) => x.id === (req.body || {}).destino && x.id !== a.id) || db.almacenes.find((x) => x.id !== a.id);
  db.productos.forEach((p) => { if (p.almacenId === a.id) p.almacenId = destino.id; });
  db.almacenes = db.almacenes.filter((x) => x.id !== a.id);
  db.almacenes.sort((x, y) => x.orden - y.orden).forEach((x, k) => { x.orden = k; });
  guardarYAvisar(req.u.id); res.json({ ok: true, movidosA: destino.nombre });
});
api.post('/categorias', soloAdmin, (req, res) => {
  const n = txt((req.body || {}).nombre, 40);
  if (!n) return res.status(400).json({ error: 'Escribe el nombre de la categoría.' });
  if (!db.categorias.some((c) => norm(c) === norm(n))) db.categorias.splice(Math.max(0, db.categorias.length - 1), 0, n);
  guardarYAvisar(req.u.id); res.json(db.categorias);
});
api.put('/categorias/orden', soloAdmin, (req, res) => {
  const n = txt((req.body || {}).nombre, 40); const dir = (req.body || {}).dir;
  const i = db.categorias.indexOf(n); const j = i + (dir === 1 ? 1 : -1);
  if (i >= 0 && j >= 0 && j < db.categorias.length) { const t = db.categorias[i]; db.categorias[i] = db.categorias[j]; db.categorias[j] = t; }
  guardarYAvisar(req.u.id); res.json(db.categorias);
});
api.delete('/categorias', soloAdmin, (req, res) => {
  const n = txt((req.body || {}).nombre, 40);
  if (n === 'Otros') return res.status(400).json({ error: 'La categoría Otros no se puede borrar.' });
  db.categorias = db.categorias.filter((c) => c !== n);
  db.productos.forEach((p) => { if (p.categoria === n) p.categoria = 'Otros'; });
  db.compra.forEach((c) => { if (c.categoria === n) c.categoria = 'Otros'; });
  guardarYAvisar(req.u.id); res.json(db.categorias);
});
api.post('/supers', soloAdmin, (req, res) => {
  const n = canonSuper((req.body || {}).nombre);
  if (!n) return res.status(400).json({ error: 'Escribe el nombre del supermercado.' });
  guardarYAvisar(req.u.id); res.json(db.supers);
});
api.delete('/supers', soloAdmin, (req, res) => {
  const n = txt((req.body || {}).nombre, 40);
  db.supers = db.supers.filter((s) => s !== n);
  guardarYAvisar(req.u.id); res.json(db.supers);
});
api.put('/usuarios/:id', soloAdmin, (req, res) => {
  const u = db.usuarios[req.params.id];
  if (!u) return res.status(404).json({ error: 'Ese usuario no existe.' });
  const rol = (req.body || {}).rol;
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Permiso no válido.' });
  if (u.rol === 'admin' && rol !== 'admin' && Object.values(db.usuarios).filter((x) => x.rol === 'admin').length <= 1) return res.status(400).json({ error: 'Tiene que quedar al menos un administrador.' });
  u.rol = rol; guardarYAvisar(req.u.id); res.json({ ok: true });
});
api.post('/ha/sincronizar', soloAdmin, async (req, res) => {
  await ha.syncLista().catch(() => {}); await ha.publicarSensores().catch(() => {});
  res.json(ha.estado());
});

/* copia de seguridad */
api.get('/copia', soloAdmin, (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="frescario-' + ahora().slice(0, 10) + '.json"');
  res.json(Object.assign({ formato: 'frescario', exportado: ahora() }, db));
});
api.post('/copia', soloAdmin, (req, res) => {
  const b = req.body || {};
  if (b.formato !== 'frescario' || !Array.isArray(b.productos) || !Array.isArray(b.almacenes) || !b.almacenes.length) return res.status(400).json({ error: 'Ese archivo no es una copia de Frescario.' });
  try { fs.copyFileSync(DATA_FILE, DATA_FILE + '.antes-de-restaurar-' + Date.now()); } catch (_) {}
  const yo = db.usuarios[req.u.id];
  delete b.formato; delete b.exportado;
  db = b; migrar();
  if (!db.usuarios[req.u.id]) db.usuarios[req.u.id] = yo;
  db.usuarios[req.u.id].rol = 'admin';
  guardarYa(); emitir('restaurar'); ha.sensoresPronto();
  res.json({ ok: true });
});

app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado' }));
app.get('/vendor/lector.js', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.sendFile(require.resolve('html5-qrcode/html5-qrcode.min.js'));
});
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', maxAge: 0, etag: true }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[frescario] Error:', err && err.message);
  if (res.headersSent) return;
  const grande = err && err.type === 'entity.too.large';
  res.status(grande ? 413 : (err && err.type === 'entity.parse.failed' ? 400 : 500)).json({ error: grande ? 'El archivo es demasiado grande.' : 'Algo ha fallado. Vuelve a intentarlo.' });
});

cargar();
const server = app.listen(PORT, () => console.log('[frescario] Versión ' + VERSION + ' lista en el puerto ' + PORT + (DEV ? ' (modo desarrollo)' : '')));
ha.iniciar({ db: () => db, guardar, emitir, opciones: leerOpciones, nuevoItemCompra: (n, por) => nuevoItemCompra(n, por) });

function apagar() {
  try { clearTimeout(tGuardar); guardarYa(); } catch (_) {}
  for (const r of clientes) { try { r.end(); } catch (_) {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
