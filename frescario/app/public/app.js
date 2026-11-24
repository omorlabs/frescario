/* Frescario - interfaz */
(function () {
  'use strict';

  /* ---------- estado ---------- */
  var D = null;
  var S = { scr: 'inicio', alm: 'todo', q: '', edit: false, sel: null, disp: null, mc: false, offline: false };
  var $app = document.getElementById('app');
  var $capa = document.getElementById('capa');
  var $toast = document.getElementById('toast');
  var capaCerrar = null;
  var COLA_KEY = 'frescario-cola', CACHE_KEY = 'frescario-estado';

  /* ---------- utilidades ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api(metodo, ruta, cuerpo) {
    var op = { method: metodo, headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
    if (cuerpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(cuerpo); }
    return fetch('api/' + ruta, op).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || 'No se ha podido completar.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  /* cola sin conexión para la lista de la compra */
  function leerCola() { try { return JSON.parse(localStorage.getItem(COLA_KEY) || '[]'); } catch (_) { return []; } }
  function escribirCola(c) { try { localStorage.setItem(COLA_KEY, JSON.stringify(c)); } catch (_) {} }
  function apiCola(metodo, ruta, cuerpo) {
    return api(metodo, ruta, cuerpo).catch(function (e) {
      if (e.status) throw e;
      var c = leerCola(); c.push({ m: metodo, r: ruta, b: cuerpo }); escribirCola(c);
      S.offline = true; pintarAviso();
      return { encolado: true };
    });
  }
  var vaciando = false;
  function vaciarCola() {
    var c = leerCola();
    if (!c.length || vaciando) return Promise.resolve();
    vaciando = true;
    var paso = function () {
      var cola = leerCola();
      if (!cola.length) { vaciando = false; S.offline = false; pintarAviso(); return recargar(); }
      var x = cola[0];
      return api(x.m, x.r, x.b).then(function () { cola.shift(); escribirCola(cola); return paso(); }, function (e) {
        if (e.status) { cola.shift(); escribirCola(cola); return paso(); }
        vaciando = false; S.offline = true; pintarAviso();
      });
    };
    return paso();
  }
  function pintarAviso() {
    var b = document.getElementById('sinred');
    var pend = leerCola().length;
    var on = S.offline || pend > 0;
    if (!b) { b = document.createElement('div'); b.id = 'sinred'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.className = on ? 'on' : '';
    b.textContent = on ? (pend ? 'Sin conexión. ' + pend + (pend === 1 ? ' cambio se guardará' : ' cambios se guardarán') + ' al volver la cobertura.' : 'Sin conexión. Mostrando lo último que se cargó.') : '';
  }
  window.addEventListener('online', function () { vaciarCola(); });
  setInterval(function () { if (leerCola().length) vaciarCola(); }, 15000);

  function toast(msg, error) {
    $toast.innerHTML = (error ? '' : icono('check', 18, 'var(--acc)', 3)) + '<span>' + esc(msg) + '</span>';
    $toast.className = 'on' + (error ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { $toast.className = ''; }, 2600);
  }
  function fallo(e) { toast(e && e.message ? e.message : 'Algo ha fallado.', true); }
  function iso(d) { d = new Date(d); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function hoyISO() { return iso(new Date()); }
  function sumaDias(n) { var d = new Date(); d.setDate(d.getDate() + n); return iso(d); }
  function dias(p) {
    if (!p.caducidad) return null;
    return Math.round((new Date(p.caducidad + 'T00:00:00') - new Date(hoyISO() + 'T00:00:00')) / 86400000);
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var MESES_L = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  function fechaCorta(s) { var p = s.split('-'); return parseInt(p[2], 10) + ' ' + MESES[parseInt(p[1], 10) - 1]; }
  function cadInfo(p) {
    var d = dias(p);
    if (d === null) return { txt: 'Sin fecha', cls: 'ok' };
    var aviso = (D && D.ajustes && D.ajustes.diasAviso) || 3;
    if (d < 0) return { txt: d === -1 ? 'Caducó ayer' : 'Caducado', cls: 'urg' };
    if (d === 0) return { txt: 'Hoy', cls: 'urg' };
    if (d === 1) return { txt: 'Mañana', cls: 'urg' };
    if (d <= aviso) return { txt: 'En ' + d + ' días', cls: 'aviso' };
    if (d <= 30) return { txt: 'En ' + d + ' días', cls: '' };
    return { txt: fechaCorta(p.caducidad), cls: 'ok' };
  }
  function fmtNum(n) { return (Math.round(n * 1000) / 1000).toString().replace('.', ','); }
  function eur(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
  var SING = { uds: 'ud', paquetes: 'paquete', bricks: 'brick', botes: 'bote', bolsas: 'bolsa', latas: 'lata', botellas: 'botella', bandejas: 'bandeja', docenas: 'docena' };
  function uni(n, u) { return n === 1 && SING[u] ? SING[u] : u; }
  function cantTxt(p) { return fmtNum(p.cantidad) + ' ' + uni(p.cantidad, p.unidad); }
  function pasoDe(u) { return (u === 'kg' || u === 'L') ? 0.5 : (u === 'g' || u === 'ml') ? 100 : 1; }
  function puedeEditar() { return D && D.yo.rol !== 'lector'; }
  function esAdmin() { return D && D.yo.rol === 'admin'; }
  function almPorId(id) { for (var i = 0; i < D.almacenes.length; i++) if (D.almacenes[i].id === id) return D.almacenes[i]; return null; }
  function prodPorId(id) { for (var i = 0; i < D.productos.length; i++) if (D.productos[i].id === id) return D.productos[i]; return null; }
  function saludo() { var h = new Date().getHours(); return h >= 6 && h < 13 ? 'Buenos días' : h >= 13 && h < 20 ? 'Buenas tardes' : 'Buenas noches'; }
  function nombreCorto() { return (D.yo.nombre || '').split(' ')[0]; }
  function ultimoPrecio(p) { return p && p.precios && p.precios[0] ? p.precios[0].precio : null; }
  function duraDias(p) { var r = D.ritmo && D.ritmo[p.id]; return r ? p.cantidad / r : null; }
  function enLista(p) { return D.compra.some(function (c) { return !c.hecho && (c.productoId === p.id || c.nombre.toLowerCase() === p.nombre.toLowerCase()); }); }
  function esMovil() { return window.matchMedia('(max-width: 820px)').matches; }

  /* ---------- iconos ---------- */
  var P = {
    inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    almacen: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 9h18M3 15h18',
    reloj: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    carro: 'M3 4h2l2.5 11h11L21 7H6.5M9 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM17 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4',
    stats: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
    mas: 'M12 5v14M5 12h14', puntos: 'M5 12h.01M12 12h.01M19 12h.01',
    buscar: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    check: 'M5 12l5 5 9-10', x: 'M6 6l12 12M18 6L6 18',
    sol: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
    luna: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z', auto: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
    izq: 'M15 6l-6 6 6 6', dcha: 'M9 6l6 6-6 6', arriba: 'M6 15l6-6 6 6', abajo: 'M6 9l6 6 6-6',
    papelera: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', lapiz: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    codigo: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9v6M11 9v6M14 9v6M17 9v6',
    ticket: 'M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4', mano: 'M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z',
    campana: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0', casa: 'M3 11l9-7 9 7M5 10v10h14V10',
    descarga: 'M12 4v12M6 10l6 6 6-6M4 20h16', subir: 'M12 20V8M6 14l6-6 6 6M4 4h16', sync: 'M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2M20 20v-4h-4',
    euro: 'M18 7a7 7 0 1 0 0 10M4 10h10M4 14h10', camara: 'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
    imagen: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M15 8h.01',
    hoja: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8', vaso: 'M7 3h10l-1 5H8zM8 8l-1 13h10L16 8',
    muslo: 'M15 4c3 0 5 2 5 5 0 4-5 7-9 7l-4 4-2-2 4-4c0-4 3-10 6-10z', pez: 'M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3zM15 11v.01',
    pan: 'M5 10a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v10H5z', bote: 'M7 6h10v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM8 3h8v3H8zM7 11h10',
    copo: 'M12 2v20M4 7l16 10M20 7L4 17', botella: 'M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3zM8 13h8',
    saco: 'M8 3h8l-1 3c3 2 5 6 5 10a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5c0-4 2-8 5-10z', taza: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
    caramelo: 'M8 8l8 8M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0zM4 4l3 3M20 20l-3-3M4 9V4h5M20 15v5h-5', spray: 'M9 8h6v13H9zM10 8V5h4v3M14 5h3l2-2M17 7h2',
    gota: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z', caja: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    despensa: 'M4 3h16v18H4zM4 9h16M4 15h16M9 6h6M9 12h6M9 18h6', nevera: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM5 10h14M9 5v2M9 13v3',
    congelador: 'M12 2v20M4 7l16 10M20 7L4 17M9 3l3 3 3-3M9 21l3-3 3 3', limpieza: 'M9 8h6v13H9zM10 8V5h4v3M14 5h3l2-2M17 7h2',
    botiquin: 'M4 7h16v13H4zM9 7V4h6v3M12 11v6M9 14h6', bebidas: 'M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3zM8 13h8',
    arrastre: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01', reloj2: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2'
  };
  function icono(n, tam, color, grosor) {
    return '<svg class="ic" width="' + (tam || 22) + '" height="' + (tam || 22) + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') + '" stroke-width="' + (grosor || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + (P[n] || P.caja) + '"></path></svg>';
  }
  var CAT = {
    'Lácteos y huevos': ['vaso', 'rojo'], 'Carne': ['muslo', 'amar'], 'Pescado': ['pez', 'azul'], 'Fruta y verdura': ['hoja', 'verde'],
    'Panadería': ['pan', 'amar'], 'Conservas': ['bote', 'rojo'], 'Congelados': ['copo', 'azul'], 'Bebidas': ['botella', 'azul'],
    'Pasta, arroz y legumbres': ['saco', 'amar'], 'Desayuno': ['taza', 'amar'], 'Salsas y especias': ['bote', 'verde'],
    'Snacks y dulces': ['caramelo', 'uva'], 'Limpieza': ['spray', 'azul'], 'Higiene': ['gota', 'uva'], 'Otros': ['caja', 'gris']
  };
  function catDe(c) { return CAT[c] || ['caja', 'gris']; }
  function imgOk(u) { return /^https:\/\/[a-z0-9.-]*openfoodfacts\.(org|net)\//i.test(u || ''); }
  function icoProd(p, grande, conFondo) {
    var c = catDe(p.categoria);
    var cls = 'ico' + (grande ? ' big' : '') + (conFondo ? ' tn-' + c[1] : '');
    if (imgOk(p.imagen)) return '<span class="' + cls + ' foto"><img src="' + esc(p.imagen) + '" alt="" loading="lazy" referrerpolicy="no-referrer"></span>';
    return '<span class="' + cls + '">' + icono(c[0], grande ? 36 : 24, 'var(--t-' + c[1] + ')', grande ? 1.8 : 2) + '</span>';
  }

  /* ---------- tema ---------- */
  var mqOscuro = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function aplicarTema() {
    var pr = (D && D.yo.prefs) || {};
    var t = pr.tema || 'claro';
    var oscuro = t === 'oscuro' || (t === 'auto' && mqOscuro && mqOscuro.matches);
    document.documentElement.setAttribute('data-tema', oscuro ? 'oscuro' : 'claro');
    document.documentElement.setAttribute('data-acento', pr.acento || 'tomate');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', oscuro ? '#121411' : '#F6F6F1');
  }
  if (mqOscuro && mqOscuro.addEventListener) mqOscuro.addEventListener('change', aplicarTema);
  function guardarPrefs(cambio) {
    Object.keys(cambio).forEach(function (k) { D.yo.prefs[k] = cambio[k]; });
    aplicarTema(); pintar();
    return api('PUT', 'yo/prefs', cambio).then(function (r) { D.yo.prefs = r.prefs; return r; }).catch(fallo);
  }

  /* ---------- cálculos ---------- */
  function calcular() {
    var aviso = D.ajustes.diasAviso || 3;
    var conStock = D.productos.filter(function (p) { return p.cantidad > 0; });
    var usalo = conStock.filter(function (p) { var d = dias(p); return d !== null && d <= Math.max(7, aviso); }).sort(function (a, b) { return dias(a) - dias(b); });
    var caducados = conStock.filter(function (p) { var d = dias(p); return d !== null && d < 0; });
    var bajo = D.productos.filter(function (p) { return p.minimo > 0 && p.cantidad < p.minimo; });
    var pend = D.compra.filter(function (c) { return !c.hecho; });
    var hechos = D.compra.filter(function (c) { return c.hecho; });
    var prevision = D.productos.filter(function (p) { var d = duraDias(p); return d !== null && d <= 7 && !enLista(p); }).sort(function (a, b) { return duraDias(a) - duraDias(b); });
    return { usalo: usalo, caducados: caducados, bajo: bajo, pend: pend, hechos: hechos, prevision: prevision,
      pct: D.compra.length ? Math.round(hechos.length / D.compra.length * 100) : 0,
      urgentes: usalo.filter(function (p) { return dias(p) <= aviso; }).length };
  }
  function gastoMes(offset) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - offset);
    var k = iso(d).slice(0, 7);
    return { k: k, mes: MESES_L[d.getMonth()], total: D.tickets.filter(function (t) { return (t.fecha || '').slice(0, 7) === k; }).reduce(function (s, t) { return s + (t.total || 0); }, 0) };
  }
  function estimadoCompra(items) {
    var tot = 0, n = 0;
    items.forEach(function (c) {
      var p = c.productoId ? prodPorId(c.productoId) : null;
      var pr = ultimoPrecio(p); if (!pr) return;
      var q = parseFloat(String(c.cantidad || '1').replace(',', '.')); if (!(q > 0)) q = 1;
      tot += pr * q; n++;
    });
    return { total: tot, n: n };
  }

  /* ---------- pintado ---------- */
  var NAV = [
    ['inicio', 'Inicio', 'inicio'], ['almacen', 'Almacén', 'almacen'], ['caducidades', 'Caducidades', 'reloj'],
    ['compra', 'Lista de la compra', 'carro'], ['estadisticas', 'Estadísticas', 'stats'], ['ajustes', 'Ajustes', 'ajustes']
  ];
  var TITULOS = {
    inicio: function () { return [saludo() + ', ' + esc(nombreCorto()), '¿Qué hay en casa?']; },
    almacen: function () { return ['Toca un producto para ver y cambiar todo', 'Almacén']; },
    caducidades: function () { return ['Ordenado por lo que caduca antes', 'Úsalo primero']; },
    compra: function () { return ['Toca cualquier producto para meterlo en el carro', 'Lista de la compra']; },
    estadisticas: function () { return ['Gasto, consumo y lo que se tira', 'Estadísticas']; },
    ajustes: function () { return ['Lo tuyo y lo de toda la casa', 'Ajustes']; }
  };

  function pintar() {
    if (!D) return;
    var C = calcular();
    var badges = { caducidades: C.urgentes, compra: C.pend.length };
    var tit = TITULOS[S.scr]();
    var h = '<div class="shell">';
    h += '<aside class="side"><div class="marca"><span class="marca-ic">' + icono('hoja', 24, '#141613', 2.2) + '</span><span class="marca-txt">Frescario</span></div><nav class="nav" aria-label="Secciones">';
    NAV.forEach(function (n) {
      var b = badges[n[0]];
      h += '<button class="nav-b' + (S.scr === n[0] ? ' on' : '') + '" data-ir="' + n[0] + '" title="' + n[1] + '">' + icono(n[2]) + '<span class="lbl">' + n[1] + '</span>' + (b ? '<span class="badge">' + b + '</span><span class="punto"></span>' : '') + '</button>';
    });
    h += '</nav><div class="side-pie">' + segTema('temas') +
      '<button class="yo" data-ir="ajustes"><span class="avatar">' + esc((D.yo.nombre || '?').charAt(0).toUpperCase()) + '</span><span class="yo-txt"><b>' + esc(D.yo.nombre) + '</b><small>' + rolTxt(D.yo.rol) + '</small></span></button></div></aside>';

    h += '<main class="main"><div class="top"><div class="top-tit"><span>' + tit[0] + '</span><h1>' + tit[1] + '</h1></div>';
    if (S.scr === 'inicio' || S.scr === 'almacen') h += '<label class="buscar">' + icono('buscar', 18, 'var(--muted)') + '<input id="q" type="search" placeholder="Busca un producto" aria-label="Buscar producto" value="' + esc(S.q) + '" autocomplete="off"></label>';
    if (puedeEditar() && S.scr !== 'ajustes' && S.scr !== 'estadisticas') {
      h += '<button class="bt-ic solo-pc claro" data-acc="escanear" aria-label="Escanear código de barras" title="Escanear código de barras">' + icono('codigo', 22) + '</button>';
      h += '<button class="bt-ic solo-pc" data-acc="menuAnadir" aria-label="Añadir" title="Añadir">' + icono('mas', 22, 'currentColor', 2.4) + '</button>';
    }
    if (S.scr === 'inicio') h += '<button class="bt' + (S.edit ? ' pri' : '') + '" data-acc="editar">' + (S.edit ? 'Listo' : 'Personalizar') + '</button>';
    h += '</div>';

    if (S.scr === 'inicio') h += vInicio(C);
    else if (S.scr === 'almacen') h += vAlmacen();
    else if (S.scr === 'caducidades') h += vCaducidades(C);
    else if (S.scr === 'compra') h += vCompra(C);
    else if (S.scr === 'estadisticas') h += vEstadisticas();
    else if (S.scr === 'ajustes') h += vAjustes();
    h += '</main></div>';

    h += '<nav class="bnav" aria-label="Secciones">' + bBtn('inicio', 'Inicio', 'inicio', C.urgentes) + bBtn('almacen', 'Almacén', 'almacen') +
      (puedeEditar() ? '<button class="centro" data-acc="menuAnadir" aria-label="Añadir"><span class="pil">' + icono('mas', 26, 'var(--bg)', 2.4) + '</span></button>' : '') +
      bBtn('compra', 'Compra', 'carro', C.pend.length) +
      '<button class="' + (['caducidades', 'estadisticas', 'ajustes'].indexOf(S.scr) >= 0 ? 'on' : '') + '" data-acc="menuMas"><span class="pil">' + icono('puntos', 24, 'currentColor', 3) + '</span>Más</button></nav>';

    var foco = document.activeElement && document.activeElement.id === 'q';
    var pos = foco ? document.activeElement.selectionStart : 0;
    $app.innerHTML = h;
    if (foco) { var q = document.getElementById('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (_) {} } }
    if (S.scr === 'ajustes' && S.disp === null) cargarDispositivos();
  }
  function bBtn(scr, txt, ic, punto) {
    return '<button class="' + (S.scr === scr ? 'on' : '') + '" data-ir="' + scr + '"><span class="pil">' + icono(ic) + '</span>' + txt + (punto ? '<span class="punto"></span>' : '') + '</button>';
  }
  function rolTxt(r) { return r === 'admin' ? 'Administrador' : r === 'lector' ? 'Solo consulta' : 'Familia'; }
  function segTema(cls) {
    var t = D.yo.prefs.tema || 'claro';
    return '<div class="seg ' + (cls || '') + '" role="group" aria-label="Tema">' +
      '<button class="' + (t === 'claro' ? 'on' : '') + '" data-tema="claro" aria-label="Tema claro" title="Claro">' + icono('sol', 18) + '</button>' +
      '<button class="' + (t === 'oscuro' ? 'on' : '') + '" data-tema="oscuro" aria-label="Tema oscuro" title="Oscuro">' + icono('luna', 18) + '</button>' +
      '<button class="' + (t === 'auto' ? 'on' : '') + '" data-tema="auto" aria-label="Tema automático" title="Automático">' + icono('auto', 18) + '</button></div>';
  }

  /* ----- inicio ----- */
  var WN = { usalo: 'Úsalo primero', compra: 'Por comprar', semana: 'Caducidades de la semana', prevision: 'Se acaba pronto', almacenes: 'Almacenes', gasto: 'Gasto del mes', resumen: 'Resumen de la casa' };
  function filtrados() {
    var q = S.q.trim().toLowerCase();
    if (!q) return null;
    return D.productos.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) >= 0 || (p.categoria || '').toLowerCase().indexOf(q) >= 0; });
  }
  function vInicio(C) {
    var f = filtrados();
    if (f) return '<section class="card"><div class="card-cab"><h2>Resultados</h2><span class="sub">' + f.length + ' encontrados</span></div>' + listaProds(f, 'Nada con ese nombre.' + (puedeEditar() ? '<button class="bt pri" data-acc="nuevoQ">Añadir "' + esc(S.q.trim()) + '"</button>' : ''), true) + '</section>';
    if (!D.productos.length && !S.edit) {
      return '<section class="card"><div class="vacio"><b>Tu almacén está vacío</b>Empieza añadiendo lo que tienes en la nevera, la despensa y el congelador. Lo más rápido es escanear el código de barras o la foto del ticket del súper.' +
        (puedeEditar() ? '<span style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><button class="bt pri" data-acc="escanear">' + icono('codigo', 18) + 'Escanear código</button><button class="bt" data-acc="ticket">' + icono('ticket', 18) + 'Leer un ticket</button><button class="bt" data-acc="nuevo">' + icono('mas', 18, 'currentColor', 2.4) + 'Añadir a mano</button></span>' : '') + '</div></section>';
    }
    var ws = D.yo.prefs.widgets || [];
    var vis = ws.filter(function (w) { return w.on && WN[w.k]; });
    var h = '';
    if (S.edit) {
      var oc = ws.filter(function (w) { return !w.on && WN[w.k]; });
      h += '<div class="ocultos">Bloques ocultos:' + (oc.length ? oc.map(function (w) { return '<button class="chip-add" data-wshow="' + w.k + '">+ ' + WN[w.k] + '</button>'; }).join('') : ' <span style="font-weight:500">ninguno, están todos en pantalla</span>') + '</div>';
    }
    if (!vis.length) h += '<section class="card"><div class="vacio"><b>No tienes bloques en el inicio</b><button class="bt" data-acc="editar">Personalizar</button></div></section>';
    h += '<div class="grid">';
    vis.forEach(function (w, i) {
      h += '<section class="card wg w-' + w.t + (S.edit ? ' editando' : '') + '">';
      if (S.edit) {
        h += '<div class="wg-bar">' + icono('arrastre', 18, 'var(--muted)', 3) +
          '<button class="mini" data-wmov="' + w.k + '" data-dir="-1" aria-label="Mover antes"' + (i === 0 ? ' disabled' : '') + '>' + icono('izq', 16, 'currentColor', 2.4) + '</button>' +
          '<button class="mini" data-wmov="' + w.k + '" data-dir="1" aria-label="Mover después"' + (i === vis.length - 1 ? ' disabled' : '') + '>' + icono('dcha', 16, 'currentColor', 2.4) + '</button><span class="esp"></span>' +
          [[4, 'S'], [6, 'M'], [8, 'L'], [12, 'XL']].map(function (z) { return '<button class="mini' + (w.t === z[0] ? ' on' : '') + '" data-wtam="' + w.k + '" data-t="' + z[0] + '" aria-label="Tamaño ' + z[1] + '">' + z[1] + '</button>'; }).join('') +
          '<button class="mini" data-whide="' + w.k + '" aria-label="Ocultar bloque">' + icono('x', 16, 'currentColor', 2.4) + '</button></div>';
      }
      h += widget(w, C) + '</section>';
    });
    return h + '</div>';
  }
  function widget(w, C) {
    if (w.k === 'usalo') {
      var lista = C.usalo.slice(0, w.t >= 8 ? 8 : 4);
      var cab = '<div class="card-cab"><h2>Úsalo primero</h2><button class="lnk" data-ir="caducidades">Ver todo</button></div>';
      if (!lista.length) return cab + '<div class="vacio">Nada caduca en los próximos días. Así da gusto.</div>';
      if (w.t >= 6) return cab + '<div class="tiles">' + lista.map(tile).join('') + '</div>';
      return cab + lista.map(filaProd).join('');
    }
    if (w.k === 'compra') {
      var items = C.pend.slice(0, w.t >= 8 ? 8 : 5);
      return '<button class="fila" data-ir="compra" style="padding:0;min-height:0;margin-bottom:12px"><span class="nom" style="white-space:normal"><span style="font-size:19px;font-weight:800">Por comprar</span><small>' + C.pend.length + ' pendientes · ' + C.hechos.length + ' en el carro</small></span><b style="font-size:24px;color:var(--acc-deep)">' + C.pct + '%</b></button>' +
        '<span class="barra gruesa" style="margin-bottom:8px"><span style="width:' + C.pct + '%"></span></span>' +
        (items.length ? items.map(function (c) { return '<button class="fila" data-compra="' + c.id + '"><span class="check"></span><span class="nom">' + esc(c.nombre) + '</span><span class="sub">' + esc(c.cantidad || '') + '</span></button>'; }).join('') : '<div class="vacio" style="padding:14px">La lista está vacía.</div>') +
        '<button class="bt pri full" data-acc="modoCompra" style="margin-top:10px"' + (D.compra.length ? '' : ' disabled') + '>' + icono('carro', 18) + 'Ir a comprar</button>';
    }
    if (w.k === 'semana') {
      var DS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      var h = '<div class="card-cab"><h2>Caducidades de la semana</h2><button class="lnk" data-ir="caducidades">Ver lista</button></div>';
      if (C.caducados.length) h += '<button class="fila tn-rojo" data-ir="caducidades" style="padding:0 14px;margin-bottom:10px"><span class="nom tc">' + C.caducados.length + (C.caducados.length === 1 ? ' producto caducado' : ' productos caducados') + '</span>' + icono('dcha', 18) + '</button>';
      h += '<div class="semana">';
      for (var i = 0; i < 7; i++) {
        var n = D.productos.filter(function (p) { return p.cantidad > 0 && dias(p) === i; }).length;
        var dd = new Date(); dd.setDate(dd.getDate() + i);
        h += '<button class="dia' + (n ? (i <= 1 ? ' rojo' : ' amar') : '') + '" data-ir="caducidades"><small>' + (i === 0 ? 'Hoy' : DS[dd.getDay()]) + '</small><b>' + n + '</b><small>' + (n === 1 ? 'producto' : 'productos') + '</small></button>';
      }
      return h + '</div>';
    }
    if (w.k === 'prevision') {
      var cabp = '<div class="card-cab"><h2>Se acaba pronto</h2><span class="sub">según lo que gastáis</span></div>';
      if (!C.prevision.length) return cabp + '<div class="vacio" style="padding:14px">Cuando vayáis consumiendo, Frescario aprende cuánto os dura cada cosa y os avisa aquí antes de que se acabe.</div>';
      return cabp + C.prevision.slice(0, w.t >= 8 ? 6 : 4).map(function (p) {
        var d = Math.max(0, Math.floor(duraDias(p)));
        return '<div class="item-prev"><button class="fila" data-prod="' + p.id + '">' + icoProd(p, false, true) + '<span class="nom">' + esc(p.nombre) + '<small>' + (d < 1 ? 'Se acaba hoy' : 'Queda para ' + d + (d === 1 ? ' día' : ' días')) + '</small></span></button>' +
          (puedeEditar() ? '<button class="mini" data-alista="' + p.id + '" aria-label="Añadir ' + esc(p.nombre) + ' a la lista">' + icono('carro', 16) + '</button>' : '') + '</div>';
      }).join('');
    }
    if (w.k === 'almacenes') {
      var total = D.productos.length || 1;
      return '<div class="card-cab"><h2>Almacenes</h2></div><div class="alms">' + D.almacenes.map(function (a) {
        var n = D.productos.filter(function (p) { return p.almacenId === a.id; }).length;
        return '<button class="alm tn-' + a.color + '" data-alm="' + a.id + '"><span class="alm-cab"><span class="tc">' + icono(a.icono, 22) + '</span><span class="n">' + esc(a.nombre) + '</span><span class="c tc">' + n + (n === 1 ? ' producto' : ' productos') + '</span></span>' +
          '<span class="barra" style="background:var(--tile)"><span style="width:' + Math.max(6, Math.round(n / total * 100)) + '%;background:var(--t-' + a.color + ')"></span></span></button>';
      }).join('') + '</div>';
    }
    if (w.k === 'gasto') {
      var meses = [5, 4, 3, 2, 1, 0].map(gastoMes);
      var max = Math.max.apply(null, meses.map(function (m) { return m.total; }).concat([1]));
      var act = meses[5], ant = meses[4];
      var dif = ant.total ? Math.round((act.total - ant.total) / ant.total * 100) : null;
      return '<div class="card-cab"><h2>Gasto del mes</h2><button class="lnk" data-ir="estadisticas">Ver más</button></div>' +
        '<button class="fila" data-ir="estadisticas" style="padding:0;min-height:0;align-items:flex-end;gap:16px"><span class="nom" style="white-space:normal"><span style="font-size:30px;font-weight:800">' + eur(act.total) + '</span><small>' + (dif === null ? 'en ' + act.mes.toLowerCase() : (dif > 0 ? dif + '% más' : Math.abs(dif) + '% menos') + ' que en ' + ant.mes.toLowerCase()) + '</small></span>' +
        '<span class="mini-barras">' + meses.map(function (m, i) { return '<span title="' + m.mes + ': ' + eur(m.total) + '" style="height:' + Math.max(6, Math.round(m.total / max * 64)) + 'px;' + (i === 5 ? 'background:var(--acc)' : '') + '"></span>'; }).join('') + '</span></button>' +
        (D.tickets.length ? '' : '<p class="sub" style="margin:10px 0 0">Se calcula con los tickets que escaneéis o con el importe que pongáis al terminar la compra.</p>');
    }
    if (w.k === 'resumen') {
      return '<div class="card-cab"><h2>Resumen de la casa</h2></div><div class="kpis">' +
        '<button class="kpi tn-azul" data-ir="almacen"><b class="tc">' + D.productos.length + '</b><span>productos</span></button>' +
        '<button class="kpi tn-rojo" data-ir="caducidades"><b class="tc">' + C.urgentes + '</b><span>caducan pronto</span></button>' +
        '<button class="kpi tn-amar" data-acc="verBajo"><b class="tc">' + C.bajo.length + '</b><span>bajo mínimo</span></button></div>';
    }
    return '';
  }
  function tile(p) {
    var c = catDe(p.categoria), ci = cadInfo(p);
    return '<button class="tile tn-' + c[1] + '" data-prod="' + p.id + '"><span class="tile-top">' + icoProd(p) + '<span class="cant tc">' + esc(cantTxt(p)) + '</span></span>' +
      '<span style="display:flex;flex-direction:column;gap:6px"><span class="tile-nom">' + esc(p.nombre) + '</span><span class="pill ' + ci.cls + '">' + ci.txt + '</span></span></button>';
  }
  function filaProd(p) {
    var ci = cadInfo(p), a = almPorId(p.almacenId);
    return '<button class="fila" data-prod="' + p.id + '">' + icoProd(p, false, true) + '<span class="nom">' + esc(p.nombre) + '<small>' + esc(a ? a.nombre : '') + ' · ' + esc(cantTxt(p)) + '</small></span><span class="pill ' + ci.cls + '">' + ci.txt + '</span></button>';
  }

  /* ----- almacén ----- */
  function listaProds(lista, vacioTxt, conAlm) {
    if (!lista.length) return '<div class="vacio">' + vacioTxt + '</div>';
    return '<div class="prods">' + lista.map(function (p) {
      var ci = cadInfo(p), a = almPorId(p.almacenId);
      var pct = p.minimo > 0 ? Math.max(6, Math.min(100, Math.round(p.cantidad / (p.minimo * 2) * 100))) : Math.min(100, 30 + p.cantidad * 10);
      var bajo = p.minimo > 0 && p.cantidad < p.minimo;
      return '<button class="prod' + (S.sel === p.id ? ' sel' : '') + '" data-prod="' + p.id + '">' +
        '<span class="prod-top">' + icoProd(p, false, true) + '<span class="pill ' + ci.cls + '">' + ci.txt + '</span></span>' +
        '<span class="prod-info"><span><span class="prod-nom">' + esc(p.nombre) + '</span><span class="sub" style="display:block">' + (conAlm !== false && a ? esc(a.nombre) + ' · ' : '') + esc(cantTxt(p)) + (bajo ? ' · <b style="color:var(--urg)">bajo mínimo</b>' : '') + '</span></span>' +
        '<span class="barra"><span style="width:' + pct + '%;' + (bajo ? 'background:var(--urg)' : '') + '"></span></span></span></button>';
    }).join('') + '</div>';
  }
  function vAlmacen() {
    var todos = D.productos.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    var h = '<div class="chips"><button class="chip' + (S.alm === 'todo' ? ' on' : '') + '" data-almf="todo">Todo · ' + todos.length + '</button>' +
      '<button class="chip' + (S.alm === 'bajo' ? ' on' : '') + '" data-almf="bajo">Bajo mínimo · ' + todos.filter(function (p) { return p.minimo > 0 && p.cantidad < p.minimo; }).length + '</button>' +
      '<button class="chip' + (S.alm === 'agotado' ? ' on' : '') + '" data-almf="agotado">Agotados · ' + todos.filter(function (p) { return p.cantidad <= 0; }).length + '</button>';
    D.almacenes.forEach(function (a) { h += '<button class="chip' + (S.alm === a.id ? ' on' : '') + '" data-almf="' + a.id + '">' + esc(a.nombre) + ' · ' + todos.filter(function (p) { return p.almacenId === a.id; }).length + '</button>'; });
    h += '</div>';
    var lista = todos;
    if (S.alm === 'bajo') lista = todos.filter(function (p) { return p.minimo > 0 && p.cantidad < p.minimo; });
    else if (S.alm === 'agotado') lista = todos.filter(function (p) { return p.cantidad <= 0; });
    else if (S.alm !== 'todo') lista = todos.filter(function (p) { return p.almacenId === S.alm; });
    var q = S.q.trim().toLowerCase();
    if (q) lista = lista.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) >= 0 || (p.categoria || '').toLowerCase().indexOf(q) >= 0; });
    var vacio = q ? 'Nada con ese nombre.' + (puedeEditar() ? '<button class="bt pri" data-acc="nuevoQ">Añadir "' + esc(S.q.trim()) + '"</button>' : '') : D.productos.length ? 'Aquí no hay nada.' : '<b>Tu almacén está vacío</b>' + (puedeEditar() ? '<button class="bt pri" data-acc="menuAnadir">Añadir el primer producto</button>' : '');
    var extra = '';
    if (S.alm === 'bajo' && lista.length && puedeEditar()) extra = '<button class="bt" data-acc="faltantes" style="align-self:flex-start">' + icono('carro', 18) + 'Añadir todo a la lista</button>';
    return h + extra + listaProds(lista, vacio, ['todo', 'bajo', 'agotado'].indexOf(S.alm) >= 0);
  }

  /* ----- caducidades ----- */
  function vCaducidades() {
    var con = D.productos.filter(function (p) { return p.caducidad && p.cantidad > 0; }).sort(function (a, b) { return dias(a) - dias(b); });
    var sin = D.productos.filter(function (p) { return !p.caducidad && p.cantidad > 0; });
    if (!con.length) return '<section class="card"><div class="vacio"><b>No hay fechas de caducidad</b>Cuando añadas productos con fecha, aquí verás qué gastar primero.</div></section>';
    var grupos = [['Caducados', function (d) { return d < 0; }], ['Hoy y mañana', function (d) { return d >= 0 && d <= 1; }], ['Esta semana', function (d) { return d > 1 && d <= 7; }], ['Este mes', function (d) { return d > 7 && d <= 30; }], ['Más adelante', function (d) { return d > 30; }]];
    var h = '';
    grupos.forEach(function (g) {
      var l = con.filter(function (p) { return g[1](dias(p)); });
      if (!l.length) return;
      h += '<section class="card"><div class="card-cab"><h2>' + g[0] + '</h2><span class="sub">' + l.length + '</span></div>' + (l.length > 3 && g[0] !== 'Más adelante' ? '<div class="tiles">' + l.map(tile).join('') + '</div>' : l.map(filaProd).join('')) + '</section>';
    });
    if (sin.length) h += '<p class="sub">' + sin.length + (sin.length === 1 ? ' producto no tiene' : ' productos no tienen') + ' fecha de caducidad.</p>';
    return h;
  }

  /* ----- compra ----- */
  function ordenCat(a, b) { var i = D.categorias.indexOf(a), j = D.categorias.indexOf(b); return (i < 0 ? 999 : i) - (j < 0 ? 999 : j); }
  function vCompra(C) {
    var est = estimadoCompra(C.pend);
    var h = '<section class="card" style="display:flex;flex-direction:column;gap:14px">';
    h += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px"><b style="font-size:32px;color:var(--acc-deep)">' + C.pct + '%</b><span style="flex:1 1 220px;display:flex;flex-direction:column;gap:8px"><span style="font-weight:700;font-size:14px">' + D.compra.length + ' productos · ' + C.hechos.length + ' en el carro' + (est.n ? ' · unos ' + eur(est.total) + ' por comprar' : '') + '</span><span class="barra gruesa"><span style="width:' + C.pct + '%"></span></span></span>' +
      (D.compra.length ? '<button class="bt pri" data-acc="modoCompra">' + icono('carro', 18) + 'Ir a comprar</button>' : '') + '</div>';
    if (puedeEditar()) {
      h += '<form class="add-row" id="f-compra" autocomplete="off"><input class="campo" style="flex:3 1 200px" name="nombre" placeholder="¿Qué hay que comprar?" list="dl-prods" aria-label="Producto" maxlength="80"><input class="campo" style="flex:1 1 90px" name="cantidad" placeholder="Cantidad" aria-label="Cantidad" maxlength="20"><button class="bt osc" type="submit">' + icono('mas', 18, 'currentColor', 2.4) + 'Añadir</button></form>';
      h += '<datalist id="dl-prods">' + D.productos.map(function (p) { return '<option value="' + esc(p.nombre) + '">'; }).join('') + '</datalist>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="bt" data-acc="faltantes">Añadir lo que falta (' + C.bajo.length + ')</button>' + (C.hechos.length ? '<button class="bt" data-acc="terminar">Terminar compra</button>' : '') + '</div>';
    }
    if (D.ha.lista) h += '<p class="sub" style="margin:0">' + icono('sync', 14) + ' Sincronizada con la lista de Home Assistant, así podéis añadir cosas por voz.</p>';
    h += '</section>';
    if (!D.compra.length) return h + '<section class="card"><div class="vacio"><b>La lista está vacía</b>Añade lo que necesites o pulsa "Añadir lo que falta" para traer lo que está bajo mínimo.</div></section>';
    var cats = [];
    D.compra.forEach(function (c) { if (cats.indexOf(c.categoria || 'Otros') < 0) cats.push(c.categoria || 'Otros'); });
    cats.sort(ordenCat);
    h += '<div class="cols">';
    cats.forEach(function (cat) {
      var its = D.compra.filter(function (c) { return (c.categoria || 'Otros') === cat; });
      its = its.filter(function (c) { return !c.hecho; }).concat(its.filter(function (c) { return c.hecho; }));
      var cc = catDe(cat);
      h += '<section class="card" style="padding:16px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:10px;padding-bottom:6px"><span class="ico tn-' + cc[1] + '" style="width:36px;height:36px;border-radius:12px">' + icono(cc[0], 20, 'var(--t-' + cc[1] + ')') + '</span><b style="flex:1">' + esc(cat) + '</b><span class="badge gris">' + its.filter(function (c) { return !c.hecho; }).length + '</span></div>';
      its.forEach(function (c) { h += itemCompra(c, true); });
      h += '</section>';
    });
    return h + '</div>';
  }
  function itemCompra(c, conX) {
    return '<div class="item' + (c.hecho ? ' hecho' : '') + '"><button class="fila" data-compra="' + c.id + '" aria-pressed="' + c.hecho + '"><span class="check' + (c.hecho ? ' on' : '') + '">' + (c.hecho ? icono('check', 15, 'var(--acc-ink)', 3) : '') + '</span><span class="nom' + (c.hecho ? ' tachado' : '') + '">' + esc(c.nombre) + '<small>' + esc(c.cantidad || '') + (c.por ? (c.cantidad ? ' · ' : '') + esc(c.por) : '') + '</small></span></button>' +
      (conX && puedeEditar() ? '<button class="x" data-cdel="' + c.id + '" aria-label="Quitar ' + esc(c.nombre) + ' de la lista">' + icono('x', 18) + '</button>' : '') + '</div>';
  }

  /* ----- modo compra ----- */
  function abrirModoCompra() {
    S.mc = true;
    abrirCapa('<div class="mc" id="mc" role="dialog" aria-modal="true" aria-label="Modo compra"></div>', function () { S.mc = false; pintar(); });
    pintarMC();
  }
  function pintarMC() {
    var el = document.getElementById('mc'); if (!el) return;
    var C = calcular();
    var cats = [];
    C.pend.forEach(function (c) { if (cats.indexOf(c.categoria || 'Otros') < 0) cats.push(c.categoria || 'Otros'); });
    cats.sort(ordenCat);
    var est = estimadoCompra(D.compra);
    var h = '<div class="mc-cab"><button class="bt-ic suave" data-cerrar="1" aria-label="Salir del modo compra">' + icono('x', 22) + '</button><div style="flex:1;min-width:0"><b style="font-size:20px">Modo compra</b><div class="sub">' + C.pend.length + ' por coger · ' + C.hechos.length + ' en el carro</div></div><b style="font-size:28px;color:var(--acc-deep)">' + C.pct + '%</b></div>' +
      '<span class="barra gruesa" style="border-radius:0"><span style="width:' + C.pct + '%;border-radius:0"></span></span><div class="mc-cuerpo">';
    if (puedeEditar()) h += '<form class="add-row en-linea" id="f-compra" autocomplete="off"><input class="campo" style="flex:1 1 160px" name="nombre" placeholder="Añadir algo más" list="dl-prods2" maxlength="80" aria-label="Añadir producto"><button class="bt osc" type="submit" aria-label="Añadir">' + icono('mas', 18, 'currentColor', 2.4) + '</button></form><datalist id="dl-prods2">' + D.productos.map(function (p) { return '<option value="' + esc(p.nombre) + '">'; }).join('') + '</datalist>';
    if (!C.pend.length) h += '<div class="vacio"><b>¡Lo tienes todo!</b>Ya está todo en el carro.</div>';
    cats.forEach(function (cat) {
      var cc = catDe(cat);
      h += '<div class="mc-pasillo"><span class="ico tn-' + cc[1] + '" style="width:32px;height:32px;border-radius:10px">' + icono(cc[0], 18, 'var(--t-' + cc[1] + ')') + '</span>' + esc(cat) + '</div>';
      C.pend.filter(function (c) { return (c.categoria || 'Otros') === cat; }).forEach(function (c) {
        var p = c.productoId ? prodPorId(c.productoId) : null, pr = ultimoPrecio(p);
        h += '<button class="mc-item" data-compra="' + c.id + '"><span class="check grande"></span><span class="nom">' + esc(c.nombre) + '<small>' + esc(c.cantidad || '') + (pr ? (c.cantidad ? ' · ' : '') + 'último precio ' + eur(pr) : '') + '</small></span></button>';
      });
    });
    if (C.hechos.length) {
      h += '<div class="mc-pasillo" style="margin-top:18px">' + icono('check', 18, 'var(--acc-deep)', 3) + 'En el carro</div>';
      C.hechos.forEach(function (c) { h += '<button class="mc-item hecho" data-compra="' + c.id + '"><span class="check grande on">' + icono('check', 18, 'var(--acc-ink)', 3) + '</span><span class="nom tachado">' + esc(c.nombre) + '</span></button>'; });
    }
    h += '</div><div class="mc-pie">' + (est.n ? '<span class="sub" style="flex:1">Unos ' + eur(est.total) + ' en total</span>' : '<span style="flex:1"></span>') +
      '<button class="bt osc" data-acc="terminar"' + (C.hechos.length ? '' : ' disabled') + '>Terminar compra</button></div>';
    el.innerHTML = h;
  }

  /* ----- estadísticas ----- */
  function vEstadisticas() {
    var h = '<div class="stats">';
    var meses = [5, 4, 3, 2, 1, 0].map(gastoMes);
    var max = Math.max.apply(null, meses.map(function (m) { return m.total; }).concat([1]));
    h += '<section class="card"><div class="card-cab"><h2>Gasto por mes</h2><span class="sub">' + eur(meses[5].total) + ' este mes</span></div>' + (D.tickets.length ?
      '<div class="barras">' + meses.map(function (m, i) { return '<div class="barra-v"><span class="v">' + (m.total ? Math.round(m.total) + ' €' : '') + '</span><span class="b" style="height:' + Math.max(4, Math.round(m.total / max * 150)) + 'px;' + (i === 5 ? 'background:var(--acc)' : '') + '"></span><span class="l">' + m.mes.slice(0, 3) + '</span></div>'; }).join('') + '</div>'
      : '<div class="vacio">Escanea los tickets del súper o pon el importe al terminar la compra y aquí verás cuánto gastáis.</div>') + '</section>';

    var desde = sumaDias(-90), porSuper = {};
    D.tickets.forEach(function (t) { if (t.fecha >= desde) { var s = t.comercio || 'Sin indicar'; porSuper[s] = (porSuper[s] || 0) + (t.total || 0); } });
    var sup = Object.keys(porSuper).map(function (k) { return [k, porSuper[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var maxS = sup.length ? sup[0][1] : 1;
    h += '<section class="card"><div class="card-cab"><h2>Dónde compráis</h2><span class="sub">últimos 3 meses</span></div>' + (sup.length ? sup.slice(0, 6).map(function (s) {
      return '<div class="hbar"><span class="hbar-t"><b>' + esc(s[0]) + '</b><span>' + eur(s[1]) + '</span></span><span class="barra gruesa"><span style="width:' + Math.max(4, Math.round(s[1] / maxS * 100)) + '%"></span></span></div>';
    }).join('') : '<div class="vacio">Todavía no hay compras registradas.</div>') + '</section>';

    var hace30 = new Date(Date.now() - 30 * 86400000).toISOString();
    var cons = {}, tir = {}, nTir = 0, vTir = 0;
    D.historial.forEach(function (x) {
      if (x.t < hace30) return;
      if (x.accion === 'consumo') cons[x.producto] = (cons[x.producto] || 0) + Math.abs(x.cant || 0);
      if (x.accion === 'tirado') { tir[x.producto] = (tir[x.producto] || 0) + Math.abs(x.cant || 0); nTir++; vTir += x.valor || 0; }
    });
    var topC = Object.keys(cons).map(function (k) { return [k, cons[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var maxC = topC.length ? topC[0][1] : 1;
    h += '<section class="card"><div class="card-cab"><h2>Lo que más gastáis</h2><span class="sub">últimos 30 días</span></div>' + (topC.length ? topC.slice(0, 8).map(function (c) {
      return '<div class="hbar"><span class="hbar-t"><b>' + esc(c[0]) + '</b><span>' + fmtNum(c[1]) + '</span></span><span class="barra gruesa"><span style="width:' + Math.max(4, Math.round(c[1] / maxC * 100)) + '%;background:var(--t-verde)"></span></span></div>';
    }).join('') : '<div class="vacio">Usa "Consumir" en los productos y aquí verás lo que más se gasta en casa.</div>') + '</section>';

    var topT = Object.keys(tir).map(function (k) { return [k, tir[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    h += '<section class="card"><div class="card-cab"><h2>Lo que se tira</h2><span class="sub">últimos 30 días</span></div>' +
      '<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px"><div class="kpi tn-rojo"><b class="tc">' + nTir + '</b><span>veces</span></div><div class="kpi tn-amar"><b class="tc">' + (vTir ? eur(vTir) : '-') + '</b><span>a la basura</span></div></div>' +
      (topT.length ? topT.slice(0, 5).map(function (c) { return '<div class="hist-f"><span>' + esc(c[0]) + '</span><span>' + fmtNum(c[1]) + '</span></div>'; }).join('') : '<p class="sub" style="margin:0">Nada tirado este mes. Bien hecho.</p>') + '</section>';

    h += '<section class="card"><div class="card-cab"><h2>Compras registradas</h2><span class="sub">' + D.tickets.length + '</span></div>' + (D.tickets.length ? D.tickets.slice(0, 12).map(function (t) {
      return '<div class="hist-f"><span><b>' + esc(t.comercio || 'Compra') + '</b> · ' + fechaCorta(t.fecha) + (t.n ? ' · ' + t.n + ' artículos' : '') + '</span><span style="display:flex;align-items:center;gap:6px"><b>' + eur(t.total) + '</b>' + (esAdmin() ? '<button class="x" data-tdel="' + t.id + '" aria-label="Borrar esta compra">' + icono('papelera', 16) + '</button>' : '') + '</span></div>';
    }).join('') : '<div class="vacio">Aún no hay compras.</div>') + '</section>';
    return h + '</div>';
  }

  /* ----- ajustes ----- */
  function cargarDispositivos() {
    S.disp = 'cargando';
    api('GET', 'yo/dispositivos').then(function (r) { S.disp = r; if (S.scr === 'ajustes') pintar(); }).catch(function () { S.disp = { dispositivos: [], conectado: false }; if (S.scr === 'ajustes') pintar(); });
  }
  function sw(on, attrs, label) { return '<button class="sw' + (on ? ' on' : '') + '" ' + attrs + ' role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '"></button>'; }
  function vAjustes() {
    var pr = D.yo.prefs, av = pr.avisos || {};
    var h = '<div class="ajustes">';
    h += '<section class="card"><h2>Mi aspecto</h2><span class="sub">Solo te afecta a ti.</span>' +
      '<div class="seg" role="group" aria-label="Tema">' + [['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna'], ['auto', 'Automático', 'auto']].map(function (o) { return '<button class="' + (pr.tema === o[0] ? 'on' : '') + '" data-tema="' + o[0] + '">' + icono(o[2], 16) + o[1] + '</button>'; }).join('') + '</div>' +
      '<b style="font-size:14px">Color de acento</b><div class="acentos">' + [['tomate', '#FF6B47', 'Tomate'], ['menta', '#3CCB86', 'Menta'], ['uva', '#A08CFF', 'Uva'], ['mar', '#5AABFF', 'Mar']].map(function (a) { return '<button class="acento' + (pr.acento === a[0] ? ' on' : '') + '" style="background:' + a[1] + '" data-acento="' + a[0] + '" aria-label="Acento ' + a[2] + '"></button>'; }).join('') + '</div></section>';

    h += '<section class="card"><h2>Mis avisos</h2><span class="sub">Llegan a la app de Home Assistant de tu móvil.</span>';
    if (S.disp === null || S.disp === 'cargando') h += '<span class="sub">Buscando tus móviles…</span>';
    else if (!S.disp.conectado) h += '<div class="nota">Ahora mismo no hay conexión con Home Assistant, así que no se pueden configurar los avisos.</div>';
    else if (!S.disp.dispositivos.length) h += '<div class="nota">No hay ningún móvil con la app de Home Assistant instalada. Instálala, inicia sesión y vuelve aquí.</div>';
    else {
      h += '<b style="font-size:14px">¿A qué móvil?</b><div class="lista-cfg">' + S.disp.dispositivos.map(function (d) {
        var on = (av.dispositivos || []).indexOf(d.id) >= 0;
        return '<div class="cfg-fila"><span class="n">' + esc(d.nombre) + '</span>' + sw(on, 'data-disp="' + esc(d.id) + '"', 'Avisos en ' + d.nombre) + '</div>';
      }).join('') + '</div>';
    }
    h += '<b style="font-size:14px">¿De qué quieres enterarte?</b><div class="lista-cfg">' +
      '<div class="cfg-fila"><span class="n">Caducidades<small>Cada día a las ' + esc(D.ajustes.avisos.hora) + (D.ajustes.avisos.hora2 ? ' y a las ' + esc(D.ajustes.avisos.hora2) : '') + ': lo que caduca hoy, mañana' + (D.ajustes.avisos.antelacion > 1 ? ' y en los próximos ' + D.ajustes.avisos.antelacion + ' días' : '') + '</small></span>' + sw(av.caducidad, 'data-avt="caducidad"', 'Avisos de caducidad') + '</div>' +
      '<div class="cfg-fila"><span class="n">Queda poco<small>Cuando algo baja de su mínimo</small></span>' + sw(av.bajoMinimo, 'data-avt="bajoMinimo"', 'Avisos de stock bajo') + '</div>' +
      '<div class="cfg-fila"><span class="n">Lista de la compra<small>Cuando alguien de casa añade algo</small></span>' + sw(av.lista, 'data-avt="lista"', 'Avisos de la lista') + '</div></div>' +
      '<button class="bt" data-acc="probarAviso"' + ((av.dispositivos || []).length ? '' : ' disabled') + '>' + icono('campana', 18) + 'Enviarme un aviso de prueba</button></section>';

    h += '<section class="card"><h2>Mi inicio</h2><span class="sub">Activa, ordena y elige el tamaño de cada bloque. En el inicio también puedes pulsar "Personalizar".</span><div class="lista-cfg">' +
      (pr.widgets || []).filter(function (w) { return WN[w.k]; }).map(function (w, i, arr) {
        return '<div class="cfg-fila"><span class="n">' + WN[w.k] + '<small>' + (w.on ? 'Visible' : 'Oculto') + '</small></span>' +
          '<button class="mini" data-wmovi="' + w.k + '" data-dir="-1" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + icono('arriba', 16, 'currentColor', 2.4) + '</button>' +
          '<button class="mini" data-wmovi="' + w.k + '" data-dir="1" aria-label="Bajar"' + (i === arr.length - 1 ? ' disabled' : '') + '>' + icono('abajo', 16, 'currentColor', 2.4) + '</button>' +
          '<select class="sel-mini" data-wtsel="' + w.k + '" aria-label="Tamaño de ' + WN[w.k] + '">' + [[4, 'S'], [6, 'M'], [8, 'L'], [12, 'XL']].map(function (z) { return '<option value="' + z[0] + '"' + (w.t === z[0] ? ' selected' : '') + '>' + z[1] + '</option>'; }).join('') + '</select>' +
          sw(w.on, 'data-wtog="' + w.k + '"', (w.on ? 'Ocultar ' : 'Mostrar ') + WN[w.k]) + '</div>';
      }).join('') + '</div></section>';

    if (esAdmin()) {
      var a = D.ajustes.avisos;
      h += '<section class="card"><h2>Avisos de la casa</h2><span class="sub">Solo el administrador. Cada persona elige luego si los quiere recibir.</span>' +
        '<div class="form"><label class="f"><span>Hora del aviso</span><input type="time" data-avh="hora" value="' + esc(a.hora) + '"></label><label class="f"><span>Segundo aviso (opcional)</span><input type="time" data-avh="hora2" value="' + esc(a.hora2 || '') + '"></label>' +
        '<label class="f ancho"><span>Avisar de lo que caduca</span><select data-avsel="antelacion">' + [[1, 'Hoy y mañana'], [2, 'Hasta dentro de 2 días'], [3, 'Hasta dentro de 3 días'], [5, 'Hasta dentro de 5 días'], [7, 'Toda la semana']].map(function (o) { return '<option value="' + o[0] + '"' + (a.antelacion === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="cfg-fila"><span class="n">Recordar también lo ya caducado</span>' + sw(a.incluirCaducados !== false, 'data-avcad="1"', 'Incluir caducados en el aviso') + '</div>' +
        '<b style="font-size:14px">Marcar como "caduca pronto"</b><div class="seg">' + [1, 2, 3, 5, 7].map(function (n) { return '<button class="' + (D.ajustes.diasAviso === n ? 'on' : '') + '" data-aviso="' + n + '">' + n + (n === 1 ? ' día' : ' días') + '</button>'; }).join('') + '</div></section>';

      var he = D.haEstado || {};
      h += '<section class="card"><h2>Home Assistant</h2><div class="lista-cfg">' +
        '<div class="cfg-fila"><span class="n">Conexión<small>' + (he.conectado ? 'Conectado' : 'Sin conexión') + '</small></span><span class="estado ' + (he.conectado ? 'ok' : 'mal') + '"></span></div>' +
        '<div class="cfg-fila"><span class="n">Lista por voz<small>' + (he.lista ? esc(he.lista) + (he.listaOk ? ' · sincronizada' : ' · pendiente') : 'Sin activar') + '</small></span><span class="estado ' + (he.lista ? (he.listaOk ? 'ok' : 'mal') : '') + '"></span></div>' +
        '<div class="cfg-fila"><span class="n">Lectura de tickets<small>' + (D.ha.tickets ? 'Activada' : 'Sin activar') + '</small></span><span class="estado ' + (D.ha.tickets ? 'ok' : '') + '"></span></div></div>' +
        (he.ultimoError ? '<div class="nota">' + esc(he.ultimoError) + '</div>' : '') +
        '<span class="sub">La lista por voz y la lectura de tickets se activan en la configuración del complemento. En Home Assistant tienes además los sensores de Frescario (caducan hoy, caducan mañana, bajo mínimo y lista de la compra) para usarlos en paneles y automatizaciones.</span>' +
        '<button class="bt" data-acc="sincronizar">' + icono('sync', 18) + 'Sincronizar ahora</button></section>';

      h += '<section class="card"><h2>Almacenes</h2><span class="sub">Al borrar uno, sus productos pasan a otro.</span><div class="lista-cfg">' +
        D.almacenes.map(function (al, i) {
          return '<div class="cfg-fila"><span class="ico tn-' + al.color + '" style="width:38px;height:38px;border-radius:12px"><span class="tc">' + icono(al.icono, 20) + '</span></span><span class="n">' + esc(al.nombre) + '</span>' +
            '<button class="mini" data-aedit="' + al.id + '" aria-label="Editar ' + esc(al.nombre) + '">' + icono('lapiz', 16) + '</button>' +
            '<button class="mini" data-amov="' + al.id + '" data-dir="-1" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + icono('arriba', 16, 'currentColor', 2.4) + '</button>' +
            '<button class="mini" data-amov="' + al.id + '" data-dir="1" aria-label="Bajar"' + (i === D.almacenes.length - 1 ? ' disabled' : '') + '>' + icono('abajo', 16, 'currentColor', 2.4) + '</button>' +
            '<button class="mini" data-adel="' + al.id + '" aria-label="Borrar ' + esc(al.nombre) + '"' + (D.almacenes.length <= 1 ? ' disabled' : '') + '>' + icono('papelera', 16) + '</button></div>';
        }).join('') + '</div><button class="bt" data-acc="nuevoAlm">' + icono('mas', 18, 'currentColor', 2.4) + 'Nuevo almacén</button></section>';

      h += '<section class="card"><h2>Usuarios y permisos</h2><span class="sub">Aparecen aquí la primera vez que abren Frescario desde su Home Assistant.</span><div class="lista-cfg">' +
        (D.usuarios || []).map(function (u) {
          return '<div class="cfg-fila"><span class="avatar" style="width:36px;height:36px;border-radius:11px">' + esc((u.nombre || '?').charAt(0).toUpperCase()) + '</span><span class="n">' + esc(u.nombre) + '<small>' + esc(u.usuario || '') + '</small></span>' +
            '<select class="sel-mini" data-urol="' + esc(u.id) + '" aria-label="Permisos de ' + esc(u.nombre) + '">' + [['admin', 'Administrador'], ['familia', 'Familia'], ['lector', 'Solo consulta']].map(function (r) { return '<option value="' + r[0] + '"' + (u.rol === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div><span class="sub"><b>Familia</b>: puede añadir, consumir y usar la lista. <b>Solo consulta</b>: solo mira.</span></section>';

      h += '<section class="card"><h2>Categorías y pasillos</h2><span class="sub">El orden de las categorías es el orden de los pasillos en la lista y en el modo compra. Ponlas como estén en tu súper.</span><div class="lista-cfg">' +
        D.categorias.map(function (c, i) {
          var cc = catDe(c);
          return '<div class="cfg-fila"><span class="ico tn-' + cc[1] + '" style="width:34px;height:34px;border-radius:10px">' + icono(cc[0], 18, 'var(--t-' + cc[1] + ')') + '</span><span class="n">' + esc(c) + '</span>' +
            '<button class="mini" data-catmov="' + esc(c) + '" data-dir="-1" aria-label="Subir ' + esc(c) + '"' + (i === 0 ? ' disabled' : '') + '>' + icono('arriba', 16, 'currentColor', 2.4) + '</button>' +
            '<button class="mini" data-catmov="' + esc(c) + '" data-dir="1" aria-label="Bajar ' + esc(c) + '"' + (i === D.categorias.length - 1 ? ' disabled' : '') + '>' + icono('abajo', 16, 'currentColor', 2.4) + '</button>' +
            (c !== 'Otros' ? '<button class="mini" data-catdel="' + esc(c) + '" aria-label="Borrar ' + esc(c) + '">' + icono('papelera', 16) + '</button>' : '<span style="width:36px"></span>') + '</div>';
        }).join('') + '</div><form class="add-row" id="f-cat" autocomplete="off"><input class="campo" style="flex:1 1 160px" name="nombre" placeholder="Nueva categoría" maxlength="40" aria-label="Nueva categoría"><button class="bt" type="submit">Añadir</button></form></section>';

      h += '<section class="card"><h2>Supermercados</h2><span class="sub">Se añaden solos al leer tickets. Sirven para comparar precios.</span><div style="display:flex;flex-wrap:wrap;gap:8px">' +
        (D.supers.length ? D.supers.map(function (s) { return '<span class="etq">' + esc(s) + '<button data-supdel="' + esc(s) + '" aria-label="Borrar ' + esc(s) + '">' + icono('x', 14) + '</button></span>'; }).join('') : '<span class="sub">Todavía ninguno.</span>') +
        '</div><form class="add-row" id="f-sup" autocomplete="off"><input class="campo" style="flex:1 1 160px" name="nombre" placeholder="Nuevo supermercado" maxlength="40" aria-label="Nuevo supermercado"><button class="bt" type="submit">Añadir</button></form></section>';

      h += '<section class="card"><h2>Copia de seguridad</h2><span class="sub">Frescario ya entra en las copias de Home Assistant. Aquí puedes además descargar una copia o restaurarla.</span>' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="bt" data-acc="descargarCopia">' + icono('descarga', 18) + 'Descargar copia</button><label class="bt" style="cursor:pointer">' + icono('subir', 18) + 'Restaurar copia<input type="file" accept="application/json,.json" id="f-restaurar" class="oculto"></label></div></section>';
    }
    h += '<section class="card"><h2>Actividad reciente</h2><div class="hist">' + (D.historial.length ? D.historial.slice(0, 15).map(function (x) {
      var acc = { alta: 'añadió', baja: 'borró', edicion: 'editó', consumo: 'consumió', tirado: 'tiró', ajuste: 'ajustó', compra: 'compró' }[x.accion] || x.accion;
      var t = new Date(x.t);
      return '<div><span><b>' + esc(x.u) + '</b> ' + acc + ' ' + esc(x.producto) + (x.cant != null && x.accion !== 'alta' && x.accion !== 'edicion' ? ' (' + (x.cant > 0 ? '+' : '') + fmtNum(x.cant) + ')' : '') + '</span><span>' + t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + '</span></div>';
    }).join('') : '<span class="sub">Todavía no hay movimientos.</span>') + '</div><span class="sub">Frescario ' + esc(D.version || '') + '</span></section>';
    return h + '</div>';
  }

  /* ---------- capa (hojas, menús y diálogos) ---------- */
  function abrirCapa(html, alCerrar) {
    if (capaCerrar) { var prev = capaCerrar; capaCerrar = null; try { prev(); } catch (_) {} }
    $capa.innerHTML = '<div class="velo" data-cerrar="1"></div>' + html;
    $capa.className = 'on';
    capaCerrar = alCerrar || null;
    document.body.style.overflow = 'hidden';
    var f = $capa.querySelector('[autofocus]');
    if (f && !esMovil()) setTimeout(function () { f.focus(); }, 60);
  }
  function cerrarCapa() {
    $capa.className = ''; $capa.innerHTML = ''; document.body.style.overflow = '';
    var cb = capaCerrar; capaCerrar = null; if (cb) cb();
  }
  function confirmar(titulo, texto, boton, peligro) {
    return new Promise(function (ok) {
      abrirCapa('<div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">' + esc(titulo) + '</h3><p>' + esc(texto) + '</p><div class="acc"><button class="bt" data-dlg="no">Cancelar</button><button class="bt ' + (peligro ? 'osc' : 'pri') + '" data-dlg="si" autofocus>' + esc(boton) + '</button></div></div>', function () { ok(false); });
      $capa.querySelector('[data-dlg="si"]').onclick = function () { capaCerrar = null; cerrarCapa(); ok(true); };
      $capa.querySelector('[data-dlg="no"]').onclick = function () { cerrarCapa(); };
    });
  }
  function menu(titulo, opciones) {
    abrirCapa('<div class="menu" role="dialog" aria-modal="true" aria-label="' + esc(titulo) + '"><div class="menu-tit">' + esc(titulo) + '</div>' + opciones.map(function (o) {
      return '<button class="menu-op" ' + o.attr + '><span class="ico ' + (o.tono || 'tn-gris') + '"><span class="tc">' + icono(o.ic, 22) + '</span></span><span class="nom">' + esc(o.t) + '<small>' + esc(o.s || '') + '</small></span></button>';
    }).join('') + '<button class="bt full" data-cerrar="1">Cancelar</button></div>');
  }

  function formProducto(p) {
    var nuevo = !p.id;
    return '<form class="form" id="f-prod" autocomplete="off">' +
      (imgOk(p.imagen) ? '<input type="hidden" name="imagen" value="' + esc(p.imagen) + '">' : '') + (p.codigo ? '<input type="hidden" name="codigo" value="' + esc(p.codigo) + '">' : '') +
      '<label class="f ancho"><span>Nombre</span><input name="nombre" required maxlength="80" value="' + esc(p.nombre) + '"' + (nuevo ? ' autofocus' : '') + ' placeholder="Por ejemplo: Yogur natural"></label>' +
      '<label class="f"><span>Cantidad</span><input name="cantidad" type="number" inputmode="decimal" min="0" step="any" value="' + esc(p.cantidad) + '"></label>' +
      '<label class="f"><span>Unidad</span><select name="unidad">' + D.unidades.map(function (u) { return '<option' + (p.unidad === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Dónde está</span><select name="almacenId">' + D.almacenes.map(function (a) { return '<option value="' + a.id + '"' + (p.almacenId === a.id ? ' selected' : '') + '>' + esc(a.nombre) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Categoría</span><select name="categoria">' + D.categorias.map(function (c) { return '<option' + (p.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Caduca el</span><input name="caducidad" type="date" value="' + esc(p.caducidad || '') + '"></label>' +
      '<label class="f"><span>Avisar si baja de</span><input name="minimo" type="number" inputmode="decimal" min="0" step="any" value="' + esc(p.minimo) + '"></label>' +
      '<div class="f ancho"><span>Fecha rápida</span><div class="atajos">' + [['Mañana', 1], ['3 días', 3], ['1 semana', 7], ['1 mes', 30], ['6 meses', 182], ['1 año', 365], ['Sin fecha', -1]].map(function (a) { return '<button type="button" data-fecha="' + a[1] + '">' + a[0] + '</button>'; }).join('') + '</div></div>' +
      (nuevo ? '<label class="f"><span>Precio (opcional)</span><input name="precio" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0,00"></label><label class="f"><span>Supermercado</span><input name="super" list="dl-sup" maxlength="40" placeholder="Opcional"></label>' : '') +
      '<label class="f ancho"><span>Nota</span><textarea name="nota" maxlength="300" placeholder="Opcional">' + esc(p.nota || '') + '</textarea></label>' +
      '</form><datalist id="dl-sup">' + D.supers.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>';
  }
  function datosForm(f) { var fd = new FormData(f), o = {}; fd.forEach(function (v, k) { o[k] = v; }); if ('caducidad' in o) o.caducidad = o.caducidad || null; return o; }

  function abrirNuevo(pre) {
    var base = { nombre: '', almacenId: ['todo', 'bajo', 'agotado'].indexOf(S.alm) < 0 ? S.alm : (D.almacenes[0] || {}).id, cantidad: 1, unidad: 'uds', minimo: 0, caducidad: '', categoria: 'Otros', nota: '' };
    var p = Object.assign(base, pre || {});
    abrirCapa('<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="h-t"><div class="hoja-cab"><h2 id="h-t">Nuevo producto</h2><button class="bt-ic suave" data-cerrar="1" aria-label="Cerrar">' + icono('x', 20) + '</button></div>' +
      '<div class="hoja-cuerpo">' + (imgOk(p.imagen) || p.codigo ? '<div class="cabficha tn-' + catDe(p.categoria)[1] + '">' + icoProd(p, true) + '<div><h3>' + esc(p.nombre || 'Producto nuevo') + '</h3><span class="sub">' + (p.codigo ? 'Código ' + esc(p.codigo) : '') + '</span></div></div>' : '') + formProducto(p) + '</div>' +
      '<div class="hoja-pie"><button class="bt" data-cerrar="1" style="flex:1">Cancelar</button><button class="bt pri" data-acc="guardarNuevo" style="flex:2">Guardar</button></div></div>');
  }

  function abrirFicha(id) {
    var p = prodPorId(id);
    if (!p) { cerrarCapa(); return; }
    S.sel = id;
    var c = catDe(p.categoria), ci = cadInfo(p), a = almPorId(p.almacenId), ed = puedeEditar();
    var paso = pasoDe(p.unidad), dura = duraDias(p);
    var h = '<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="h-t" data-ficha="' + p.id + '"><div class="hoja-cab"><h2 id="h-t">' + esc(a ? a.nombre : 'Producto') + '</h2><button class="bt-ic suave" data-cerrar="1" aria-label="Cerrar">' + icono('x', 20) + '</button></div><div class="hoja-cuerpo">';
    h += '<div class="cabficha tn-' + c[1] + '">' + icoProd(p, true) + '<div><h3>' + esc(p.nombre) + '</h3><span class="pill ' + ci.cls + '">' + (p.caducidad ? 'Caduca: ' + ci.txt : 'Sin fecha de caducidad') + '</span></div></div>';
    h += '<div class="stock"><span><small>En casa</small><b>' + esc(cantTxt(p)) + '</b>' + (p.minimo > 0 ? '<small>Aviso por debajo de ' + fmtNum(p.minimo) + ' ' + esc(uni(p.minimo, p.unidad)) + '</small>' : '') + '</span>' +
      (ed ? '<span style="display:flex;gap:8px"><button class="paso" data-mover="' + (-paso) + '" data-motivo="ajuste" aria-label="Quitar ' + fmtNum(paso) + '"' + (p.cantidad <= 0 ? ' disabled' : '') + '>−</button><button class="paso mas" data-mover="' + paso + '" data-motivo="ajuste" aria-label="Añadir ' + fmtNum(paso) + '">+</button></span>' : '') + '</div>';
    if (dura !== null) h += '<div class="nota">' + icono('reloj', 16) + (p.cantidad <= 0 ? ' Está agotado.' : ' Al ritmo de las últimas semanas, te dura unos ' + Math.max(1, Math.round(dura)) + (Math.round(dura) === 1 ? ' día.' : ' días.')) + '</div>';
    if (ed) {
      h += '<div class="acciones"><button class="bt pri ancho" data-mover="' + (-paso) + '" data-motivo="consumo"' + (p.cantidad <= 0 ? ' disabled' : '') + '>Consumir ' + fmtNum(paso) + '</button>' +
        '<button class="bt" data-acc="aLista">' + icono('carro', 18) + (enLista(p) ? 'Ya en la lista' : 'A la lista') + '</button><button class="bt" data-mover="' + (-paso) + '" data-motivo="tirado"' + (p.cantidad <= 0 ? ' disabled' : '') + '>Lo he tirado</button></div>';
    }
    var precios = p.precios || [];
    h += '<h3 class="sec-tit">Precios</h3><div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">';
    if (precios.length) {
      var porSup = {};
      precios.forEach(function (x) { var k = x.super || 'Sin indicar'; if (!porSup[k] || porSup[k].f < x.f) porSup[k] = x; });
      var lista = Object.keys(porSup).map(function (k) { return [k, porSup[k]]; }).sort(function (x, y) { return x[1].precio - y[1].precio; });
      h += '<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="sub">Último precio</span><b style="font-size:20px">' + eur(precios[0].precio) + '</b></div>' +
        lista.map(function (x, i) { return '<div class="hist-f"><span>' + (i === 0 && lista.length > 1 ? '<b style="color:var(--t-verde)">Más barato · </b>' : '') + esc(x[0]) + '</span><span>' + eur(x[1].precio) + ' · ' + fechaCorta(x[1].f) + '</span></div>'; }).join('');
    } else h += '<span class="sub">Aún no hay precios. Se guardan solos al leer tickets.</span>';
    if (ed) h += '<form class="add-row" id="f-precio" autocomplete="off"><input class="campo" style="flex:1 1 100px" name="precio" type="number" inputmode="decimal" min="0" step="0.01" placeholder="Precio" aria-label="Precio"><input class="campo" style="flex:2 1 140px" name="super" list="dl-sup" placeholder="Supermercado" maxlength="40" aria-label="Supermercado"><button class="bt" type="submit">Guardar</button></form>';
    h += '</div>';
    if (ed) h += '<h3 class="sec-tit">Datos del producto</h3>' + formProducto(p);
    else h += '<div class="card" style="padding:4px 16px">' + [['Categoría', p.categoria], ['Caduca', p.caducidad ? fechaCorta(p.caducidad) : 'Sin fecha'], ['Nota', p.nota || '-']].map(function (r) { return '<div class="hist-f"><span class="sub">' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
    h += '</div>';
    if (ed) h += '<div class="hoja-pie"><button class="bt peligro" data-acc="borrar" aria-label="Borrar producto">' + icono('papelera', 18) + '</button><button class="bt pri" data-acc="guardarFicha" style="flex:1">Guardar cambios</button></div>';
    h += '</div>';
    abrirCapa(h, function () { S.sel = null; if (S.scr === 'almacen') pintar(); });
  }
  function fichaId() { var f = $capa.querySelector('[data-ficha]'); return f ? f.getAttribute('data-ficha') : null; }
  function refrescarFicha() { var id = fichaId(); if (id) { var cb = capaCerrar; capaCerrar = null; abrirFicha(id); capaCerrar = cb; } }

  function abrirAlmacen(a) {
    var nuevo = !a; a = a || { nombre: '', icono: 'caja', color: 'gris' };
    var ICS = [['despensa', 'Despensa'], ['nevera', 'Nevera'], ['congelador', 'Congelador'], ['limpieza', 'Limpieza'], ['botiquin', 'Botiquín'], ['bebidas', 'Bebidas'], ['caja', 'Caja']];
    var COLS = [['rojo', 'Rojo'], ['amar', 'Amarillo'], ['verde', 'Verde'], ['azul', 'Azul'], ['uva', 'Morado'], ['gris', 'Gris']];
    abrirCapa('<div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">' + (nuevo ? 'Nuevo almacén' : 'Editar almacén') + '</h3><form class="form" id="f-alm" autocomplete="off">' +
      '<label class="f ancho"><span>Nombre</span><input name="nombre" maxlength="40" required value="' + esc(a.nombre) + '" autofocus placeholder="Por ejemplo: Trastero"></label>' +
      '<label class="f"><span>Icono</span><select name="icono">' + ICS.map(function (o) { return '<option value="' + o[0] + '"' + (a.icono === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Color</span><select name="color">' + COLS.map(function (o) { return '<option value="' + o[0] + '"' + (a.color === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></form>' +
      '<div class="acc"><button class="bt" data-cerrar="1">Cancelar</button><button class="bt pri" data-acc="guardarAlm" data-id="' + (a.id || '') + '">Guardar</button></div></div>');
  }

  /* ---------- escáner de códigos ---------- */
  var lector = { stream: null, timer: null, h5: null, activo: false };
  function pararLector() {
    lector.activo = false;
    clearInterval(lector.timer); lector.timer = null;
    if (lector.stream) { lector.stream.getTracks().forEach(function (t) { t.stop(); }); lector.stream = null; }
    if (lector.h5) { var h5 = lector.h5; lector.h5 = null; try { h5.stop().catch(function () {}); } catch (_) {} }
  }
  function cargarLibreria() {
    if (window.__Html5QrcodeLibrary__) return Promise.resolve(window.__Html5QrcodeLibrary__);
    return new Promise(function (ok, ko) {
      var s = document.createElement('script'); s.src = 'vendor/lector.js';
      s.onload = function () { ok(window.__Html5QrcodeLibrary__); }; s.onerror = ko; document.head.appendChild(s);
    });
  }
  function abrirEscaner() {
    pararLector();
    abrirCapa('<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="h-t"><div class="hoja-cab"><h2 id="h-t">Escanear código</h2><button class="bt-ic suave" data-cerrar="1" aria-label="Cerrar">' + icono('x', 20) + '</button></div><div class="hoja-cuerpo">' +
      '<div class="visor" id="visor"><div id="lector"></div><div class="marco"><span></span></div><p id="visor-msg">Apunta al código de barras del producto</p></div>' +
      '<form class="add-row" id="f-codigo" autocomplete="off"><input class="campo" style="flex:1 1 160px" name="codigo" inputmode="numeric" placeholder="O escribe el número" maxlength="32" aria-label="Número del código de barras"><button class="bt" type="submit">Buscar</button></form>' +
      '<p class="sub" style="margin:0">Si el producto ya está en casa, podrás sumarlo o consumirlo de un toque. Si es nuevo, se rellena solo con su nombre, foto y categoría.</p></div></div>', pararLector);
    var msg = document.getElementById('visor-msg');
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg.textContent = 'La cámara no está disponible aquí. Entra en Home Assistant con su dirección segura (https) o escribe el número del código.';
      document.getElementById('visor').classList.add('sin');
      return;
    }
    lector.activo = true;
    var detectado = function (codigo) {
      if (!lector.activo) return;
      pararLector();
      if (navigator.vibrate) navigator.vibrate(80);
      procesarCodigo(codigo);
    };
    if ('BarcodeDetector' in window) {
      var det;
      try { det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'] }); } catch (_) { det = null; }
      if (det) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false }).then(function (st) {
          if (!lector.activo) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
          lector.stream = st;
          var v = document.createElement('video'); v.setAttribute('playsinline', ''); v.muted = true; v.srcObject = st;
          document.getElementById('lector').appendChild(v); v.play();
          lector.timer = setInterval(function () {
            if (v.readyState < 2) return;
            det.detect(v).then(function (r) { if (r && r[0] && r[0].rawValue) detectado(r[0].rawValue); }).catch(function () {});
          }, 250);
        }).catch(function () { msg.textContent = 'No se ha podido abrir la cámara. Revisa el permiso de cámara o escribe el número.'; });
        return;
      }
    }
    cargarLibreria().then(function (L) {
      if (!lector.activo) return;
      var F = L.Html5QrcodeSupportedFormats;
      lector.h5 = new L.Html5Qrcode('lector', { formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39], verbose: false });
      return lector.h5.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 260, height: 140 } }, detectado, function () {});
    }).catch(function () { msg.textContent = 'No se ha podido abrir la cámara. Revisa el permiso de cámara o escribe el número.'; });
  }
  function procesarCodigo(codigo) {
    toast('Buscando el producto…');
    api('GET', 'codigo/' + encodeURIComponent(codigo)).then(function (r) {
      if (r.existe) {
        var p = r.producto;
        menu(p.nombre + ' · ' + cantTxt(p), [
          { t: 'Sumar 1', s: 'Lo acabas de comprar', ic: 'mas', tono: 'tn-verde', attr: 'data-rapido="' + p.id + '" data-delta="1" data-motivo="compra"' },
          { t: 'Consumir 1', s: 'Lo acabas de gastar', ic: 'check', tono: 'tn-amar', attr: 'data-rapido="' + p.id + '" data-delta="-1" data-motivo="consumo"' },
          { t: 'Ver la ficha', s: 'Cambiar fecha, cantidad o dónde está', ic: 'lapiz', tono: 'tn-azul', attr: 'data-prod="' + p.id + '"' },
          { t: 'Escanear otro', s: '', ic: 'codigo', attr: 'data-acc="escanear"' }
        ]);
      } else if (r.datos) {
        abrirNuevo({ nombre: r.datos.nombre, categoria: r.datos.categoria, imagen: r.datos.imagen, codigo: r.codigo, almacenId: r.datos.categoria === 'Congelados' ? (D.almacenes.find(function (a) { return a.icono === 'congelador'; }) || {}).id : undefined, nota: r.datos.formato ? 'Formato: ' + r.datos.formato : '' });
        toast('Encontrado. Revisa los datos y guarda.');
      } else {
        abrirNuevo({ codigo: r.codigo });
        toast('No lo conozco. Ponle nombre y la próxima vez lo reconoceré.');
      }
    }).catch(fallo);
  }

  /* ---------- tickets ---------- */
  var ticket = null;
  function abrirTicket() {
    ticket = null;
    abrirCapa('<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="h-t"><div class="hoja-cab"><h2 id="h-t">Leer un ticket</h2><button class="bt-ic suave" data-cerrar="1" aria-label="Cerrar">' + icono('x', 20) + '</button></div><div class="hoja-cuerpo" id="tk-cuerpo">' +
      (D.ha.tickets ? '' : '<div class="nota">La lectura de tickets no está activada todavía. ' + (esAdmin() ? 'Se activa en la configuración del complemento de Frescario en Home Assistant.' : 'Pídeselo al administrador de la casa.') + '</div>') +
      '<div class="vacio" style="padding:20px 10px"><span class="ico big tn-azul"><span class="tc">' + icono('ticket', 34) + '</span></span><b>Haz una foto al ticket del súper</b>Frescario lee lo que has comprado, lo mete en el almacén y guarda los precios. Pon el ticket recto y con buena luz.</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px"><label class="bt pri full" style="cursor:pointer">' + icono('camara', 18) + 'Hacer foto<input type="file" accept="image/*" capture="environment" class="oculto" data-tkfile="1"' + (D.ha.tickets ? '' : ' disabled') + '></label>' +
      '<label class="bt full" style="cursor:pointer">' + icono('imagen', 18) + 'Elegir de la galería<input type="file" accept="image/*" class="oculto" data-tkfile="1"' + (D.ha.tickets ? '' : ' disabled') + '></label></div></div></div>');
  }
  function comprimir(file) {
    return new Promise(function (ok, ko) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1800, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('No se ha podido abrir la foto.')); };
      img.src = url;
    });
  }
  function leerTicket(file) {
    var cu = document.getElementById('tk-cuerpo');
    cu.innerHTML = '<div class="vacio" style="padding:50px 10px"><div class="arranque-logo"></div><b>Leyendo el ticket…</b>Esto tarda unos segundos.</div>';
    comprimir(file).then(function (dataUrl) { return api('POST', 'ticket/leer', { imagen: dataUrl }); }).then(function (r) {
      ticket = r;
      if (!r.articulos.length) { cu.innerHTML = '<div class="vacio"><b>No he encontrado artículos</b>Prueba con otra foto más nítida.</div>'; return; }
      pintarRevision();
    }).catch(function (e) {
      cu.innerHTML = '<div class="vacio"><b>No se ha podido leer</b>' + esc(e.message) + '<button class="bt" data-acc="ticket">Probar otra vez</button></div>';
    });
  }
  function almDestino(a) {
    if (a.almacenId && almPorId(a.almacenId)) return a.almacenId;
    var ic = a.categoria === 'Congelados' ? 'congelador' : /Lácteos|Carne|Pescado|Fruta/.test(a.categoria || '') ? 'nevera' : 'despensa';
    var al = D.almacenes.find(function (x) { return x.icono === ic; }) || D.almacenes[0];
    return al ? al.id : null;
  }
  function pintarRevision() {
    var cu = document.getElementById('tk-cuerpo'); if (!cu || !ticket) return;
    var h = '<div class="form"><label class="f"><span>Tienda</span><input id="tk-com" value="' + esc(ticket.comercio) + '" list="dl-sup" maxlength="40"></label><label class="f"><span>Fecha</span><input id="tk-fecha" type="date" value="' + esc(ticket.fecha) + '"></label></div>' +
      '<datalist id="dl-sup">' + D.supers.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
      '<p class="sub" style="margin:0">Revisa lo que he leído. Desmarca lo que no quieras guardar. En cada línea: cantidad, precio en euros y dónde va.</p><div class="tk-lista">';
    ticket.articulos.forEach(function (a, i) {
      var inc = a.incluir !== false;
      h += '<div class="tk-art' + (inc ? '' : ' fuera') + '"><button class="check' + (inc ? ' on' : '') + '" data-tkinc="' + i + '" aria-label="' + (inc ? 'Quitar ' : 'Incluir ') + esc(a.nombre) + '">' + (inc ? icono('check', 15, 'var(--acc-ink)', 3) : '') + '</button>' +
        '<div class="tk-campos"><input class="campo" data-tkn="' + i + '" value="' + esc(a.nombre) + '" aria-label="Nombre" maxlength="80">' +
        '<div class="tk-fila"><input class="campo" data-tkq="' + i + '" type="number" inputmode="decimal" min="0" step="any" value="' + esc(a.cantidad) + '" aria-label="Cantidad"><input class="campo" data-tkp="' + i + '" type="number" inputmode="decimal" min="0" step="0.01" value="' + esc(a.precio) + '" aria-label="Precio en euros">' +
        '<select class="campo" data-tkd="' + i + '" aria-label="Dónde va">' +
        '<optgroup label="Sumar a lo que ya tienes">' + D.productos.slice().sort(function (x, y) { return x.nombre.localeCompare(y.nombre, 'es'); }).map(function (p) { return '<option value="p:' + p.id + '"' + (a.productoId === p.id ? ' selected' : '') + '>' + esc(p.nombre) + '</option>'; }).join('') + '</optgroup>' +
        '<optgroup label="Nuevo en">' + D.almacenes.map(function (al) { return '<option value="a:' + al.id + '"' + (!a.productoId && al.id === almDestino(a) ? ' selected' : '') + '>Nuevo en ' + esc(al.nombre) + '</option>'; }).join('') + '</optgroup></select></div></div></div>';
    });
    var total = ticket.articulos.filter(function (a) { return a.incluir !== false; }).reduce(function (s, a) { return s + (parseFloat(a.precio) || 0); }, 0);
    h += '</div><div class="hoja-pie" style="margin:0 -20px -20px;position:sticky;bottom:-20px;background:var(--bg)"><span class="sub" style="flex:1;align-self:center">Total ' + eur(ticket.total || total) + '</span><button class="bt pri" data-acc="aplicarTicket">Guardar en el almacén</button></div>';
    cu.innerHTML = h;
  }
  function leerCamposTicket() {
    if (!ticket) return;
    $capa.querySelectorAll('[data-tkn]').forEach(function (el) { ticket.articulos[+el.dataset.tkn].nombre = el.value; });
    $capa.querySelectorAll('[data-tkq]').forEach(function (el) { ticket.articulos[+el.dataset.tkq].cantidad = el.value; });
    $capa.querySelectorAll('[data-tkp]').forEach(function (el) { ticket.articulos[+el.dataset.tkp].precio = el.value; });
    $capa.querySelectorAll('[data-tkd]').forEach(function (el) {
      var a = ticket.articulos[+el.dataset.tkd], v = el.value;
      if (v.indexOf('p:') === 0) { a.productoId = v.slice(2); a.almacenId = null; } else { a.productoId = null; a.almacenId = v.slice(2); }
    });
    var com = document.getElementById('tk-com'), fe = document.getElementById('tk-fecha');
    if (com) ticket.comercio = com.value; if (fe) ticket.fecha = fe.value;
  }

  /* ---------- acciones ---------- */
  function cambiarWidgets(fn) {
    var w = (D.yo.prefs.widgets || []).map(function (x) { return { k: x.k, on: x.on, t: x.t }; });
    fn(w); return guardarPrefs({ widgets: w });
  }
  function moverWidget(k, dir, soloVisibles) {
    cambiarWidgets(function (w) {
      var base = soloVisibles ? w.filter(function (x) { return x.on && WN[x.k]; }) : w.filter(function (x) { return WN[x.k]; });
      var i = base.findIndex(function (x) { return x.k === k; });
      var otro = base[i + dir]; if (!otro) return;
      var a = w.findIndex(function (x) { return x.k === k; }), b = w.findIndex(function (x) { return x.k === otro.k; });
      var t = w[a]; w[a] = w[b]; w[b] = t;
    });
  }
  function hecho(r, msg) { if (msg) toast(msg); return recargar().then(function () { return r; }); }
  function marcarCompra(id) {
    var c = D.compra.find(function (x) { return x.id === id; });
    if (!c || !puedeEditar()) return;
    c.hecho = !c.hecho;
    if (navigator.vibrate) navigator.vibrate(20);
    if (S.mc) pintarMC(); pintar();
    guardarCache();
    apiCola('PUT', 'compra/' + c.id, { hecho: c.hecho }).then(function (r) { if (!r.encolado) recargar(); }).catch(function (e) { c.hecho = !c.hecho; if (S.mc) pintarMC(); pintar(); fallo(e); });
  }
  function descargarCopia() {
    fetch('api/copia', { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('No se ha podido descargar.'); return r.blob(); }).then(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'frescario-' + hoyISO() + '.json'; document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }).catch(fallo);
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, [data-cerrar]');
    if (!t || t.disabled) return;
    var ds = t.dataset;
    if (ds.cerrar) { cerrarCapa(); return; }
    if (ds.ir) {
      if ($capa.className === 'on' && !S.mc) cerrarCapa();
      S.scr = ds.ir; S.edit = false; if (ds.ir !== 'almacen' && ds.ir !== 'inicio') S.q = '';
      if (ds.ir === 'ajustes') S.disp = null;
      pintar(); window.scrollTo(0, 0); return;
    }
    if (ds.prod) { abrirFicha(ds.prod); if (S.scr === 'almacen') pintar(); return; }
    if (ds.alm) { S.scr = 'almacen'; S.alm = ds.alm; S.q = ''; pintar(); window.scrollTo(0, 0); return; }
    if (ds.almf) { S.alm = ds.almf; pintar(); return; }
    if (ds.tema) { guardarPrefs({ tema: ds.tema }); return; }
    if (ds.acento) { guardarPrefs({ acento: ds.acento }); return; }
    if (ds.wshow) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wshow) x.on = true; }); }); return; }
    if (ds.whide) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.whide) x.on = false; }); }); return; }
    if (ds.wtog) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wtog) x.on = !x.on; }); }); return; }
    if (ds.wtam) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wtam) x.t = parseInt(ds.t, 10); }); }); return; }
    if (ds.wmov) { moverWidget(ds.wmov, parseInt(ds.dir, 10), true); return; }
    if (ds.wmovi) { moverWidget(ds.wmovi, parseInt(ds.dir, 10), false); return; }
    if (ds.disp) {
      var av = Object.assign({}, D.yo.prefs.avisos || {}); var l = (av.dispositivos || []).slice();
      var i = l.indexOf(ds.disp); if (i >= 0) l.splice(i, 1); else l.push(ds.disp);
      av.dispositivos = l; guardarPrefs({ avisos: av }); return;
    }
    if (ds.avt) { var av2 = Object.assign({}, D.yo.prefs.avisos || {}); av2[ds.avt] = !av2[ds.avt]; guardarPrefs({ avisos: av2 }); return; }
    if (ds.avcad) { api('PUT', 'ajustes', { avisos: { incluirCaducados: !(D.ajustes.avisos.incluirCaducados !== false) } }).then(function (r) { return hecho(r, 'Guardado'); }).catch(fallo); return; }
    if (ds.fecha) { var inp = t.closest('form').querySelector('[name="caducidad"]'); inp.value = ds.fecha === '-1' ? '' : sumaDias(parseInt(ds.fecha, 10)); return; }
    if (ds.mover) {
      var fid = fichaId();
      t.disabled = true;
      var msgs = { consumo: 'Consumido, apuntado', tirado: 'Apuntado como desperdicio', ajuste: '' };
      api('POST', 'productos/' + fid + '/mover', { delta: parseFloat(ds.mover), motivo: ds.motivo })
        .then(function (r) { return hecho(r, msgs[ds.motivo]); })
        .then(function () {
          var p = prodPorId(fid); refrescarFicha();
          if (p && ds.motivo !== 'ajuste' && p.minimo > 0 && p.cantidad < p.minimo && !enLista(p)) setTimeout(function () { toast('Queda poco ' + p.nombre.toLowerCase() + '. Puedes añadirlo a la lista.'); }, 2700);
        }).catch(function (e) { t.disabled = false; fallo(e); });
      return;
    }
    if (ds.rapido) {
      api('POST', 'productos/' + ds.rapido + '/mover', { delta: parseFloat(ds.delta), motivo: ds.motivo }).then(function (r) { cerrarCapa(); return hecho(r, (parseFloat(ds.delta) > 0 ? 'Sumado. Ahora hay ' : 'Consumido. Quedan ') + cantTxt(r)); }).catch(fallo);
      return;
    }
    if (ds.alista) {
      var pp = prodPorId(ds.alista);
      api('POST', 'compra', { nombre: pp.nombre, productoId: pp.id }).then(function (r) { return hecho(r, r.repetido ? 'Ya estaba en la lista' : 'Añadido a la lista'); }).catch(fallo); return;
    }
    if (ds.compra) { marcarCompra(ds.compra); return; }
    if (ds.cdel) { var cdel = ds.cdel; D.compra = D.compra.filter(function (x) { return x.id !== cdel; }); pintar(); if (S.mc) pintarMC(); apiCola('DELETE', 'compra/' + cdel).then(function (r) { if (!r.encolado) recargar(); }).catch(fallo); return; }
    if (ds.aviso) { api('PUT', 'ajustes', { diasAviso: parseInt(ds.aviso, 10) }).then(function (r) { return hecho(r, 'Guardado'); }).catch(fallo); return; }
    if (ds.aedit) { abrirAlmacen(almPorId(ds.aedit)); return; }
    if (ds.amov) { api('PUT', 'almacenes/' + ds.amov, { mover: parseInt(ds.dir, 10) }).then(function (r) { return hecho(r); }).catch(fallo); return; }
    if (ds.catmov) { api('PUT', 'categorias/orden', { nombre: ds.catmov, dir: parseInt(ds.dir, 10) }).then(function (r) { return hecho(r); }).catch(fallo); return; }
    if (ds.tdel) { confirmar('Borrar esta compra', 'Se quita de las estadísticas de gasto. Los productos del almacén no se tocan.', 'Borrar', true).then(function (ok) { if (ok) api('DELETE', 'tickets/' + ds.tdel).then(function (r) { return hecho(r, 'Compra borrada'); }).catch(fallo); }); return; }
    if (ds.supdel) { api('DELETE', 'supers', { nombre: ds.supdel }).then(function (r) { return hecho(r); }).catch(fallo); return; }
    if (ds.tkinc) { leerCamposTicket(); var art = ticket.articulos[+ds.tkinc]; art.incluir = art.incluir === false; pintarRevision(); return; }
    if (ds.adel) {
      var al = almPorId(ds.adel);
      var n = D.productos.filter(function (p) { return p.almacenId === ds.adel; }).length;
      confirmar('Borrar ' + al.nombre, n ? 'Sus ' + n + ' productos pasarán a otro almacén. No se pierde nada.' : 'Está vacío, se borra sin más.', 'Borrar', true).then(function (ok) {
        if (ok) api('DELETE', 'almacenes/' + ds.adel, {}).then(function (r) { return hecho(r, n ? 'Borrado. Los productos están ahora en ' + r.movidosA : 'Almacén borrado'); }).catch(fallo);
      });
      return;
    }
    if (ds.catdel) {
      confirmar('Borrar categoría', 'Los productos de "' + ds.catdel + '" pasarán a "Otros".', 'Borrar', true).then(function (ok) {
        if (ok) api('DELETE', 'categorias', { nombre: ds.catdel }).then(function (r) { return hecho(r, 'Categoría borrada'); }).catch(fallo);
      });
      return;
    }
    var acc = ds.acc;
    if (!acc) return;
    if (acc === 'menuAnadir') {
      menu('Añadir', [
        { t: 'Escanear código de barras', s: 'Lo más rápido para un producto', ic: 'codigo', tono: 'tn-verde', attr: 'data-acc="escanear"' },
        { t: 'Leer un ticket del súper', s: D.ha.tickets ? 'Mete toda la compra de golpe' : 'Sin activar todavía', ic: 'ticket', tono: 'tn-azul', attr: 'data-acc="ticket"' },
        { t: 'Añadir a mano', s: 'Escribe el nombre y la fecha', ic: 'mano', tono: 'tn-amar', attr: 'data-acc="nuevo"' },
        { t: 'Algo a la lista de la compra', s: '', ic: 'carro', tono: 'tn-rojo', attr: 'data-ir="compra"' }
      ]);
      return;
    }
    if (acc === 'menuMas') {
      menu('Más', [
        { t: 'Caducidades', s: 'Qué gastar primero', ic: 'reloj', tono: 'tn-rojo', attr: 'data-ir="caducidades"' },
        { t: 'Estadísticas', s: 'Gasto, consumo y lo que se tira', ic: 'stats', tono: 'tn-azul', attr: 'data-ir="estadisticas"' },
        { t: 'Ajustes', s: 'Aspecto, avisos y la casa', ic: 'ajustes', tono: 'tn-gris', attr: 'data-ir="ajustes"' }
      ]);
      return;
    }
    if (acc === 'escanear') { abrirEscaner(); return; }
    if (acc === 'ticket') { abrirTicket(); return; }
    if (acc === 'nuevo') { abrirNuevo(); return; }
    if (acc === 'nuevoQ') { abrirNuevo({ nombre: S.q.trim() }); return; }
    if (acc === 'editar') { S.edit = !S.edit; S.q = ''; pintar(); return; }
    if (acc === 'verBajo') { S.scr = 'almacen'; S.alm = 'bajo'; S.q = ''; pintar(); return; }
    if (acc === 'nuevoAlm') { abrirAlmacen(null); return; }
    if (acc === 'modoCompra') { abrirModoCompra(); return; }
    if (acc === 'sincronizar') { t.disabled = true; api('POST', 'ha/sincronizar', {}).then(function (r) { return hecho(r, 'Sincronizado'); }).catch(fallo).then(function () { t.disabled = false; }); return; }
    if (acc === 'probarAviso') { t.disabled = true; api('POST', 'yo/probar-aviso', {}).then(function () { toast('Aviso enviado. Mira tu móvil.'); }).catch(fallo).then(function () { t.disabled = false; }); return; }
    if (acc === 'descargarCopia') { descargarCopia(); return; }
    if (acc === 'guardarNuevo' || acc === 'guardarFicha') {
      var f = document.getElementById('f-prod');
      if (!f.reportValidity()) return;
      var datos = datosForm(f);
      t.disabled = true;
      var pr = acc === 'guardarNuevo' ? api('POST', 'productos', datos) : api('PUT', 'productos/' + fichaId(), datos);
      pr.then(function (r) { capaCerrar = null; cerrarCapa(); return hecho(r, acc === 'guardarNuevo' ? 'Producto añadido' : 'Cambios guardados'); }).catch(function (e) { t.disabled = false; fallo(e); });
      return;
    }
    if (acc === 'borrar') {
      var bid = fichaId(), bp = prodPorId(bid);
      confirmar('Borrar ' + bp.nombre, 'Se quita del almacén para siempre. Si solo se ha acabado, mejor deja la cantidad a 0.', 'Borrar', true).then(function (ok) {
        if (ok) api('DELETE', 'productos/' + bid).then(function (r) { S.sel = null; return hecho(r, 'Producto borrado'); }).catch(fallo);
        else abrirFicha(bid);
      });
      return;
    }
    if (acc === 'aLista') {
      var lp = prodPorId(fichaId());
      api('POST', 'compra', { nombre: lp.nombre, productoId: lp.id }).then(function (r) { return hecho(r, r.repetido ? 'Ya estaba en la lista' : 'Añadido a la lista'); }).then(refrescarFicha).catch(fallo);
      return;
    }
    if (acc === 'faltantes') { api('POST', 'compra/faltantes', {}).then(function (r) { return hecho(r, r.anadidos ? 'Añadidos ' + r.anadidos + ' productos a la lista' : 'No falta nada, todo está por encima del mínimo'); }).catch(fallo); return; }
    if (acc === 'terminar') {
      var C = calcular();
      var ligados = C.hechos.filter(function (c) { return c.productoId; }).length;
      var est = estimadoCompra(C.hechos);
      var volverMC = S.mc;
      abrirCapa('<div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">Terminar compra</h3><p>Se quitan de la lista los ' + C.hechos.length + ' productos que están en el carro.</p>' +
        (ligados ? '<label class="cfg-fila" style="cursor:pointer"><span class="n">Sumarlos a su almacén<small>' + ligados + ' de ellos ya están en el almacén</small></span><input type="checkbox" id="sumar" checked style="width:22px;height:22px;accent-color:var(--acc)"></label>' : '') +
        '<div class="form"><label class="f"><span>¿Cuánto ha costado?</span><input id="importe" type="number" inputmode="decimal" min="0" step="0.01" placeholder="' + (est.n ? fmtNum(Math.round(est.total * 100) / 100) : 'Opcional') + '"></label><label class="f"><span>¿Dónde?</span><input id="super" list="dl-sup" maxlength="40" placeholder="Opcional"></label></div>' +
        '<datalist id="dl-sup">' + D.supers.map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
        '<div class="acc"><button class="bt" data-acc="' + (volverMC ? 'modoCompra' : 'cerrarDlg') + '">Cancelar</button><button class="bt osc" data-acc="terminarOk">Terminar</button></div></div>');
      return;
    }
    if (acc === 'cerrarDlg') { cerrarCapa(); return; }
    if (acc === 'terminarOk') {
      var sm = document.getElementById('sumar'), imp = document.getElementById('importe'), su = document.getElementById('super');
      api('POST', 'compra/terminar', { sumarAlAlmacen: !!(sm && sm.checked), importe: imp ? imp.value : 0, super: su ? su.value : '' }).then(function (r) { S.mc = false; cerrarCapa(); return hecho(r, 'Compra terminada. ¡A colocarlo todo!'); }).catch(fallo);
      return;
    }
    if (acc === 'guardarAlm') {
      var fa = document.getElementById('f-alm');
      if (!fa.reportValidity()) return;
      var da = datosForm(fa);
      (ds.id ? api('PUT', 'almacenes/' + ds.id, da) : api('POST', 'almacenes', da)).then(function (r) { cerrarCapa(); return hecho(r, 'Almacén guardado'); }).catch(fallo);
      return;
    }
    if (acc === 'aplicarTicket') {
      leerCamposTicket();
      t.disabled = true;
      api('POST', 'ticket/aplicar', ticket).then(function (r) {
        cerrarCapa(); ticket = null;
        return hecho(r, 'Listo: ' + r.nuevos + ' nuevos, ' + r.sumados + ' sumados' + (r.quitadosLista ? ' y ' + r.quitadosLista + ' quitados de la lista' : ''));
      }).catch(function (e) { t.disabled = false; fallo(e); });
      return;
    }
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.id === 'f-compra') {
      ev.preventDefault();
      var d = datosForm(f);
      if (!String(d.nombre || '').trim()) return;
      apiCola('POST', 'compra', { nombre: d.nombre, cantidad: d.cantidad || '' }).then(function (r) {
        toast(r.encolado ? 'Guardado, se enviará al volver la cobertura' : r.repetido ? 'Ya estaba en la lista' : 'Añadido');
        if (r.encolado) { D.compra.push({ id: 'tmp' + Date.now(), nombre: d.nombre, cantidad: d.cantidad || '', categoria: 'Otros', hecho: false }); pintar(); if (S.mc) pintarMC(); return; }
        return recargar();
      }).then(function () { var i = document.querySelector('#f-compra [name="nombre"]'); if (i) { i.value = ''; if (!esMovil()) i.focus(); } }).catch(fallo);
    } else if (f.id === 'f-cat') {
      ev.preventDefault(); api('POST', 'categorias', datosForm(f)).then(function (r) { return hecho(r, 'Categoría añadida'); }).catch(fallo);
    } else if (f.id === 'f-sup') {
      ev.preventDefault(); api('POST', 'supers', datosForm(f)).then(function (r) { return hecho(r, 'Supermercado añadido'); }).catch(fallo);
    } else if (f.id === 'f-precio') {
      ev.preventDefault();
      api('POST', 'productos/' + fichaId() + '/precio', datosForm(f)).then(function (r) { return hecho(r, 'Precio guardado'); }).then(refrescarFicha).catch(fallo);
    } else if (f.id === 'f-codigo') {
      ev.preventDefault();
      var cod = String(datosForm(f).codigo || '').replace(/\D/g, '');
      if (cod) { pararLector(); procesarCodigo(cod); }
    } else if (f.id === 'f-prod') {
      ev.preventDefault(); var b = $capa.querySelector('[data-acc="guardarNuevo"],[data-acc="guardarFicha"]'); if (b) b.click();
    } else if (f.id === 'f-alm') {
      ev.preventDefault(); var g = $capa.querySelector('[data-acc="guardarAlm"]'); if (g) g.click();
    }
  });

  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'q') { S.q = ev.target.value; clearTimeout(document._qt); document._qt = setTimeout(pintar, 120); }
  });
  document.addEventListener('change', function (ev) {
    var el = ev.target, ds = el.dataset;
    if (ds.wtsel) cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wtsel) x.t = parseInt(el.value, 10); }); });
    if (ds.urol) api('PUT', 'usuarios/' + encodeURIComponent(ds.urol), { rol: el.value }).then(function (r) { return hecho(r, 'Permisos guardados'); }).catch(function (e) { fallo(e); recargar(); });
    if (ds.avh) { var o = {}; o[ds.avh] = el.value; api('PUT', 'ajustes', { avisos: o }).then(function (r) { return hecho(r, 'Hora guardada'); }).catch(fallo); }
    if (ds.avsel) { var o2 = {}; o2[ds.avsel] = parseInt(el.value, 10); api('PUT', 'ajustes', { avisos: o2 }).then(function (r) { return hecho(r, 'Guardado'); }).catch(fallo); }
    if (ds.tkfile && el.files && el.files[0]) leerTicket(el.files[0]);
    if (el.id === 'f-restaurar' && el.files && el.files[0]) {
      var file = el.files[0];
      confirmar('Restaurar copia', 'Se sustituye todo lo que hay ahora en Frescario por lo de la copia. Antes se guarda una copia de lo actual por si acaso.', 'Restaurar', true).then(function (ok) {
        if (!ok) return;
        file.text().then(function (t) { return api('POST', 'copia', JSON.parse(t)); }).then(function (r) { return hecho(r, 'Copia restaurada'); }).catch(function (e) { fallo(e.status ? e : new Error('Ese archivo no es una copia de Frescario.')); });
      });
      el.value = '';
    }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $capa.className === 'on') cerrarCapa(); });

  /* ---------- carga y tiempo real ---------- */
  function guardarCache() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(D)); } catch (_) {} }
  var cargando = null;
  function recargar() {
    if (cargando) return cargando;
    cargando = api('GET', 'estado').then(function (d) {
      D = d; S.offline = false; aplicarTema(); guardarCache(); pintarAviso();
      if (['todo', 'bajo', 'agotado'].indexOf(S.alm) < 0 && !almPorId(S.alm)) S.alm = 'todo';
      pintar();
      if (S.mc) pintarMC();
    }).catch(function (e) {
      if (!e.status && !D) {
        try { D = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch (_) { D = null; }
        if (D) { S.offline = true; aplicarTema(); pintar(); pintarAviso(); return; }
      }
      if (!e.status && D) { S.offline = true; pintarAviso(); return; }
      if (!D) $app.innerHTML = '<div class="arranque"><p style="max-width:320px;text-align:center">' + esc(e.status === 401 ? 'Abre Frescario desde el menú lateral de Home Assistant.' : 'No se ha podido cargar Frescario. Vuelve a intentarlo en unos segundos.') + '</p><button class="bt pri" onclick="location.reload()">Reintentar</button></div>';
      else throw e;
    }).then(function () { cargando = null; }, function (e) { cargando = null; throw e; });
    return cargando;
  }
  function escuchar() {
    if (!window.EventSource) return;
    var es = new EventSource('api/eventos');
    es.addEventListener('cambio', function (e) {
      try { var d = JSON.parse(e.data); if (D && d.por === D.yo.id) return; } catch (_) {}
      clearTimeout(escuchar._t); escuchar._t = setTimeout(function () { recargar().catch(function () {}); }, 250);
    });
    es.addEventListener('open', function () { if (S.offline) vaciarCola(); });
  }
  setInterval(function () { if (!document.hidden) recargar().catch(function () {}); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { vaciarCola(); recargar().catch(function () {}); } });

  recargar().then(function () { escuchar(); vaciarCola(); }).catch(function () {});
})();
