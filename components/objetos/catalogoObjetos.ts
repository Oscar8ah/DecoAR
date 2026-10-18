/**
 * DecoAR — Catálogo de objetos predeterminados (Entrega 3b). LÓGICA PURA: sin React, sin Viro.
 * ------------------------------------------------------------------
 * Traslado de DecoiArte web: nombres, iconos y descripciones de CATALOGO_MUEBLES (visor3d.js:1463-1500)
 * y piezas, medidas, colores y posiciones de crearMueble (visor3d.js:1579-1940). No es un catálogo nuevo.
 *
 * Diferencias con la web (documentadas):
 *  · Fuera: ventana_blanca, ventana_negra, ventana_balcon, puerta y hueco. Van en muros: ya son
 *    "Aberturas" de Construcción (vanos del plano, Entrega 3a).
 *  · ViroReact 3.0.2 no tiene cilindro ni toro (solo ViroBox y ViroSphere). Esas piezas se dibujan como
 *    una caja del mismo diámetro y alto, marcadas con `aprox`. Ej.: el tapete redondo se ve cuadrado.
 *  · El vidrio de la ducha va con opacidad (la web usa un material transparente).
 *
 * Origen de cada objeto: su centro en el piso. x al este, z al sur, y hacia arriba (metros), como el plano.
 */

export interface PiezaObjeto {
  forma: 'caja' | 'esfera';
  tam: [number, number, number];          // caja: ancho, alto, largo; esfera: diámetro en los tres
  pos: [number, number, number];          // centro de la pieza respecto al origen del objeto
  color: string;
  opacidad?: number;
  /** La pieza en la web es un cilindro o un toro: aquí se aproxima con una caja. */
  aprox?: 'cilindro' | 'toro';
}

export interface LuzObjeto { color: string; intensidad: number; alcance: number; pos: [number, number, number] }

export interface ObjetoCatalogo {
  id: string; nombre: string; icono: string; hint: string;
  piezas: PiezaObjeto[];
  /** Altura de la base: 0 en el piso; un número fijo (microondas sobre mesón, toallero en la pared); o 'techo'. */
  elevacion: number | 'techo';
  /** Luz real del objeto (la lámpara de pie de la web tiene una PointLight). Se usa en la Entrega 3c. */
  luz?: LuzObjeto;
}

const caja = (tam: PiezaObjeto['tam'], pos: PiezaObjeto['pos'], color: string, extra: Partial<PiezaObjeto> = {}): PiezaObjeto => ({ forma: 'caja', tam, pos, color, ...extra });
/** Cilindro de la web (radio arriba, radio abajo, alto) → caja del diámetro mayor. */
const cil = (rArriba: number, rAbajo: number, alto: number, pos: PiezaObjeto['pos'], color: string): PiezaObjeto =>
  ({ forma: 'caja', tam: [2 * Math.max(rArriba, rAbajo), alto, 2 * Math.max(rArriba, rAbajo)], pos, color, aprox: 'cilindro' });
const esf = (radio: number, pos: PiezaObjeto['pos'], color: string): PiezaObjeto => ({ forma: 'esfera', tam: [2 * radio, 2 * radio, 2 * radio], pos, color });
const cuatro = (xs: number, zs: number, f: (x: number, z: number) => PiezaObjeto) => [f(-xs, -zs), f(-xs, zs), f(xs, -zs), f(xs, zs)];

export const CATALOGO_OBJETOS: ObjetoCatalogo[] = [
  { id: 'sofa', nombre: 'Sofá', icono: '🛋️', hint: 'Sala de estar', elevacion: 0, piezas: [
    caja([2.2, 0.5, 0.9], [0, 0.25, 0], '#6B7280'), caja([2.2, 0.7, 0.2], [0, 0.7, -0.35], '#6B7280'),
    caja([0.9, 0.15, 0.7], [-0.55, 0.55, 0.05], '#8B93A0'), caja([0.9, 0.15, 0.7], [0.55, 0.55, 0.05], '#8B93A0'),
    ...cuatro(1.0, 0.4, (x, z) => caja([0.08, 0.12, 0.08], [x, 0.06, z], '#4B5563'))] },
  { id: 'mesa', nombre: 'Mesa comedor', icono: '🪑', hint: 'Comedor', elevacion: 0, piezas: [
    caja([1.6, 0.06, 0.9], [0, 0.76, 0], '#C4913A'), ...cuatro(0.7, 0.38, (x, z) => caja([0.06, 0.76, 0.06], [x, 0.38, z], '#8B6914'))] },
  { id: 'cama', nombre: 'Cama', icono: '🛏️', hint: 'Dormitorio', elevacion: 0, piezas: [
    caja([1.6, 0.35, 2.0], [0, 0.175, 0], '#8B7355'), caja([1.55, 0.2, 1.85], [0, 0.45, 0.075], '#F0EDE8'),
    caja([1.6, 0.75, 0.1], [0, 0.55, -0.95], '#6B5335'),
    caja([0.65, 0.2, 0.45], [-0.4, 0.65, -0.6], '#E8E0D0'), caja([0.65, 0.2, 0.45], [0.4, 0.65, -0.6], '#E8E0D0'),
    ...cuatro(0.75, 0.95, (x, z) => caja([0.08, 0.18, 0.08], [x, 0.09, z], '#5B4525'))] },
  { id: 'mesita', nombre: 'Mesa de noche', icono: '🗄️', hint: 'Dormitorio', elevacion: 0, piezas: [
    caja([0.55, 0.04, 0.45], [0, 0.6, 0], '#C4913A'), caja([0.5, 0.5, 0.4], [0, 0.3, 0], '#A07840'),
    caja([0.5, 0.05, 0.4], [0, 0.03, 0], '#8B6914'), caja([0.1, 0.02, 0.02], [0, 0.3, 0.21], '#D4A96A')] },
  { id: 'escritorio', nombre: 'Escritorio', icono: '💻', hint: 'Oficina', elevacion: 0, piezas: [
    caja([1.4, 0.05, 0.7], [0, 0.75, 0], '#D4C5A9'), caja([0.04, 0.75, 0.7], [-0.68, 0.375, 0], '#C4B48A'),
    caja([0.04, 0.75, 0.7], [0.68, 0.375, 0], '#C4B48A'), caja([1.4, 0.04, 0.7], [0, 0.02, 0], '#C4B48A')] },
  { id: 'sofa2', nombre: 'Sofá 2 plazas', icono: '🛋️', hint: 'Sala', elevacion: 0, piezas: [
    caja([1.6, 0.45, 0.85], [0, 0.22, 0], '#9CA3AF'), caja([1.6, 0.65, 0.18], [0, 0.65, -0.335], '#9CA3AF'),
    caja([1.3, 0.12, 0.6], [0, 0.5, 0.05], '#B0B8C4')] },
  { id: 'mesa_cafe', nombre: 'Mesa de café', icono: '☕', hint: 'Sala', elevacion: 0, piezas: [
    caja([1.0, 0.05, 0.55], [0, 0.45, 0], '#C4913A'), ...cuatro(0.43, 0.22, (x, z) => caja([0.05, 0.45, 0.05], [x, 0.225, z], '#8B6914'))] },
  { id: 'armario', nombre: 'Armario', icono: '🚪', hint: 'Dormitorio', elevacion: 0, piezas: [
    caja([1.2, 2.1, 0.55], [0, 1.05, 0], '#D4C5A9'), caja([0.04, 2.0, 0.53], [0, 1.0, 0], '#C4B48A'),
    caja([0.56, 1.95, 0.03], [-0.3, 1.0, 0.29], '#E8DCC8'), caja([0.56, 1.95, 0.03], [0.3, 1.0, 0.29], '#E8DCC8'),
    caja([0.04, 0.1, 0.04], [-0.08, 1.0, 0.31], '#D4A96A'), caja([0.04, 0.1, 0.04], [0.08, 1.0, 0.31], '#D4A96A')] },
  { id: 'planta', nombre: 'Planta', icono: '🌿', hint: 'Decoración', elevacion: 0, piezas: [
    cil(0.18, 0.13, 0.32, [0, 0.16, 0], '#C17F3A'), cil(0.22, 0.18, 0.04, [0, 0.32, 0], '#8B5A1A'),
    cil(0.025, 0.025, 0.5, [0, 0.57, 0], '#3A6B1A'), esf(0.32, [0, 1.05, 0], '#2E8B22')] },
  { id: 'lampara_pie', nombre: 'Lámpara pie', icono: '💡', hint: 'Decoración', elevacion: 0, piezas: [
    cil(0.22, 0.28, 0.06, [0, 0.03, 0], '#888888'), cil(0.02, 0.02, 1.55, [0, 0.8, 0], '#AAAAAA'),
    cil(0.25, 0.18, 0.32, [0, 1.68, 0], '#FFF8E8'), esf(0.06, [0, 1.6, 0], '#FFF5D0')],
    luz: { color: '#FFF5D0', intensidad: 0.5, alcance: 4, pos: [0, 1.6, 0] } },   // THREE.PointLight(0xFFF5D0, 0.5, 4) (visor3d.js:1731)
  { id: 'estufa', nombre: 'Estufa', icono: '🔥', hint: 'Cocina', elevacion: 0, piezas: [
    caja([0.6, 0.85, 0.6], [0, 0.425, 0], '#E5E5E5'), caja([0.62, 0.03, 0.62], [0, 0.865, 0], '#1A1A1A'),
    ...cuatro(0.15, 0.15, (x, z) => cil(0.06, 0.06, 0.015, [x, 0.885, z], '#0D0D0D')),
    caja([0.55, 0.15, 0.03], [0, 0.55, 0.31], '#CCCCCC')] },
  { id: 'cocina_integral', nombre: 'Cocina integral', icono: '🗄️', hint: 'Cocina — mesón y cajones', elevacion: 0, piezas: [
    caja([2.0, 0.85, 0.6], [0, 0.425, 0], '#D8CFC0'), caja([2.05, 0.04, 0.63], [0, 0.87, 0], '#F5F0E8'),
    ...[-2, -1, 0, 1, 2].flatMap(i => [caja([0.36, 0.7, 0.02], [i * 0.38, 0.4, 0.31], '#C4B8A4'), caja([0.14, 0.02, 0.02], [i * 0.38, 0.55, 0.33], '#8A8A8A')])] },
  { id: 'inodoro', nombre: 'Inodoro', icono: '🚽', hint: 'Baño', elevacion: 0, piezas: [
    caja([0.38, 0.35, 0.18], [0, 0.62, -0.18], '#F5F5F5'), cil(0.19, 0.16, 0.4, [0, 0.2, 0], '#F5F5F5'),
    cil(0.21, 0.21, 0.04, [0, 0.4, 0.02], '#FFFFFF')] },
  { id: 'ducha', nombre: 'Ducha', icono: '🚿', hint: 'Baño', elevacion: 0, piezas: [
    caja([0.9, 0.05, 0.9], [0, 0.025, 0], '#E8E8E8'),
    caja([0.9, 2.0, 0.02], [0, 1.0, -0.44], '#CFE8F0', { opacidad: 0.25 }), caja([0.02, 2.0, 0.9], [-0.44, 1.0, 0], '#CFE8F0', { opacidad: 0.25 }),
    cil(0.08, 0.08, 0.02, [0.2, 2.05, -0.35], '#B0B0B0'),
    caja([0.3, 0.024, 0.024], [0.1, 2.05, -0.42], '#B0B0B0', { aprox: 'cilindro' })] },   // brazo inclinado en la web
  { id: 'lavamanos', nombre: 'Lavamanos', icono: '🧼', hint: 'Baño', elevacion: 0, piezas: [
    caja([0.6, 0.75, 0.45], [0, 0.375, 0], '#D8CFC0'), caja([0.64, 0.04, 0.48], [0, 0.77, 0], '#F5F5F5'),
    cil(0.16, 0.13, 0.1, [0, 0.75, 0], '#EAEAEA'), cil(0.012, 0.012, 0.2, [0, 0.9, -0.15], '#B0B0B0')] },
  { id: 'toallero', nombre: 'Toallero', icono: '🏳️', hint: 'Baño — pegado a pared', elevacion: 1.1, piezas: [
    caja([0.55, 0.024, 0.024], [0, 0, 0], '#C0C0C0', { aprox: 'cilindro' }),   // barra horizontal (cilindro girado en la web)
    caja([0.03, 0.06, 0.03], [-0.26, 0, -0.03], '#C0C0C0'), caja([0.03, 0.06, 0.03], [0.26, 0, -0.03], '#C0C0C0')] },
  { id: 'tv', nombre: 'Televisor', icono: '📺', hint: 'Sala/Dormitorio', elevacion: 0, piezas: [
    caja([1.1, 0.65, 0.04], [0, 0.9, 0], '#0A0A0A'), caja([1.14, 0.69, 0.02], [0, 0.9, -0.021], '#1A1A1A'),
    caja([0.3, 0.05, 0.15], [0, 0.55, 0.05], '#2A2A2A'), caja([0.05, 0.25, 0.05], [0, 0.68, 0.05], '#2A2A2A')] },
  { id: 'nevera', nombre: 'Nevera', icono: '🧊', hint: 'Cocina', elevacion: 0, piezas: [
    caja([0.7, 1.75, 0.68], [0, 0.875, 0], '#E8E8E8'), caja([0.72, 0.03, 0.02], [0, 1.15, 0.35], '#B0B0B0'),
    caja([0.03, 0.4, 0.04], [0.32, 1.35, 0.36], '#C0C0C0'), caja([0.03, 0.55, 0.04], [0.32, 0.75, 0.36], '#C0C0C0')] },
  { id: 'lavadora', nombre: 'Lavadora', icono: '🧺', hint: 'Zona de ropas', elevacion: 0, piezas: [
    caja([0.6, 0.85, 0.6], [0, 0.425, 0], '#F0F0F0'),
    caja([0.48, 0.48, 0.02], [0, 0.45, 0.305], '#B0B0B0', { aprox: 'toro' }),   // aro de la puerta
    caja([0.4, 0.4, 0.05], [0, 0.45, 0.31], '#1A1A1A', { aprox: 'cilindro' }),  // tambor (cilindro girado)
    caja([0.55, 0.08, 0.02], [0, 0.83, 0.3], '#D8D8D8')] },
  { id: 'microondas', nombre: 'Horno microondas', icono: '🍿', hint: 'Cocina — sobre mesón', elevacion: 0.75, piezas: [
    caja([0.5, 0.3, 0.4], [0, 0.15, 0], '#2A2A2A'), caja([0.32, 0.24, 0.02], [0.05, 0.15, 0.21], '#111111')] },
  { id: 'tapete', nombre: 'Tapete', icono: '🟫', hint: 'Decoración — sobre el piso', elevacion: 0, piezas: [
    cil(0.9, 0.9, 0.02, [0, 0.01, 0], '#8B7355')] },
  { id: 'luz_techo', nombre: 'Luz de techo', icono: '💡', hint: 'Iluminación', elevacion: 'techo', piezas: [
    cil(0.08, 0.08, 0.04, [0, 0, 0], '#D4AF37'), esf(0.15, [0, -0.15, 0], '#FFF8E7')] },
];

export const objetoPorId = (id: string) => CATALOGO_OBJETOS.find(o => o.id === id);

/** Medidas del objeto (caja que lo contiene): ancho en x, largo en z, alto desde su base. */
export function medidasObjeto(o: ObjetoCatalogo): { ancho: number; largo: number; alto: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y1 = -Infinity, y0 = Infinity;
  for (const p of o.piezas) {
    x0 = Math.min(x0, p.pos[0] - p.tam[0] / 2); x1 = Math.max(x1, p.pos[0] + p.tam[0] / 2);
    z0 = Math.min(z0, p.pos[2] - p.tam[2] / 2); z1 = Math.max(z1, p.pos[2] + p.tam[2] / 2);
    y0 = Math.min(y0, p.pos[1] - p.tam[1] / 2); y1 = Math.max(y1, p.pos[1] + p.tam[1] / 2);
  }
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { ancho: r(x1 - x0), largo: r(z1 - z0), alto: r(y1 - Math.min(0, y0)) };
}

/** Cuántas piezas del objeto se aproximan (cilindros y toros de la web). */
export const aproximadas = (o: ObjetoCatalogo) => o.piezas.filter(p => p.aprox).length;

// ───────────────────────────── A 3D ─────────────────────────────
export interface Colocado { x: number; z: number; rot: number }   // centro en el plano (m) y giro (°, horario visto desde arriba)
export interface PiezaMundo { forma: PiezaObjeto['forma']; tam: PiezaObjeto['tam']; pos: [number, number, number]; rotY: number; color: string; opacidad?: number }

/**
 * Las piezas de un objeto colocado, en el sistema de una escena 3D.
 *   off:   desplazamiento con que planGeometry centra la maqueta (x y z del plano).
 *   zSign: 1 en la vista 3D (Escena3D), −1 en la AR (MaquetaScene dibuja la maqueta con z·Z_SIGN, Z_SIGN = −1).
 *   base:  altura del piso donde está + su elevación.
 * La POSICIÓN de cada pieza se calcula aquí, exacta. `rotY` es el giro de la pieza para Viro
 * (rotación estándar alrededor de Y): −rot con zSign 1 y +rot con zSign −1 (el espejo invierte el sentido).
 */
export function piezasEnMundo(o: ObjetoCatalogo, c: Colocado, off: { x: number; z: number }, base: number, zSign: 1 | -1): PiezaMundo[] {
  const t = (c.rot * Math.PI) / 180, cs = Math.cos(t), sn = Math.sin(t);
  return o.piezas.map(p => {
    const dx = p.pos[0] * cs - p.pos[2] * sn, dz = p.pos[0] * sn + p.pos[2] * cs;   // giro horario en el plano
    return {
      forma: p.forma, tam: p.tam, color: p.color, opacidad: p.opacidad,
      pos: [c.x + dx - off.x, base + p.pos[1], zSign * (c.z + dz - off.z)],
      rotY: zSign === 1 ? -c.rot : c.rot,
    };
  });
}
