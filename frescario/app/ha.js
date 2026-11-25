'use strict';
/*
 * Frescario - conexión con Home Assistant
 * Avisos al móvil, sensores y sincronización con una lista de tareas de HA (voz).
 */
const idiomas = require('./idiomas');
const TOKEN = process.env.SUPERVISOR_TOKEN || process.env.FRESCARIO_HA_TOKEN || '';
const CORE = process.env.FRESCARIO_HA_URL || 'http://supervisor/core/api';
const SUP = process.env.FRESCARIO_SUP_URL || 'http://supervisor';

let ctx = null;            // { db, guardar, emitir, opciones, registrarEvento }
let estado = { conectado: false, ultimoError: '', zona: 'Europe/Madrid', panel: '', lista: '', listaOk: false, ultimaSync: null };

function disponible() { return !!TOKEN; }

async function llamar(base, ruta, metodo, cuerpo, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || 10000);
  try {
    const r = await fetch(base + ruta, {
      method: metodo || 'GET',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: ctrl.signal
    });
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (_) { j = txt; }
    if (!r.ok) { const e = new Error('HA respondió ' + r.status); e.status = r.status; e.cuerpo = j; throw e; }
    return j;
  } finally { clearTimeout(t); }
}
const core = (ruta, metodo, cuerpo) => llamar(CORE, ruta, metodo, cuerpo);
const sup = (ruta) => llamar(SUP, ruta, 'GET');

/* ---------- fecha local de la casa ---------- */
function partesLocales(d) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: estado.zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = {}; f.formatToParts(d || new Date()).forEach((x) => { p[x.type] = x.value; });
  const hora = p.hour === '24' ? '00' : p.hour;
  return { fecha: p.year + '-' + p.month + '-' + p.day, hm: hora + ':' + p.minute };
}
function diasHasta(iso, hoy) {
  if (!iso) return null;
  return Math.round((new Date(iso + 'T00:00:00Z') - new Date(hoy + 'T00:00:00Z')) / 86400000);
}
function hoyLocal() { return partesLocales().fecha; }

/* ---------- arranque ---------- */
async function iniciar(c) {
  ctx = c;
  if (!disponible()) { estado.ultimoError = 'Sin conexión con Home Assistant (modo desarrollo).'; return; }
  try {
    const cfg = await core('/config');
    if (cfg && cfg.time_zone) estado.zona = cfg.time_zone;
    estado.conectado = true;
  } catch (e) { estado.ultimoError = 'No se pudo conectar con Home Assistant.'; console.error('[frescario] HA:', e.message); }
  try {
    const info = await sup('/addons/self/info');
    const d = (info && info.data) || {};
    if (d.slug) estado.panel = '/hassio/ingress/' + d.slug;
  } catch (e) { console.error('[frescario] Supervisor:', e.message); }
  setInterval(tickMinuto, 30000);
  setInterval(() => publicarSensores().catch(() => {}), 10 * 60000);
  setInterval(() => syncLista().catch(() => {}), 20000);
  setTimeout(() => { publicarSensores().catch(() => {}); syncLista().catch(() => {}); }, 3000);
}

/* ---------- notificaciones ---------- */
async function servicioNotify() {
  if (!estado.conectado) return [];
  try {
    const sv = await core('/services');
    const n = (sv || []).find((x) => x.domain === 'notify');
    if (!n) return [];
    return Object.keys(n.services || {}).filter((k) => k.indexOf('mobile_app_') === 0).sort().map((k) => ({
      id: k,
      nombre: k.replace('mobile_app_', '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    }));
  } catch (e) { return []; }
}

async function notificar(dispositivos, titulo, mensaje, extra) {
  if (!estado.conectado || !dispositivos || !dispositivos.length) return 0;
  let ok = 0;
  for (const d of dispositivos) {
    if (!/^mobile_app_[a-z0-9_]+$/.test(d)) continue;
    const data = Object.assign({ group: 'frescario', channel: 'Frescario' }, extra || {});
    if (estado.panel) { data.url = estado.panel; data.clickAction = estado.panel; }
    try { await core('/services/notify/' + d, 'POST', { title: titulo, message: mensaje, data }); ok++; }
    catch (e) { console.error('[frescario] Aviso a ' + d + ' falló:', e.message); }
  }
  return ok;
}

/* Textos de los avisos. El castellano va aquí; el resto de idiomas sale del
   apartado "avisos" de su archivo public/i18n/<código>.json. */
const ES = {
  y: ' y ', yaCad: 'Ya caducado: ', hoy1: 'Hoy caduca ', hoyN: 'Hoy caducan ', man1: 'Mañana caduca ', manN: 'Mañana caducan ',
  enDias: 'En {d} días: ', nada: 'Ahora mismo no caduca nada en los próximos días.',
  tCad: 'Frescario: caducidades', tPoco: 'Frescario: queda poco', tLista: 'Frescario: lista de la compra',
  poco: 'Queda poco de {n} ({c} {u}). ¿Lo añades a la lista?',
  listaUno: '{quien} ha añadido {cosas}.', listaVarios: '{quien} han añadido {cosas}.',
  uni: { uds: ['ud', 'uds'], kg: ['kg', 'kg'], g: ['g', 'g'], L: ['L', 'L'], ml: ['ml', 'ml'], paquetes: ['paquete', 'paquetes'], bricks: ['brick', 'bricks'], botes: ['bote', 'botes'], bolsas: ['bolsa', 'bolsas'], latas: ['lata', 'latas'], botellas: ['botella', 'botellas'], bandejas: ['bandeja', 'bandejas'], docenas: ['docena', 'docenas'] }
};
const TXT = {};
function textosAviso(lang) {
  if (TXT[lang]) return TXT[lang];
  if (lang === 'es' || !idiomas.existe(lang)) return (TXT.es = TXT.es || ES);
  /* lo que falte en un idioma se coge del inglés y, si tampoco está, del castellano */
  const base = lang === 'en' ? ES : textosAviso('en');
  const propio = idiomas.avisos(lang) || {};
  const t = {};
  for (const k of Object.keys(ES)) {
    if (k === 'uni') continue;
    t[k] = typeof propio[k] === 'string' ? propio[k] : base[k];
  }
  t.uni = Object.assign({}, base.uni);
  if (propio.uni && typeof propio.uni === 'object') {
    for (const [k, v] of Object.entries(propio.uni)) if (Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === 'string')) t.uni[k] = v;
  }
  return (TXT[lang] = t);
}
function rellenar(plantilla, datos) {
  return String(plantilla).replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(datos, k) ? String(datos[k]) : m));
}
const idiomaU = (u) => (u && u.prefs && idiomas.existe(u.prefs.idiomaReal)) ? u.prefs.idiomaReal : 'es';
function unir(nombres, lang) {
  const y = textosAviso(lang || 'es').y;
  if (nombres.length <= 1) return nombres.join('');
  return nombres.slice(0, -1).join(', ') + y + nombres[nombres.length - 1];
}

function textoCaducidades(db, hoy, lang) {
  const L = textosAviso(lang || 'es');
  const aj = db.ajustes.avisos || {};
  const antel = Math.max(1, Math.min(7, aj.antelacion || 1));
  const con = db.productos.filter((p) => p.caducidad && p.cantidad > 0);
  const lineas = [];
  const cad = con.filter((p) => diasHasta(p.caducidad, hoy) < 0).map((p) => p.nombre);
  if (aj.incluirCaducados !== false && cad.length) lineas.push(L.yaCad + unir(cad, lang) + '.');
  const h = con.filter((p) => diasHasta(p.caducidad, hoy) === 0).map((p) => p.nombre);
  if (h.length) lineas.push((h.length === 1 ? L.hoy1 : L.hoyN) + unir(h, lang) + '.');
  const m = con.filter((p) => diasHasta(p.caducidad, hoy) === 1).map((p) => p.nombre);
  if (m.length) lineas.push((m.length === 1 ? L.man1 : L.manN) + unir(m, lang) + '.');
  for (let d = 2; d <= antel; d++) {
    const x = con.filter((p) => diasHasta(p.caducidad, hoy) === d).map((p) => p.nombre);
    if (x.length) lineas.push(rellenar(L.enDias, { d }) + unir(x, lang) + '.');
  }
  return lineas;
}

async function avisoCaducidades(usuarios, forzar) {
  const db = ctx.db();
  const hoy = hoyLocal();
  let n = 0;
  for (const u of usuarios) {
    const av = (u.prefs && u.prefs.avisos) || {};
    if (!forzar && !av.caducidad) continue;
    const lang = idiomaU(u);
    const lineas = textoCaducidades(db, hoy, lang);
    if (!lineas.length && !forzar) continue;
    const msg = lineas.length ? lineas.join('\n') : textosAviso(lang).nada;
    n += await notificar(av.dispositivos || [], textosAviso(lang).tCad, msg, { tag: 'frescario-caducidades' });
  }
  return n;
}

let ultimoMinuto = '';
async function tickMinuto() {
  if (!ctx) return;
  const db = ctx.db();
  const { fecha, hm } = partesLocales();
  if (hm === ultimoMinuto) return;
  ultimoMinuto = hm;
  const aj = db.ajustes.avisos || {};
  const horas = [aj.hora || '09:00'].concat(aj.hora2 ? [aj.hora2] : []);
  if (horas.includes(hm)) {
    const clave = fecha + ' ' + hm;
    if (db.ajustes.ultimoAviso !== clave) {
      db.ajustes.ultimoAviso = clave;
      ctx.guardar();
      try { await avisoCaducidades(Object.values(db.usuarios), false); } catch (e) { console.error('[frescario] Aviso diario:', e.message); }
    }
  }
  if (hm === '00:01') publicarSensores().catch(() => {});
}

/* aviso inmediato de "bajo mínimo" y de cambios en la lista */
const pendientesLista = new Map();
function eventoBajoMinimo(p, autorId) {
  if (!ctx) return;
  const db = ctx.db();
  for (const u of Object.values(db.usuarios)) {
    const av = (u.prefs && u.prefs.avisos) || {};
    if (!av.bajoMinimo || !(av.dispositivos || []).length) continue;
    const lang = idiomaU(u);
    const L = textosAviso(lang);
    const par = L.uni[p.unidad] || [p.unidad, p.unidad];
    const cant = idiomas.info(lang).decimal === ',' ? String(p.cantidad).replace('.', ',') : String(p.cantidad);
    notificar(av.dispositivos, L.tPoco, rellenar(L.poco, { n: p.nombre, c: cant, u: p.cantidad === 1 ? par[0] : par[1] }), { tag: 'frescario-minimo-' + p.id }).catch(() => {});
  }
}
function eventoLista(nombre, autor) {
  if (!ctx) return;
  const db = ctx.db();
  for (const u of Object.values(db.usuarios)) {
    if (u.id === autor.id) continue;
    const av = (u.prefs && u.prefs.avisos) || {};
    if (!av.lista || !(av.dispositivos || []).length) continue;
    const k = u.id;
    const cur = pendientesLista.get(k) || { nombres: [], autores: new Set(), t: null };
    cur.nombres.push(nombre); cur.autores.add(autor.nombre);
    clearTimeout(cur.t);
    cur.t = setTimeout(() => {
      pendientesLista.delete(k);
      const lang = idiomaU(u);
      const L = textosAviso(lang);
      const autores = Array.from(cur.autores);
      notificar(av.dispositivos, L.tLista, rellenar(autores.length > 1 ? L.listaVarios : L.listaUno, { quien: unir(autores, lang), cosas: unir(cur.nombres, lang) }), { tag: 'frescario-lista' }).catch(() => {});
    }, 90000);
    pendientesLista.set(k, cur);
  }
}

/* ---------- sensores ---------- */
let tSensores = null;
function sensoresPronto() { clearTimeout(tSensores); tSensores = setTimeout(() => publicarSensores().catch(() => {}), 2000); }
async function publicarSensores() {
  if (!estado.conectado || !ctx) return;
  const db = ctx.db();
  const hoy = hoyLocal();
  const con = db.productos.filter((p) => p.caducidad && p.cantidad > 0);
  const por = (f) => con.filter((p) => f(diasHasta(p.caducidad, hoy))).map((p) => p.nombre);
  const bajo = db.productos.filter((p) => p.minimo > 0 && p.cantidad < p.minimo).map((p) => p.nombre);
  const pend = db.compra.filter((c) => !c.hecho).map((c) => c.nombre);
  const S = [
    ['caducan_hoy', 'Frescario caducan hoy', por((d) => d === 0), 'mdi:calendar-alert'],
    ['caducan_manana', 'Frescario caducan mañana', por((d) => d === 1), 'mdi:calendar-clock'],
    ['caducan_semana', 'Frescario caducan esta semana', por((d) => d >= 0 && d <= 7), 'mdi:calendar-week'],
    ['caducados', 'Frescario caducados', por((d) => d < 0), 'mdi:delete-clock'],
    ['bajo_minimo', 'Frescario bajo mínimo', bajo, 'mdi:package-down'],
    ['lista_compra', 'Frescario lista de la compra', pend, 'mdi:cart-outline']
  ];
  for (const [id, nombre, lista, icono] of S) {
    try {
      await core('/states/sensor.frescario_' + id, 'POST', { state: lista.length, attributes: { friendly_name: nombre, unit_of_measurement: 'productos', icon: icono, productos: lista, texto: unir(lista) } });
    } catch (e) { /* silencioso */ }
  }
}

/* ---------- lista de tareas de HA (voz) ---------- */
function entidadLista() {
  const e = String((ctx && ctx.opciones().lista_ha) || '').trim();
  return /^todo\.[a-z0-9_]+$/.test(e) ? e : '';
}
async function itemsHA(ent) {
  const r = await core('/services/todo/get_items?return_response', 'POST', { entity_id: ent, status: ['needs_action', 'completed'] });
  const sr = (r && (r.service_response || r)) || {};
  const it = (sr[ent] && sr[ent].items) || [];
  return it.map((x) => ({ uid: x.uid, nombre: String(x.summary || '').trim(), hecho: x.status === 'completed' })).filter((x) => x.nombre);
}
const k = (s) => String(s || '').trim().toLowerCase();
let sincronizando = false;
async function syncLista() {
  const ent = entidadLista();
  estado.lista = ent;
  if (!ent || !estado.conectado || !ctx || sincronizando) { if (!ent) estado.listaOk = false; return; }
  sincronizando = true;
  try {
    const db = ctx.db();
    db.haSync = db.haSync || { uids: {} };
    const map = db.haSync.uids;
    const items = await itemsHA(ent);
    const porUid = new Map(items.map((i) => [i.uid, i]));
    let cambios = false;
    // 1) enlazar por nombre lo que aún no tiene uid
    for (const c of db.compra) {
      if (map[c.id] && porUid.has(map[c.id])) continue;
      const m = items.find((i) => k(i.nombre) === k(c.nombre) && !Object.values(map).includes(i.uid));
      if (m) { map[c.id] = m.uid; }
      else if (map[c.id] && !porUid.has(map[c.id])) {
        // se borró en HA: se borra aquí
        delete map[c.id];
        db.compra = db.compra.filter((x) => x.id !== c.id);
        cambios = true;
      } else if (!c.hecho) {
        await core('/services/todo/add_item', 'POST', { entity_id: ent, item: c.nombre });
      }
    }
    // 2) lo nuevo de HA entra en Frescario; estados completados se reflejan
    const enlazados = new Set(Object.values(map));
    for (const i of items) {
      const cid = Object.keys(map).find((x) => map[x] === i.uid);
      const c = cid && db.compra.find((x) => x.id === cid);
      if (c) {
        if (i.hecho && ctx.compraDirecta && ctx.compraDirecta()) { ctx.comprar(c); cambios = true; continue; }
        if (i.hecho && !c.hecho) { c.hecho = true; cambios = true; }
        if (!i.hecho && c.hecho) { c.hecho = false; cambios = true; }
      } else if (!enlazados.has(i.uid) && !i.hecho) {
        const nuevo = ctx.nuevoItemCompra(i.nombre, 'Asistente de voz');
        map[nuevo.id] = i.uid;
        cambios = true;
      }
    }
    for (const id of Object.keys(map)) if (!db.compra.some((c) => c.id === id)) delete map[id];
    estado.listaOk = true; estado.ultimaSync = new Date().toISOString(); estado.ultimoError = '';
    if (cambios) { ctx.guardar(); ctx.emitir('ha'); sensoresPronto(); }
  } catch (e) {
    estado.listaOk = false;
    estado.ultimoError = 'No se pudo sincronizar con ' + ent + '.';
    console.error('[frescario] Lista HA:', e.message);
  } finally { sincronizando = false; }
}
async function listaMarcar(c) {
  const ent = entidadLista(); if (!ent || !estado.conectado) return;
  const db = ctx.db(); const uid = db.haSync && db.haSync.uids[c.id];
  try { await core('/services/todo/update_item', 'POST', { entity_id: ent, item: uid || c.nombre, status: c.hecho ? 'completed' : 'needs_action' }); } catch (_) {}
}
async function listaAnadir(c) {
  const ent = entidadLista(); if (!ent || !estado.conectado) return;
  try { await core('/services/todo/add_item', 'POST', { entity_id: ent, item: c.nombre }); setTimeout(() => syncLista().catch(() => {}), 1500); } catch (_) {}
}
async function listaQuitar(cs) {
  const ent = entidadLista(); if (!ent || !estado.conectado) return;
  const db = ctx.db();
  for (const c of cs) {
    const uid = db.haSync && db.haSync.uids[c.id];
    if (db.haSync) delete db.haSync.uids[c.id];
    try { await core('/services/todo/remove_item', 'POST', { entity_id: ent, item: uid || c.nombre }); } catch (_) {}
  }
}

module.exports = {
  iniciar, disponible, estado: () => Object.assign({}, estado, { lista: entidadLista() }),
  servicioNotify, notificar, avisoCaducidades, textoCaducidades, hoyLocal,
  eventoBajoMinimo, eventoLista, sensoresPronto, publicarSensores,
  syncLista, listaMarcar, listaAnadir, listaQuitar
};
