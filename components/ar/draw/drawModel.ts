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
 *   4. Edición estilo Maya sobre la figura SELECCIONADA (piso u objeto):
 *        - vértice: se mueve libre, con imán de alineación a los ejes de la figura;
 *        - lado: se desplaza por su normal saliente (sus dos vértices juntos);
 *        - figura completa: traslación rígida (mover el piso arrastra sus objetos).
 *   5. Deshacer / rehacer con historial. Un arrastre entero cuenta como UN paso:
 *      'beginEdit' guarda el "antes" y los cuadros intermedios no llenan el historial.
 *   6. 'importFloor': convierte el piso que detectó ARKit/ARCore en una figura
 *      editable (puente entre detección automática e intervención humana).
 *
 * Reglas geométricas: toda figura debe ser simple (sin lados cruzados), sin lados
 * degenerados (< MIN_EDGE), con área mínima, y los objetos deben quedar DENTRO del
 * piso. Un movimiento que rompa una regla se rechaza y deja un mensaje en el HUD.
 */

export type Vec3 = [number, number, number];
type Vec2 = [number, number];

export const CLOSE_DIST = 0.15;      // m: radio de "imán" hacia el primer punto para cerrar
export const MIN_POINT_GAP = 0.03;   // m: ignora un "+" repetido en el mismo sitio
export const MIN_EDGE = 0.05;        // m: un lado más corto se considera degenerado
export const MIN_FLOOR_AREA = 0.05;  // m²
export const MIN_HOLE_AREA = 0.01;   // m²
export const AXIS_SNAP = 0.04;       // m: imán de alineación al mover un vértice
export const HISTORY_LIMIT = 60;     // pasos de deshacer guardados

export type Phase = 'floor' | 'floorDone' | 'hole';
/** Qué figura se edita: el piso, o el objeto (hueco) número i. */
export type Target = 'floor' | number;

/** La parte del estado que entra en el historial (deshacer/rehacer). */
export interface Geometry {
  phase: Phase;
  floor: Vec3[] | null;   // contorno del piso, cerrado
  holes: Vec3[][];        // objetos marcados por el humano
  current: Vec3[];        // polígono en construcción (piso u objeto, según phase)
}

export interface DrawState extends Geometry {
  message: string | null;   // aviso puntual para el HUD
  selected: Target | null;  // figura en edición
  past: Geometry[];
  future: Geometry[];
  gesture: boolean;         // hay un arrastre en curso (su "antes" ya está en past)
  axisSnapped: boolean;     // el último movimiento de vértice quedó alineado por el imán
}

export type DrawAction =
  | { type: 'add'; point: Vec3 }
  | { type: 'close' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset' }
  | { type: 'startHole' }
  | { type: 'cancelHole' }
  | { type: 'select'; target: Target | null }
  | { type: 'cycleSelection' }
  | { type: 'deleteSelected' }
  | { type: 'beginEdit' }
  | { type: 'endEdit' }
  | { type: 'dragEdge'; edge: number; amount: number; target?: Target }
  | { type: 'dragVertex'; index: number; to: Vec3; target?: Target; snap?: boolean }
  | { type: 'translate'; delta: Vec3; target?: Target }
  | { type: 'importFloor'; polygon: Vec3[] };

type EditAction = Extract<DrawAction, { type: 'dragEdge' | 'dragVertex' | 'translate' }>;

export const initialDrawState = (): DrawState => ({
  phase: 'floor', floor: null, holes: [], current: [], message: null,
  selected: null, past: [], future: [], gesture: false, axisSnapped: false,
});

// ───────────────────────────── Geometría ─────────────────────────────

export const distXZ = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** Área con signo en planta: > 0 si el contorno gira en un sentido, < 0 en el otro. */
export function signedAreaXZ(poly: Vec3[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[2] - b[0] * a[2];
  }
  return s / 2;
}

export const areaXZ = (poly: Vec3[]): number => Math.abs(signedAreaXZ(poly));

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

export function minEdgeXZ(poly: Vec3[]): number {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, distXZ(poly[i], poly[(i + 1) % poly.length]));
  return m;
}

/** ¿La figura `inner` queda entera dentro de `outer`? (vértices dentro y ningún lado cruzando el borde) */
export function polygonInsideXZ(inner: Vec3[], outer: Vec3[]): boolean {
  if (!inner.every(p => pointInPolygonXZ(p, outer))) return false;
  for (let i = 0; i < inner.length; i++)
    for (let j = 0; j < outer.length; j++)
      if (segmentsCross(inner[i], inner[(i + 1) % inner.length], outer[j], outer[(j + 1) % outer.length])) return false;
  return true;
}

/**
 * Normal saliente (en planta) del lado i, apuntando hacia afuera de la forma.
 * Se decide con el SENTIDO de giro del contorno (área con signo), no con el centroide:
 * el centroide falla en figuras cóncavas (habitaciones en L) y el lado se estiraba al revés.
 */
export function outwardNormal(poly: Vec3[], i: number): Vec2 {
  const a = poly[i], b = poly[(i + 1) % poly.length];
  const dx = b[0] - a[0], dz = b[2] - a[2];
  const L = Math.hypot(dx, dz) || 1;
  return signedAreaXZ(poly) >= 0 ? [dz / L, -dx / L] : [-dz / L, dx / L];
}

/**
 * Imán de alineación al mover el vértice i: si el punto queda a menos de AXIS_SNAP
 * de la línea "recta" respecto a un vecino (en los ejes de la propia figura), se pega.
 * Los ejes salen del lado más largo que NO toca el vértice, para que no giren mientras se arrastra.
 */
export function axisSnap(poly: Vec3[], i: number, p: Vec3, tol = AXIS_SNAP): { point: Vec3; snapped: boolean } {
  const n = poly.length;
  let best = -1, bestLen = 0;
  for (let k = 0; k < n; k++) {
    if (k === i || (k + 1) % n === i) continue;
    const len = distXZ(poly[k], poly[(k + 1) % n]);
    if (len > bestLen) { bestLen = len; best = k; }
  }
  let u: Vec2 = [1, 0];
  if (best >= 0 && bestLen > 1e-6) {
    const a = poly[best], b = poly[(best + 1) % n];
    u = [(b[0] - a[0]) / bestLen, (b[2] - a[2]) / bestLen];
  }
  const v: Vec2 = [-u[1], u[0]];
  const U = (q: Vec3) => q[0] * u[0] + q[2] * u[1];
  const V = (q: Vec3) => q[0] * v[0] + q[2] * v[1];
  let pu = U(p), pv = V(p), snapped = false;
  const A = poly[(i - 1 + n) % n], B = poly[(i + 1) % n];
  for (const q of [A, B]) if (Math.abs(pu - U(q)) < tol) { pu = U(q); snapped = true; break; }
  for (const q of [A, B]) if (Math.abs(pv - V(q)) < tol) { pv = V(q); snapped = true; break; }
  return { point: [u[0] * pu + v[0] * pv, p[1], u[1] * pu + v[1] * pv], snapped };
}

/**
 * Simplifica un contorno: quita el vértice que MENOS se desvía de la recta entre sus
 * vecinos, mientras esa desviación sea menor que `tol` metros. El contorno del piso
 * detectado trae decenas de puntos; editar 40 esquinas con el dedo es imposible.
 * (Se usa la desviación y no el área del triángulo: con el área, el ruido de 1 cm en
 *  un lado de 5 m parece "grande" y quedan vértices sobrantes.)
 */
export function simplifyPolygon(poly: Vec3[], tol = 0.05, minPoints = 3): Vec3[] {
  const pts = [...poly];
  const dev = (a: Vec3, b: Vec3, c: Vec3) => {
    const base = distXZ(a, c);
    const twiceArea = Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]));
    return base < 1e-6 ? distXZ(a, b) : twiceArea / base;
  };
  while (pts.length > minPoints) {
    let k = -1, m = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = dev(pts[(i - 1 + pts.length) % pts.length], pts[i], pts[(i + 1) % pts.length]);
      if (d < m) { m = d; k = i; }
    }
    if (m >= tol) break;
    pts.splice(k, 1);
  }
  return pts;
}

/** Si la mira está cerca del primer punto (y ya hay forma), se "pega" a él, como el imán del Medir. */
export function snapReticle(state: DrawState, reticle: Vec3 | null): { point: Vec3 | null; snapped: boolean } {
  if (!reticle) return { point: null, snapped: false };
  const c = state.current;
  if (c.length >= 3 && distXZ(reticle, c[0]) < CLOSE_DIST) return { point: c[0], snapped: true };
  return { point: reticle, snapped: false };
}

// ───────────────────────────── Validación ─────────────────────────────

const polyOf = (s: Geometry, t: Target): Vec3[] | null => (t === 'floor' ? s.floor : s.holes[t] ?? null);

/** ¿Qué regla rompería esta figura? null si es válida. */
function problem(s: Geometry, t: Target, poly: Vec3[]): string | null {
  if (poly.length < 3) return 'Se necesitan al menos 3 puntos';
  if (!isSimplePolygon(poly)) return 'Los lados se cruzan';
  if (minEdgeXZ(poly) < MIN_EDGE) return 'Dos esquinas quedarían demasiado juntas';
  if (t === 'floor') {
    if (areaXZ(poly) < MIN_FLOOR_AREA) return 'La superficie quedaría demasiado pequeña';
    if (s.holes.some(h => !polygonInsideXZ(h, poly))) return 'Un objeto marcado quedaría fuera del piso';
  } else {
    if (areaXZ(poly) < MIN_HOLE_AREA) return 'El objeto quedaría demasiado pequeño';
    if (s.floor && !polygonInsideXZ(poly, s.floor)) return 'El objeto debe quedar dentro del piso';
  }
  return null;
}

// ───────────────────────────── Historial ─────────────────────────────

const geo = (s: Geometry): Geometry => ({ phase: s.phase, floor: s.floor, holes: s.holes, current: s.current });
const sameGeo = (a: Geometry, b: Geometry) =>
  a.phase === b.phase && a.floor === b.floor && a.holes === b.holes && a.current === b.current;

/** Si la geometría cambió, guarda el "antes" en el historial y vacía el rehacer. */
function commit(prev: DrawState, next: DrawState): DrawState {
  if (sameGeo(prev, next)) return next;
  return { ...next, past: [...prev.past, geo(prev)].slice(-HISTORY_LIMIT), future: [] };
}

/** Selección coherente con la geometría actual (tras deshacer, un objeto puede no existir ya). */
function fixSelection(s: DrawState): DrawState {
  let sel = s.selected;
  if (typeof sel === 'number' && sel >= s.holes.length) sel = s.floor ? 'floor' : null;
  if (sel === 'floor' && !s.floor) sel = null;
  if (sel === null && s.phase === 'floorDone' && s.floor) sel = 'floor';
  return sel === s.selected ? s : { ...s, selected: sel };
}

/** Termina un arrastre. Si al final no cambió nada, retira el "antes" que había guardado. */
function endGesture(s: DrawState): DrawState {
  if (!s.gesture) return s;
  const top = s.past[s.past.length - 1];
  if (top && sameGeo(top, s)) return { ...s, gesture: false, axisSnapped: false, past: s.past.slice(0, -1) };
  return { ...s, gesture: false, axisSnapped: false };
}

// ───────────────────────────── Edición ─────────────────────────────

function setPoly(s: DrawState, t: Target, poly: Vec3[]): DrawState {
  return t === 'floor' ? { ...s, floor: poly } : { ...s, holes: s.holes.map((h, k) => (k === t ? poly : h)) };
}

function tryEdit(s: DrawState, t: Target, poly: Vec3[], snapped: boolean): DrawState {
  const err = problem(s, t, poly);
  if (err) return s.message === err ? s : { ...s, message: err, axisSnapped: false };
  return { ...setPoly(s, t, poly), message: null, axisSnapped: snapped };
}

function applyEdit(s: DrawState, a: EditAction): DrawState {
  if (s.phase !== 'floorDone') return s;           // no se edita mientras se marca un objeto
  const t: Target = a.target ?? s.selected ?? 'floor';
  const poly = polyOf(s, t);
  if (!poly) return s;
  const n = poly.length;

  switch (a.type) {
    case 'dragEdge': {
      const i = a.edge;
      if (i < 0 || i >= n || !Number.isFinite(a.amount)) return s;
      const nrm = outwardNormal(poly, i);
      const moved = poly.map((p, k) =>
        k === i || k === (i + 1) % n ? [p[0] + nrm[0] * a.amount, p[1], p[2] + nrm[1] * a.amount] as Vec3 : p);
      return tryEdit(s, t, moved, false);
    }
    case 'dragVertex': {
      const i = a.index;
      if (i < 0 || i >= n || !a.to.every(Number.isFinite)) return s;
      let p: Vec3 = [a.to[0], poly[i][1], a.to[2]];   // el vértice nunca sale del plano de la figura
      let snapped = false;
      if (a.snap !== false) ({ point: p, snapped } = axisSnap(poly, i, p));
      return tryEdit(s, t, poly.map((q, k) => (k === i ? p : q)), snapped);
    }
    case 'translate': {
      const [dx, , dz] = a.delta;                      // solo en el plano: la altura no cambia
      if (!Number.isFinite(dx) || !Number.isFinite(dz)) return s;
      const mv = (p: Vec3): Vec3 => [p[0] + dx, p[1], p[2] + dz];
      // Mover el piso arrastra sus objetos: si el dibujo entero quedó corrido respecto
      // al cuarto real, se corrige todo junto sin desarmar lo que ya se marcó.
      if (t === 'floor') return { ...s, floor: poly.map(mv), holes: s.holes.map(h => h.map(mv)), message: null };
      return tryEdit(s, t, poly.map(mv), false);
    }
  }
}

function closeCurrent(s: DrawState): DrawState {
  const poly = s.current;
  if (s.phase === 'floor') {
    const err = problem({ ...s, holes: [] }, 'floor', poly);
    if (err) return { ...s, message: err };
    return { ...s, phase: 'floorDone', floor: poly, current: [], message: null, selected: 'floor' };
  }
  const err = problem(s, s.holes.length, poly);
  if (err) return { ...s, message: err };
  return { ...s, phase: 'floorDone', holes: [...s.holes, poly], current: [], message: null, selected: s.holes.length };
}

// ───────────────────────────── Reductor ─────────────────────────────

export function drawReducer(state: DrawState, a: DrawAction): DrawState {
  switch (a.type) {
    case 'beginEdit': {
      const s = endGesture(state);
      return { ...s, gesture: true, past: [...s.past, geo(s)].slice(-HISTORY_LIMIT) };
    }
    case 'endEdit':
      return endGesture(state);

    case 'dragEdge':
    case 'dragVertex':
    case 'translate': {
      const next = applyEdit(state, a);
      if (sameGeo(next, state)) return next;
      // Dentro de un arrastre el "antes" ya está guardado: solo se invalida el rehacer.
      return state.gesture ? (next.future.length ? { ...next, future: [] } : next) : commit(state, next);
    }

    case 'undo': {
      const s = endGesture(state);
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return fixSelection({ ...s, ...prev, past: s.past.slice(0, -1),
        future: [geo(s), ...s.future].slice(0, HISTORY_LIMIT), message: null });
    }
    case 'redo': {
      const s = endGesture(state);
      if (!s.future.length) return s;
      const next = s.future[0];
      return fixSelection({ ...s, ...next, future: s.future.slice(1),
        past: [...s.past, geo(s)].slice(-HISTORY_LIMIT), message: null });
    }

    case 'select': {
      const t = a.target;
      const ok = t === null || (t === 'floor' ? !!state.floor : t >= 0 && t < state.holes.length);
      return ok ? { ...state, selected: t, message: null } : state;
    }
    case 'cycleSelection': {
      if (!state.floor) return state;
      const order: Target[] = ['floor', ...state.holes.map((_, k) => k)];
      const i = state.selected === null ? -1 : order.indexOf(state.selected);
      return { ...state, selected: order[(i + 1) % order.length], message: null };
    }
  }

  // Acciones discretas: cada una es un paso del historial.
  const s = endGesture(state);
  let next: DrawState = s;
  switch (a.type) {
    case 'add': {
      if (s.phase === 'floorDone') return s;
      const c = s.current;
      if (c.length >= 3 && distXZ(a.point, c[0]) < CLOSE_DIST) next = closeCurrent(s);
      else if (c.length && distXZ(a.point, c[c.length - 1]) < MIN_POINT_GAP) return s;
      else next = { ...s, current: [...c, a.point], message: null };
      break;
    }
    case 'close':
      if (s.phase === 'floorDone') return s;
      next = closeCurrent(s);
      break;
    case 'reset':   // se puede deshacer: el historial se conserva
      next = { ...s, phase: 'floor', floor: null, holes: [], current: [], selected: null, message: null };
      break;
    case 'startHole':
      if (s.phase !== 'floorDone') return s;
      next = { ...s, phase: 'hole', current: [], message: null };
      break;
    case 'cancelHole':
      if (s.phase !== 'hole') return s;
      next = { ...s, phase: 'floorDone', current: [], message: null };
      break;
    case 'deleteSelected': {
      if (typeof s.selected !== 'number') return { ...s, message: 'Para borrar el piso usa la papelera' };
      const k = s.selected;
      next = { ...s, holes: s.holes.filter((_, j) => j !== k), selected: 'floor', message: null };
      break;
    }
    case 'importFloor': {
      if (s.floor) return { ...s, message: 'Ya hay un piso dibujado: bórralo para usar el detectado' };
      const poly = simplifyPolygon(a.polygon);
      const err = problem({ ...s, holes: [] }, 'floor', poly);
      if (err) return { ...s, message: `El piso detectado no sirve todavía: ${err.toLowerCase()}` };
      next = { ...s, phase: 'floorDone', floor: poly, current: [], selected: 'floor', message: null };
      break;
    }
  }
  return fixSelection(commit(s, next));
}

// ───────────────────────────── Estadísticas para el HUD ─────────────────────────────

export interface DrawStats {
  phase: Phase;
  points: number;          // del polígono en construcción
  floorArea: number;       // m², piso menos objetos
  floorPerimeter: number;  // m
  holes: number;
  liveLength: number | null; // m: del último punto a la mira (la "línea viva")
  snapped: boolean;
  message: string | null;
  selected: Target | null;
  selectedLabel: string | null;
  selectedArea: number | null;
  canUndo: boolean;
  canRedo: boolean;
  axisSnapped: boolean;
}

export const targetLabel = (t: Target | null): string | null =>
  t === null ? null : t === 'floor' ? 'Piso' : `Objeto ${t + 1}`;

export function drawStats(s: DrawState, reticle: Vec3 | null): DrawStats {
  const { point, snapped } = snapReticle(s, reticle);
  const last = s.current[s.current.length - 1];
  const sel = s.selected !== null ? polyOf(s, s.selected) : null;
  return {
    phase: s.phase,
    points: s.current.length,
    floorArea: s.floor ? Math.max(0, areaXZ(s.floor) - s.holes.reduce((t, h) => t + areaXZ(h), 0)) : 0,
    floorPerimeter: s.floor ? perimeterXZ(s.floor, true) : 0,
    holes: s.holes.length,
    liveLength: last && point ? distXZ(last, point) : null,
    snapped,
    message: s.message,
    selected: s.selected,
    selectedLabel: targetLabel(s.selected),
    selectedArea: sel ? areaXZ(sel) : null,
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
    axisSnapped: s.axisSnapped,
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