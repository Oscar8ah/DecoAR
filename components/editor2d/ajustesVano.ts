/**
 * DecoAR — Ajustes del vano seleccionado (entrega 1b-3b). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * Solo decide QUÉ muestran los controles (rangos, pasos, textos). Los cambios se envían con las
 * acciones existentes del reductor, que aplican los límites reales:
 *   ancho   → actualizarVano('ancho')    0,40 m … largo del tramo compartido; recoloca el centro
 *   posición→ moverVano(u)               centro dentro de [limIni + ancho/2, limFin − ancho/2]
 *   alto    → actualizarVano('alto')     1,60 … 2,50 m
 *   puerta  → actualizarVano('estilo' | 'bisagra' | 'sentido' | 'apertura')
 * Valores y pasos verificados en visor3d.js:7286-7327 (panel del vano de DecoiArte).
 */
import type { Vano } from '../plan/planModel';

export const ANCHO_MIN = 0.4;       // visor3d.js:7288 (min="0.4"); mismo límite en actualizarVano
export const PASO_ANCHO = 0.05;     // visor3d.js:7288 (step="0.05")
export const ANCHO_PUERTA = 0.9;    // botón rápido "Puerta 0,9 m" (= ANCHO_VANO_DEF del reductor)
export const ALTO_MIN = 1.6, ALTO_MAX = 2.5, PASO_ALTO = 0.05;   // visor3d.js:7302
export const PASO_ANGULO = 5;       // visor3d.js:7323 (0…90, step 5)

/** Tramo del muro compartido por el que puede ir el vano. null si el vano no lo trae (no se inventa). */
export function tramo(v: Pick<Vano, 'limIni' | 'limFin'>): { ini: number; fin: number } | null {
  const ini = v.limIni, fin = v.limFin;
  if (typeof ini !== 'number' || typeof fin !== 'number' || !Number.isFinite(ini) || !Number.isFinite(fin) || fin <= ini) return null;
  return { ini, fin };
}

/** Rango del control de ancho: de 0,40 m a todo el tramo (si el tramo es más corto, el máximo manda). */
export function rangoAncho(v: Vano): { min: number; max: number } | null {
  const t = tramo(v);
  if (!t) return null;
  const max = t.fin - t.ini;
  return { min: Math.min(ANCHO_MIN, max), max };
}

/** Por dónde puede ir el CENTRO con el ancho actual (la misma cuenta que hace moverVano). */
export function rangoCentro(v: Vano): { min: number; max: number } | null {
  const t = tramo(v);
  if (!t) return null;
  const mitad = Math.min(v.ancho, t.fin - t.ini) / 2;
  return { min: t.ini + mitad, max: t.fin - mitad };
}

/**
 * Valor de un control deslizable con su paso, dentro de [min, max]. El máximo siempre se puede
 * alcanzar aunque no sea múltiplo del paso (así "toda la pared" también se logra deslizando).
 */
export function cuantizar(valor: number, paso: number, min: number, max: number): number {
  if (!(max > min)) return min;
  if (valor >= max - paso / 2) return max;
  const q = Math.round(valor / paso) * paso;
  return Number(Math.max(min, Math.min(max, q)).toFixed(4));
}

/** Botones rápidos de ancho. "Puerta" nunca pasa del tramo; "Toda la pared" es el tramo completo. */
export function anchoRapido(v: Vano, cual: 'puerta' | 'pared'): number | null {
  const r = rangoAncho(v);
  if (!r) return null;
  return cual === 'pared' ? r.max : Math.min(ANCHO_PUERTA, r.max);
}

/** Centro del tramo, para el botón "Centrar". */
export function centroDelTramo(v: Vano): number | null {
  const t = tramo(v);
  return t ? (t.ini + t.fin) / 2 : null;
}

/**
 * Qué extremo del muro queda a cada lado del control. Muros norte/sur: el control va de oeste a este
 * (x crece); muros oeste/este: de norte a sur (z crece). En el plano el norte está arriba.
 */
export function extremos(lado: Vano['lado']): [string, string] {
  return lado === 'norte' || lado === 'sur' ? ['Oeste', 'Este'] : ['Norte', 'Sur'];
}

/** Fracción 0…1 de un valor dentro de un rango, y su inversa (para dibujar y leer los controles). */
export const fraccion = (valor: number, min: number, max: number) => (max > min ? Math.max(0, Math.min(1, (valor - min) / (max - min))) : 0);
export const deFraccion = (f: number, min: number, max: number) => min + Math.max(0, Math.min(1, f)) * (max - min);

/** El alto solo aplica a vano y puerta: el arco es paso libre de piso a techo (visor3d.js:7284, 7300). */
export const llevaAlto = (tipo: Vano['tipo']) => tipo === 'vano' || tipo === 'puerta';

export const DESCRIPCION: Record<string, string> = {
  arco: 'Paso libre de piso a techo.',
  vano: 'Hueco con marco.',
  puerta: 'Hueco con marco y hoja.',
  ventana: 'Ventana sobre el muro.',
};

/** Tipos de puerta de la web (visor3d.js:7307), con el valor exacto que guarda `estiloPuerta`. */
export const ESTILOS_PUERTA: { valor: string; etiqueta: string }[] = [
  { valor: 'sencilla', etiqueta: 'Sencilla' }, { valor: 'doble', etiqueta: 'Doble' },
  { valor: 'corrediza', etiqueta: 'Corrediza' }, { valor: 'vidrio', etiqueta: 'De vidrio' },
  { valor: 'plegable', etiqueta: 'Plegable' },
];

/** Etiqueta de la bisagra según el estilo, como la web (visor3d.js:7311). */
export function etiquetaBisagra(estilo: string | undefined): string {
  return ({ corrediza: 'Se corre hacia', plegable: 'Se pliega hacia', doble: 'Bisagras' } as Record<string, string>)[estilo ?? ''] ?? 'Bisagra';
}

/** Ángulo que muestra el control: 0 si la puerta está cerrada (como la web, visor3d.js:7323). */
export const anguloVisible = (v: Vano) => (v.abierta === false ? 0 : v.anguloApertura ?? 75);

/** Aviso para lo que se guarda pero aún no se ve en la maqueta 3D (planGeometry.ts:52). */
export const AVISO_HOJA_3D = 'Se guarda en el plano, pero la hoja de la puerta aún no se dibuja en la maqueta 3D.';
