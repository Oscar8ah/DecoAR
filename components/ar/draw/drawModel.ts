/**
 * DecoAR — Lógica del modo "Dibujar" (detección con ayuda humana)
 * ------------------------------------------------------------------
 * Módulo puro (sin React ni Viro) para poder probarlo aislado.
 *
 * Flujo, inspirado en el Medir de iPhone:
 *   1. El usuario apunta la MIRA central al piso y presiona "+": se agrega un punto.
 *   2. Si la mira está cerca del primer punto, "+" cierra la forma.
 *   3. Con el piso cerrado, "Marcar objeto" dibuja otro polígono (la huella de
 *      un sofá, una mesa...). Ese polígono se vuelve un HUECO: la textura del
 *      piso pasa por debajo del objeto en vez de pintarse encima.
 *   4. Cada lado del piso se puede estirar (como mover un edge en Maya).
 */

export type Vec3 = [number, number, number];
type Vec2 = [number, number];

export const CLOSE_DIST = 0.15;      // m: radio de "imán" hacia el primer punto para cerrar
export const MIN_POINT_GAP = 0.03;   // m: ignora un "+" repetido en el mismo sitio

export type Phase = 'floor' | 'floorDone' | 'hole';

export interface DrawState {
  phase: Phase;
  floor: Vec3[] | null;   // contorno del piso, cerrado
  holes: Vec3[][];        // objetos marcados por el humano
  current: Vec3[];        // polígono en construcción (piso u objeto, según phase)
  message: string | null; // aviso puntual para el HUD
}

export type DrawAction =
  | { type: 'add'; point: Vec3 }
  | { type: 'close' }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'startHole' }
  | { type: 'cancelHole' }
  | { type: 'dragEdge'; edge: number; amount: number };

export const initialDrawState = (): DrawState => ({ phase: 'floor', floor: null, holes: [], current: [], message: null });

// ───────────────────────────── Geometría ─────────────────────────────

export const distXZ = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function areaXZ(poly: Vec3[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[2] - b[0] * a[2];
  }
  return Math.abs(s) / 2;
}

export function perimeterXZ(poly: Vec3[], closed: boolean): number {
  let s = 0;
  for (let i = 0; i < poly.length - (closed ? 0 : 1); i++) s += distXZ(poly[i], poly[(i + 1) % poly.length]);
  return s;
}

export function centroidXZ(poly: Vec3[]): Vec3 {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly[0]?.[1] ?? 0, poly.reduce((s, p) => s + p[2], 0) / n];
}

export function pointInPolygonXZ(p: Vec3, poly: Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, , zi] = poly[i], [xj, , zj] = poly[j];
    if ((zi > p[2]) !== (zj > p[2]) && p[0] < ((xj - xi) * (p[2] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Dos segmentos en planta (sin contar extremos compartidos) ¿se cruzan? */
function segmentsCross(a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean {
  const o = (p: Vec3, q: Vec3, r: Vec3) => (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && Math.abs(d1) > 1e-9 && Math.abs(d2) > 1e-9;
}

/** Un polígono "simple" no se cruza consigo mismo; si se cruza, la textura y el área salen mal. */
export function isSimplePolygon(poly: Vec3[]): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // lados vecinos comparten punta
      if (segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Normal saliente (en planta) del lado i del polígono, apuntando hacia afuera de la forma. */
export function outwardNormal(poly: Vec3[], i: number): Vec2 {
  const a = poly[i], b = poly[(i + 1) % poly.length];
  let n: Vec2 = [-(b[2] - a[2]), b[0] - a[0]];
  const L = Math.hypot(n[0], n[1]) || 1;
  n = [n[0] / L, n[1] / L];
  const c = centroidXZ(poly);
  const mx = (a[0] + b[0]) / 2 - c[0], mz = (a[2] + b[2]) / 2 - c[2];
  return n[0] * mx + n[1] * mz < 0 ? [-n[0], -n[1]] : n;
}

/** Si la mira está cerca del primer punto (y ya hay forma), se "pega" a él, como el imán del Medir. */
export function snapReticle(state: DrawState, reticle: Vec3 | null): { point: Vec3 | null; snapped: boolean } {
  if (!reticle) return { point: null, snapped: false };
  const c = state.current;
  if (c.length >= 3 && distXZ(reticle, c[0]) < CLOSE_DIST) return { point: c[0], snapped: true };
  return { point: reticle, snapped: false };
}

// ───────────────────────────── Reductor ─────────────────────────────

function closeCurrent(s: DrawState): DrawState {
  const poly = s.current;
  if (poly.length < 3) return { ...s, message: 'Se necesitan al menos 3 puntos' };
  if (!isSimplePolygon(poly)) return { ...s, message: 'Los lados se cruzan: deshaz el último punto' };
  if (s.phase === 'floor') return { ...s, phase: 'floorDone', floor: poly, current: [], message: null };
  // Objeto: debe quedar dentro del piso para que el hueco tenga sentido.
  if (s.floor && !poly.every(p => pointInPolygonXZ(p, s.floor!)))
    return { ...s, message: 'El objeto debe quedar dentro del piso dibujado' };
  return { ...s, phase: 'floorDone', holes: [...s.holes, poly], current: [], message: null };
}

export function drawReducer(s: DrawState, a: DrawAction): DrawState {
  switch (a.type) {
    case 'add': {
      if (s.phase === 'floorDone') return s;
      const c = s.current;
      if (c.length >= 3 && distXZ(a.point, c[0]) < CLOSE_DIST) return closeCurrent(s);
      if (c.length && distXZ(a.point, c[c.length - 1]) < MIN_POINT_GAP) return s;
      return { ...s, current: [...c, a.point], message: null };
    }
    case 'close':
      return s.phase === 'floorDone' ? s : closeCurrent(s);
    case 'undo': {
      if (s.current.length) return { ...s, current: s.current.slice(0, -1), message: null };
      if (s.phase === 'hole') return { ...s, phase: 'floorDone', message: null };
      if (s.holes.length) return { ...s, holes: s.holes.slice(0, -1), message: null };
      if (s.floor) return { ...s, phase: 'floor', current: s.floor.slice(0, -1), floor: null, message: null }; // reabre el piso
      return s;
    }
    case 'reset':
      return initialDrawState();
    case 'startHole':
      return s.phase === 'floorDone' ? { ...s, phase: 'hole', current: [], message: null } : s;
    case 'cancelHole':
      return s.phase === 'hole' ? { ...s, phase: 'floorDone', current: [], message: null } : s;
    case 'dragEdge': {
      if (!s.floor) return s;
      const f = s.floor, n = f.length, i = a.edge;
      const nrm = outwardNormal(f, i);
      const moved = f.map((p, k) =>
        k === i || k === (i + 1) % n ? [p[0] + nrm[0] * a.amount, p[1], p[2] + nrm[1] * a.amount] as Vec3 : p);
      // No permitimos que estirar un lado deforme la figura hasta cruzarse o se coma un objeto marcado.
      if (!isSimplePolygon(moved) || areaXZ(moved) < 0.05) return s;
      if (s.holes.some(h => !h.every(p => pointInPolygonXZ(p, moved)))) return s;
      return { ...s, floor: moved };
    }
  }
}

export interface DrawStats {
  phase: Phase;
  points: number;          // del polígono en construcción
  floorArea: number;       // m², piso menos objetos
  floorPerimeter: number;  // m
  holes: number;
  liveLength: number | null; // m: del último punto a la mira (la "línea viva")
  snapped: boolean;
  message: string | null;
}

export function drawStats(s: DrawState, reticle: Vec3 | null): DrawStats {
  const { point, snapped } = snapReticle(s, reticle);
  const last = s.current[s.current.length - 1];
  return {
    phase: s.phase,
    points: s.current.length,
    floorArea: s.floor ? Math.max(0, areaXZ(s.floor) - s.holes.reduce((t, h) => t + areaXZ(h), 0)) : 0,
    floorPerimeter: s.floor ? perimeterXZ(s.floor, true) : 0,
    holes: s.holes.length,
    liveLength: last && point ? distXZ(last, point) : null,
    snapped,
    message: s.message,
  };
}

/**
 * Mira central: intersección del rayo de la cámara (posición + dirección "forward")
 * con el plano horizontal del piso y = floorY. null si se apunta al horizonte o hacia arriba.
 */
export function reticleOnFloor(camPos: Vec3, forward: Vec3, floorY: number, maxDist = 12): Vec3 | null {
  if (forward[1] > -0.05) return null;               // casi paralelo al piso o mirando hacia arriba
  const t = (floorY - camPos[1]) / forward[1];
  if (t <= 0 || t > maxDist) return null;
  return [camPos[0] + forward[0] * t, floorY, camPos[2] + forward[2] * t];
}