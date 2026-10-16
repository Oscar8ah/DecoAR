/**
 * DecoAR — Geometría del editor sobre la mesa (lógica pura, probada sin teléfono).
 * ------------------------------------------------------------------
 * Tres marcos de referencia, y cómo pasa uno al otro:
 *
 *   MUNDO (ARKit)  ──worldToLocal(ancla)──▶  ANCLA (la mesa)  ──− punto tocado, ÷ escala──▶  PLANO (metros reales)
 *
 * La escena cuelga el proyecto así: ViroARPlane(ancla) → ViroNode(punto tocado) → ViroNode(escala) → contenido.
 * Dentro de ese último nodo, un punto del plano (x, y, z) se dibuja en (x, y, Z_SIGN·z): la misma
 * convención con la que ya se dibujan las cajas de la maqueta (MaquetaScene.tsx).
 *
 * El ORIGEN del plano es el punto de la mesa que se tocó y no se recentra nunca mientras se edita:
 * añadir o estirar un espacio no desplaza a los demás.
 */
import { Vec3, localToWorld, worldToLocal } from '../ar/spatial/roomModel';
import { Modulo } from './planModel';
import { Esquina } from './planEditor';

export const Z_SIGN = -1;   // misma convención que MaquetaScene.tsx y RoomScanScene.tsx

/** Pose del ancla de la mesa, tal como la entrega ARKit (VRTARUtils): posición y giro en grados. */
export interface PoseAncla { position: Vec3; rotation: Vec3 }

/** Lo que la escena de maqueta le ofrece al contenido editable, ya resuelto con el ancla vigente. */
export interface ContextoMesa {
  escala: number;                                   // p. ej. 1/20
  lado: [number, number];                           // tamaño de la superficie detectada (m)
  aPlano: (mundo: number[]) => { x: number; z: number } | null;
  aMundo: (x: number, y: number, z: number) => Vec3 | null;
  planoDeArrastre: { planePoint: Vec3; planeNormal: Vec3 } | null;
}

/** Mundo → plano (metros reales). Se proyecta sobre la mesa: la altura del dedo no importa. */
export function mundoAPlano(pose: PoseAncla, tapLocal: Vec3, escala: number, mundo: Vec3): { x: number; z: number } {
  const l = worldToLocal(pose.position, pose.rotation, mundo);
  return { x: (l[0] - tapLocal[0]) / escala, z: (Z_SIGN * (l[2] - tapLocal[2])) / escala };
}

/** Plano (metros reales, y = altura sobre la mesa) → mundo. Inversa exacta de mundoAPlano en la mesa. */
export function planoAMundo(pose: PoseAncla, tapLocal: Vec3, escala: number, x: number, y: number, z: number): Vec3 {
  const local: Vec3 = [tapLocal[0] + x * escala, tapLocal[1] + y * escala, tapLocal[2] + Z_SIGN * z * escala];
  return localToWorld(pose.position, pose.rotation, local);
}

/** Plano de arrastre en MUNDO: pasa por el punto tocado y su normal es la "arriba" de la mesa. */
export function planoDeArrastre(pose: PoseAncla, tapLocal: Vec3): { planePoint: Vec3; planeNormal: Vec3 } {
  const p0 = localToWorld(pose.position, pose.rotation, [0, 0, 0]);
  const p1 = localToWorld(pose.position, pose.rotation, [0, 1, 0]);
  const n: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const len = Math.hypot(n[0], n[1], n[2]) || 1;
  return { planePoint: localToWorld(pose.position, pose.rotation, tapLocal), planeNormal: [n[0] / len, n[1] / len, n[2] / len] };
}

/**
 * `onDrag` de Viro entrega tres números sin decir su espacio (VRTNode.mm:1776). La documentación dice
 * "mundo", pero no está verificado en el motor instalado. Al empezar cada arrastre se compara con la
 * posición esperada del asa en ambos espacios y se elige el más cercano. El resultado se registra.
 */
export function espacioDeArrastre(dragToPos: number[], esperadoMundo: Vec3, esperadoLocal: Vec3): 'mundo' | 'local' {
  const d = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return d(dragToPos, esperadoMundo) <= d(dragToPos, esperadoLocal) ? 'mundo' : 'local';
}

/** Posición de un asa dentro del nodo con escala (sus "coordenadas locales" para Viro). */
export const localDePlano = (x: number, y: number, z: number): Vec3 => [x, y, Z_SIGN * z];

/** Convierte un `dragToPos` al plano según el espacio detectado. */
export function arrastreAPlano(espacio: 'mundo' | 'local', dragToPos: number[], ctx: ContextoMesa): { x: number; z: number } | null {
  if (espacio === 'local') return { x: dragToPos[0], z: Z_SIGN * dragToPos[2] };
  return ctx.aPlano(dragToPos);
}

/** Las cuatro esquinas de un espacio en el plano. 'no' = x mín y z mín … 'se' = x máx y z máx. */
export function esquinasDe(m: Modulo): Record<Esquina, { x: number; z: number }> {
  return {
    no: { x: m.x, z: m.z },
    ne: { x: m.x + m.ancho, z: m.z },
    so: { x: m.x, z: m.z + m.largo },
    se: { x: m.x + m.ancho, z: m.z + m.largo },
  };
}

export interface Extension { minX: number; maxX: number; minZ: number; maxZ: number; cx: number; cz: number; ancho: number; largo: number }

/** Rectángulo que ocupan los espacios (null si no hay ninguno). Mismo centro que usa el generador. */
export function extensionPlanta(modulos: Modulo[]): Extension | null {
  if (!modulos.length) return null;
  const minX = Math.min(...modulos.map(m => m.x)), maxX = Math.max(...modulos.map(m => m.x + m.ancho));
  const minZ = Math.min(...modulos.map(m => m.z)), maxZ = Math.max(...modulos.map(m => m.z + m.largo));
  return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, ancho: maxX - minX, largo: maxZ - minZ };
}

/**
 * ¿Cabe la planta en la mesa a esta escala? Se compara la huella REAL sobre la mesa con la superficie
 * detectada, en ambas orientaciones, con un margen. Devuelve un aviso legible, o null si cabe.
 */
export function avisoEspacio(ext: Extension | null, escala: number, lado: [number, number], margen = 0.9): string | null {
  if (!ext) return null;
  const a = ext.ancho * escala, b = ext.largo * escala;
  const [w, h] = lado;
  const cabe = (a <= w * margen && b <= h * margen) || (a <= h * margen && b <= w * margen);
  if (cabe) return null;
  const cm = (v: number) => Math.round(v * 100);
  return `La planta ocupa ${cm(a)}×${cm(b)} cm y la mesa ${cm(w)}×${cm(h)} cm: prueba una escala menor`;
}