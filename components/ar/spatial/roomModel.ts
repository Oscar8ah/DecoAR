/**
 * DecoAR — Modelo espacial de interiores
 * ------------------------------------------------------------------
 * Convierte los planos que detecta ARKit/ARCore (anclas) en un modelo
 * geométrico de la habitación en coordenadas de mundo (metros):
 *
 *   piso (plano + límites), paredes (plano, ancho, alto, línea base),
 *   esquinas (intersección de 2 paredes + piso), techo, puertas,
 *   ventanas, mesas/asientos, y una confianza por elemento.
 *
 * Módulo puro: no importa React ni Viro, para poder probarlo aislado.
 *
 * Convenciones (las mismas de ViroReact):
 *   - Mundo: Y hacia arriba, metros.
 *   - Rotación del ancla en grados, matriz R = Rz · Ry · Rx (convención real de ViroCore).
 *   - Un plano de ARKit vive en el plano XZ local del ancla; su normal es +Y local.
 *   - Los vértices del contorno vienen en coordenadas locales del ancla.
 */

export type Vec3 = [number, number, number];
type Vec2 = [number, number];

// ─────────────────────────── Álgebra básica ───────────────────────────

const DEG = Math.PI / 180;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a);
  return l < 1e-9 ? [0, 0, 0] : scale(a, 1 / l);
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

type Mat3 = [Vec3, Vec3, Vec3]; // filas

/**
 * Matriz de rotación de un ancla de Viro, a partir de sus ángulos en grados.
 *
 * Viro (ViroCore, VROQuaternion::set / toEuler, heredado de Irrlicht) usa
 * R = Rz · Ry · Rx: primero gira en X, luego en Y, luego en Z.
 * OJO: el JavaScript de ViroARPlaneSelector asume Rx·Ry·Rz, pero el motor C++
 * que genera `anchor.rotation` hace Rz·Ry·Rx. Verificado numéricamente contra
 * el código fuente de ViroCore (error 1e-15).
 */
export function rotationMatrix(deg: Vec3): Mat3 {
  const [a, b, c] = [deg[0] * DEG, deg[1] * DEG, deg[2] * DEG];
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return [
    [cb * cc, sa * sb * cc - ca * sc, ca * sb * cc + sa * sc],
    [cb * sc, sa * sb * sc + ca * cc, ca * sb * sc - sa * cc],
    [-sb, sa * cb, ca * cb],
  ];
}
const mul = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const mulT = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];

export const localToWorld = (pos: Vec3, rotDeg: Vec3, p: Vec3): Vec3 => add(pos, mul(rotationMatrix(rotDeg), p));
export const worldToLocal = (pos: Vec3, rotDeg: Vec3, p: Vec3): Vec3 => mulT(rotationMatrix(rotDeg), sub(p, pos));

/** Intersección de 3 planos n·x + d = 0 (Cramer). null si son casi paralelos. */
export function intersectThreePlanes(
  n1: Vec3, d1: number, n2: Vec3, d2: number, n3: Vec3, d3: number,
): Vec3 | null {
  const c23 = cross(n2, n3);
  const det = dot(n1, c23);
  if (Math.abs(det) < 1e-6) return null;
  const p = add(add(scale(c23, -d1), scale(cross(n3, n1), -d2)), scale(cross(n1, n2), -d3));
  return scale(p, 1 / det);
}

// ───────────────────────── Polígonos 2D (planta XZ) ─────────────────────────

const cross2 = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Envolvente convexa (Andrew monotone chain), sentido antihorario. */
export function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return pts;
  const lower: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross2(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross2(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** Área (fórmula del cordón / shoelace). */
export function polygonArea(poly: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/**
 * Recorta un polígono contra el semiplano a·x + b·z + c >= 0 (Sutherland–Hodgman).
 * Se usa para que el piso no "se salga" por detrás de una pared detectada.
 */
export function clipByHalfPlane(poly: Vec2[], a: number, b: number, c: number): Vec2[] {
  const f = (p: Vec2) => a * p[0] + b * p[1] + c;
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = f(P), fq = f(Q);
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push([P[0] + t * (Q[0] - P[0]), P[1] + t * (Q[1] - P[1])]);
    }
  }
  return out;
}

// ───────────────────────────── Tipos de salida ─────────────────────────────

export type SurfaceKind = 'floor' | 'wall' | 'ceiling' | 'door' | 'window' | 'table' | 'seat' | 'unknown';

/** Lo mínimo que necesitamos de un ancla de Viro (ViroAnchor). */
export interface AnchorLike {
  anchorId: string;
  type?: string;
  position: Vec3;
  rotation: Vec3;
  center?: Vec3;
  width?: number;
  height?: number;
  alignment?: string;
  classification?: string;
  vertices?: Vec3[];
}

export interface FloorModel {
  type: 'floor';
  y: number;                 // altura del piso en el mundo
  normal: Vec3;
  polygons: Vec3[][];        // contornos reales de ARKit, ya recortados contra paredes
  pieces: { anchorId: string; polygon: Vec3[] }[]; // lo mismo, indicando a qué ancla pertenece cada pieza
  polygon: Vec3[];           // envolvente exterior (solo referencia; NO es el área)
  area: number;              // m² de la UNIÓN real (rasterizada a 5 cm)
  center: Vec3;
  sourceAnchors: string[];
  confidence: number;
}

export interface CeilingModel {
  type: 'ceiling';
  y: number;
  area: number;
  sourceAnchors: string[];
  confidence: number;
}

export interface OpeningModel {
  type: 'door' | 'window';
  id: string;
  wallId: string | null;
  center: Vec3;
  width: number;
  height: number;
  sillHeight: number;        // distancia del borde inferior al piso
  corners: Vec3[];           // 4 esquinas en mundo
  confidence: number;
}

export interface WallModel {
  type: 'wall';
  id: string;
  keyAnchorId: string;       // ancla principal: el dibujo se cuelga de ella para seguir el tracking
  sourceAnchors: string[];
  normal: Vec3;              // horizontal, apunta hacia el interior observado
  d: number;                 // ecuación del plano: normal·x + d = 0
  yawDeg: number;            // orientación en planta
  width: number;             // m (tramo observado, extendido hasta esquinas)
  height: number;            // m
  heightSource: HeightSource;
  baseline: [Vec3, Vec3];    // línea piso–pared
  corners: [Vec3, Vec3, Vec3, Vec3]; // abajo-izq, abajo-der, arriba-der, arriba-izq
  center: Vec3;
  distanceToCamera?: number;
  openings: OpeningModel[];
  confidence: number;
}

export type HeightSource = 'ceiling' | 'observed-top' | 'estimated';

export interface CornerModel {
  id: string;
  kind: 'interior' | 'exterior'; // esquina cóncava (rincón) o convexa (columna, marco)
  walls: [string, string];
  floorPoint: Vec3;
  topPoint: Vec3;
  angleDeg: number;          // ángulo interior entre paredes
  confidence: number;
}

export interface ObjectModel {
  type: 'table' | 'seat';
  id: string;
  topHeight: number;         // altura de la superficie sobre el piso
  center: Vec3;
  footprint: Vec3[];
  area: number;
  confidence: number;
}

export interface RoomModel {
  floor: FloorModel | null;
  ceiling: CeilingModel | null;
  walls: WallModel[];
  corners: CornerModel[];
  openings: OpeningModel[];
  objects: ObjectModel[];
  roomHeight: number | null;           // solo si hay techo medido
  heightEstimate: { value: number; source: HeightSource };
  fragments: number;                   // planos verticales descartados (marcos, columnas)
  stats: { anchors: number; horizontal: number; vertical: number };
}

/**
 * Memoria entre recálculos. Hace el modelo ESTABLE en el tiempo:
 *  - wallSign: hacia qué lado mira cada pared, fijado la primera vez que se vio
 *    (ARKit detecta una pared desde su cara visible, que es la cara "interior").
 *  - floorY / planes: filtros de suavizado exponencial para quitar el temblor.
 */
export interface RoomMemory {
  wallSign: Map<string, 1 | -1>;
  floorY?: number;
  planes: Map<string, { n: Vec3; d: number }>;
}
export const createRoomMemory = (): RoomMemory => ({ wallSign: new Map(), planes: new Map() });

// ─────────────────────────── Parámetros (afinables) ───────────────────────────

export const TUNING = {
  horizontalTolDeg: 15,     // |inclinación| máxima para considerar un plano horizontal
  verticalTolDeg: 15,       // idem vertical
  floorMergeTol: 0.06,      // m: planos horizontales a ±6 cm del piso se fusionan
  minFloorArea: 0.15,       // m²
  ceilingAboveCamera: 0.25, // m: un horizontal más de esto sobre la cámara es techo
  wallMergeAngleDeg: 10,
  wallMergeDist: 0.08,      // m entre planos casi paralelos para fusionar
  wallMergeGap: 0.6,        // m de hueco máximo entre tramos coplanares
  cornerMinAngleDeg: 55,    // rango de ángulo entre paredes para buscar esquina
  cornerMaxAngleDeg: 125,
  cornerReach: 1.2,         // m: cuánto puede estar la esquina fuera del tramo observado
  minWallWidth: 0.4,        // m: por debajo es un marco/columna, no una pared
  minWallArea: 0.25,        // m²
  wallClipConfidence: 0.5,  // paredes con menos confianza no recortan el piso
  clipSpanMargin: 0.3,      // m: una pared solo recorta piso frente a su tramo (+ margen)
  minPlausibleHeight: 2.2,  // m: si lo observado es menor, la altura es estimada
  defaultWallHeight: 2.4,   // m (altura típica de vivienda) cuando no hay medición
  smoothing: 0.35,          // 0..1: peso del dato nuevo en el filtro exponencial
  rasterCell: 0.05,         // m: resolución para calcular el área de la unión del piso
};

// ─────────────────────────── Planos individuales ───────────────────────────

interface Plane {
  id: string;
  label: SurfaceKind | null;  // etiqueta ARKit (si la hay)
  normal: Vec3;
  d: number;
  origin: Vec3;
  polygon: Vec3[];            // contorno en mundo
  area: number;
  orientation: 'horizontal' | 'vertical' | 'tilted';
  tiltScore: number;          // 1 = perfectamente alineado con la gravedad
}

const LABELS: Record<string, SurfaceKind> = {
  floor: 'floor', wall: 'wall', ceiling: 'ceiling', door: 'door',
  window: 'window', table: 'table', seat: 'seat',
};

function anchorToPlane(a: AnchorLike): Plane | null {
  if (!a.position || !a.rotation) return null;
  const R = rotationMatrix(a.rotation);
  const normal = normalize(mul(R, [0, 1, 0]));
  const toWorld = (p: Vec3) => add(a.position, mul(R, p));

  let local: Vec3[];
  if (a.vertices && a.vertices.length >= 3) {
    local = a.vertices.map(v => [v[0], 0, v[2]] as Vec3);
  } else {
    // Sin contorno: rectángulo de la extensión, CENTRADO EN `center` (no en el origen del ancla).
    const c: Vec3 = a.center ?? [0, 0, 0];
    const hw = (a.width ?? 0.3) / 2, hh = (a.height ?? 0.3) / 2;
    local = [[c[0] - hw, 0, c[2] - hh], [c[0] + hw, 0, c[2] - hh], [c[0] + hw, 0, c[2] + hh], [c[0] - hw, 0, c[2] + hh]];
  }
  const polygon = local.map(toWorld);
  const area = polygonArea(local.map(v => [v[0], v[2]] as Vec2));

  const up = Math.abs(normal[1]);
  const sinV = Math.sin(TUNING.verticalTolDeg * DEG);
  const cosH = Math.cos(TUNING.horizontalTolDeg * DEG);
  let orientation: Plane['orientation'] = 'tilted';
  let tiltScore = 0;
  if (up >= cosH) { orientation = 'horizontal'; tiltScore = clamp01((up - cosH) / (1 - cosH)); }
  else if (up <= sinV) { orientation = 'vertical'; tiltScore = clamp01(1 - up / sinV); }

  const label = a.classification ? LABELS[a.classification.toLowerCase()] ?? null : null;
  return { id: a.anchorId, label, normal, d: -dot(normal, a.position), origin: a.position, polygon, area, orientation, tiltScore };
}

// ─────────────────────────── Utilidades del piso ───────────────────────────

function pointInPolygon(x: number, z: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Área de la UNIÓN de polígonos (los planos de ARKit se solapan): rasterización en celdas. */
function unionArea(polys: Vec2[][], cell: number): number {
  if (!polys.length) return 0;
  let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polys) for (const [x, z] of p) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  // Si la zona es enorme, bajamos resolución para no pasar de ~60k celdas.
  while (((x1 - x0) / cell) * ((z1 - z0) / cell) > 60000) cell *= 2;
  let count = 0;
  for (let x = x0 + cell / 2; x < x1; x += cell)
    for (let z = z0 + cell / 2; z < z1; z += cell)
      if (polys.some(p => pointInPolygon(x, z, p))) count++;
  return count * cell * cell;
}

/**
 * Resta a un polígono la franja que queda DETRÁS de una pared y dentro de SU tramo [u0, u1]:
 *   resultado = (poly ∩ u<u0) ∪ (poly ∩ u>u1) ∪ (poly ∩ u0≤u≤u1 ∩ delante)
 * Tres piezas disjuntas, cada una obtenida con recortes por semiplano.
 * Así una pared corta solo el "derrame" que tiene detrás, no el piso de otras zonas.
 */
function subtractBehindWall(poly: Vec2[], n: Vec3, d: number, t: Vec3, u0: number, u1: number): Vec2[][] {
  const left = clipByHalfPlane(poly, -t[0], -t[2], u0);                  // u ≤ u0
  const right = clipByHalfPlane(poly, t[0], t[2], -u1);                  // u ≥ u1
  let mid = clipByHalfPlane(poly, t[0], t[2], -u0);                      // u ≥ u0
  mid = clipByHalfPlane(mid, -t[0], -t[2], u1);                          // u ≤ u1
  mid = clipByHalfPlane(mid, n[0], n[2], d + 0.01);                      // delante de la pared
  return [left, right, mid].filter(p => p.length >= 3 && polygonArea(p) > 1e-4);
}

const ema = (prev: number, next: number, a: number) => prev + a * (next - prev);

// ─────────────────────────── Construcción del modelo ───────────────────────────

export function buildRoomModel(anchors: AnchorLike[], cameraPos?: Vec3, memory: RoomMemory = createRoomMemory()): RoomModel {
  const planes = anchors.filter(a => a.type !== 'image').map(anchorToPlane).filter((p): p is Plane => !!p);
  const horizontals = planes.filter(p => p.orientation === 'horizontal');
  const verticals = planes.filter(p => p.orientation === 'vertical');
  const heightOf = (p: Plane) => p.polygon.reduce((s, v) => s + v[1], 0) / p.polygon.length;
  const A = TUNING.smoothing;

  // 1. TECHO
  const isCeiling = (p: Plane) =>
    p.label === 'ceiling' || (!p.label && cameraPos !== undefined && heightOf(p) > cameraPos[1] + TUNING.ceilingAboveCamera);
  const ceilingPlanes = horizontals.filter(isCeiling);

  // 2. ALTURA DEL PISO (promedio ponderado por área + suavizado temporal)
  const floorCands = horizontals
    .filter(p => !isCeiling(p) && p.label !== 'table' && p.label !== 'seat' && p.area >= TUNING.minFloorArea)
    .sort((a, b) => heightOf(a) - heightOf(b));
  const seed = floorCands.find(p => p.label === 'floor') ?? floorCands[0];
  let floorMembers: Plane[] = [];
  let floorY = 0;
  if (seed) {
    const seedY = heightOf(seed);
    floorMembers = horizontals.filter(p => !isCeiling(p) && p.label !== 'table' && p.label !== 'seat'
      && Math.abs(heightOf(p) - seedY) <= TUNING.floorMergeTol);
    const w = floorMembers.reduce((s, p) => s + p.area, 0) || 1;
    const raw = floorMembers.reduce((s, p) => s + heightOf(p) * p.area, 0) / w;
    floorY = memory.floorY !== undefined && Math.abs(memory.floorY - raw) < 0.05 ? ema(memory.floorY, raw, A) : raw;
    memory.floorY = floorY;
  }

  const ceilingY = ceilingPlanes.length
    ? ceilingPlanes.reduce((s, p) => s + heightOf(p) * p.area, 0) / (ceilingPlanes.reduce((s, p) => s + p.area, 0) || 1)
    : null;

  // 3. PAREDES. Las puertas/ventanas también son EVIDENCIA de pared (están en su plano):
  //    así, el fondo de un pasillo que es casi todo puerta sigue siendo una pared.
  interface Group { key: string; planes: Plane[]; n: Vec3; d: number; t: Vec3; umin: number; umax: number; ymax: number; }
  const groups: Group[] = [];
  const isOpening = (p: Plane) => p.label === 'door' || p.label === 'window';
  const ordered = [...verticals].sort((a, b) => Number(isOpening(a)) - Number(isOpening(b)) || b.area - a.area);
  const planeGroup = new Map<string, Group>();

  for (const p of ordered) {
    let n = normalize([p.normal[0], 0, p.normal[2]]);
    // Orientación fijada la PRIMERA vez que se ve el plano (no cambia al cruzar a otra habitación).
    let sign = memory.wallSign.get(p.id);
    if (sign === undefined) {
      const ref = cameraPos ?? [0, floorY, 0];
      sign = dot(n, sub(ref as Vec3, p.origin)) >= 0 ? 1 : -1;
      memory.wallSign.set(p.id, sign);
    }
    n = scale(n, sign);

    const g = groups.find(g =>
      Math.abs(dot(g.n, n)) > Math.cos(TUNING.wallMergeAngleDeg * DEG) &&
      Math.abs(dot(g.n, p.origin) + g.d) < TUNING.wallMergeDist &&
      (() => { const us = p.polygon.map(v => dot(v, g.t)); return Math.min(...us) <= g.umax + TUNING.wallMergeGap && Math.max(...us) >= g.umin - TUNING.wallMergeGap; })());
    if (g) {
      // Coplanar (aunque mire al revés): adopta la orientación del grupo.
      const us = p.polygon.map(v => dot(v, g.t));
      g.umin = Math.min(g.umin, ...us); g.umax = Math.max(g.umax, ...us);
      g.ymax = Math.max(g.ymax, ...p.polygon.map(v => v[1]));
      if (!isOpening(p)) {
        const nn = dot(g.n, n) < 0 ? scale(n, -1) : n;
        const wOld = g.planes.filter(q => !isOpening(q)).reduce((s, q) => s + q.area, 0);
        if (wOld > 0) {
          g.n = normalize(add(scale(g.n, wOld), scale(nn, p.area)));
          g.d = -(wOld * dot(g.n, g.planes[0].origin) + p.area * dot(g.n, p.origin)) / (wOld + p.area);
          g.t = [-g.n[2], 0, g.n[0]];
        }
      }
      g.planes.push(p);
      planeGroup.set(p.id, g);
    } else {
      const t: Vec3 = [-n[2], 0, n[0]];
      const us = p.polygon.map(v => dot(v, t));
      const ng: Group = { key: p.id, planes: [p], n, d: -dot(n, p.origin), t,
        umin: Math.min(...us), umax: Math.max(...us), ymax: Math.max(...p.polygon.map(v => v[1])) };
      groups.push(ng);
      planeGroup.set(p.id, ng);
    }
  }

  // Suavizado temporal de cada pared (clave = su plano más grande, que es estable).
  for (const g of groups) {
    const prev = memory.planes.get(g.key);
    if (prev && dot(prev.n, g.n) > Math.cos(5 * DEG) && Math.abs(prev.d - g.d) < 0.05) {
      g.n = normalize([ema(prev.n[0], g.n[0], A), 0, ema(prev.n[2], g.n[2], A)]);
      g.d = ema(prev.d, g.d, A);
      g.t = [-g.n[2], 0, g.n[0]];
    }
    memory.planes.set(g.key, { n: g.n, d: g.d });
  }

  // Descartamos fragmentos: marcos de puerta, columnas delgadas, reflejos.
  const area = (g: Group) => g.planes.reduce((s, q) => s + q.area, 0);
  const validGroups = groups.filter(g => g.umax - g.umin >= TUNING.minWallWidth && area(g) >= TUNING.minWallArea);
  const fragments = groups.length - validGroups.length;

  // 4. ALTURA consensuada: todas las paredes de una vivienda comparten altura.
  let heightEstimate: RoomModel['heightEstimate'];
  if (ceilingY !== null && seed) {
    heightEstimate = { value: ceilingY - floorY, source: 'ceiling' };
  } else {
    const observed = Math.max(0, ...validGroups.map(g => g.ymax - floorY));
    heightEstimate = observed >= TUNING.minPlausibleHeight
      ? { value: observed, source: 'observed-top' }
      : { value: Math.max(observed, TUNING.defaultWallHeight), source: 'estimated' };
  }
  const H = heightEstimate.value;

  // 5. ESQUINAS: pared ∩ pared ∩ piso (sistema 3×3).
  const floorN: Vec3 = [0, 1, 0];
  const corners: CornerModel[] = [];
  const idx = new Map(validGroups.map((g, i) => [g, i]));
  for (let i = 0; i < validGroups.length; i++) {
    for (let j = i + 1; j < validGroups.length; j++) {
      const Ga = validGroups[i], Gb = validGroups[j];
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(Ga.n, Gb.n)))) / DEG;
      if (ang < TUNING.cornerMinAngleDeg || ang > TUNING.cornerMaxAngleDeg) continue;
      const P = intersectThreePlanes(Ga.n, Ga.d, Gb.n, Gb.d, floorN, -floorY);
      if (!P) continue;
      const uA = dot(P, Ga.t), uB = dot(P, Gb.t);
      const r = TUNING.cornerReach;
      const gapA = Math.max(0, Ga.umin - uA, uA - Ga.umax), gapB = Math.max(0, Gb.umin - uB, uB - Gb.umax);
      if (gapA > r || gapB > r) continue;
      // ¿Rincón o esquina saliente? Si la pared B se aleja de P hacia el FRENTE de A, es rincón.
      const dirB = scale(Gb.t, Math.sign((Gb.umin + Gb.umax) / 2 - uB) || 1);
      const kind: CornerModel['kind'] = dot(Ga.n, dirB) > 0 ? 'interior' : 'exterior';
      Ga.umin = Math.min(Ga.umin, uA); Ga.umax = Math.max(Ga.umax, uA);
      Gb.umin = Math.min(Gb.umin, uB); Gb.umax = Math.max(Gb.umax, uB);
      corners.push({
        id: `corner-${Ga.key}-${Gb.key}`, kind, walls: [`wall-${idx.get(Ga)}`, `wall-${idx.get(Gb)}`],
        floorPoint: P, topPoint: [P[0], floorY + H, P[2]],
        angleDeg: kind === 'interior' ? 180 - ang : 180 + ang,
        confidence: clamp01(1 - Math.abs(ang - 90) / 45) * clamp01(1 - (gapA + gapB) / (2 * r)),
      });
    }
  }

  // 6. Paredes finales.
  const walls: WallModel[] = validGroups.map((g, i) => {
    const p0 = scale(g.n, -g.d);
    const base = (u: number): Vec3 => { const q = add(p0, scale(g.t, u - dot(p0, g.t))); return [q[0], floorY, q[2]]; };
    const bl = base(g.umin), br = base(g.umax);
    const tr: Vec3 = [br[0], floorY + H, br[2]], tl: Vec3 = [bl[0], floorY + H, bl[2]];
    const solid = g.planes.filter(q => !isOpening(q));
    const labelScore = solid.some(q => q.label === 'wall') ? 1 : solid.length ? 0.6 : 0.5;
    const cornerBonus = corners.some(c => c.walls.includes(`wall-${i}`)) ? 0.1 : 0;
    return {
      type: 'wall', id: `wall-${i}`, keyAnchorId: g.key, sourceAnchors: g.planes.map(q => q.id),
      normal: g.n, d: g.d, yawDeg: Math.atan2(g.n[0], g.n[2]) / DEG,
      width: g.umax - g.umin, height: H, heightSource: heightEstimate.source,
      baseline: [bl, br], corners: [bl, br, tr, tl],
      center: [(bl[0] + br[0]) / 2, floorY + H / 2, (bl[2] + br[2]) / 2],
      distanceToCamera: cameraPos ? Math.abs(dot(g.n, cameraPos) + g.d) : undefined,
      openings: [],
      confidence: clamp01(0.3 * labelScore + 0.3 * clamp01(area(g) / 1.5)
        + 0.2 * Math.min(...g.planes.map(q => q.tiltScore)) + 0.1 * (seed ? 1 : 0) + cornerBonus),
    };
  });
  const wallOfGroup = new Map(validGroups.map((g, i) => [g, walls[i]]));

  // 7. PISO: cada contorno real de ARKit se recorta SOLO contra las paredes que tiene enfrente
  //    y dentro del tramo de esa pared. Un piso que está detrás de una pared (otra habitación)
  //    se conserva: pertenece a ese otro cuarto.
  let floor: FloorModel | null = null;
  if (seed) {
    const clipped: Vec2[][] = [];
    const pieceOwner: string[] = [];
    for (const m of floorMembers) {
      let pieces: Vec2[][] = [m.polygon.map(v => [v[0], v[2]] as Vec2)];
      const cx = pieces[0].reduce((s, v) => s + v[0], 0) / pieces[0].length;
      const cz = pieces[0].reduce((s, v) => s + v[1], 0) / pieces[0].length;
      for (let i = 0; i < validGroups.length; i++) {
        const g = validGroups[i];
        if (walls[i].confidence < TUNING.wallClipConfidence) continue;
        if (g.n[0] * cx + g.n[2] * cz + g.d < 0.05) continue;   // el parche está detrás: es de otro cuarto
        pieces = pieces.flatMap(pc => subtractBehindWall(pc, g.n, g.d, g.t, g.umin - 0.05, g.umax + 0.05));
      }
      for (const pc of pieces) if (pc.length >= 3 && polygonArea(pc) > 0.01) { clipped.push(pc); pieceOwner.push(m.id); }
    }
    const all = clipped.flat();
    const hull = convexHull(all);
    const unionA = unionArea(clipped, TUNING.rasterCell);
    const labelScore = floorMembers.some(p => p.label === 'floor') ? 1 : 0.6;
    floor = {
      type: 'floor', y: floorY, normal: [0, 1, 0],
      polygons: clipped.map(p => p.map(([x, z]) => [x, floorY, z] as Vec3)),
      pieces: clipped.map((p, k) => ({ anchorId: pieceOwner[k], polygon: p.map(([x, z]) => [x, floorY, z] as Vec3) })),
      polygon: hull.map(([x, z]) => [x, floorY, z] as Vec3),
      area: unionA,
      center: all.length ? [all.reduce((s, v) => s + v[0], 0) / all.length, floorY, all.reduce((s, v) => s + v[1], 0) / all.length] : [0, floorY, 0],
      sourceAnchors: floorMembers.map(p => p.id),
      confidence: clamp01(0.4 * labelScore + 0.35 * clamp01(unionA / 2) + 0.25 * Math.min(...floorMembers.map(m => m.tiltScore))),
    };
  }

  // 8. PUERTAS y VENTANAS: ya están agrupadas con su pared; se miden en el marco de esa pared.
  const openings: OpeningModel[] = verticals.filter(isOpening).map(p => {
    const g = planeGroup.get(p.id)!;
    const wall = wallOfGroup.get(g) ?? null;
    const us = p.polygon.map(v => dot(v, g.t)), ys = p.polygon.map(v => v[1]);
    const [u0, u1, y0, y1] = [Math.min(...us), Math.max(...us), Math.max(floorY, Math.min(...ys)), Math.max(...ys)];
    const p0 = scale(g.n, -g.d);
    const at = (u: number, y: number): Vec3 => { const q = add(p0, scale(g.t, u - dot(p0, g.t))); return [q[0], y, q[2]]; };
    const op: OpeningModel = {
      type: p.label as 'door' | 'window', id: p.id, wallId: wall?.id ?? null,
      center: at((u0 + u1) / 2, (y0 + y1) / 2),
      width: u1 - u0, height: y1 - y0, sillHeight: y0 - floorY,
      corners: [at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1)],
      confidence: clamp01(0.6 + (wall ? 0.3 : 0) + 0.1 * p.tiltScore),
    };
    wall?.openings.push(op);
    return op;
  });

  // 9. OBJETOS
  const objects: ObjectModel[] = horizontals
    .filter(p => p.label === 'table' || p.label === 'seat')
    .map(p => {
      const h = heightOf(p);
      return {
        type: p.label as 'table' | 'seat', id: p.id, topHeight: h - floorY,
        center: [p.polygon.reduce((s, v) => s + v[0], 0) / p.polygon.length, h, p.polygon.reduce((s, v) => s + v[2], 0) / p.polygon.length] as Vec3,
        footprint: p.polygon, area: p.area, confidence: clamp01(0.6 + 0.4 * p.tiltScore),
      };
    });

  return {
    floor,
    ceiling: ceilingY !== null ? {
      type: 'ceiling', y: ceilingY, area: ceilingPlanes.reduce((s, p) => s + p.area, 0),
      sourceAnchors: ceilingPlanes.map(p => p.id),
      confidence: ceilingPlanes.some(p => p.label === 'ceiling') ? 0.9 : 0.55,
    } : null,
    walls, corners, openings, objects,
    roomHeight: ceilingY !== null && seed ? ceilingY - floorY : null,
    heightEstimate, fragments,
    stats: { anchors: planes.length, horizontal: horizontals.length, vertical: verticals.length },
  };
}