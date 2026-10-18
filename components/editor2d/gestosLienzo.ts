/**
 * DecoAR — Gestos del lienzo 2D (entrega 1b-1). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * Traduce toques y arrastres en ACCIONES EXISTENTES de planEditor.ts. No calcula geometría propia:
 * la cuadrícula de 0,5 m, el mínimo de 1 m y demás reglas las aplica el reductor al recibir la acción.
 *
 *   tocar un espacio         → seleccionar
 *   arrastrar un espacio     → iniciarGesto, moverModulo…, terminarGesto   (un solo paso de deshacer)
 *   arrastrar el asa (SE)    → iniciarGesto, redimensionar…, terminarGesto
 *   tocar el fondo           → seleccionar(null)
 *   arrastrar el fondo       → desplaza la vista (no toca el plano)
 *   en modo colocar, tocar   → agregarModulo centrado donde se tocó
 *   tocar un "+" de un muro  → crearVanoEnContacto                      (1b-3)
 *   tocar un vano            → seleccionar(vano)  (gana sobre el espacio, como en la web)
 *   arrastrar un vano        → iniciarGesto, moverVano…, terminarGesto  (solo a lo largo de su muro)
 */
import type { AccionEditor, Contacto, Planta, Seleccion } from '../plan/planEditor';
import { MEDIDAS_DEFECTO } from '../plan/planEditor';
import type { Modulo } from '../plan/planModel';
import { esCuarto } from '../plan/planModel';
import { Vista, aPantalla, aPlano, modulosDelNivel, tramoVano, vanosDelNivel } from './vistaLienzo';
import { RADIO_MENOS, botonesMas, ejeVano, posicionMenos, tieneId } from './vanosLienzo';

export const RADIO_ASA = 22;          // pt: el asa se puede agarrar en un círculo de 44 pt (mínimo táctil de iOS)
export const MIN_OBJETIVO = 44;       // pt: un espacio muy delgado (una viga) se puede tocar en 44 pt
export const UMBRAL_ARRASTRE = 8;     // pt: por debajo es un toque; el temblor del dedo no mueve nada
export const RADIO_MAS = 22;          // pt: un "+" se toca en un círculo de 44 pt
export const TOLERANCIA_VANO = 22;    // pt a cada lado de la barra del vano

/**
 * Lo que se quiere colocar al tocar el lienzo (tipo del reductor y nombre opcional, p. ej. Comedor).
 * `vano`: puerta o ventana, que se ponen tocando un MURO (ponerPuertaLibre / ponerVentanaLibre).
 */
export interface Pieza { tipo: string; nombre?: string; etiqueta: string; vano?: 'puerta' | 'ventana' }

/** Tipos de espacio del botón "Colocar espacio". Mismos tipos y nombres que la paleta de E2 (EditorPanel). */
export const ESPACIOS: Pieza[] = [
  { etiqueta: '🛋️ Sala', tipo: 'sala' },
  { etiqueta: '🍽️ Comedor', tipo: 'zona', nombre: '🍽️ Comedor' },
  { etiqueta: '🍳 Cocina', tipo: 'cocina' },
  { etiqueta: '🛏️ Habitación', tipo: 'habitacion', nombre: '🛏️ Habitación' },
  { etiqueta: '🚿 Baño', tipo: 'bano', nombre: '🚿 Baño' },
  { etiqueta: '🚶 Pasillo', tipo: 'pasillo' },
  { etiqueta: '📦 Zona', tipo: 'zona' },
];

/** Estado en la maqueta 3D, comprobado con generarMaqueta (planGeometry.ts) en tools/test-estructuras.ts. */
export type Estado3D = 'si' | 'parcial' | 'no';
export interface PiezaConstruccion extends Pieza { grupo: string; estado3D: Estado3D; nota3D: string }

/**
 * Botón "Agregar objetos de construcción": los mismos grupos que la web (lista general: pared y vidrio;
 * Estructura: columna, viga, baranda, hueco, escalera; Exteriores: piso exterior). La zona ya está en
 * "Colocar espacio". El plafón y la cubierta van en la capa Techo de la web: no están aquí.
 */
export const CONSTRUCCION: PiezaConstruccion[] = [
  { grupo: 'Muros', etiqueta: '🧱 Pared', tipo: 'pared', estado3D: 'si', nota3D: 'Se ve en 3D.' },
  { grupo: 'Muros', etiqueta: '🪟 Vidrio', tipo: 'vidrio', estado3D: 'no', nota3D: 'Aún no se ve en 3D.' },
  { grupo: 'Estructura', etiqueta: '🏛️ Columna', tipo: 'columna', estado3D: 'si', nota3D: 'Va de piso a techo. Se ve en 3D.' },
  { grupo: 'Estructura', etiqueta: '🪵 Viga', tipo: 'viga', estado3D: 'si', nota3D: 'Cuelga del techo (base a 2,20 m, 0,40 m de alto). Se ve en 3D.' },
  { grupo: 'Estructura', etiqueta: '🚧 Baranda', tipo: 'baranda', estado3D: 'no', nota3D: 'Aún no se ve en 3D.' },
  { grupo: 'Estructura', etiqueta: '⬚ Hueco', tipo: 'hueco', estado3D: 'parcial', nota3D: 'En un piso alto recorta su piso en 3D; en el primer piso no se ve.' },
  { grupo: 'Estructura', etiqueta: '🪜 Escalera', tipo: 'escalera', estado3D: 'no', nota3D: 'Aún no se ve en 3D.' },
  { grupo: 'Exteriores', etiqueta: '🟫 Piso exterior', tipo: 'exterior', nombre: '🟫 Piso exterior', estado3D: 'no',
    nota3D: 'Andén, losa, patio o zona verde alrededor de la casa: va sobre el suelo, no levanta muros ni suma área. Aún no se ve en 3D.' },
];

/**
 * Aberturas de "Construcción" (Entrega 3): se colocan tocando un muro, interior o exterior.
 * Estado 3D comprobado con generarMaqueta en tools/test-muros-aberturas.ts.
 */
export const ABERTURAS: PiezaConstruccion[] = [
  { grupo: 'Aberturas', etiqueta: '🚪 Puerta', tipo: 'puerta', vano: 'puerta', estado3D: 'parcial', nota3D: 'Se ven el hueco y el marco en 3D; la hoja aún no.' },
  { grupo: 'Aberturas', etiqueta: '🪟 Ventana', tipo: 'ventana', vano: 'ventana', estado3D: 'parcial',
    nota3D: 'En 3D se ve el hueco con muro abajo y arriba; sin marco ni vidrio aún.' },
];

/** Nota 3D del tipo de un elemento ya colocado (null si es un cuarto). */
export const notaConstruccion = (tipo: string | null | undefined) => CONSTRUCCION.find(c => c.tipo === tipo)?.nota3D ?? null;

/**
 * Piezas delgadas sin círculo de estirar: el reductor (como la web, visor3d.js:7753) no deja nada por
 * debajo de 1 m al estirar, así que una columna de 0,30 m saltaría a 1 × 1 m. Se giran con "Girar 90°".
 */
export const SIN_ESTIRAR = new Set(['pared', 'vidrio', 'columna', 'viga', 'baranda']);
export const puedeEstirar = (m: Pick<Modulo, 'tipo'>) => !SIN_ESTIRAR.has(m.tipo ?? '');

export type Objetivo =
  | { tipo: 'asa'; id: string } | { tipo: 'modulo'; id: string }
  | { tipo: 'mas'; contacto: Contacto } | { tipo: 'menos'; contacto: Contacto; cerrado: boolean }
  | { tipo: 'vano'; id: string } | { tipo: 'vacio' };

/** Esquina SE del módulo en pantalla: donde se dibuja y se agarra el asa de estirar. */
export function posicionAsa(v: Vista, m: Modulo) { return aPantalla(v, m.x + m.ancho, m.z + m.largo); }

/**
 * Espacios bajo el dedo, de arriba abajo: primero la estructura (se dibuja encima) y después los
 * cuartos, el último dibujado primero. Al final, los que solo se alcanzan por su objetivo ampliado
 * de 44 pt (una viga delgada). Solo cuenta el nivel visible.
 */
export function candidatos(v: Vista, p: Planta, nivel: number, px: number, py: number): string[] {
  const mods = modulosDelNivel(p, nivel);
  const orden = [...mods.filter(m => esCuarto(m.tipo)), ...mods.filter(m => !esCuarto(m.tipo))].reverse();
  const exactos: string[] = [], ampliados: string[] = [];
  for (const m of orden) {
    const a = aPantalla(v, m.x, m.z);
    const w = m.ancho * v.escala, h = m.largo * v.escala;
    if (px >= a.px && px <= a.px + w && py >= a.py && py <= a.py + h) { exactos.push(String(m.id)); continue; }
    const mx = Math.max(0, (MIN_OBJETIVO - w) / 2), my = Math.max(0, (MIN_OBJETIVO - h) / 2);
    if ((mx || my) && px >= a.px - mx && px <= a.px + w + mx && py >= a.py - my && py <= a.py + h + my) ampliados.push(String(m.id));
  }
  return [...exactos, ...ampliados];
}

/** Vano (con id, del piso visible) bajo el dedo: a menos de TOLERANCIA_VANO de su barra. */
export function vanoBajoDedo(v: Vista, p: Planta, nivel: number, px: number, py: number): string | null {
  const mods = modulosDelNivel(p, nivel);
  let mejor: { id: string; d: number } | null = null;
  for (const vn of vanosDelNivel(p, nivel)) {
    if (!tieneId(vn)) continue;
    const t = tramoVano(vn, mods);
    if (!t) continue;
    const a = aPantalla(v, t.x0, t.z0), b = aPantalla(v, t.x1, t.z1);
    // distancia del punto al segmento a-b
    const lx = b.px - a.px, ly = b.py - a.py, l2 = lx * lx + ly * ly;
    const k = l2 ? Math.max(0, Math.min(1, ((px - a.px) * lx + (py - a.py) * ly) / l2)) : 0;
    const d = Math.hypot(px - (a.px + k * lx), py - (a.py + k * ly));
    if (d <= TOLERANCIA_VANO && (!mejor || d < mejor.d)) mejor = { id: String(vn.id), d };
  }
  return mejor?.id ?? null;
}

/**
 * Qué se agarra, en el orden de la web (visor3d.js:7684-7700): el asa del espacio seleccionado; un
 * "+" de un muro; un vano (gana sobre el espacio porque vive sobre su borde); el espacio seleccionado
 * si está bajo el dedo (aunque otro lo tape: una sala cruzada por una viga se sigue moviendo); el de
 * más arriba; y si no hay nada, el fondo.
 */
export function queToca(v: Vista, p: Planta, nivel: number, sel: Seleccion, px: number, py: number): Objetivo {
  if (sel?.tipo === 'modulo') {
    const m = modulosDelNivel(p, nivel).find(x => String(x.id) === sel.id);
    if (m && puedeEstirar(m)) { const a = posicionAsa(v, m); if (Math.hypot(px - a.px, py - a.py) <= RADIO_ASA) return { tipo: 'asa', id: String(m.id) }; }
  }
  let mas: { b: ReturnType<typeof botonesMas>[number]; d: number } | null = null;
  for (const b of botonesMas(p, nivel)) {
    const q = aPantalla(v, b.x, b.z), d = Math.hypot(px - q.px, py - q.py);
    if (d <= RADIO_MAS && (!mas || d < mas.d)) mas = { b, d };
  }
  if (mas) return { tipo: 'mas', contacto: mas.b.contacto };
  for (const b of botonesMas(p, nivel)) {
    const q = posicionMenos(aPantalla(v, b.x, b.z), b.contacto.lado);
    if (Math.hypot(px - q.px, py - q.py) <= RADIO_MENOS) return { tipo: 'menos', contacto: b.contacto, cerrado: b.cerrado };
  }
  const vano = vanoBajoDedo(v, p, nivel, px, py);
  if (vano) return { tipo: 'vano', id: vano };
  const c = candidatos(v, p, nivel, px, py);
  if (!c.length) return { tipo: 'vacio' };
  if (sel?.tipo === 'modulo' && c.includes(sel.id)) return { tipo: 'modulo', id: sel.id };
  return { tipo: 'modulo', id: c[0] };
}

/** Esquina mínima para que un espacio nuevo quede CENTRADO donde se tocó (el reductor la ajusta a 0,5 m). */
export function esquinaParaColocar(tipo: string, x: number, z: number) {
  const med = MEDIDAS_DEFECTO[tipo] || { ancho: 4, largo: 4 };   // los 4 × 4 por defecto del reductor
  return { x: x - med.ancho / 2, z: z - med.largo / 2 };
}

// ───────────────────────────── Máquina del gesto ─────────────────────────────
export interface Contexto { vista: Vista; planta: Planta; nivel: number; seleccion: Seleccion; colocar: Pieza | null }

export interface Gesto {
  objetivo: Objetivo;
  px0: number; py0: number;               // dónde empezó, en pt del lienzo
  vista0: Vista;
  mod0: { x: number; z: number; ancho: number; largo: number } | null;
  /** Para arrastrar un vano: su centro al empezar y el eje de su muro. */
  vano0: { centro: number; eje: 'x' | 'z' } | null;
  arrastrando: boolean;
  colocar: Pieza | null;
  /** Espacios superpuestos bajo el dedo y si el agarrado ya estaba seleccionado: tocar otra vez alterna. */
  bajoDedo: string[];
  yaSeleccionado: boolean;
}

export interface Paso { gesto: Gesto; acciones: AccionEditor[]; vista?: Vista }

/** Dedo abajo. Tocar un espacio o un vano no seleccionado lo selecciona ya, para que se vea qué se va a mover. */
export function iniciar(c: Contexto, px: number, py: number): Paso {
  const objetivo: Objetivo = c.colocar ? { tipo: 'vacio' } : queToca(c.vista, c.planta, c.nivel, c.seleccion, px, py);
  const idMod = objetivo.tipo === 'modulo' || objetivo.tipo === 'asa' ? objetivo.id : null;
  const m = idMod ? c.planta.modulos.find(x => String(x.id) === idMod) ?? null : null;
  const vn = objetivo.tipo === 'vano' ? c.planta.vanos.find(x => String(x.id) === objetivo.id) ?? null : null;
  const yaSeleccionado = (objetivo.tipo === 'modulo' || objetivo.tipo === 'asa' || objetivo.tipo === 'vano')
    && c.seleccion?.id === objetivo.id && c.seleccion.tipo === (objetivo.tipo === 'vano' ? 'vano' : 'modulo');
  const gesto: Gesto = {
    objetivo, px0: px, py0: py, vista0: c.vista, arrastrando: false, colocar: c.colocar,
    mod0: m ? { x: m.x, z: m.z, ancho: m.ancho, largo: m.largo } : null,
    vano0: vn ? { centro: vn.centro, eje: ejeVano(vn) } : null,
    bajoDedo: objetivo.tipo === 'modulo' ? candidatos(c.vista, c.planta, c.nivel, px, py) : [], yaSeleccionado,
  };
  const acciones: AccionEditor[] = [];
  if (objetivo.tipo === 'modulo' && !yaSeleccionado) acciones.push({ type: 'seleccionar', seleccion: { tipo: 'modulo', id: objetivo.id } });
  if (objetivo.tipo === 'vano' && !yaSeleccionado) acciones.push({ type: 'seleccionar', seleccion: { tipo: 'vano', id: objetivo.id } });
  return { gesto, acciones };
}

/** Dedo moviéndose. `dx`, `dy`: desplazamiento total desde el inicio, en pt. */
export function mover(g: Gesto, dx: number, dy: number): Paso {
  if (!g.arrastrando && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return { gesto: g, acciones: [] };
  const primera = !g.arrastrando;
  const gesto = primera ? { ...g, arrastrando: true } : g;
  const e = g.vista0.escala;
  const o = g.objetivo;
  const editaAlgo = (o.tipo === 'modulo' || o.tipo === 'asa') ? !!g.mod0 : o.tipo === 'vano' ? !!g.vano0 : false;
  if (!editaAlgo) {   // fondo, "+" o "−": arrastrar desplaza la vista
    return { gesto, acciones: [], vista: { ...g.vista0, ox: g.vista0.ox + dx, oy: g.vista0.oy + dy } };
  }
  const acciones: AccionEditor[] = primera ? [{ type: 'iniciarGesto' }] : [];
  if (o.tipo === 'modulo') {
    acciones.push({ type: 'moverModulo', id: o.id, x: g.mod0!.x + dx / e, z: g.mod0!.z + dy / e });
  } else if (o.tipo === 'asa') {
    acciones.push({ type: 'redimensionar', id: o.id, esquina: 'se',
      x: g.mod0!.x + g.mod0!.ancho + dx / e, z: g.mod0!.z + g.mod0!.largo + dy / e });
  } else if (o.tipo === 'vano') {
    // Solo cuenta el movimiento a lo largo del muro; el reductor lo limita al tramo compartido.
    acciones.push({ type: 'moverVano', id: o.id, u: g.vano0!.centro + (g.vano0!.eje === 'x' ? dx : dy) / e });
  }
  return { gesto, acciones };
}

/** Dedo arriba. `cancelado`: el sistema interrumpió el gesto (llamada, notificación…): no se crea nada. */
export function terminar(g: Gesto, c: Contexto, cancelado = false): AccionEditor[] {
  const o = g.objetivo;
  if (g.arrastrando) return (o.tipo === 'modulo' || o.tipo === 'asa' || o.tipo === 'vano') ? [{ type: 'terminarGesto' }] : [];
  if (cancelado) return [];
  if (g.colocar?.vano) {   // puerta o ventana: en el muro más cercano al toque (el reductor decide cuál)
    const p = aPlano(c.vista, g.px0, g.py0);
    const tolerancia = Math.max(0.3, RADIO_ASA / c.vista.escala);
    return [g.colocar.vano === 'puerta' ? { type: 'ponerPuertaLibre', x: p.x, z: p.z, tolerancia } : { type: 'ponerVentanaLibre', x: p.x, z: p.z, tolerancia }];
  }
  if (g.colocar) {
    const p = aPlano(c.vista, g.px0, g.py0);
    const esq = esquinaParaColocar(g.colocar.tipo, p.x, p.z);
    return [{ type: 'agregarModulo', tipo: g.colocar.tipo, nombre: g.colocar.nombre, x: esq.x, z: esq.z }];
  }
  if (o.tipo === 'mas') return [{ type: 'crearVanoEnContacto', contacto: o.contacto }];
  if (o.tipo === 'menos') return [o.cerrado ? { type: 'abrirMuro', contacto: o.contacto } : { type: 'cerrarMuro', contacto: o.contacto }];
  if (o.tipo === 'vacio' && c.seleccion) return [{ type: 'seleccionar', seleccion: null }];
  // Tocar otra vez un espacio ya seleccionado que tiene otro encima o debajo: pasa al siguiente.
  if (o.tipo === 'modulo' && g.yaSeleccionado && g.bajoDedo.length > 1) {
    const i = g.bajoDedo.indexOf(o.id);
    return [{ type: 'seleccionar', seleccion: { tipo: 'modulo', id: g.bajoDedo[(i + 1) % g.bajoDedo.length] } }];
  }
  return [];
}

/** Dos vistas iguales a efectos prácticos (para que "Ajustar vista" diga si ya estaba encuadrado). */
export const mismaVista = (a: Vista, b: Vista) =>
  Math.abs(a.escala - b.escala) < 1e-3 * b.escala && Math.abs(a.ox - b.ox) < 0.5 && Math.abs(a.oy - b.oy) < 0.5;
