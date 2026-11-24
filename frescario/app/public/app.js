/* Frescario - interfaz */
(function () {
  'use strict';

  /* ---------- estado ---------- */
  var D = null;            // datos del servidor
  var S = { scr: 'inicio', alm: 'todo', q: '', edit: false, sel: null };
  var $app = document.getElementById('app');
  var $capa = document.getElementById('capa');
  var $toast = document.getElementById('toast');
  var capaCerrar = null;

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
  function toast(msg, error) {
    $toast.innerHTML = (error ? '' : icono('check', 18, 'var(--acc)', 3)) + '<span>' + esc(msg) + '</span>';
    $toast.className = 'on' + (error ? ' error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { $toast.className = ''; }, 2400);
  }
  function fallo(e) { toast(e && e.message ? e.message : 'Algo ha fallado.', true); }
  function hoyISO() { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function sumaDias(n) { var d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
  function dias(p) {
    if (!p.caducidad) return null;
    var a = new Date(hoyISO() + 'T00:00:00'), b = new Date(p.caducidad + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  var MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(iso) { var p = iso.split('-'); return parseInt(p[2], 10) + ' ' + MESES[parseInt(p[1], 10) - 1]; }
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

  /* ---------- iconos ---------- */
  var P = {
    inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    almacen: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM3 9h18M3 15h18',
    reloj: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    carro: 'M3 4h2l2.5 11h11L21 7H6.5M9 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM17 18a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
    mas: 'M12 5v14M5 12h14',
    buscar: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    check: 'M5 12l5 5 9-10',
    x: 'M6 6l12 12M18 6L6 18',
    sol: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
    luna: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
    auto: 'M12 3a9 9 0 1 0 0 18zM12 3a9 9 0 0 1 0 18',
    izq: 'M15 6l-6 6 6 6', dcha: 'M9 6l6 6-6 6', arriba: 'M6 15l6-6 6 6', abajo: 'M6 9l6 6 6-6',
    papelera: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    lapiz: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    hoja: 'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
    vaso: 'M7 3h10l-1 5H8zM8 8l-1 13h10L16 8',
    muslo: 'M15 4c3 0 5 2 5 5 0 4-5 7-9 7l-4 4-2-2 4-4c0-4 3-10 6-10z',
    pez: 'M3 12c3-5 9-6 13-3l5-3v12l-5-3c-4 3-10 2-13-3zM15 11v.01',
    pan: 'M5 10a4 4 0 0 1 2-7h10a4 4 0 0 1 2 7v10H5z',
    bote: 'M7 6h10v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1zM8 3h8v3H8zM7 11h10',
    copo: 'M12 2v20M4 7l16 10M20 7L4 17',
    botella: 'M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3zM8 13h8',
    saco: 'M8 3h8l-1 3c3 2 5 6 5 10a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5c0-4 2-8 5-10z',
    taza: 'M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
    caramelo: 'M8 8l8 8M7 12a5 5 0 1 0 10 0 5 5 0 0 0-10 0zM4 4l3 3M20 20l-3-3M4 9V4h5M20 15v5h-5',
    spray: 'M9 8h6v13H9zM10 8V5h4v3M14 5h3l2-2M17 7h2',
    gota: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
    caja: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    despensa: 'M4 3h16v18H4zM4 9h16M4 15h16M9 6h6M9 12h6M9 18h6',
    nevera: 'M6 2h12a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM5 10h14M9 5v2M9 13v3',
    congelador: 'M12 2v20M4 7l16 10M20 7L4 17M9 3l3 3 3-3M9 21l3-3 3 3',
    limpieza: 'M9 8h6v13H9zM10 8V5h4v3M14 5h3l2-2M17 7h2',
    botiquin: 'M4 7h16v13H4zM9 7V4h6v3M12 11v6M9 14h6',
    bebidas: 'M10 2h4v4l2 3v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3zM8 13h8',
    campana: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
    usuarios: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c1-4 4-6 7-6s6 2 7 6M16 3a4 4 0 0 1 0 8M18 15c2 1 3 3 4 6',
    arrastre: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01'
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
  function icoProd(p, grande) {
    var c = catDe(p.categoria);
    return '<span class="ico' + (grande ? ' big' : '') + '">' + icono(c[0], grande ? 36 : 24, 'var(--t-' + c[1] + ')', grande ? 1.8 : 2) + '</span>';
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
    api('PUT', 'yo/prefs', cambio).then(function (r) { D.yo.prefs = r.prefs; }).catch(fallo);
  }

  /* ---------- cálculos ---------- */
  function calcular() {
    var aviso = D.ajustes.diasAviso || 3;
    var conStock = D.productos.filter(function (p) { return p.cantidad > 0; });
    var usalo = conStock.filter(function (p) { var d = dias(p); return d !== null && d <= Math.max(7, aviso); })
      .sort(function (a, b) { return dias(a) - dias(b); });
    var caducados = conStock.filter(function (p) { var d = dias(p); return d !== null && d < 0; });
    var bajo = D.productos.filter(function (p) { return p.minimo > 0 && p.cantidad < p.minimo; });
    var pend = D.compra.filter(function (c) { return !c.hecho; });
    var hechos = D.compra.filter(function (c) { return c.hecho; });
    return { usalo: usalo, caducados: caducados, bajo: bajo, pend: pend, hechos: hechos,
      pct: D.compra.length ? Math.round(hechos.length / D.compra.length * 100) : 0,
      urgentes: usalo.filter(function (p) { return dias(p) <= aviso; }).length };
  }

  /* ---------- pintado ---------- */
  var NAV = [
    ['inicio', 'Inicio', 'inicio'], ['almacen', 'Almacén', 'almacen'], ['caducidades', 'Caducidades', 'reloj'],
    ['compra', 'Lista de la compra', 'carro'], ['ajustes', 'Ajustes', 'ajustes']
  ];
  var TITULOS = {
    inicio: function () { return [saludo() + ', ' + esc(nombreCorto()), '¿Qué hay en casa?']; },
    almacen: function () { return ['Toca un producto para ver y cambiar todo', 'Almacén']; },
    caducidades: function () { return ['Ordenado por lo que caduca antes', 'Úsalo primero']; },
    compra: function () { return ['Toca cualquier producto para meterlo en el carro', 'Lista de la compra']; },
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
      h += '<button class="nav-b' + (S.scr === n[0] ? ' on' : '') + '" data-ir="' + n[0] + '" title="' + n[1] + '">' + icono(n[2]) + '<span class="lbl">' + n[1] + '</span>' +
        (b ? '<span class="badge">' + b + '</span><span class="punto"></span>' : '') + '</button>';
    });
    h += '</nav><div class="side-pie">' + segTema('temas') +
      '<button class="yo" data-ir="ajustes"><span class="avatar">' + esc((D.yo.nombre || '?').charAt(0).toUpperCase()) + '</span><span class="yo-txt"><b>' + esc(D.yo.nombre) + '</b><small>' + rolTxt(D.yo.rol) + '</small></span></button></div></aside>';

    h += '<main class="main"><div class="top"><div class="top-tit"><span>' + tit[0] + '</span><h1>' + tit[1] + '</h1></div>';
    if (S.scr === 'inicio' || S.scr === 'almacen') {
      h += '<label class="buscar">' + icono('buscar', 18, 'var(--muted)') + '<input id="q" type="search" placeholder="Busca un producto" aria-label="Buscar producto" value="' + esc(S.q) + '" autocomplete="off"></label>';
    }
    if (puedeEditar() && S.scr !== 'ajustes') h += '<button class="bt-ic solo-pc" data-acc="nuevo" aria-label="Añadir producto" title="Añadir producto">' + icono('mas', 22, 'currentColor', 2.4) + '</button>';
    if (S.scr === 'inicio') h += '<button class="bt' + (S.edit ? ' pri' : '') + '" data-acc="editar">' + (S.edit ? 'Listo' : 'Personalizar') + '</button>';
    h += '</div>';

    if (S.scr === 'inicio') h += vInicio(C);
    else if (S.scr === 'almacen') h += vAlmacen();
    else if (S.scr === 'caducidades') h += vCaducidades(C);
    else if (S.scr === 'compra') h += vCompra(C);
    else if (S.scr === 'ajustes') h += vAjustes();
    h += '</main></div>';

    h += '<nav class="bnav" aria-label="Secciones">' +
      bBtn('inicio', 'Inicio', 'inicio', C.urgentes) + bBtn('almacen', 'Almacén', 'almacen') +
      (puedeEditar() ? '<button class="centro" data-acc="nuevo" aria-label="Añadir producto"><span class="pil">' + icono('mas', 26, 'var(--bg)', 2.4) + '</span></button>' : '') +
      bBtn('compra', 'Compra', 'carro', C.pend.length) + bBtn('ajustes', 'Ajustes', 'ajustes') + '</nav>';

    var foco = document.activeElement && document.activeElement.id === 'q';
    var pos = foco ? document.activeElement.selectionStart : 0;
    $app.innerHTML = h;
    if (foco) { var q = document.getElementById('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (_) {} } }
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
  var WN = { usalo: 'Úsalo primero', compra: 'Por comprar', semana: 'Caducidades de la semana', almacenes: 'Almacenes', resumen: 'Resumen de la casa' };
  function filtrados() {
    var q = S.q.trim().toLowerCase();
    if (!q) return null;
    return D.productos.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) >= 0 || (p.categoria || '').toLowerCase().indexOf(q) >= 0; });
  }
  function vInicio(C) {
    var f = filtrados();
    if (f) return '<section class="card"><div class="card-cab"><h2>Resultados</h2><span class="sub">' + f.length + ' encontrados</span></div>' + listaProds(f, 'Nada con ese nombre.', true) + '</section>';
    if (!D.productos.length && !S.edit) {
      return '<section class="card"><div class="vacio"><b>Tu almacén está vacío</b>Empieza añadiendo lo que tienes en la nevera, la despensa y el congelador.' +
        (puedeEditar() ? '<button class="bt pri" data-acc="nuevo">' + icono('mas', 18, 'currentColor', 2.4) + 'Añadir el primer producto</button>' : '') + '</div></section>';
    }
    var ws = D.yo.prefs.widgets || [];
    var vis = ws.filter(function (w) { return w.on; });
    var h = '';
    if (S.edit) {
      var oc = ws.filter(function (w) { return !w.on; });
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
        (items.length ? items.map(filaCompraMini).join('') : '<div class="vacio" style="padding:14px">La lista está vacía.</div>') +
        '<button class="bt pri full" data-ir="compra" style="margin-top:10px">Ir a la lista</button>';
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
    if (w.k === 'almacenes') {
      var total = D.productos.length || 1;
      return '<div class="card-cab"><h2>Almacenes</h2></div><div class="alms">' + D.almacenes.map(function (a) {
        var n = D.productos.filter(function (p) { return p.almacenId === a.id; }).length;
        return '<button class="alm tn-' + a.color + '" data-alm="' + a.id + '"><span class="alm-cab"><span class="tc">' + icono(a.icono, 22) + '</span><span class="n">' + esc(a.nombre) + '</span><span class="c tc">' + n + (n === 1 ? ' producto' : ' productos') + '</span></span>' +
          '<span class="barra" style="background:var(--tile)"><span style="width:' + Math.max(6, Math.round(n / total * 100)) + '%;background:var(--t-' + a.color + ')"></span></span></button>';
      }).join('') + '</div>';
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
    var c = catDe(p.categoria), ci = cadInfo(p), a = almPorId(p.almacenId);
    return '<button class="fila" data-prod="' + p.id + '"><span class="ico tn-' + c[1] + '">' + icono(c[0], 24, 'var(--t-' + c[1] + ')') + '</span><span class="nom">' + esc(p.nombre) + '<small>' + esc(a ? a.nombre : '') + ' · ' + esc(cantTxt(p)) + '</small></span><span class="pill ' + ci.cls + '">' + ci.txt + '</span></button>';
  }
  function filaCompraMini(c) {
    return '<button class="fila" data-compra="' + c.id + '"><span class="check">' + '</span><span class="nom">' + esc(c.nombre) + '</span><span class="sub">' + esc(c.cantidad || '') + '</span></button>';
  }

  /* ----- almacén ----- */
  function listaProds(lista, vacioTxt, conAlm) {
    if (!lista.length) return '<div class="vacio">' + vacioTxt + '</div>';
    return '<div class="prods">' + lista.map(function (p) {
      var ci = cadInfo(p), a = almPorId(p.almacenId), c = catDe(p.categoria);
      var pct = p.minimo > 0 ? Math.max(6, Math.min(100, Math.round(p.cantidad / (p.minimo * 2) * 100))) : Math.min(100, 30 + p.cantidad * 10);
      var bajo = p.minimo > 0 && p.cantidad < p.minimo;
      return '<button class="prod' + (S.sel === p.id ? ' sel' : '') + '" data-prod="' + p.id + '">' +
        '<span style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><span class="ico tn-' + c[1] + '">' + icono(c[0], 24, 'var(--t-' + c[1] + ')') + '</span>' + '<span class="pill ' + ci.cls + '">' + ci.txt + '</span></span>' +
        '<span class="prod-info" style="display:flex;flex-direction:column;gap:8px"><span><span class="prod-nom">' + esc(p.nombre) + '</span><span class="sub" style="display:block">' + (conAlm !== false && a ? esc(a.nombre) + ' · ' : '') + esc(cantTxt(p)) + (bajo ? ' · <b style="color:var(--urg)">bajo mínimo</b>' : '') + '</span></span>' +
        '<span class="barra"><span style="width:' + pct + '%;' + (bajo ? 'background:var(--urg)' : '') + '"></span></span></span></button>';
    }).join('') + '</div>';
  }
  function vAlmacen() {
    var todos = D.productos.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    var h = '<div class="chips"><button class="chip' + (S.alm === 'todo' ? ' on' : '') + '" data-almf="todo">Todo · ' + todos.length + '</button>' +
      '<button class="chip' + (S.alm === 'bajo' ? ' on' : '') + '" data-almf="bajo">Bajo mínimo · ' + todos.filter(function (p) { return p.minimo > 0 && p.cantidad < p.minimo; }).length + '</button>';
    D.almacenes.forEach(function (a) {
      h += '<button class="chip' + (S.alm === a.id ? ' on' : '') + '" data-almf="' + a.id + '">' + esc(a.nombre) + ' · ' + todos.filter(function (p) { return p.almacenId === a.id; }).length + '</button>';
    });
    h += '</div>';
    var lista = todos;
    if (S.alm === 'bajo') lista = todos.filter(function (p) { return p.minimo > 0 && p.cantidad < p.minimo; });
    else if (S.alm !== 'todo') lista = todos.filter(function (p) { return p.almacenId === S.alm; });
    var q = S.q.trim().toLowerCase();
    if (q) lista = lista.filter(function (p) { return p.nombre.toLowerCase().indexOf(q) >= 0 || (p.categoria || '').toLowerCase().indexOf(q) >= 0; });
    var vacio = q ? 'Nada con ese nombre.' + (puedeEditar() ? '<button class="bt pri" data-acc="nuevoQ">Añadir "' + esc(S.q.trim()) + '"</button>' : '') : D.productos.length ? 'Aquí no hay nada.' : '<b>Tu almacén está vacío</b>' + (puedeEditar() ? '<button class="bt pri" data-acc="nuevo">Añadir el primer producto</button>' : '');
    return h + '<div id="lista-alm">' + listaProds(lista, vacio, S.alm === 'todo' || S.alm === 'bajo') + '</div>';
  }

  /* ----- caducidades ----- */
  function vCaducidades(C) {
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
    if (sin.length) h += '<p class="sub">' + sin.length + ' productos no tienen fecha de caducidad.</p>';
    return h;
  }

  /* ----- compra ----- */
  function vCompra(C) {
    var h = '<section class="card" style="display:flex;flex-direction:column;gap:14px">';
    h += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px"><b style="font-size:32px;color:var(--acc-deep)">' + C.pct + '%</b><span style="flex:1 1 220px;display:flex;flex-direction:column;gap:8px"><span style="font-weight:700;font-size:14px">' + D.compra.length + ' productos · ' + C.hechos.length + ' en el carro</span><span class="barra gruesa"><span style="width:' + C.pct + '%"></span></span></span></div>';
    if (puedeEditar()) {
      h += '<form class="add-row" id="f-compra" autocomplete="off"><input class="campo" style="flex:3 1 200px" name="nombre" placeholder="¿Qué hay que comprar?" list="dl-prods" aria-label="Producto" maxlength="80"><input class="campo" style="flex:1 1 90px" name="cantidad" placeholder="Cantidad" aria-label="Cantidad" maxlength="20"><button class="bt pri" type="submit">' + icono('mas', 18, 'currentColor', 2.4) + 'Añadir</button></form>';
      h += '<datalist id="dl-prods">' + D.productos.map(function (p) { return '<option value="' + esc(p.nombre) + '">'; }).join('') + '</datalist>';
      h += '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="bt" data-acc="faltantes">Añadir lo que falta (' + C.bajo.length + ')</button>' + (C.hechos.length ? '<button class="bt osc" data-acc="terminar">Terminar compra</button>' : '') + '</div>';
    }
    h += '</section>';
    if (!D.compra.length) return h + '<section class="card"><div class="vacio"><b>La lista está vacía</b>Añade lo que necesites o pulsa "Añadir lo que falta" para traer lo que está bajo mínimo.</div></section>';
    var cats = [];
    D.compra.forEach(function (c) { if (cats.indexOf(c.categoria || 'Otros') < 0) cats.push(c.categoria || 'Otros'); });
    cats.sort(function (a, b) { return D.categorias.indexOf(a) - D.categorias.indexOf(b); });
    h += '<div class="cols">';
    cats.forEach(function (cat) {
      var its = D.compra.filter(function (c) { return (c.categoria || 'Otros') === cat; });
      its = its.filter(function (c) { return !c.hecho; }).concat(its.filter(function (c) { return c.hecho; }));
      var cc = catDe(cat);
      h += '<section class="card" style="padding:16px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:10px;padding-bottom:6px"><span class="ico tn-' + cc[1] + '" style="width:36px;height:36px;border-radius:12px">' + icono(cc[0], 20, 'var(--t-' + cc[1] + ')') + '</span><b style="flex:1">' + esc(cat) + '</b><span class="badge" style="background:var(--track);color:var(--text)">' + its.filter(function (c) { return !c.hecho; }).length + '</span></div>';
      its.forEach(function (c) {
        h += '<div class="item' + (c.hecho ? ' hecho' : '') + '"><button class="fila" data-compra="' + c.id + '" aria-pressed="' + c.hecho + '"><span class="check' + (c.hecho ? ' on' : '') + '">' + (c.hecho ? icono('check', 15, 'var(--acc-ink)', 3) : '') + '</span><span class="nom' + (c.hecho ? ' tachado' : '') + '">' + esc(c.nombre) + '<small>' + esc(c.cantidad || '') + (c.por ? ' · ' + esc(c.por) : '') + '</small></span></button>' +
          (puedeEditar() ? '<button class="x" data-cdel="' + c.id + '" aria-label="Quitar de la lista">' + icono('x', 18) + '</button>' : '') + '</div>';
      });
      h += '</section>';
    });
    return h + '</div>';
  }

  /* ----- ajustes ----- */
  function vAjustes() {
    var pr = D.yo.prefs;
    var h = '<div class="ajustes">';
    h += '<section class="card"><h2>Mi aspecto</h2><span class="sub">Solo te afecta a ti.</span>' +
      '<div class="seg" role="group" aria-label="Tema">' + [['claro', 'Claro', 'sol'], ['oscuro', 'Oscuro', 'luna'], ['auto', 'Automático', 'auto']].map(function (o) { return '<button class="' + (pr.tema === o[0] ? 'on' : '') + '" data-tema="' + o[0] + '">' + icono(o[2], 16) + o[1] + '</button>'; }).join('') + '</div>' +
      '<b style="font-size:14px">Color de acento</b><div class="acentos">' + [['tomate', '#FF6B47'], ['menta', '#3CCB86'], ['uva', '#A08CFF'], ['mar', '#5AABFF']].map(function (a) { return '<button class="acento' + (pr.acento === a[0] ? ' on' : '') + '" style="background:' + a[1] + '" data-acento="' + a[0] + '" aria-label="Acento ' + a[0] + '"></button>'; }).join('') + '</div></section>';
    h += '<section class="card"><h2>Mi inicio</h2><span class="sub">Activa, ordena y elige el tamaño de cada bloque. En el inicio también puedes pulsar "Personalizar".</span><div class="lista-cfg">' +
      (pr.widgets || []).map(function (w, i, arr) {
        return '<div class="cfg-fila"><span class="n">' + WN[w.k] + '<small>' + (w.on ? 'Visible' : 'Oculto') + '</small></span>' +
          '<button class="mini" data-wmovi="' + i + '" data-dir="-1" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + icono('arriba', 16, 'currentColor', 2.4) + '</button>' +
          '<button class="mini" data-wmovi="' + i + '" data-dir="1" aria-label="Bajar"' + (i === arr.length - 1 ? ' disabled' : '') + '>' + icono('abajo', 16, 'currentColor', 2.4) + '</button>' +
          '<select class="sel-mini" data-wtsel="' + w.k + '" aria-label="Tamaño">' + [[4, 'S'], [6, 'M'], [8, 'L'], [12, 'XL']].map(function (z) { return '<option value="' + z[0] + '"' + (w.t === z[0] ? ' selected' : '') + '>' + z[1] + '</option>'; }).join('') + '</select>' +
          '<button class="sw' + (w.on ? ' on' : '') + '" data-wtog="' + w.k + '" aria-label="' + (w.on ? 'Ocultar ' : 'Mostrar ') + WN[w.k] + '"></button></div>';
      }).join('') + '</div></section>';

    if (esAdmin()) {
      h += '<section class="card"><h2>Almacenes</h2><span class="sub">Solo el administrador. Al borrar uno, sus productos pasan a otro.</span><div class="lista-cfg">' +
        D.almacenes.map(function (a, i) {
          return '<div class="cfg-fila"><span class="ico tn-' + a.color + '" style="width:38px;height:38px;border-radius:12px"><span class="tc">' + icono(a.icono, 20) + '</span></span><span class="n">' + esc(a.nombre) + '</span>' +
            '<button class="mini" data-aedit="' + a.id + '" aria-label="Editar ' + esc(a.nombre) + '">' + icono('lapiz', 16) + '</button>' +
            '<button class="mini" data-amov="' + a.id + '" data-dir="-1" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>' + icono('arriba', 16, 'currentColor', 2.4) + '</button>' +
            '<button class="mini" data-amov="' + a.id + '" data-dir="1" aria-label="Bajar"' + (i === D.almacenes.length - 1 ? ' disabled' : '') + '>' + icono('abajo', 16, 'currentColor', 2.4) + '</button>' +
            '<button class="mini" data-adel="' + a.id + '" aria-label="Borrar ' + esc(a.nombre) + '"' + (D.almacenes.length <= 1 ? ' disabled' : '') + '>' + icono('papelera', 16) + '</button></div>';
        }).join('') + '</div><button class="bt" data-acc="nuevoAlm">' + icono('mas', 18, 'currentColor', 2.4) + 'Nuevo almacén</button></section>';

      h += '<section class="card"><h2>Avisos de caducidad</h2><span class="sub">A partir de cuántos días antes se marca un producto como "caduca pronto".</span>' +
        '<div class="seg">' + [1, 2, 3, 5, 7].map(function (n) { return '<button class="' + (D.ajustes.diasAviso === n ? 'on' : '') + '" data-aviso="' + n + '">' + n + (n === 1 ? ' día' : ' días') + '</button>'; }).join('') + '</div></section>';

      h += '<section class="card"><h2>Usuarios y permisos</h2><span class="sub">Aparecen aquí la primera vez que abren Frescario desde su Home Assistant.</span><div class="lista-cfg">' +
        (D.usuarios || []).map(function (u) {
          return '<div class="cfg-fila"><span class="avatar" style="width:36px;height:36px;border-radius:11px">' + esc((u.nombre || '?').charAt(0).toUpperCase()) + '</span><span class="n">' + esc(u.nombre) + '<small>' + esc(u.usuario || '') + '</small></span>' +
            '<select class="sel-mini" data-urol="' + esc(u.id) + '" aria-label="Permisos de ' + esc(u.nombre) + '">' + [['admin', 'Administrador'], ['familia', 'Familia'], ['lector', 'Solo consulta']].map(function (r) { return '<option value="' + r[0] + '"' + (u.rol === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div><span class="sub"><b>Familia</b>: puede añadir, consumir y usar la lista. <b>Solo consulta</b>: solo mira.</span></section>';

      h += '<section class="card"><h2>Categorías</h2><div style="display:flex;flex-wrap:wrap;gap:8px">' +
        D.categorias.map(function (c) { return '<span class="etq">' + esc(c) + (c !== 'Otros' ? '<button data-catdel="' + esc(c) + '" aria-label="Borrar ' + esc(c) + '">' + icono('x', 14) + '</button>' : '<span style="width:6px"></span>') + '</span>'; }).join('') +
        '</div><form class="add-row" id="f-cat" autocomplete="off"><input class="campo" style="flex:1 1 160px" name="nombre" placeholder="Nueva categoría" maxlength="40" aria-label="Nueva categoría"><button class="bt" type="submit">Añadir</button></form></section>';
    }
    h += '<section class="card"><h2>Actividad reciente</h2><div class="hist">' + (D.historial.length ? D.historial.slice(0, 12).map(function (x) {
      var acc = { alta: 'añadió', baja: 'borró', edicion: 'editó', consumo: 'consumió', tirado: 'tiró', ajuste: 'ajustó', compra: 'compró' }[x.accion] || x.accion;
      var t = new Date(x.t);
      return '<div><span><b>' + esc(x.u) + '</b> ' + acc + ' ' + esc(x.producto) + (x.cant != null && x.accion !== 'alta' ? ' (' + (x.cant > 0 ? '+' : '') + fmtNum(x.cant) + ')' : '') + '</span><span>' + t.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + '</span></div>';
    }).join('') : '<span class="sub">Todavía no hay movimientos.</span>') + '</div></section>';
    return h + '</div>';
  }

  /* ---------- capa (hojas y diálogos) ---------- */
  function abrirCapa(html, alCerrar) {
    $capa.innerHTML = '<div class="velo" data-cerrar="1"></div>' + html;
    $capa.className = 'on';
    capaCerrar = alCerrar || null;
    document.body.style.overflow = 'hidden';
    var f = $capa.querySelector('[autofocus]');
    if (f) setTimeout(function () { f.focus(); }, 60);
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

  function formProducto(p) {
    var nuevo = !p;
    p = p || { nombre: '', almacenId: S.alm !== 'todo' && S.alm !== 'bajo' ? S.alm : (D.almacenes[0] || {}).id, cantidad: 1, unidad: 'uds', minimo: 0, caducidad: '', categoria: 'Otros', nota: '' };
    return '<form class="form" id="f-prod" autocomplete="off">' +
      '<label class="f ancho"><span>Nombre</span><input name="nombre" required maxlength="80" value="' + esc(p.nombre) + '"' + (nuevo ? ' autofocus' : '') + ' placeholder="Por ejemplo: Yogur natural"></label>' +
      '<label class="f"><span>Cantidad</span><input name="cantidad" type="number" inputmode="decimal" min="0" step="any" value="' + esc(p.cantidad) + '"></label>' +
      '<label class="f"><span>Unidad</span><select name="unidad">' + D.unidades.map(function (u) { return '<option' + (p.unidad === u ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Dónde está</span><select name="almacenId">' + D.almacenes.map(function (a) { return '<option value="' + a.id + '"' + (p.almacenId === a.id ? ' selected' : '') + '>' + esc(a.nombre) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Categoría</span><select name="categoria">' + D.categorias.map(function (c) { return '<option' + (p.categoria === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="f"><span>Caduca el</span><input name="caducidad" type="date" value="' + esc(p.caducidad || '') + '"></label>' +
      '<label class="f"><span>Avisar si baja de</span><input name="minimo" type="number" inputmode="decimal" min="0" step="any" value="' + esc(p.minimo) + '"></label>' +
      '<div class="f ancho"><span>Fecha rápida</span><div class="atajos">' + [['Mañana', 1], ['3 días', 3], ['1 semana', 7], ['1 mes', 30], ['6 meses', 182], ['1 año', 365], ['Sin fecha', -1]].map(function (a) { return '<button type="button" data-fecha="' + a[1] + '">' + a[0] + '</button>'; }).join('') + '</div></div>' +
      '<label class="f ancho"><span>Nota</span><textarea name="nota" maxlength="300" placeholder="Opcional">' + esc(p.nota || '') + '</textarea></label>' +
      '</form>';
  }
  function datosForm(f) {
    var fd = new FormData(f), o = {};
    fd.forEach(function (v, k) { o[k] = v; });
    o.caducidad = o.caducidad || null;
    return o;
  }

  function abrirNuevo(nombre) {
    abrirCapa('<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="h-t"><div class="hoja-cab"><h2 id="h-t">Nuevo producto</h2><button class="bt-ic" style="background:var(--track);color:var(--text)" data-cerrar="1" aria-label="Cerrar">' + icono('x', 20) + '</button></div>' +
      '<div class="hoja-cuerpo">' + formProducto(nombre ? { nombre: nombre, almacenId: (D.almacenes[0] || {}).id, cantidad: 1, unidad: 'uds', minimo: 0, caducidad: '', categoria: 'Otros', nota: '' } : null) + '</div>' +
      '<div class="hoja-pie"><button class="bt" data-cerrar="1" style="flex:1">Cancelar</button><button class="bt pri" data-acc="guardarNuevo" style="flex:2">Guardar</button></div></div>');
  }

  function abrirFicha(id) {
    var p = prodPorId(id);
    if (!p) { cerrarCapa(); return; }
    S.sel = id;
    var c = catDe(p.categoria), ci = cadInfo(p), a = almPorId(p.almacenId), ed = puedeEditar();
    var paso = pasoDe(p.unidad);
    var h = '<div class="hoja" role="dialog" aria-modal="true" aria-labelledby="h-t" data-ficha="' + p.id + '"><div class="hoja-cab"><h2 id="h-t">' + esc(a ? a.nombre : 'Producto') + '</h2><button class="bt-ic" style="background:var(--track);color:var(--text)" data-cerrar="1" aria-label="Cerrar">' + icono('x', 20) + '</button></div><div class="hoja-cuerpo">';
    h += '<div class="cabficha tn-' + c[1] + '">' + icoProd(p, true) + '<div><h3>' + esc(p.nombre) + '</h3><span class="pill ' + ci.cls + '">' + (p.caducidad ? 'Caduca: ' + ci.txt : 'Sin fecha de caducidad') + '</span></div></div>';
    h += '<div class="stock"><span><small>En casa</small><b>' + esc(cantTxt(p)) + '</b>' + (p.minimo > 0 ? '<small>Aviso por debajo de ' + fmtNum(p.minimo) + ' ' + esc(uni(p.minimo, p.unidad)) + '</small>' : '') + '</span>' +
      (ed ? '<span style="display:flex;gap:8px"><button class="paso" data-mover="' + (-paso) + '" data-motivo="ajuste" aria-label="Quitar ' + fmtNum(paso) + '"' + (p.cantidad <= 0 ? ' disabled' : '') + '>−</button><button class="paso mas" data-mover="' + paso + '" data-motivo="ajuste" aria-label="Añadir ' + fmtNum(paso) + '">+</button></span>' : '') + '</div>';
    if (ed) {
      h += '<div class="acciones"><button class="bt pri ancho" data-mover="' + (-paso) + '" data-motivo="consumo"' + (p.cantidad <= 0 ? ' disabled' : '') + '>Consumir ' + fmtNum(paso) + '</button>' +
        '<button class="bt" data-acc="aLista">' + icono('carro', 18) + 'A la lista</button><button class="bt" data-mover="' + (-paso) + '" data-motivo="tirado"' + (p.cantidad <= 0 ? ' disabled' : '') + '>Lo he tirado</button></div>';
      h += '<h3 class="sec-tit" style="margin-top:6px;font-size:16px">Datos del producto</h3>' + formProducto(p);
    } else {
      h += '<div class="card" style="padding:4px 16px">' + [['Categoría', p.categoria], ['Caduca', p.caducidad ? fechaCorta(p.caducidad) : 'Sin fecha'], ['Nota', p.nota || '-']].map(function (r) { return '<div style="display:flex;justify-content:space-between;gap:10px;padding:13px 0;border-bottom:1px solid var(--line);font-size:14px"><span class="sub">' + r[0] + '</span><b>' + esc(r[1]) + '</b></div>'; }).join('') + '</div>';
    }
    h += '</div>';
    if (ed) h += '<div class="hoja-pie"><button class="bt peligro" data-acc="borrar" aria-label="Borrar producto">' + icono('papelera', 18) + '</button><button class="bt pri" data-acc="guardarFicha" style="flex:1">Guardar cambios</button></div>';
    h += '</div>';
    abrirCapa(h, function () { S.sel = null; if (S.scr === 'almacen') pintar(); });
  }
  function refrescarFicha() { var f = $capa.querySelector('[data-ficha]'); if (f) { var cb = capaCerrar; abrirFicha(f.getAttribute('data-ficha')); capaCerrar = cb; } }

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

  /* ---------- acciones ---------- */
  function cambiarWidgets(fn) {
    var w = (D.yo.prefs.widgets || []).map(function (x) { return { k: x.k, on: x.on, t: x.t }; });
    fn(w);
    guardarPrefs({ widgets: w });
  }
  function moverWidget(k, dir) {
    cambiarWidgets(function (w) {
      var vis = w.filter(function (x) { return x.on; });
      var i = vis.findIndex(function (x) { return x.k === k; });
      var otro = vis[i + dir]; if (!otro) return;
      var a = w.findIndex(function (x) { return x.k === k; }), b = w.findIndex(function (x) { return x.k === otro.k; });
      var t = w[a]; w[a] = w[b]; w[b] = t;
    });
  }
  function hecho(r, msg) { if (msg) toast(msg); return recargar().then(function () { return r; }); }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, [data-cerrar]');
    if (!t) return;
    var ds = t.dataset;
    if (ds.cerrar) { cerrarCapa(); return; }
    if (ds.ir) { S.scr = ds.ir; S.edit = false; if (ds.ir !== 'almacen' && ds.ir !== 'inicio') S.q = ''; if (ds.ir === 'almacen' && !t.closest('.side,.bnav')) {} pintar(); window.scrollTo(0, 0); return; }
    if (ds.prod) { abrirFicha(ds.prod); if (S.scr === 'almacen') pintar(); return; }
    if (ds.alm) { S.scr = 'almacen'; S.alm = ds.alm; S.q = ''; pintar(); window.scrollTo(0, 0); return; }
    if (ds.almf) { S.alm = ds.almf; pintar(); return; }
    if (ds.tema) { guardarPrefs({ tema: ds.tema }); return; }
    if (ds.acento) { guardarPrefs({ acento: ds.acento }); return; }
    if (ds.wshow) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wshow) x.on = true; }); }); return; }
    if (ds.whide) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.whide) x.on = false; }); }); return; }
    if (ds.wtog) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wtog) x.on = !x.on; }); }); return; }
    if (ds.wtam) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wtam) x.t = parseInt(ds.t, 10); }); }); return; }
    if (ds.wmov) { moverWidget(ds.wmov, parseInt(ds.dir, 10)); return; }
    if (ds.wmovi) { cambiarWidgets(function (w) { var i = parseInt(ds.wmovi, 10), j = i + parseInt(ds.dir, 10); if (j < 0 || j >= w.length) return; var x = w[i]; w[i] = w[j]; w[j] = x; }); return; }
    if (ds.fecha) {
      var inp = t.closest('form').querySelector('[name="caducidad"]');
      inp.value = ds.fecha === '-1' ? '' : sumaDias(parseInt(ds.fecha, 10));
      return;
    }
    if (ds.mover) {
      var fid = $capa.querySelector('[data-ficha]').getAttribute('data-ficha');
      t.disabled = true;
      var msgs = { consumo: 'Consumido, apuntado', tirado: 'Apuntado como desperdicio', ajuste: '' };
      api('POST', 'productos/' + fid + '/mover', { delta: parseFloat(ds.mover), motivo: ds.motivo })
        .then(function (r) { return hecho(r, msgs[ds.motivo]); })
        .then(function () {
          var p = prodPorId(fid);
          refrescarFicha();
          if (p && ds.motivo !== 'ajuste' && p.minimo > 0 && p.cantidad < p.minimo && !D.compra.some(function (c) { return !c.hecho && c.productoId === p.id; })) {
            setTimeout(function () { toast('Queda poco ' + p.nombre.toLowerCase() + '. Puedes añadirlo a la lista.'); }, 2500);
          }
        }).catch(function (e) { t.disabled = false; fallo(e); });
      return;
    }
    if (ds.compra) {
      var c = D.compra.find(function (x) { return x.id === ds.compra; });
      if (!c || !puedeEditar()) return;
      c.hecho = !c.hecho; pintar();
      api('PUT', 'compra/' + c.id, { hecho: c.hecho }).then(function () { return recargar(); }).catch(function (e) { c.hecho = !c.hecho; pintar(); fallo(e); });
      return;
    }
    if (ds.cdel) { D.compra = D.compra.filter(function (x) { return x.id !== ds.cdel; }); pintar(); api('DELETE', 'compra/' + ds.cdel).then(function () { return recargar(); }).catch(fallo); return; }
    if (ds.aviso) { api('PUT', 'ajustes', { diasAviso: parseInt(ds.aviso, 10) }).then(function (r) { return hecho(r, 'Guardado'); }).catch(fallo); return; }
    if (ds.aedit) { abrirAlmacen(almPorId(ds.aedit)); return; }
    if (ds.amov) { api('PUT', 'almacenes/' + ds.amov, { mover: parseInt(ds.dir, 10) }).then(function (r) { return hecho(r); }).catch(fallo); return; }
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
    if (acc === 'nuevo') { abrirNuevo(); return; }
    if (acc === 'nuevoQ') { abrirNuevo(S.q.trim()); return; }
    if (acc === 'editar') { S.edit = !S.edit; S.q = ''; pintar(); return; }
    if (acc === 'verBajo') { S.scr = 'almacen'; S.alm = 'bajo'; S.q = ''; pintar(); return; }
    if (acc === 'nuevoAlm') { abrirAlmacen(null); return; }
    if (acc === 'guardarNuevo' || acc === 'guardarFicha') {
      var f = document.getElementById('f-prod');
      if (!f.reportValidity()) return;
      var datos = datosForm(f);
      t.disabled = true;
      var pr = acc === 'guardarNuevo' ? api('POST', 'productos', datos) : api('PUT', 'productos/' + $capa.querySelector('[data-ficha]').getAttribute('data-ficha'), datos);
      pr.then(function (r) { capaCerrar = null; cerrarCapa(); return hecho(r, acc === 'guardarNuevo' ? 'Producto añadido' : 'Cambios guardados'); }).catch(function (e) { t.disabled = false; fallo(e); });
      return;
    }
    if (acc === 'borrar') {
      var bid = $capa.querySelector('[data-ficha]').getAttribute('data-ficha'), bp = prodPorId(bid);
      confirmar('Borrar ' + bp.nombre, 'Se quita del almacén para siempre. Si solo se ha acabado, mejor deja la cantidad a 0.', 'Borrar', true).then(function (ok) {
        if (ok) api('DELETE', 'productos/' + bid).then(function (r) { S.sel = null; return hecho(r, 'Producto borrado'); }).catch(fallo);
        else abrirFicha(bid);
      });
      return;
    }
    if (acc === 'aLista') {
      var lp = prodPorId($capa.querySelector('[data-ficha]').getAttribute('data-ficha'));
      api('POST', 'compra', { nombre: lp.nombre, productoId: lp.id }).then(function (r) { return hecho(r, r.repetido ? 'Ya estaba en la lista' : 'Añadido a la lista'); }).catch(fallo);
      return;
    }
    if (acc === 'faltantes') { api('POST', 'compra/faltantes', {}).then(function (r) { return hecho(r, r.anadidos ? 'Añadidos ' + r.anadidos + ' productos' : 'No falta nada, todo está por encima del mínimo'); }).catch(fallo); return; }
    if (acc === 'terminar') {
      var C = calcular();
      var ligados = C.hechos.filter(function (c) { return c.productoId; }).length;
      abrirCapa('<div class="dialogo" role="dialog" aria-modal="true" aria-labelledby="dlg-t"><h3 id="dlg-t">Terminar compra</h3><p>Se quitan de la lista los ' + C.hechos.length + ' productos que están en el carro.</p>' +
        (ligados ? '<label class="cfg-fila" style="cursor:pointer"><span class="n">Sumarlos a su almacén<small>' + ligados + ' de ellos ya existen en el almacén</small></span><input type="checkbox" id="sumar" checked style="width:22px;height:22px;accent-color:var(--acc)"></label>' : '') +
        '<div class="acc"><button class="bt" data-cerrar="1">Cancelar</button><button class="bt osc" data-acc="terminarOk" autofocus>Terminar</button></div></div>');
      return;
    }
    if (acc === 'terminarOk') {
      var sm = document.getElementById('sumar');
      api('POST', 'compra/terminar', { sumarAlAlmacen: !!(sm && sm.checked) }).then(function (r) { cerrarCapa(); return hecho(r, 'Compra terminada'); }).catch(fallo);
      return;
    }
    if (acc === 'guardarAlm') {
      var fa = document.getElementById('f-alm');
      if (!fa.reportValidity()) return;
      var da = datosForm(fa);
      (ds.id ? api('PUT', 'almacenes/' + ds.id, da) : api('POST', 'almacenes', da)).then(function (r) { cerrarCapa(); return hecho(r, 'Almacén guardado'); }).catch(fallo);
      return;
    }
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.id === 'f-compra') {
      ev.preventDefault();
      var d = datosForm(f);
      if (!String(d.nombre || '').trim()) return;
      api('POST', 'compra', { nombre: d.nombre, cantidad: d.cantidad }).then(function (r) {
        toast(r.repetido ? 'Ya estaba en la lista' : 'Añadido');
        return recargar();
      }).then(function () { var i = document.querySelector('#f-compra [name="nombre"]'); if (i) i.focus(); }).catch(fallo);
    } else if (f.id === 'f-cat') {
      ev.preventDefault();
      api('POST', 'categorias', datosForm(f)).then(function (r) { return hecho(r, 'Categoría añadida'); }).catch(fallo);
    } else if (f.id === 'f-prod') {
      ev.preventDefault();
      var b = $capa.querySelector('[data-acc="guardarNuevo"],[data-acc="guardarFicha"]'); if (b) b.click();
    } else if (f.id === 'f-alm') {
      ev.preventDefault();
      var g = $capa.querySelector('[data-acc="guardarAlm"]'); if (g) g.click();
    }
  });

  document.addEventListener('input', function (ev) {
    if (ev.target.id === 'q') {
      S.q = ev.target.value;
      clearTimeout(document._qt);
      document._qt = setTimeout(pintar, 120);
    }
  });
  document.addEventListener('change', function (ev) {
    var ds = ev.target.dataset;
    if (ds.wtsel) { cambiarWidgets(function (w) { w.forEach(function (x) { if (x.k === ds.wtsel) x.t = parseInt(ev.target.value, 10); }); }); }
    if (ds.urol) { api('PUT', 'usuarios/' + encodeURIComponent(ds.urol), { rol: ev.target.value }).then(function (r) { return hecho(r, 'Permisos guardados'); }).catch(function (e) { fallo(e); recargar(); }); }
  });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && $capa.className === 'on') cerrarCapa(); });

  /* ---------- carga y tiempo real ---------- */
  var cargando = null;
  function recargar() {
    if (cargando) return cargando;
    cargando = api('GET', 'estado').then(function (d) {
      D = d; aplicarTema();
      if (S.alm !== 'todo' && S.alm !== 'bajo' && !almPorId(S.alm)) S.alm = 'todo';
      if ($capa.className !== 'on') pintar(); else { var keep = document.activeElement; pintar(); if (keep && keep.isConnected) keep.focus(); }
    }).catch(function (e) {
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
  }
  setInterval(function () { if (!document.hidden) recargar().catch(function () {}); }, 60000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) recargar().catch(function () {}); });

  recargar().then(escuchar).catch(function () {});
})();
