/**
 * DecoAR — Vista 3D (Entrega 2). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * Cámara, encuadre, vistas, zoom, filtro por piso y avisos de fidelidad, sobre la maqueta que ya
 * genera planGeometry.generarMaqueta(planoDe(planta)). No hay geometría propia aquí.
 *
 * Sistema de la maqueta (planGeometry.ts:138-166): X/Z centrados en 0, Y desde el piso del nivel 0, metros.
 */
import type { Plano } from '../plan/planModel';
import type { Caja, Maqueta } from '../plan/planGeometry';

export type Vista = 'isometrica' | 'arriba' | 'libre';
export type Vec3 = [number, number, number];

/**
 * Cómo se mira la maqueta. NO se usa una cámara orbital: en el iPhone, ViroOrbitCamera no llegó a
 * activarse (ViroScene la activa con NativeModules.VRTCameraModule.setSceneCamera + findNodeHandle) y la
 * cámara por defecto quedó dentro de la losa del piso: pantalla negra. Así que la cámara por defecto de
 * Viro se queda quieta (en el origen, mirando hacia −Z) y lo que se gira y se aleja es la MAQUETA.
 *
 *   inclinacion: grados alrededor de X. 0 = de frente (a la altura de los ojos), 90 = desde arriba.
 *   giro:        grados alrededor de Y (vertical).
 *   acerca:      zoom. 1 = la maqueta entera cabe; más es más cerca.
 */
export interface Mirada { inclinacion: number; giro: number; acerca: number }

export const FOV_SUPUESTO = 60;         // grados: campo de visión con que se calcula la distancia (con margen)
export const MARGEN_ENCUADRE = 1.3;     // la esfera de la maqueta ocupa como mucho el 77 % del campo
export const ACERCA_MIN = 0.4, ACERCA_MAX = 4, PASO_ZOOM = 1.25;
export const INCLINACION_MIN = 5, INCLINACION_MAX = 90;
export const GRADOS_POR_PUNTO = 0.4;    // girar con el dedo

/** Centro de la maqueta y radio de la esfera que la contiene (para que entre entera en cualquier plano). */
export function encuadre(m: Pick<Maqueta, 'extension'>): { foco: Vec3; radio: number } {
  const [w, h, d] = m.extension;
  const radio = Math.max(1, Math.hypot(w, h, d) / 2);
  return { foco: [0, h / 2, 0], radio };
}

/** Las vistas fijas. "Libre" no tiene una propia: conserva la mirada actual. */
export function miradaDe(vista: Vista): Mirada | null {
  if (vista === 'isometrica') return { inclinacion: 35, giro: -45, acerca: 1 };
  if (vista === 'arriba') return { inclinacion: 90, giro: 0, acerca: 1 };
  return null;
}

/** Distancia de la maqueta a la cámara: entera en el campo de visión, con margen; acercar la reduce. */
export function distancia(e: { radio: number }, acerca: number): number {
  return (e.radio / Math.sin((FOV_SUPUESTO * Math.PI) / 360)) * MARGEN_ENCUADRE / acerca;
}

/** Girar con el dedo: dx gira alrededor de la vertical; dy inclina, entre de frente y desde arriba. */
export function girar(m: Mirada, dx: number, dy: number): Mirada {
  const inclinacion = Math.min(INCLINACION_MAX, Math.max(INCLINACION_MIN, m.inclinacion + dy * GRADOS_POR_PUNTO));
  return { ...m, giro: m.giro + dx * GRADOS_POR_PUNTO, inclinacion };
}

/** Zoom con + y −, siempre dentro de [ACERCA_MIN, ACERCA_MAX]. */
export const zoom = (acerca: number, acercar: boolean) =>
  Math.round(Math.min(ACERCA_MAX, Math.max(ACERCA_MIN, acercar ? acerca * PASO_ZOOM : acerca / PASO_ZOOM)) * 1000) / 1000;
export const puedeAcercar = (a: number) => a < ACERCA_MAX - 1e-9;
export const puedeAlejar = (a: number) => a > ACERCA_MIN + 1e-9;

/**
 * Transformación de la maqueta frente a la cámara quieta (la que aplica Escena3D con tres nodos):
 * trasladar el foco al origen, girar alrededor de Y, inclinar alrededor de X y alejar a −Z.
 */
export function transformacion(e: { foco: Vec3; radio: number }, m: Mirada) {
  return {
    alejar: [0, 0, -distancia(e, m.acerca)] as Vec3,
    inclinar: [m.inclinacion, 0, 0] as Vec3,
    girar: [0, m.giro, 0] as Vec3,
    centrar: [-e.foco[0], -e.foco[1], -e.foco[2]] as Vec3,
  };
}

/**
 * Dónde queda un punto de la maqueta en el espacio de la cámara (misma transformación que la escena),
 * para comprobar en pruebas que la maqueta queda delante, centrada y entera.
 */
export function aCamara(p: Vec3, e: { foco: Vec3; radio: number }, m: Mirada): Vec3 {
  const t = transformacion(e, m);
  let [x, y, z] = [p[0] + t.centrar[0], p[1] + t.centrar[1], p[2] + t.centrar[2]];
  const g = (m.giro * Math.PI) / 180, i = (m.inclinacion * Math.PI) / 180;
  [x, z] = [x * Math.cos(g) + z * Math.sin(g), -x * Math.sin(g) + z * Math.cos(g)];   // giro alrededor de Y
  [y, z] = [y * Math.cos(i) - z * Math.sin(i), y * Math.sin(i) + z * Math.cos(i)];    // inclinación alrededor de X
  return [x, y, z + t.alejar[2]];
}

/** Número de pisos del plano (el mayor entre `niveles` y el nivel más alto usado). */
export function pisosDe(p: Plano): number {
  return Math.max(p.niveles || 1, ...(p.modulos ?? []).map(m => (m.nivel || 0) + 1));
}

/**
 * Cajas visibles "hasta el piso N" (N = 0 es el primer piso; null = todo). Cada caja dice de qué
 * módulo es (moduloId); el piso sale del módulo. Se filtran también los marcos.
 */
export function visibles(m: Pick<Maqueta, 'cajas' | 'marcos'>, p: Plano, hasta: number | null): Caja[] {
  const nivel = new Map((p.modulos ?? []).map(x => [String(x.id), x.nivel || 0]));
  const todas = [...m.cajas, ...m.marcos];
  return hasta === null ? todas : todas.filter(c => (nivel.get(String(c.moduloId)) ?? 0) <= hasta);
}

// ───────────────────────────── Avisos de fidelidad ─────────────────────────────
export type Fidelidad = 'compatible' | 'parcial' | 'no-representado' | 'pendiente';
export interface Aviso { fidelidad: Fidelidad; texto: string }

const NOMBRES: Record<string, string> = {
  escalera: 'Escaleras', baranda: 'Barandas', vidrio: 'Paredes de vidrio', exterior: 'Pisos exteriores',
  plafon: 'Plafones', cubierta: 'Cubiertas', 'columna redonda': 'Columnas redondas',
};

/**
 * Lo que se ve y lo que no, a partir de lo que REALMENTE devolvió el generador y de lo que hay en el
 * plano. Nada se anuncia sin comprobarlo:
 *  · "Aún no se representan: N tipo" son avisos del propio generador (planGeometry.ts).
 *  · Puertas: el generador hace el hueco, el dintel y el marco, pero no la hoja (planGeometry.ts:52).
 *  · Pisos del catálogo: el generador no lee imagen_piso; la escena pinta el piso de un color.
 *  · Huecos en pisos altos: recortan el piso (comprobado en test-estructuras).
 */
export function avisos(m: Pick<Maqueta, 'avisos' | 'errores'>, p: Plano): Aviso[] {
  const out: Aviso[] = [];
  for (const err of m.errores) out.push({ fidelidad: 'no-representado', texto: `El plano tiene un problema y no se puede dibujar: ${err}` });
  for (const a of m.avisos) {
    // planGeometry.ts:278 junta todo en uno: "Aún no se representan: 1 vidrio, 2 baranda, 1 columna redonda"
    if (a.startsWith('Aún no se representan: ')) {
      for (const parte of a.slice('Aún no se representan: '.length).split(', ')) {
        const r = /^(\d+) (.+)$/.exec(parte);
        if (r) out.push({ fidelidad: 'no-representado', texto: `${NOMBRES[r[2]] ?? r[2]}: aún no se dibujan en 3D (${r[1]}).` });
      }
    } else if (a.startsWith('El plano tiene varios niveles')) out.push({ fidelidad: 'compatible', texto: 'Varios pisos: se apilan según la altura de entrepiso.' });
    else if (a.startsWith('Techos y fachada')) out.push({ fidelidad: 'no-representado', texto: 'Techos y fachada (envolvente) aún no se dibujan.' });
    else if (a.startsWith('El diseño de paredes')) out.push({ fidelidad: 'no-representado', texto: 'Enchapes, placas y pintura por pared aún no se dibujan.' });
    else if (/^El vano de .* es más alto que la pared$/.test(a)) out.push({ fidelidad: 'parcial', texto: a + '.' });
    else out.push({ fidelidad: 'pendiente', texto: a });
  }
  const mods = p.modulos ?? [], vanos = p.vanos ?? [];
  const puertas = vanos.filter(v => v.tipo === 'puerta').length;
  if (puertas) out.push({ fidelidad: 'parcial', texto: `Puertas (${puertas}): se ven el hueco y el marco, pero no la hoja ni su sentido de apertura.` });
  const conPiso = mods.filter(x => x.imagen_piso).length;
  if (conPiso) out.push({ fidelidad: 'parcial', texto: `Pisos del catálogo (${conPiso}): la maqueta los pinta de un color único; la textura de la foto aún no se muestra.` });
  if (mods.some(x => x.tipo === 'hueco' && (x.nivel || 0) > 0)) out.push({ fidelidad: 'compatible', texto: 'Huecos en pisos altos: recortan el piso de ese nivel.' });
  if (mods.some(x => x.tipo === 'hueco' && !(x.nivel || 0))) out.push({ fidelidad: 'parcial', texto: 'Huecos en el primer piso: no recortan nada (solo afectan a pisos altos).' });
  return out;
}

/** El plano no tiene nada que dibujar (vacío o con errores): la pantalla lo dice en vez de mostrar una escena vacía. */
export const sinContenido = (m: Pick<Maqueta, 'cajas' | 'errores'>) => m.cajas.length === 0 || m.errores.length > 0;
