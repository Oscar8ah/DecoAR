/**
 * DecoAR — Flujo "Generar 3D" (Entrega 2). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * La conversión es la acción EXISTENTE 'convertir' del reductor (planEditor.ts), la misma regla que la
 * web al generar: arco automático en cada contacto sin vano (salvo muros cerrados) y fuera los vanos
 * cuyos espacios ya no se tocan. Aquí solo se aplica y se resume qué cambió, comparando antes y después.
 */
import type { EditorPlanta } from '../plan/planEditor';
import { reducirEditor } from '../plan/planEditor';

export interface ResumenConversion { arcos: number; quitados: number; texto: string | null }

/** Aplica 'convertir'. Es un paso de deshacer; si no cambia nada, no deja paso (regla del reductor). */
export const generar3D = (e: EditorPlanta): EditorPlanta => reducirEditor(e, { type: 'convertir' });

/** Qué hizo la conversión, para decírselo al usuario. */
export function resumenConversion(antes: EditorPlanta, despues: EditorPlanta): ResumenConversion {
  const ids = (e: EditorPlanta) => new Set(e.planta.vanos.filter(v => v.id != null).map(v => String(v.id)));
  const a = ids(antes), d = ids(despues);
  const arcos = despues.planta.vanos.filter(v => v.id != null && !a.has(String(v.id))).length;
  const quitados = [...a].filter(id => !d.has(id)).length;
  const partes: string[] = [];
  if (arcos) partes.push(arcos === 1 ? 'se agregó 1 arco automático' : `se agregaron ${arcos} arcos automáticos`);
  if (quitados) partes.push(quitados === 1 ? 'se quitó 1 vano de espacios que ya no se tocan' : `se quitaron ${quitados} vanos de espacios que ya no se tocan`);
  const texto = partes.length ? `Al generar ${partes.join(' y ')}. Puedes deshacerlo desde el plano.` : null;
  return { arcos, quitados, texto };
}

/** Pantallas del flujo P1 (las de AppInicio). */
export type Etapa = 'editor2d' | 'revision3d' | 'maqueta3dAR';

/** A dónde lleva "volver" desde cada pantalla: nunca deja al usuario sin salida. */
export const volverDesde = (e: Etapa): Etapa => (e === 'maqueta3dAR' ? 'revision3d' : 'editor2d');
