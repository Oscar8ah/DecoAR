/**
 * DecoAR — Generador de maqueta: plano → cajas.
 * ------------------------------------------------------------------
 * Módulo PURO: no importa React ni Viro, así que se prueba sin dispositivo.
 *
 * Entra un `Plano` (el formato real de DecoIArte) y salen cajas en METROS, con el
 * origen en el centro de la planta. La escala de visualización NO se aplica aquí:
 * es una transformación aparte (ver `escalaParaCaber`), para que los datos
 * arquitectónicos nunca se toquen.
 *
 * Paredes y huecos siguen la misma idea que `visor3d.js`: cada lado de cada módulo
 * se parte en segmentos restando los huecos de los vanos (`restarIntervalos`,
 * visor3d.js:8423-8435), y las paredes compartidas entre dos módulos se dibujan una sola vez.
 *
 * Convenciones verificadas en visor3d.js (detalladas en planModel.ts):
 *   módulo ocupa [x, x+ancho] × [z, z+largo]; norte = z menor, sur = z mayor,
 *   oeste = x menor, este = x mayor; `vano.centro` es coordenada ABSOLUTA.
 */

import {
  ALTO_PISO_DEF, ALTO_VANO_DEF, ALTURA_ENTREPISO_DEF,
  Lado, Modulo, Plano, Vano, esCuarto, normalizarIds, validarPlano,
} from './planModel';

/** Caja orientada a ejes, en METROS, con el origen en el centro de la planta. */
export interface Caja {
  id: string;
  clase: 'piso' | 'pared' | 'dintel';
  /** Centro de la caja (x, y, z). y se mide desde el nivel 0 del plano. */
  centro: [number, number, number];
  /** Tamaño (ancho en X, alto en Y, fondo en Z). */
  tamano: [number, number, number];
  color?: string;
  moduloId: string;
  /** Qué es: 'cuarto' para piso y muros de un cuarto; si no, el tipo estructural ('pared', 'columna', 'viga'). */
  elemento?: string;
}

export interface Maqueta {
  cajas: Caja[];
  /** Extensión de la planta en metros: [ancho en X, alto en Y, largo en Z]. */
  extension: [number, number, number];
  /** Área total de suelo (m²), sin descontar paredes. */
  areaM2: number;
  /** Problemas del plano; si hay alguno, `cajas` va vacío. */
  errores: string[];
  /** Avisos sobre cosas que el formato no puede representar (ver límites en planModel.ts). */
  avisos: string[];
  /**
   * Marcos de vanos y puertas (dos jambas y un cabezal), como visor3d.js:9007-9020.
   * Van APARTE de `cajas` para no cambiar la escena de maqueta en esta etapa: se calculan y se
   * prueban, pero la escena aún no los dibuja. La hoja de las puertas todavía no se genera.
   */
  marcos: Caja[];
}

// Marco de la web (visor3d.js:9008-9009)
export const ESP_MARCO = 0.06;
export const FONDO_MARCO = 0.16;

export const GROSOR_PARED = 0.10;  // m. El formato no lo trae (límite L2): constante propia.
export const GROSOR_PISO = 0.04;   // m

/** Resta huecos de un intervalo. Equivalente a `restarIntervalos` de visor3d.js:8423. */
export function restarIntervalos(ini: number, fin: number, huecos: [number, number][]): [number, number][] {
  let seg: [number, number][] = [[ini, fin]];
  for (const [hIni, hFin] of huecos) {
    const nuevos: [number, number][] = [];
    for (const [sIni, sFin] of seg) {
      if (hFin <= sIni || hIni >= sFin) { nuevos.push([sIni, sFin]); continue; }
      if (hIni > sIni) nuevos.push([sIni, Math.min(hIni, sFin)]);
      if (hFin < sFin) nuevos.push([Math.max(hFin, sIni), sFin]);
    }
    seg = nuevos;
  }
  return seg.filter(([a, b]) => b - a > 0.05);   // mismo umbral que el visor
}

// Misma regla que visor3d.js:8487-8493 y 8546 (con ||, como la web: un 0 cuenta como "sin dato").
const altoDe = (m: Modulo, p: Plano) => m.alto || p.alto_piso || ALTO_PISO_DEF;
const baseDe = (m: Modulo, p: Plano) => (m.nivel || 0) * (p.altura_entrepiso || ALTURA_ENTREPISO_DEF);
const LADOS: Lado[] = ['norte', 'sur', 'oeste', 'este'];

/** Rectángulo en planta (metros). */
export interface Rect { x0: number; x1: number; z0: number; z1: number }

/** Resta rectángulos de un rectángulo. Puerto literal de `restarHuecos` (visor3d.js:6519-6534). */
export function restarHuecosRect(rect: Rect, huecos: Rect[]): Rect[] {
  let pedazos: Rect[] = [rect];
  for (const h of huecos) {
    const nuevos: Rect[] = [];
    for (const p of pedazos) {
      const ix0 = Math.max(p.x0, h.x0), ix1 = Math.min(p.x1, h.x1), iz0 = Math.max(p.z0, h.z0), iz1 = Math.min(p.z1, h.z1);
      if (ix1 - ix0 <= 0.01 || iz1 - iz0 <= 0.01) { nuevos.push(p); continue; }      // no se tocan
      if (iz0 - p.z0 > 0.01) nuevos.push({ x0: p.x0, x1: p.x1, z0: p.z0, z1: iz0 });   // franja de arriba
      if (p.z1 - iz1 > 0.01) nuevos.push({ x0: p.x0, x1: p.x1, z0: iz1, z1: p.z1 });   // franja de abajo
      if (ix0 - p.x0 > 0.01) nuevos.push({ x0: p.x0, x1: ix0, z0: iz0, z1: iz1 });     // izquierda
      if (p.x1 - ix1 > 0.01) nuevos.push({ x0: ix1, x1: p.x1, z0: iz0, z1: iz1 });     // derecha
    }
    pedazos = nuevos;
  }
  return pedazos;
}

/** Rango que ocupa un lado del módulo, en la coordenada que corre a lo largo de ese lado. */
function rangoLado(m: Modulo, lado: Lado): [number, number] {
  return lado === 'norte' || lado === 'sur' ? [m.x, m.x + m.ancho] : [m.z, m.z + m.largo];
}

/** ¿Dos módulos comparten este lado? Se RECALCULA (límite L3) en vez de confiar en el campo. */
function ladoCompartido(a: Modulo, b: Modulo, lado: Lado): [number, number] | null {
  const TOL = 0.01;
  const tocan =
    lado === 'norte' ? Math.abs(a.z - (b.z + b.largo)) < TOL :
    lado === 'sur'   ? Math.abs(a.z + a.largo - b.z) < TOL :
    lado === 'oeste' ? Math.abs(a.x - (b.x + b.ancho)) < TOL :
                       Math.abs(a.x + a.ancho - b.x) < TOL;
  if (!tocan) return null;
  const [a0, a1] = rangoLado(a, lado), [b0, b1] = rangoLado(b, lado);
  const ini = Math.max(a0, b0), fin = Math.min(a1, b1);
  return fin - ini > 0.05 ? [ini, fin] : null;
}

/**
 * Genera la maqueta. Todo en metros, origen en el centro de la planta
 * (mismo criterio que visor3d.js:8501-8502: offset = max/2).
 */
export function generarMaqueta(planoEntrada: Plano): Maqueta {
  const errores = validarPlano(planoEntrada);
  const avisos: string[] = [];
  if (errores.length) return { cajas: [], extension: [0, 0, 0], areaM2: 0, errores, avisos, marcos: [] };
  const plano = normalizarIds(planoEntrada);   // ids numéricos del editor web → texto

  const mods = plano.modulos;
  const vanos = plano.vanos ?? [];
  const maxX = Math.max(...mods.map(m => m.x + m.ancho));
  const maxZ = Math.max(...mods.map(m => m.z + m.largo));
  const minX = Math.min(...mods.map(m => m.x));
  const minZ = Math.min(...mods.map(m => m.z));
  const offX = (minX + maxX) / 2, offZ = (minZ + maxZ) / 2;
  const cajas: Caja[] = [];
  let areaM2 = 0;
  let altoMax = 0;

  const cuartos = mods.filter(m => esCuarto(m.tipo));
  const huecos = mods.filter(m => m.tipo === 'hueco');
  const omitidos = new Map<string, number>();
  const omitir = (t: string) => omitidos.set(t, (omitidos.get(t) ?? 0) + 1);
  const elim = (m: Modulo, lado: Lado) => (m.paredes_eliminadas ?? []).includes(lado);

  if (mods.some(m => (m.nivel ?? 0) > 0)) avisos.push('El plano tiene varios niveles: se generan apilados por altura_entrepiso');
  if (plano.envolvente) avisos.push('Techos y fachada (envolvente) aún no se representan');
  if (cuartos.some(m => m.diseno_paredes && Object.keys(m.diseno_paredes).length))
    avisos.push('El diseño de paredes (enchapes, placas y pintura por lado) aún no se representa');

  // Un hueco no se dibuja: solo recorta el PISO de cuartos de su mismo nivel, y únicamente en
  // niveles superiores (en planta baja recorta techos, que la maqueta no dibuja). visor3d.js:8534-8537
  const huecosPiso = (nivel: number): Rect[] => nivel > 0
    ? huecos.filter(h => (h.nivel || 0) === nivel).map(h => ({ x0: h.x, x1: h.x + h.ancho, z0: h.z, z1: h.z + h.largo }))
    : [];

  // ───────────────────────────── CUARTOS ─────────────────────────────
  for (const m of cuartos) {
    const h = altoDe(m, plano);
    const base = baseDe(m, plano);
    altoMax = Math.max(altoMax, base + h);

    // ── SUELO (recortado por huecos del mismo nivel, si los hay) ──
    const piezas = restarHuecosRect({ x0: m.x, x1: m.x + m.ancho, z0: m.z, z1: m.z + m.largo }, huecosPiso(m.nivel || 0));
    piezas.forEach((r, i) => {
      areaM2 += (r.x1 - r.x0) * (r.z1 - r.z0);
      cajas.push({
        id: piezas.length === 1 ? `piso-${m.id}` : `piso-${m.id}-${i}`, clase: 'piso', elemento: 'cuarto', moduloId: m.id,
        centro: [(r.x0 + r.x1) / 2 - offX, base - GROSOR_PISO / 2, (r.z0 + r.z1) / 2 - offZ],
        tamano: [r.x1 - r.x0, GROSOR_PISO, r.z1 - r.z0],
      });
    });

    // ── PAREDES ──
    // Regla de la web: cada cuarto dibuja sus propios muros (visor3d.js:8830), así que un muro
    // compartido se ve mientras AL MENOS UNO de los dos cuartos lo conserve. Aquí se dibuja una
    // sola vez (lo dibuja el cuarto de id menor) y desaparece solo si ambos lo eliminaron.
    const fijoDe = (lado: Lado) => lado === 'norte' ? m.z : lado === 'sur' ? m.z + m.largo : lado === 'oeste' ? m.x : m.x + m.ancho;
    for (const lado of LADOS) {
      const [ini, fin] = rangoLado(m, lado);
      const huecosVano: [number, number][] = vanos
        .filter(v => (v.modulo_a === m.id && v.lado === lado) || (v.modulo_b === m.id && v.lado === opuesto(lado)))
        .map(v => [v.centro - v.ancho / 2, v.centro + v.ancho / 2]);
      const compartidos: { o: Modulo; r: [number, number] }[] = [];
      for (const o of cuartos) {
        if (o.id === m.id || (o.nivel || 0) !== (m.nivel || 0)) continue;
        const r = ladoCompartido(m, o, lado);
        if (r) compartidos.push({ o, r });
      }

      let tramos: [number, number][];
      if (!elim(m, lado)) {
        // Conserva su muro: todo el lado, menos vanos y menos los tramos que dibuja el vecino de id menor
        const losDibujaElVecino = compartidos.filter(c => m.id > c.o.id).map(c => c.r);
        tramos = restarIntervalos(ini, fin, [...huecosVano, ...losDibujaElVecino]);
      } else {
        // Lo eliminó: solo dibuja los tramos compartidos que le tocan Y que el vecino conserva
        tramos = compartidos
          .filter(c => m.id < c.o.id && !elim(c.o, opuesto(lado)))
          .flatMap(c => restarIntervalos(c.r[0], c.r[1], huecosVano));
      }

      const esHoriz = lado === 'norte' || lado === 'sur';
      const fijo = fijoDe(lado);
      for (const [s0, s1] of tramos) {
        const largoSeg = s1 - s0;
        const cx = esHoriz ? (s0 + s1) / 2 : fijo;
        const cz = esHoriz ? fijo : (s0 + s1) / 2;
        cajas.push({
          id: `pared-${m.id}-${lado}-${s0.toFixed(3)}`, clase: 'pared', elemento: 'cuarto', moduloId: m.id, color: m.color_pared ?? undefined,
          centro: [cx - offX, base + h / 2, cz - offZ],
          tamano: esHoriz ? [largoSeg, h, GROSOR_PARED] : [GROSOR_PARED, h, largoSeg],
        });
      }

      // ── DINTEL y ANTEPECHO de los vanos de este cuarto en este lado ──
      for (const v of vanos) {
        if (!(v.modulo_a === m.id && v.lado === lado)) continue;
        // Si en ese punto no queda muro (ambos lo eliminaron, o no hay vecino), no hay dintel que dibujar
        const vecino = v.modulo_b ? cuartos.find(o => o.id === v.modulo_b) : undefined;
        const hayMuro = !elim(m, lado) || (vecino !== undefined && !elim(vecino, opuesto(lado)));
        if (!hayMuro) continue;
        // E0 — igual que la construcción 3D de la web: SOLO la puerta lleva dintel (visor3d.js:8805).
        // El arco y el vano dejan el hueco de piso a techo. La 'ventana' es una extensión de DecoAR.
        if (v.tipo !== 'puerta' && v.tipo !== 'ventana') continue;
        const altoV = v.alto || ALTO_VANO_DEF;
        const antepecho = v.tipo === 'ventana' ? (v.alto_antepecho ?? 0) : 0;
        const cx = esHoriz ? v.centro : fijo;
        const cz = esHoriz ? fijo : v.centro;
        const tam = (alt: number): [number, number, number] => esHoriz ? [v.ancho, alt, GROSOR_PARED] : [GROSOR_PARED, alt, v.ancho];
        if (antepecho > 0.02) cajas.push({
          id: `dintel-${m.id}-${lado}-${v.centro}-bajo`, clase: 'dintel', elemento: 'cuarto', moduloId: m.id, color: m.color_pared ?? undefined,
          centro: [cx - offX, base + antepecho / 2, cz - offZ], tamano: tam(antepecho),
        });
        const arriba = h - (antepecho + altoV);
        if (arriba > 0.02) cajas.push({
          id: `dintel-${m.id}-${lado}-${v.centro}-alto`, clase: 'dintel', elemento: 'cuarto', moduloId: m.id, color: m.color_pared ?? undefined,
          centro: [cx - offX, base + antepecho + altoV + arriba / 2, cz - offZ], tamano: tam(arriba),
        });
        else if (arriba < -0.02) avisos.push(`El vano de ${m.nombre ?? m.id} (${lado}) es más alto que la pared`);
      }
    }
  }

  // ───────────────────── ESTRUCTURA SIMPLE (visor3d.js:8699-8740) ─────────────────────
  for (const m of mods) {
    const t = m.tipo ?? '';
    if (esCuarto(t) || t === 'hueco') continue;
    const h = altoDe(m, plano);
    const base = baseDe(m, plano);
    const cx = m.x + m.ancho / 2 - offX, cz = m.z + m.largo / 2 - offZ;
    if (t === 'pared' || (t === 'columna' && m.forma !== 'redonda')) {
      // pared y columna cuadrada: caja ancho × alto × largo, apoyada en el piso
      altoMax = Math.max(altoMax, base + h);
      cajas.push({
        id: `est-${m.id}`, clase: 'pared', elemento: t, moduloId: m.id, color: t === 'columna' ? '#BDB8B2' : (m.color_pared ?? undefined),
        centro: [cx, base + h / 2, cz], tamano: [m.ancho, h, m.largo],
      });
    } else if (t === 'viga') {
      // viga: canto `peralte` (0.4 por defecto), cara inferior en `altura_base` (por defecto pegada al techo)
      const peralte = m.peralte ?? 0.4;
      const alturaBase = m.altura_base ?? Math.max(0, h - peralte);
      cajas.push({
        id: `est-${m.id}`, clase: 'pared', elemento: 'viga', moduloId: m.id, color: '#C6BFB4',
        centro: [cx, base + alturaBase + peralte / 2, cz], tamano: [m.ancho, peralte, m.largo],
      });
    } else {
      // vidrio (necesita material transparente), columna redonda (necesita cilindro), plafón,
      // cubierta, exterior, escalera y baranda: se informan en vez de dibujarse mal
      omitir(t === 'columna' ? 'columna redonda' : t);
    }
  }
  if (omitidos.size) avisos.push('Aún no se representan: ' + [...omitidos].map(([t, n]) => `${n} ${t}`).join(', '));

  // ───────────────────── MARCOS de vano y puerta (visor3d.js:8988-9020) ─────────────────────
  const marcos: Caja[] = [];
  vanos.forEach((v, idx) => {
    if (v.tipo !== 'puerta' && v.tipo !== 'vano') return;
    const a = mods.find(m => m.id === v.modulo_a);
    if (!a) return;
    marcos.push(...marcoDe(v, a, baseDe(a, plano), offX, offZ, idx));
  });

  return { cajas, extension: [maxX - minX, altoMax, maxZ - minZ], areaM2, errores: [], avisos, marcos };
}

/**
 * Dos jambas y un cabezal, como visor3d.js:9007-9020. El grupo de la web se arma sobre +X local y se
 * gira para los lados oeste/este; aquí se aplica ese giro directamente a posiciones y tamaños.
 */
function marcoDe(v: Vano, a: Modulo, base: number, offX: number, offZ: number, idx: number): Caja[] {
  const horizontal = v.lado === 'norte' || v.lado === 'sur';
  const wx = v.lado === 'norte' || v.lado === 'sur' ? v.centro : v.lado === 'oeste' ? a.x : a.x + a.ancho;
  const wz = v.lado === 'norte' ? a.z : v.lado === 'sur' ? a.z + a.largo : v.centro;
  const W = v.ancho, H = v.alto || ALTO_VANO_DEF;
  const id = `marco-${v.id ?? idx}`;
  // (desplazamiento a lo largo del muro, alto, tamaño a lo largo del muro, alto, fondo)
  const pieza = (sufijo: string, along: number, y: number, tamAlong: number, tamY: number): Caja => ({
    id: `${id}-${sufijo}`, clase: 'dintel', elemento: 'marco', moduloId: a.id, color: '#8B6914',
    centro: horizontal ? [wx + along - offX, base + y, wz - offZ] : [wx - offX, base + y, wz + along - offZ],
    tamano: horizontal ? [tamAlong, tamY, FONDO_MARCO] : [FONDO_MARCO, tamY, tamAlong],
  });
  return [
    pieza('jamba-i', -(W / 2 + ESP_MARCO / 2), H / 2, ESP_MARCO, H),
    pieza('jamba-d', +(W / 2 + ESP_MARCO / 2), H / 2, ESP_MARCO, H),
    pieza('cabezal', 0, H + ESP_MARCO / 2, W + ESP_MARCO * 2, ESP_MARCO),
  ];
}

const opuesto = (l: Lado): Lado => (l === 'norte' ? 'sur' : l === 'sur' ? 'norte' : l === 'oeste' ? 'este' : 'oeste');

/**
 * Escala de VISUALIZACIÓN. No toca los datos: es un factor uniforme que se aplica
 * al nodo que contiene la maqueta. Devuelve, por ejemplo, 0.05 para 1:20.
 */
export function escalaParaCaber(ext: [number, number, number], ladoMesaM = 0.6): number {
  const mayor = Math.max(ext[0], ext[2], 0.01);
  return ladoMesaM / mayor;
}

/** Denominador legible de la escala: 0.05 → 20 (es decir, 1:20). */
export const denominadorEscala = (escala: number) => Math.max(1, Math.round(1 / escala));