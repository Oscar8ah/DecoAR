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
 */
import type { AccionEditor, Planta, Seleccion } from '../plan/planEditor';
import { MEDIDAS_DEFECTO } from '../plan/planEditor';
import type { Modulo } from '../plan/planModel';
import { esCuarto } from '../plan/planModel';
import { Vista, aPantalla, aPlano, modulosDelNivel } from './vistaLienzo';

export const RADIO_ASA = 22;          // pt: el asa se puede agarrar en un círculo de 44 pt (mínimo táctil de iOS)
export const MIN_OBJETIVO = 44;       // pt: un espacio muy delgado (una viga) se puede tocar en 44 pt
export const UMBRAL_ARRASTRE = 8;     // pt: por debajo es un toque; el temblor del dedo no mueve nada

/** Lo que se quiere colocar al tocar el lienzo (tipo del reductor y nombre opcional, p. ej. Comedor). */
export interface Pieza { tipo: string; nombre?: string; etiqueta: string }

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

export type Objetivo = { tipo: 'asa'; id: string } | { tipo: 'modulo'; id: string } | { tipo: 'vacio' };

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

/**
 * Qué se agarra: el asa del espacio seleccionado; si no, el espacio seleccionado cuando está bajo el
 * dedo (aunque otro lo tape: así una sala cruzada por una viga se puede seguir moviendo); si no, el
 * de más arriba; si no hay nada, el fondo.
 */
export function queToca(v: Vista, p: Planta, nivel: number, sel: Seleccion, px: number, py: number): Objetivo {
  if (sel?.tipo === 'modulo') {
    const m = modulosDelNivel(p, nivel).find(x => String(x.id) === sel.id);
    if (m) { const a = posicionAsa(v, m); if (Math.hypot(px - a.px, py - a.py) <= RADIO_ASA) return { tipo: 'asa', id: String(m.id) }; }
  }
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
  arrastrando: boolean;
  colocar: Pieza | null;
  /** Espacios superpuestos bajo el dedo y si el agarrado ya estaba seleccionado: tocar otra vez alterna. */
  bajoDedo: string[];
  yaSeleccionado: boolean;
}

export interface Paso { gesto: Gesto; acciones: AccionEditor[]; vista?: Vista }

/** Dedo abajo. Tocar un espacio no seleccionado lo selecciona ya, para que se vea qué se va a mover. */
export function iniciar(c: Contexto, px: number, py: number): Paso {
  const objetivo: Objetivo = c.colocar ? { tipo: 'vacio' } : queToca(c.vista, c.planta, c.nivel, c.seleccion, px, py);
  const m = objetivo.tipo === 'vacio' ? null : c.planta.modulos.find(x => String(x.id) === objetivo.id) ?? null;
  const yaSeleccionado = c.seleccion?.tipo === 'modulo' && objetivo.tipo !== 'vacio' && c.seleccion.id === objetivo.id;
  const gesto: Gesto = {
    objetivo, px0: px, py0: py, vista0: c.vista, arrastrando: false, colocar: c.colocar,
    mod0: m ? { x: m.x, z: m.z, ancho: m.ancho, largo: m.largo } : null,
    bajoDedo: objetivo.tipo === 'modulo' ? candidatos(c.vista, c.planta, c.nivel, px, py) : [], yaSeleccionado,
  };
  const acciones: AccionEditor[] = objetivo.tipo === 'modulo' && !yaSeleccionado
    ? [{ type: 'seleccionar', seleccion: { tipo: 'modulo', id: objetivo.id } }] : [];
  return { gesto, acciones };
}

/** Dedo moviéndose. `dx`, `dy`: desplazamiento total desde el inicio, en pt. */
export function mover(g: Gesto, dx: number, dy: number): Paso {
  if (!g.arrastrando && Math.hypot(dx, dy) < UMBRAL_ARRASTRE) return { gesto: g, acciones: [] };
  const primera = !g.arrastrando;
  const gesto = primera ? { ...g, arrastrando: true } : g;
  const e = g.vista0.escala;
  if (g.objetivo.tipo === 'vacio' || !g.mod0) {
    return { gesto, acciones: [], vista: { ...g.vista0, ox: g.vista0.ox + dx, oy: g.vista0.oy + dy } };
  }
  const acciones: AccionEditor[] = primera ? [{ type: 'iniciarGesto' }] : [];
  if (g.objetivo.tipo === 'modulo') {
    acciones.push({ type: 'moverModulo', id: g.objetivo.id, x: g.mod0.x + dx / e, z: g.mod0.z + dy / e });
  } else {
    acciones.push({ type: 'redimensionar', id: g.objetivo.id, esquina: 'se',
      x: g.mod0.x + g.mod0.ancho + dx / e, z: g.mod0.z + g.mod0.largo + dy / e });
  }
  return { gesto, acciones };
}

/** Dedo arriba. `cancelado`: el sistema interrumpió el gesto (llamada, notificación…): no se coloca nada. */
export function terminar(g: Gesto, c: Contexto, cancelado = false): AccionEditor[] {
  if (g.arrastrando) return g.objetivo.tipo === 'vacio' ? [] : [{ type: 'terminarGesto' }];
  if (cancelado) return [];
  if (g.colocar) {
    const p = aPlano(c.vista, g.px0, g.py0);
    const esq = esquinaParaColocar(g.colocar.tipo, p.x, p.z);
    return [{ type: 'agregarModulo', tipo: g.colocar.tipo, nombre: g.colocar.nombre, x: esq.x, z: esq.z }];
  }
  if (g.objetivo.tipo === 'vacio' && c.seleccion) return [{ type: 'seleccionar', seleccion: null }];
  // Tocar otra vez un espacio ya seleccionado que tiene otro encima o debajo: pasa al siguiente.
  if (g.objetivo.tipo === 'modulo' && g.yaSeleccionado && g.bajoDedo.length > 1) {
    const i = g.bajoDedo.indexOf(g.objetivo.id);
    return [{ type: 'seleccionar', seleccion: { tipo: 'modulo', id: g.bajoDedo[(i + 1) % g.bajoDedo.length] } }];
  }
  return [];
}

/** Dos vistas iguales a efectos prácticos (para que "Ajustar vista" diga si ya estaba encuadrado). */
export const mismaVista = (a: Vista, b: Vista) =>
  Math.abs(a.escala - b.escala) < 1e-3 * b.escala && Math.abs(a.ox - b.ox) < 0.5 && Math.abs(a.oy - b.oy) < 0.5;
