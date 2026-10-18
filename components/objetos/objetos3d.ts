/**
 * DecoAR — Objetos del editor en 3D (Entrega 3b). LÓGICA PURA: sin React, sin Viro.
 * La fuente de verdad son los objetos de la planta (planEditor: Planta.muebles). Aquí solo se calcula dónde
 * va cada pieza en la escena, con el MISMO centrado y la misma altura de piso que la maqueta de
 * planGeometry (las pruebas lo comprueban contra generarMaqueta, porque esas fórmulas no se exportan).
 */
import type { Plano } from '../plan/planModel';
import type { Mueble } from '../plan/planEditor';
import { ALTO_MODULO_DEF } from '../plan/planEditor';
import { PiezaMundo, objetoPorId, piezasEnMundo } from './catalogoObjetos';

const ENTREPISO_DEF = 2.8;   // planoDe usa ALTURA_ENTREPISO_DEF = 2,80 si el plano no trae otra

/** Desplazamiento con que planGeometry centra la maqueta: centro de la extensión de todos los módulos. */
export function centradoMaqueta(p: Plano): { x: number; z: number } {
  const mods = p.modulos ?? [];
  if (!mods.length) return { x: 0, z: 0 };
  const minX = Math.min(...mods.map(m => m.x)), maxX = Math.max(...mods.map(m => m.x + m.ancho));
  const minZ = Math.min(...mods.map(m => m.z)), maxZ = Math.max(...mods.map(m => m.z + m.largo));
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
}

/** Altura de la base de un objeto: su piso (nivel × entrepiso) + su elevación; la luz de techo, bajo el techo del cuarto. */
export function baseObjeto(o: Mueble, p: Plano): number {
  const piso = (o.nivel || 0) * (typeof p.altura_entrepiso === 'number' ? p.altura_entrepiso : ENTREPISO_DEF);
  const cat = objetoPorId(o.tipo);
  if (!cat) return piso;
  if (cat.elevacion === 'techo') {
    const cuarto = (p.modulos ?? []).find(m => (m.nivel || 0) === (o.nivel || 0) && o.x >= m.x && o.x <= m.x + m.ancho && o.z >= m.z && o.z <= m.z + m.largo);
    return piso + (cuarto?.alto ?? ALTO_MODULO_DEF) - 0.1;   // "pegado al techo" (visor3d.js, luz_techo)
  }
  return piso + cat.elevacion;
}

/** Todas las piezas de los objetos (hasta el piso `hasta`, o todos), listas para una escena. */
export function objetosEnEscena(muebles: Mueble[] | undefined, p: Plano, zSign: 1 | -1, hasta: number | null = null): (PiezaMundo & { objeto: string })[] {
  const off = centradoMaqueta(p);
  const out: (PiezaMundo & { objeto: string })[] = [];
  for (const o of muebles ?? []) {
    if (hasta !== null && (o.nivel || 0) > hasta) continue;
    const cat = objetoPorId(o.tipo);
    if (!cat) continue;   // tipo desconocido: no se inventa una forma
    for (const pz of piezasEnMundo(cat, o, off, baseObjeto(o, p), zSign)) out.push({ ...pz, objeto: o.id });
  }
  return out;
}

/** Objetos del plano con piezas aproximadas (cilindros y toros dibujados como cajas). */
export function conAproximaciones(muebles: Mueble[] | undefined): string[] {
  const tipos = new Set((muebles ?? []).map(o => o.tipo));
  return [...tipos].filter(t => objetoPorId(t)?.piezas.some(p => p.aprox)).map(t => objetoPorId(t)!.nombre);
}
