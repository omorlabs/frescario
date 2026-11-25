'use strict';
/* Idiomas de Frescario.
   El castellano es el idioma base y va dentro del código.
   Cualquier otro idioma es un único archivo public/i18n/<código>.json con:
     nombre   nombre del idioma en su propia lengua (sale en el selector)
     locale   formato de fechas y números (por ejemplo "fr-FR")
     decimal  separador decimal ("," o ".")
     mesMayuscula  true si los meses se escriben con mayúscula en mitad de frase
     textos, patrones  traducción de la interfaz
     avisos   textos de las notificaciones del móvil
   Al arrancar se leen todos los archivos de la carpeta: no hay que tocar nada más. */
const fs = require('fs');
const path = require('path');

const CARPETA = path.join(__dirname, 'public', 'i18n');
const CODIGO = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

function cargar() {
  const lista = [{ codigo: 'es', nombre: 'Español', locale: 'es-ES', decimal: ',' }];
  const avisos = {};
  let archivos = [];
  try { archivos = fs.readdirSync(CARPETA).filter((f) => f.endsWith('.json')).sort(); } catch (e) { archivos = []; }
  for (const f of archivos) {
    const codigo = f.slice(0, -5).toLowerCase();
    if (!CODIGO.test(codigo) || codigo === 'es') continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(CARPETA, f), 'utf8'));
      if (!j || typeof j.textos !== 'object') { console.error('[frescario] Idioma ' + f + ' sin "textos", se ignora'); continue; }
      lista.push({
        codigo,
        nombre: String(j.nombre || codigo).slice(0, 40),
        locale: String(j.locale || codigo).slice(0, 20),
        decimal: j.decimal === ',' ? ',' : '.'
      });
      if (j.avisos && typeof j.avisos === 'object') avisos[codigo] = j.avisos;
    } catch (e) {
      console.error('[frescario] Idioma ' + f + ' no se puede leer: ' + e.message);
    }
  }
  return { lista, avisos };
}

const { lista, avisos } = cargar();
const codigos = lista.map((l) => l.codigo);

module.exports = {
  lista: () => lista.slice(),
  codigos: () => codigos.slice(),
  existe: (c) => codigos.includes(c),
  avisos: (c) => avisos[c] || null,
  info: (c) => lista.find((l) => l.codigo === c) || lista[0]
};
