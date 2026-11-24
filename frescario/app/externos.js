'use strict';
/*
 * Frescario - servicios externos: Open Food Facts (códigos de barras) y Gemini (tickets)
 */
const GEMINI_URL = process.env.FRESCARIO_GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const OFF_URL = process.env.FRESCARIO_OFF_URL || 'https://world.openfoodfacts.org/api/v2/product/';

async function conTiempo(url, op, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms || 12000);
  try { return await fetch(url, Object.assign({ signal: ctrl.signal }, op || {})); } finally { clearTimeout(t); }
}

/* categorías de Open Food Facts a las nuestras */
const MAPA = [
  [/(yogurt|yogur|milk|leche|dair|cheese|queso|egg|huevo|butter|mantequilla|cream|nata)/, 'Lácteos y huevos'],
  [/(frozen|congelad|ice-cream|helado)/, 'Congelados'],
  [/(fish|pescado|seafood|marisco|tuna|atun)/, 'Pescado'],
  [/(meat|carne|sausage|embutido|ham|jamon|chicken|pollo|pork|cerdo|beef|ternera)/, 'Carne'],
  [/(fruit|fruta|vegetable|verdura|hortaliza|salad|ensalada)/, 'Fruta y verdura'],
  [/(bread|pan|bakery|panaderia|toast|biscotte)/, 'Panadería'],
  [/(canned|conserva|preserve)/, 'Conservas'],
  [/(beverage|bebida|drink|water|agua|juice|zumo|soda|refresco|beer|cerveza|wine|vino)/, 'Bebidas'],
  [/(pasta|rice|arroz|legume|legumbre|pulses|cereal|flour|harina)/, 'Pasta, arroz y legumbres'],
  [/(breakfast|desayuno|coffee|cafe|tea|cacao|cocoa|cookie|galleta)/, 'Desayuno'],
  [/(sauce|salsa|condiment|spice|especia|oil|aceite|vinegar|vinagre)/, 'Salsas y especias'],
  [/(snack|chocolate|candy|sweet|dulce|chips|patatas-fritas|crisps)/, 'Snacks y dulces'],
  [/(clean|limpi|detergent|deterg)/, 'Limpieza'],
  [/(hygiene|higiene|shampoo|champu|soap|jabon|toothpaste|dent)/, 'Higiene']
];
function categoriaDe(tags, categorias) {
  const s = (tags || []).join(' ').toLowerCase();
  for (const [re, c] of MAPA) if (re.test(s) && categorias.includes(c)) return c;
  return 'Otros';
}

async function buscarCodigo(codigo, categorias) {
  const campos = 'product_name,product_name_es,generic_name_es,brands,categories_tags,image_front_small_url,image_front_url,quantity';
  const r = await conTiempo(OFF_URL + encodeURIComponent(codigo) + '.json?fields=' + campos, { headers: { 'User-Agent': 'Frescario/1.0 (Home Assistant add-on)' } }, 9000);
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || j.status !== 1 || !j.product) return null;
  const p = j.product;
  let nombre = (p.product_name_es || p.product_name || p.generic_name_es || '').trim();
  const marca = String(p.brands || '').split(',')[0].trim();
  if (!nombre) return null;
  if (marca && nombre.toLowerCase().indexOf(marca.toLowerCase()) < 0) nombre = nombre + ' ' + marca;
  const img = p.image_front_small_url || p.image_front_url || '';
  return {
    nombre: nombre.slice(0, 80),
    marca,
    categoria: categoriaDe(p.categories_tags, categorias),
    imagen: /^https:\/\/[a-z0-9.-]*openfoodfacts\.(org|net)\//i.test(img) ? img : '',
    formato: String(p.quantity || '').slice(0, 30)
  };
}

/* lectura de tickets con Gemini */
async function leerTicket(clave, imagenes, categorias) {
  const prompt = [
    'Eres un lector de tickets de supermercado en España.',
    'Extrae los artículos comprados del ticket. Puede venir en varias fotos, en orden de arriba abajo; si dos fotos se solapan, no repitas los artículos que salen en las dos.',
    'Para cada artículo da un nombre claro y corto en castellano, desarrollando las abreviaturas del ticket (por ejemplo "LECH.ENT.BRIK" pasa a "Leche entera").',
    'No incluyas bolsas, descuentos, totales, IVA ni formas de pago.',
    'cantidad es el número de unidades compradas (si es a peso, los kilos con decimales).',
    'precio es el importe total de esa línea en euros.',
    'categoria debe ser exactamente una de: ' + categorias.join(' | ') + '.',
    'comercio es el nombre comercial de la tienda (sin S.A., S.L. ni similares). fecha en formato AAAA-MM-DD.'
  ].join(' ');
  const cuerpo = {
    contents: [{ parts: [{ text: prompt }].concat(imagenes.map((im) => ({ inline_data: { mime_type: im.mime || 'image/jpeg', data: im.data } }))) }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          comercio: { type: 'STRING' }, fecha: { type: 'STRING' }, total: { type: 'NUMBER' },
          articulos: { type: 'ARRAY', items: { type: 'OBJECT', properties: { nombre: { type: 'STRING' }, cantidad: { type: 'NUMBER' }, precio: { type: 'NUMBER' }, categoria: { type: 'STRING' } }, required: ['nombre'] } }
        },
        required: ['articulos']
      }
    }
  };
  const r = await conTiempo(GEMINI_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: JSON.stringify(cuerpo) }, 60000);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(r.status === 400 || r.status === 403 ? 'La clave de lectura de tickets no es válida.' : 'El servicio de lectura de tickets no responde. Prueba en un rato.');
    e.status = 502; throw e;
  }
  const txt = (((j.candidates || [])[0] || {}).content || {}).parts;
  const t = txt && txt.map((x) => x.text || '').join('');
  let datos;
  try { datos = JSON.parse(t); } catch (_) { const e = new Error('No he podido leer bien el ticket. Prueba con una foto más nítida y recta.'); e.status = 422; throw e; }
  return datos;
}

module.exports = { buscarCodigo, leerTicket };
