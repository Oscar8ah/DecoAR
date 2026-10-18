/**
 * DecoAR — Contactos y vanos en el lienzo 2D (entrega 1b-3). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * No reimplementa ninguna regla: CONSULTA planEditor.ts.
 *   · Dónde va un "+": contactosPlanta() y claveMuro(), con el mismo criterio de la web
 *     (visor3d.js:7534-7553): cada muro que se toca, del piso visible, que aún no tiene vano.
 *   · Qué vanos se perderían por estar entre espacios que ya no se tocan: se aplica la acción
 *     'convertir' REAL sobre una copia y se mira cuáles desaparecen (la web los quita igual, al
 *     generar el 3D: visor3d.js:8335).
 */
import type { Contacto, EditorPlanta, Planta } from '../plan/planEditor';
import { claveMuro, contactosPlanta, reducirEditor } from '../plan/planEditor';
import type { Vano } from '../plan/planModel';

/**
 * Un "+" sobre un muro compartido: dónde está (metros del plano) y qué contacto crea al tocarlo.
 * `cerrado`: el usuario marcó "−" en ese muro (está en murosCerrados): no tendrá paso al generar el 3D.
 */
export interface BotonMas { contacto: Contacto; x: number; z: number; exterior: boolean; cerrado: boolean }

/** El "−" va junto al "+", a lo largo del muro, fuera del área táctil del "+" (22 pt): nunca se confunden. */
export const SEPARACION_MENOS = 40;   // pt entre el centro del "+" y el del "−"
export const RADIO_MENOS = 17;        // pt: se toca en un círculo de 34 pt
export const posicionMenos = (pMas: { px: number; py: number }, lado: Contacto['lado']) =>
  (lado === 'norte' || lado === 'sur') ? { px: pMas.px + SEPARACION_MENOS, py: pMas.py } : { px: pMas.px, py: pMas.py + SEPARACION_MENOS };

/** Los "+" del piso visible: un contacto entre espacios que no tiene ningún vano en ese muro. */
export function botonesMas(p: Planta, nivel: number): BotonMas[] {
  const out: BotonMas[] = [];
  for (const c of contactosPlanta(p)) {
    if ((c.nivel || 0) !== nivel) continue;
    if (p.vanos.some(v => claveMuro(v) === claveMuro(c))) continue;
    const a = p.modulos.find(m => String(m.id) === c.modulo_a);
    if (!a) continue;
    const med = (c.ini + c.fin) / 2;
    const pos = c.lado === 'norte' ? { x: med, z: a.z }
      : c.lado === 'sur' ? { x: med, z: a.z + a.largo }
      : c.lado === 'oeste' ? { x: a.x, z: med }
      : { x: a.x + a.ancho, z: med };
    out.push({ contacto: c, ...pos, exterior: !!c.exterior, cerrado: p.murosCerrados.includes(claveMuro(c)) });
  }
  return out;
}

/** Eje a lo largo del muro de un vano: x en muros norte/sur, z en muros oeste/este (como `centro`). */
export const ejeVano = (v: Pick<Vano, 'lado'>): 'x' | 'z' => (v.lado === 'norte' || v.lado === 'sur' ? 'x' : 'z');

/** Vanos con id: los únicos que el reductor puede mover, cambiar o borrar (todas sus acciones van por id). */
export const tieneId = (v: Vano) => v.id !== undefined && v.id !== null && String(v.id) !== '';

/**
 * Ids de los vanos que desaparecerían al generar el 3D porque sus espacios ya no se tocan.
 * Usa la acción 'convertir' del reductor sobre una copia: misma regla, sin duplicarla.
 */
export function vanosQueSeQuitarian(e: EditorPlanta): Set<string> {
  const antes = e.planta.vanos.filter(tieneId).map(v => String(v.id));
  if (!antes.length || !e.planta.modulos.length) return new Set();
  const despues = new Set(reducirEditor(e, { type: 'convertir' }).planta.vanos.map(v => String(v.id)));
  return new Set(antes.filter(id => !despues.has(id)));
}

export const NOMBRE_VANO: Record<string, string> = { arco: 'Arco', vano: 'Vano', puerta: 'Puerta', ventana: 'Ventana' };
