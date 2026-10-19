/**
 * DecoAR — Iluminación de la vista 3D (Entrega 3c). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * Traslado de configurarLuces y cambiarTipoLuz de la web (visor3d.js:2990-3100):
 *   ambiente 0xFFF5E6 ×0,14 · hemisférica 0xE8F0FF ×0,55 · sol 0xFFF8F0 ×1,1 · relleno 0xCCDDFF ×0,25 ·
 *   puntual de techo 0xFFFAE6 ×0,5 (todo × intensidad, 10–100 %, 70 % por defecto).
 *   Tipos: día, noche, cálida, fría cambian el color de ambiente, sol y puntual (los mismos valores).
 * Diferencias con la web (documentadas):
 *   · Viro no tiene luz hemisférica: se aproxima con una segunda luz ambiente del color del cielo.
 *   · Viro mide la intensidad en otra unidad (≈ lúmenes, 1000 por defecto): se usa ESCALA_VIRO = 850,
 *     calibrada con la escena que ya se validó en el iPhone (ambiente 420 y sol 650 ≈ web al 70 %).
 *   · Sin sombras en la vista 3D sin AR (la web las calcula; aquí no se activaron).
 *   · La "Luz de techo" del catálogo web solo se ve; en DecoAR además ilumina (añadido propio).
 */
import type { Plano } from '../plan/planModel';
import type { Mueble } from '../plan/planEditor';
import { objetoPorId } from '../objetos/catalogoObjetos';
import { baseObjeto, centradoMaqueta } from '../objetos/objetos3d';

export type Ambiente = 'dia' | 'noche' | 'calida' | 'fria';
export const AMBIENTES: { valor: Ambiente; etiqueta: string }[] = [
  { valor: 'dia', etiqueta: 'Día' }, { valor: 'noche', etiqueta: 'Noche' }, { valor: 'calida', etiqueta: 'Cálida' }, { valor: 'fria', etiqueta: 'Fría' },
];
/** cambiarTipoLuz (visor3d.js:3094): a = ambiente, d = sol, p = puntual. */
export const COLORES_AMBIENTE: Record<Ambiente, { a: string; d: string; p: string }> = {
  dia: { a: '#FFFFFF', d: '#FFFFFF', p: '#FFFAE6' },
  noche: { a: '#1A1A3A', d: '#4444FF', p: '#FFAA44' },
  calida: { a: '#FFE4C4', d: '#FFB347', p: '#FF8C00' },
  fria: { a: '#E0F0FF', d: '#ADD8E6', p: '#E0F0FF' },
};
export const INTENSIDAD_MIN = 0.1, INTENSIDAD_MAX = 1, INTENSIDAD_DEF = 0.7;   // control 10–100 %, 70 % (visor3d.html:1208, visor3d.js:1458)
export const ESCALA_VIRO = 850;
export const MAX_LUMINARIAS = 4;   // luces puntuales de objetos encendidas a la vez (cuidar el rendimiento en el teléfono)

/** Luz de techo de DecoAR (la web no le pone luz): mismos valores que la lámpara de pie, en la pantalla. */
const LUZ_TECHO_DECOAR = { color: '#FFF8E7', intensidad: 0.5, alcance: 4, pos: [0, -0.15, 0] as [number, number, number] };

export interface Luces {
  ambientes: { color: string; intensidad: number }[];
  direccionales: { color: string; intensidad: number; direccion: [number, number, number] }[];
  puntuales: { color: string; intensidad: number; pos: [number, number, number]; alcance: number; origen: 'escena' | 'lampara_pie' | 'luz_techo'; objeto?: string }[];
  /** Luminarias que quedaron sin luz por el límite (se informan). */
  apagadas: number;
}

const unit = (v: [number, number, number]): [number, number, number] => { const n = Math.hypot(...v); return [v[0] / n, v[1] / n, v[2] / n]; };
export const limitarIntensidad = (i: number) => Math.min(INTENSIDAD_MAX, Math.max(INTENSIDAD_MIN, i));

/**
 * Las luces de la vista 3D, en el sistema de Escena3D (maqueta centrada, z del plano, zSign 1).
 * `extension` es la de la maqueta ([ancho, alto, largo]); `hasta`, el filtro de pisos de la vista.
 */
export function lucesEscena(ambiente: Ambiente, intensidad: number, plano: Plano, extension: [number, number, number],
  muebles?: Mueble[], hasta: number | null = null): Luces {
  const i = limitarIntensidad(intensidad), K = ESCALA_VIRO, c = COLORES_AMBIENTE[ambiente];
  const escena = Math.max(4, extension[0], extension[2]);
  const altoEsc = typeof plano.alto_piso === 'number' ? plano.alto_piso : 2.6;
  const puntuales: Luces['puntuales'] = [
    { color: c.p, intensidad: 0.5 * i * K, pos: [0, altoEsc - 0.3, 0], alcance: escena * 2.2, origen: 'escena' },
  ];
  const off = centradoMaqueta(plano);
  const luminarias: Luces['puntuales'] = [];
  for (const o of muebles ?? []) {
    if (hasta !== null && (o.nivel || 0) > hasta) continue;
    const cat = objetoPorId(o.tipo);
    const luz = o.tipo === 'luz_techo' ? LUZ_TECHO_DECOAR : cat?.luz;
    if (!luz) continue;
    // La luz va en el eje del objeto (x = z = 0 locales): el giro no la mueve.
    luminarias.push({ color: luz.color, intensidad: luz.intensidad * K, alcance: luz.alcance, origen: o.tipo === 'luz_techo' ? 'luz_techo' : 'lampara_pie', objeto: o.id,
      pos: [o.x + luz.pos[0] - off.x, baseObjeto(o, plano) + luz.pos[1], o.z + luz.pos[2] - off.z] });
  }
  return {
    ambientes: [
      { color: c.a, intensidad: 0.14 * i * K },
      { color: '#E8F0FF', intensidad: 0.55 * i * K },   // en lugar de la hemisférica (Viro no la tiene)
    ],
    direccionales: [
      { color: c.d, intensidad: 1.1 * i * K, direccion: unit([-0.7, -1.1, -0.6]) },     // sol: desde (0,7; 1,1; 0,6)·escena
      { color: '#CCDDFF', intensidad: 0.25 * i * K, direccion: unit([0.6, -0.7, 0.5]) }, // relleno, del lado opuesto
    ],
    puntuales: [...puntuales, ...luminarias.slice(0, MAX_LUMINARIAS)],
    apagadas: Math.max(0, luminarias.length - MAX_LUMINARIAS),
  };
}
