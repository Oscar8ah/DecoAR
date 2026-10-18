/**
 * DecoAR — Lienzo del editor de planta 2D (Etapa 1, entrega 1a). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * Solo traduce entre METROS del plano y PUNTOS de la pantalla, y decide qué se dibuja y dónde.
 * No contiene reglas de edición (cuadrícula de 0,5 m, mínimos, contactos…): esas viven en
 * planEditor.ts y la pantalla solo las usará enviando acciones al reductor (entregas 1b en adelante).
 *
 * Convenciones del plano (planModel.ts, verificadas en visor3d.js):
 *   x crece al este, z crece al sur ("norte" = z menor). (x, z) de un módulo es su esquina mínima.
 * En pantalla: x → derecha, z → abajo. Así el norte queda arriba, igual que el lienzo de la web.
 */
import type { Modulo, Vano } from '../plan/planModel';
import { esCuarto } from '../plan/planModel';
import type { Planta } from '../plan/planEditor';

/** Puntos de pantalla por metro y posición del origen del plano (0, 0) en la pantalla. */
export interface Vista { escala: number; ox: number; oy: number }

export const ESCALA_MIN = 8;        // pt/m: un plano de ~40 m todavía cabe en un iPhone
export const ESCALA_MAX = 160;      // pt/m: un baño de 2 m no se agranda sin sentido
export const ESCALA_INICIAL = 40;   // pt/m: la misma de la web (ESCALA en visor3d.js) para un plano vacío
export const MARGEN_ENCUADRE = 44;  // pt alrededor del plano: deja sitio a las cotas generales (ver cotasGenerales)

export const aPantalla = (v: Vista, x: number, z: number) => ({ px: v.ox + x * v.escala, py: v.oy + z * v.escala });
export const aPlano = (v: Vista, px: number, py: number) => ({ x: (px - v.ox) / v.escala, z: (py - v.oy) / v.escala });

const nivelDe = (m: { nivel?: number | null }) => m.nivel || 0;

/** Lo que se ve en el lienzo: los módulos del nivel indicado (los demás se conservan, no se dibujan). */
export const modulosDelNivel = (p: Planta, nivel: number): Modulo[] => p.modulos.filter(m => nivelDe(m) === nivel);

export interface Extension { x0: number; z0: number; x1: number; z1: number }
export function extension(mods: Modulo[]): Extension | null {
  if (!mods.length) return null;
  const e = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const m of mods) {
    e.x0 = Math.min(e.x0, m.x); e.z0 = Math.min(e.z0, m.z);
    e.x1 = Math.max(e.x1, m.x + m.ancho); e.z1 = Math.max(e.z1, m.z + m.largo);
  }
  return e;
}

/**
 * "Ajustar vista": el plano completo, centrado y lo más grande posible dentro de ancho × alto,
 * con MARGEN_ENCUADRE alrededor. Sin módulos: escala inicial con el origen en el centro.
 */
export function encuadrar(mods: Modulo[], ancho: number, alto: number, margen = MARGEN_ENCUADRE): Vista {
  const e = extension(mods);
  if (!e || ancho <= 0 || alto <= 0) return { escala: ESCALA_INICIAL, ox: ancho / 2, oy: alto / 2 };
  const w = Math.max(e.x1 - e.x0, 0.01), h = Math.max(e.z1 - e.z0, 0.01);
  const disponibleX = Math.max(ancho - 2 * margen, 1), disponibleY = Math.max(alto - 2 * margen, 1);
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, Math.min(disponibleX / w, disponibleY / h)));
  const cx = (e.x0 + e.x1) / 2, cz = (e.z0 + e.z1) / 2;
  return { escala, ox: ancho / 2 - cx * escala, oy: alto / 2 - cz * escala };
}

/** Paso de cada toque en + o −: 25 % más cerca o más lejos. */
export const PASO_ZOOM = 1.25;

/**
 * Acercar (factor > 1) o alejar (< 1) manteniendo FIJO el punto (cx, cy) de la pantalla, normalmente
 * el centro del lienzo: lo que estaba en el centro sigue en el centro. Respeta ESCALA_MIN y ESCALA_MAX.
 */
export function zoomVista(v: Vista, factor: number, cx: number, cy: number): Vista {
  const escala = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, v.escala * factor));
  const k = escala / v.escala;
  return { escala, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k };
}
export const puedeAcercar = (v: Vista) => v.escala < ESCALA_MAX - 1e-9;
export const puedeAlejar = (v: Vista) => v.escala > ESCALA_MIN + 1e-9;

/**
 * Botones de zoom (dos círculos de 46 pt, uno encima del otro, a 12 pt del borde inferior). Normalmente
 * van a la derecha; si el asa de estirar del espacio seleccionado caería debajo de ellos, pasan a la
 * izquierda para que nunca se tapen.
 */
export const ZOOM = { margen: 12, ancho: 46, alto: 46 * 2 + 8 };
export function ladoZoom(asa: { px: number; py: number } | null, ancho: number, alto: number, radioAsa = 22): 'derecha' | 'izquierda' {
  if (!asa) return 'derecha';
  const x0 = ancho - ZOOM.margen - ZOOM.ancho, y0 = alto - ZOOM.margen - ZOOM.alto;
  const tapa = asa.px + radioAsa >= x0 && asa.px - radioAsa <= ancho - ZOOM.margen && asa.py + radioAsa >= y0 && asa.py - radioAsa <= alto - ZOOM.margen;
  return tapa ? 'izquierda' : 'derecha';
}

// ───────────────────────────── Cuadrícula ─────────────────────────────
export interface Linea { pos: number; fuerte: boolean }
export const MAX_LINEAS = 160;      // por eje: cada línea es una View; más no aporta y cuesta rendimiento

/**
 * Líneas visibles de la cuadrícula. Paso de 0,5 m (el de la web, CUADRICULA) mientras queden al menos
 * 12 pt entre líneas; si no, 1 m, y si aún así no caben, 5 m. Las líneas de metro entero son "fuertes".
 */
export function cuadricula(v: Vista, ancho: number, alto: number): { paso: number; verticales: Linea[]; horizontales: Linea[] } {
  const paso = [0.5, 1, 5, 10].find(p => p * v.escala >= 12) ?? 10;
  const eje = (o: number, largo: number): Linea[] => {
    const desde = Math.floor(-o / v.escala / paso), hasta = Math.ceil((largo - o) / v.escala / paso);
    const out: Linea[] = [];
    for (let i = desde; i <= hasta && out.length < MAX_LINEAS; i++) {
      const metros = i * paso;
      out.push({ pos: o + metros * v.escala, fuerte: Math.abs(metros - Math.round(metros)) < 1e-9 });
    }
    return out;
  };
  return { paso, verticales: eje(v.ox, ancho), horizontales: eje(v.oy, alto) };
}

// ───────────────────────────── Textos ─────────────────────────────
/** 4 → "4", 4.5 → "4,5", 4.25 → "4,25". Coma decimal, como el resto de la app. */
export function metros(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r).replace('.', ',');
}
/** "5 × 4 m": sale directamente de ancho y largo del módulo, el mismo dato que usará el panel. */
export const textoMedidas = (m: Pick<Modulo, 'ancho' | 'largo'>) => `${metros(m.ancho)} × ${metros(m.largo)} m`;

/** Nombre que se muestra: el del plano; si no tiene, el tipo; si tampoco, el id. */
export function nombreVisible(m: Modulo): string {
  if (m.nombre) return m.nombre;
  if (m.tipo) return m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1);
  return String(m.id);
}

/**
 * Tipo SOLO PARA PINTAR. Los planos de la IA no traen `tipo` por módulo: se deduce del nombre para
 * elegir el color. Nunca se escribe en el plano (decisión C de P0).
 */
export function tipoVisual(m: Modulo): string {
  if (m.tipo) return m.tipo;
  const n = (m.nombre || String(m.id)).toLowerCase();
  if (/sala|estancia|living/.test(n)) return 'sala';
  if (/cocina/.test(n)) return 'cocina';
  if (/ba[ñn]o/.test(n)) return 'bano';
  if (/habitaci|dormitorio|rec[aá]mara|alcoba|cuarto/.test(n)) return 'habitacion';
  if (/pasillo|hall|corredor/.test(n)) return 'pasillo';
  if (/comedor|estudio|oficina|lavado|terraza/.test(n)) return 'zona';
  return 'otro';
}

/** Qué etiqueta cabe dentro de un rectángulo de w × h puntos (nunca se dibuja texto encima de otro). */
export function etiquetaCabe(w: number, h: number): { nombre: boolean; medidas: boolean } {
  return { nombre: w >= 44 && h >= 22, medidas: w >= 56 && h >= 40 };
}

// ───────────────────────────── Vanos ─────────────────────────────
/**
 * Tramo de muro que ocupa un vano, en METROS del plano. `centro` es una coordenada ABSOLUTA
 * (X si el lado es norte/sur, Z si es oeste/este), como documenta planModel.ts (visor3d.js:8995-8998).
 */
export function tramoVano(v: Vano, mods: Modulo[]): { x0: number; z0: number; x1: number; z1: number } | null {
  const a = mods.find(m => String(m.id) === String(v.modulo_a));
  if (!a || !(v.ancho > 0) || !Number.isFinite(v.centro)) return null;
  const i = v.centro - v.ancho / 2, f = v.centro + v.ancho / 2;
  switch (v.lado) {
    case 'norte': return { x0: i, x1: f, z0: a.z, z1: a.z };
    case 'sur':   return { x0: i, x1: f, z0: a.z + a.largo, z1: a.z + a.largo };
    case 'oeste': return { x0: a.x, x1: a.x, z0: i, z1: f };
    case 'este':  return { x0: a.x + a.ancho, x1: a.x + a.ancho, z0: i, z1: f };
    default: return null;
  }
}

/** Vanos del nivel visible: los de un módulo de ese nivel. */
export function vanosDelNivel(p: Planta, nivel: number): Vano[] {
  const ids = new Set(modulosDelNivel(p, nivel).map(m => String(m.id)));
  return p.vanos.filter(v => ids.has(String(v.modulo_a)));
}

// ───────────────────────────── Cotas generales ─────────────────────────────
export const SEPARACION_COTA = 18;   // pt entre el plano y la línea de cota
export const ALTO_TEXTO_COTA = 16;   // pt que ocupa una línea de texto de cota

/**
 * Medida total del plano: ancho arriba, largo a la izquierda (con el texto girado, como en un plano).
 * Devuelve las cajas que ocupan los textos para poder comprobar que quedan dentro del lienzo.
 */
export function cotasGenerales(v: Vista, e: Extension) {
  const a = aPantalla(v, e.x0, e.z0), b = aPantalla(v, e.x1, e.z1);
  const yLinea = a.py - SEPARACION_COTA, xLinea = a.px - SEPARACION_COTA;
  return {
    horizontal: { x0: a.px, x1: b.px, y: yLinea, texto: metros(e.x1 - e.x0) + ' m',
      cajaTexto: { x0: a.px, x1: b.px, y0: yLinea - 4 - ALTO_TEXTO_COTA, y1: yLinea - 4 } },
    vertical: { y0: a.py, y1: b.py, x: xLinea, texto: metros(e.z1 - e.z0) + ' m',
      // girado 90°: ocupa ALTO_TEXTO_COTA de ancho a la izquierda de la línea, centrado en su largo
      cajaTexto: { x0: xLinea - 4 - ALTO_TEXTO_COTA, x1: xLinea - 4, y0: a.py, y1: b.py } },
  };
}

// ───────────────────────────── Resumen ─────────────────────────────
export interface Resumen { espacios: number; vanos: number; ancho: number; largo: number; area: number; niveles: number }
/** Lo que muestra la cabecera. `area` suma solo cuartos (como la web: TIPOS_NO_CUARTO no suman área). */
export function resumen(p: Planta, nivel: number): Resumen {
  const mods = modulosDelNivel(p, nivel);
  const e = extension(mods);
  return {
    espacios: mods.filter(m => esCuarto(m.tipo)).length,
    vanos: vanosDelNivel(p, nivel).length,
    ancho: e ? e.x1 - e.x0 : 0,
    largo: e ? e.z1 - e.z0 : 0,
    area: mods.filter(m => esCuarto(m.tipo)).reduce((s, m) => s + m.ancho * m.largo, 0),
    niveles: Math.max(p.niveles || 1, ...p.modulos.map(m => nivelDe(m) + 1)),
  };
}
