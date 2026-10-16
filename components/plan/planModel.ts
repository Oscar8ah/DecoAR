/**
 * DecoAR — Modelo de plano COMPARTIDO con DecoIArte.
 * ------------------------------------------------------------------
 * Este archivo NO inventa un formato: refleja el que ya existe en producción,
 * guardado en la tabla `modelos_3d_plano` (columna `modelo_json`) y consumido por
 * `frontend/visor3d.js`. Los campos y su semántica se verificaron leyendo ese código;
 * cada convención lleva abajo la línea exacta que la respalda.
 *
 * NADA de este archivo cambia el esquema de producción. Es solo lectura e interpretación.
 *
 * ── SEMÁNTICA VERIFICADA (visor3d.js) ──
 *  · `x`, `z` de un módulo son la ESQUINA MÍNIMA, no el centro:
 *       `if (m.x + m.ancho > maxX) maxX = m.x + m.ancho`        (visor3d.js:8497-8500)
 *    Así que el módulo ocupa [x, x+ancho] × [z, z+largo].
 *  · `ancho` corre en X y `largo` en Z. Se deduce de la misma línea y del uso de los lados.
 *  · Los lados se nombran: norte = z menor, sur = z mayor, oeste = x menor, este = x mayor:
 *       norte → `wz = a.z`            sur  → `wz = a.z + a.largo`
 *       oeste → `wx = a.x`            este → `wx = a.x + a.ancho`   (visor3d.js:8995-8998)
 *    (Ojo: "norte" es z menor, que en pantalla suele dibujarse arriba. No es el norte real.)
 *  · `vanos[].centro` es una COORDENADA ABSOLUTA del plano, no un offset dentro de la pared:
 *       norte/sur → `wx = v.centro - offsetX`   (es una X del plano)
 *       oeste/este→ `wz = v.centro - offsetZ`   (es una Z del plano)      (visor3d.js:8995-8998)
 *    Y el hueco en el muro va de `v.centro - v.ancho/2` a `v.centro + v.ancho/2` (visor3d.js:8802-8803).
 *  · `vanos[].alto` por defecto 2.1 m                                     (visor3d.js:8805, 9001)
 *  · `alto_piso` por defecto 2.6 m                                        (visor3d.js:8487)
 *  · `altura_entrepiso` por defecto 2.80 m, y cada nivel se levanta
 *    `(mod.nivel || 0) * altura_entrepiso`                                (visor3d.js:8489-8493)
 *  · El visor centra la maqueta en `maxX/2`, `maxZ/2`                     (visor3d.js:8501-8502)
 *
 *  · TIPOS. Es cuarto todo tipo que NO esté en TIPOS_NO_CUARTO (visor3d.js:6372-6373), así que
 *    sala, cocina, bano, cuarto, habitacion y PASILLO son cuartos. Rotar un módulo en el editor
 *    solo intercambia ancho y largo (visor3d.js, rotarModulo): no existe un campo de rotación.
 *  · `paredes_eliminadas` es una lista de LADOS ('norte'…). Se llena con el lado del muro
 *    eliminado (visor3d.js:439-440) y se compara contra el lado (visor3d.js:8830, 8973).
 *  · El visor web serializa los módulos con estos nombres y deja en null lo que no aplica
 *    (visor3d.js:8344-8378). Aquí se declaran tal cual, sin renombrar ni añadir campos.
 *
 * ── LÍMITES DEL FORMATO ACTUAL (documentados, no "arreglados" aquí) ──
 *  L1. Un módulo es siempre un RECTÁNGULO alineado a los ejes. Una habitación en L
 *      hay que componerla con dos módulos. No hay paredes en diagonal.
 *  L2. No hay grosor de pared por módulo. El visor usa sus propias constantes.
 *  L3. `paredes_compartidas` que trae el JSON solo dice {modulo_a, modulo_b, lado};
 *      el visor lo RECALCULA con rangos ini/fin                           (visor3d.js:8266-8294).
 *      Por eso aquí se recalcula también, en vez de confiar en el campo.
 *  L4. No hay techos, ni muebles, ni acabados por cara de pared.
 *  Estas son las extensiones que necesitaría el editor nativo.
 */

export type Lado = 'norte' | 'sur' | 'oeste' | 'este';
export type TipoVano = 'puerta' | 'ventana' | 'vano' | 'arco';   // 'arco': visor3d.js (serializador de vanos)

/** Una habitación rectangular. Medidas en METROS. */
export interface Modulo {
  id: string;
  nombre?: string;
  x: number;            // esquina mínima en X (m)
  z: number;            // esquina mínima en Z (m)
  ancho: number;        // extensión en X (m)
  largo: number;        // extensión en Z (m)
  alto?: number;        // alto libre (m); si falta, se usa alto_piso del plano
  nivel?: number;       // piso: 0 = planta baja
  material_piso?: string;
  color_pared?: string;
  es_humeda?: boolean;
  /** Tipo de módulo. Si falta o no está en TIPOS_NO_CUARTO, es un cuarto (visor3d.js:6373). */
  tipo?: string | null;
  /** Lados cuyo muro eliminó el usuario (visor3d.js:439-440). */
  paredes_eliminadas?: Lado[] | null;
  imagen_piso?: string | null;
  /** Diseño por lado (enchapes, placas, pintura). Aún no se representa en la maqueta. */
  diseno_paredes?: Record<string, unknown> | null;
  // ── estructura (visor3d.js:8357-8370); null cuando no aplica ──
  forma?: string | null;          // columna: 'cuadrada' | 'redonda'
  altura_base?: number | null;    // viga: desde el piso hasta su cara inferior
  peralte?: number | null;        // viga: canto
  descuelgue?: number | null;     // plafón
  tipo_techo?: string | null;     // cubierta
  pendiente?: number | null;
  voladizo?: number | null;
  orientacion?: unknown;
  espesor?: number | null;
  subtipo?: string | null;        // piso exterior
  acabado?: string | null;
  nivel_exterior?: number | null;
  baranda?: unknown;
  escalera?: unknown;
  capa?: string | null;           // 'planta' por defecto (visor3d.js, capaDe)
}

/** Tipos que NO son cuartos. Copiado tal cual de visor3d.js:6372. */
export const TIPOS_NO_CUARTO = ['pared', 'vidrio', 'columna', 'viga', 'plafon', 'cubierta', 'exterior', 'escalera', 'hueco', 'baranda'] as const;
/** Igual que `esCuarto` de visor3d.js:6373. Un tipo ausente cuenta como cuarto. */
export const esCuarto = (t: string | null | undefined) => !(TIPOS_NO_CUARTO as readonly string[]).includes(t ?? '');

/**
 * Abertura en un muro. `centro` es coordenada ABSOLUTA del plano (X si norte/sur, Z si oeste/este).
 * Los nombres van tal cual los crea el editor web (camelCase incluido): visor3d.js:7119-7181 y 8299-8318.
 *
 * Qué construye cada tipo en 3D (visor3d.js:8805, 8989, 9022):
 *   'arco'   → hueco de piso a techo, sin dintel ni marco
 *   'vano'   → hueco de piso a techo, con MARCO de `alto` (2.1); la web NO le pone dintel
 *   'puerta' → hueco con DINTEL sobre `alto` (2.1), marco y hoja
 *   'ventana'→ NO existe como vano en la web (allí las ventanas son objetos del entorno 3D).
 *              Extensión de DecoAR, con antepecho y dintel; se conserva por compatibilidad.
 */
export interface Vano {
  id?: string;
  modulo_a: string;
  /** null en una puerta libre que no da a otro cuarto (visor3d.js:7169). */
  modulo_b?: string | null;
  lado: Lado;
  centro: number;       // m, absoluto
  ancho: number;        // m
  alto?: number;        // m; por defecto 2.1
  alto_antepecho?: number; // m desde el piso; solo para el tipo 'ventana' (extensión de DecoAR)
  tipo?: TipoVano;
  /** Puerta "libre": el serializador web solo la conserva mientras exista su cuarto. */
  libre?: boolean;
  nivel?: number;
  bisagra?: 'izq' | 'der';
  sentido?: 'dentro' | 'fuera';
  anguloApertura?: number;     // grados, 0..90
  abierta?: boolean;
  /** 'sencilla' | 'doble' | 'corrediza' | 'vidrio' | 'plegable' (visor3d.js:9024) */
  estiloPuerta?: string;
  /** Tramo de pared por el que puede deslizarse (visor3d.js:7209). */
  limIni?: number;
  limFin?: number;
}

/** El generador web las emite con el tramo exacto que se toca (visor3d.js:8266-8294). */
export interface ParedCompartida { modulo_a: string; modulo_b: string; lado: Lado; ini?: number; fin?: number }

/** El documento tal como vive en `modelos_3d_plano.modelo_json`. */
export interface Plano {
  tipo?: string;
  alto_piso?: number;            // por defecto 2.6
  altura_entrepiso?: number;     // por defecto 2.80
  modulos: Modulo[];
  vanos?: Vano[];
  paredes_compartidas?: ParedCompartida[];
  niveles?: number;
  /** Techos interiores y fachada (visor3d.js:8381). Aún no se representa en la maqueta. */
  envolvente?: Record<string, unknown> | null;
}

export const ALTO_PISO_DEF = 2.6;
export const ALTURA_ENTREPISO_DEF = 2.80;
export const ALTO_VANO_DEF = 2.1;

/** Fuente del plano. Hoy solo 'local'; en la fase 2 entrará 'supabase' sin tocar el generador. */
export interface FuentePlano {
  origen: 'local' | 'supabase';
  id?: string;          // id de la fila en modelos_3d_plano, cuando venga de la nube
  plano: Plano;
}

// ───────────────────────────── Validación ─────────────────────────────

/** Problemas que impiden generar geometría. Devuelve [] si el plano sirve. */
export function validarPlano(p: Plano | null | undefined): string[] {
  const e: string[] = [];
  if (!p || !Array.isArray(p.modulos) || p.modulos.length === 0) return ['El plano no tiene módulos'];
  const ids = new Set<string>();
  for (const m of p.modulos) {
    const n = m?.nombre || m?.id || '(sin id)';
    // El editor web crea los ids con Date.now() (números, visor3d.js:6853); la IA los crea como texto.
    const idValido = (typeof m?.id === 'string' && m.id !== '') || (typeof (m as any)?.id === 'number' && Number.isFinite((m as any).id));
    if (!m || !idValido) { e.push('Hay un módulo sin id'); continue; }
    if (ids.has(String(m.id))) e.push(`Módulo con id repetido: ${m.id}`);
    ids.add(String(m.id));
    for (const [k, v] of [['x', m.x], ['z', m.z], ['ancho', m.ancho], ['largo', m.largo]] as const)
      if (!Number.isFinite(v)) e.push(`${n}: ${k} no es un número`);
    if (m.ancho <= 0 || m.largo <= 0) e.push(`${n}: ancho y largo deben ser mayores que cero`);
    if (m.alto !== undefined && !(m.alto > 0)) e.push(`${n}: alto inválido`);
  }
  for (const v of p.vanos ?? []) {
    if (!ids.has(String(v.modulo_a))) e.push(`Vano sobre un módulo inexistente: ${v.modulo_a}`);
    if (!(v.ancho > 0)) e.push(`Vano en ${v.modulo_a}: ancho inválido`);
    if (!Number.isFinite(v.centro)) e.push(`Vano en ${v.modulo_a}: centro inválido`);
    if (!['norte', 'sur', 'oeste', 'este'].includes(v.lado)) e.push(`Vano en ${v.modulo_a}: lado desconocido`);
  }
  return e;
}

/** Plano de ejemplo para la fase 1: una habitación de 4 × 3 m con una puerta y una ventana. */
export function planoDemo(ancho = 4, largo = 3, alto = 2.5): Plano {
  return {
    tipo: 'demo',
    alto_piso: alto,
    modulos: [{ id: 'sala', nombre: 'Sala', x: 0, z: 0, ancho, largo, alto, material_piso: 'madera', color_pared: '#F5F5F5' }],
    vanos: [
      // Puerta de 0.9 m centrada en el lado norte (z menor). `centro` es una X absoluta.
      { modulo_a: 'sala', lado: 'norte', centro: ancho / 2, ancho: 0.9, alto: 2.1, tipo: 'puerta' },
      // Ventana de 1.2 m en el lado este (x mayor). `centro` es una Z absoluta.
      { modulo_a: 'sala', lado: 'este', centro: largo / 2, ancho: 1.2, alto: 1.2, alto_antepecho: 0.9, tipo: 'ventana' },
    ],
  };
}

/** Cambia una dimensión del módulo conservando su esquina. Devuelve un plano NUEVO (no muta). */
export function conDimension(p: Plano, moduloId: string, campo: 'ancho' | 'largo' | 'alto', valor: number): Plano {
  return {
    ...p,
    modulos: p.modulos.map(m => (m.id === moduloId ? { ...m, [campo]: valor } : m)),
    vanos: p.vanos ? p.vanos.map(v => ({ ...v })) : undefined,
  };
}

/**
 * Apartamento de PRUEBA, SINTÉTICO. No proviene de ningún cliente ni de la base de datos.
 * Reproduce la FORMA del JSON que serializa el visor web (snake_case y null en lo que no aplica),
 * para probar el generador mientras no haya un plano real exportado.
 *
 *  x →   0        5      8
 *  z  0  ┌─ sala ──┬cocina┐   cocina abierta: sala y cocina eliminaron la pared que comparten
 *     4  ├──── pasillo ───┤
 *   5.2  ├ cuarto ─┬ bano ┤
 *   7.7  │         └──────┘
 *   8.2  └─────────┘
 *  Más una columna en la esquina sala/cocina/pasillo y una viga que cruza la sala.
 */
export function planoApartamentoSintetico(): Plano {
  const base = { alto: 2.5, nivel: 0, capa: 'planta', imagen_piso: null, diseno_paredes: null,
    forma: null, altura_base: null, peralte: null, descuelgue: null, tipo_techo: null, pendiente: null,
    voladizo: null, orientacion: null, espesor: null, subtipo: null, acabado: null, nivel_exterior: null,
    baranda: null, escalera: null };
  return {
    tipo: 'apartamento', alto_piso: 2.5, altura_entrepiso: 2.8, niveles: 1,
    modulos: [
      { ...base, id: 'sala',    nombre: 'Sala',    tipo: 'sala',    x: 0, z: 0,   ancho: 5, largo: 4,   color_pared: '#F5F5F5', material_piso: 'madera',   paredes_eliminadas: ['este'] },
      { ...base, id: 'cocina',  nombre: 'Cocina',  tipo: 'cocina',  x: 5, z: 0,   ancho: 3, largo: 4,   color_pared: '#F5F5F5', material_piso: 'ceramica', paredes_eliminadas: ['oeste'] },
      { ...base, id: 'pasillo', nombre: 'Pasillo', tipo: 'pasillo', x: 0, z: 4,   ancho: 8, largo: 1.2, color_pared: '#F5F5F5', material_piso: 'ceramica', paredes_eliminadas: [] },
      { ...base, id: 'cuarto',  nombre: 'Cuarto',  tipo: 'cuarto',  x: 0, z: 5.2, ancho: 5, largo: 3,   color_pared: '#F5F5F5', material_piso: 'madera',   paredes_eliminadas: [] },
      { ...base, id: 'bano',    nombre: 'Baño',    tipo: 'bano',    x: 5, z: 5.2, ancho: 3, largo: 2.5, color_pared: '#F5F5F5', material_piso: 'ceramica', paredes_eliminadas: [], es_humeda: true },
      { ...base, id: 'col-1',   nombre: 'Columna', tipo: 'columna', x: 4.85, z: 3.85, ancho: 0.3, largo: 0.3, forma: 'cuadrada', paredes_eliminadas: [] },
      { ...base, id: 'viga-1',  nombre: 'Viga',    tipo: 'viga',    x: 0, z: 1.9, ancho: 5, largo: 0.25, peralte: 0.35, paredes_eliminadas: [] },
    ],
    vanos: [
      { modulo_a: 'sala',   modulo_b: 'pasillo', lado: 'sur',   centro: 2.5, ancho: 0.9, alto: 2.1, tipo: 'puerta' },
      { modulo_a: 'cuarto', modulo_b: 'pasillo', lado: 'norte', centro: 1.5, ancho: 0.9, alto: 2.1, tipo: 'puerta' },
      { modulo_a: 'bano',   modulo_b: 'pasillo', lado: 'norte', centro: 6.5, ancho: 0.8, alto: 2.1, tipo: 'puerta' },
      { modulo_a: 'sala',   lado: 'norte', centro: 2.5, ancho: 1.6, alto: 1.2, alto_antepecho: 0.9, tipo: 'ventana' },
    ],
    paredes_compartidas: [],
    envolvente: null,
  };
}

/**
 * Copia del plano con todos los ids como texto. El editor web usa números y la IA texto; dentro de
 * un mismo plano siempre son coherentes, así que pasarlos a texto no cambia ninguna relación.
 * No modifica el plano recibido.
 */
export function normalizarIds(p: Plano): Plano {
  const t = (x: unknown) => (typeof x === 'number' ? String(x) : (x as string));
  return {
    ...p,
    modulos: (p.modulos ?? []).map(m => ({ ...m, id: t(m.id) })),
    vanos: p.vanos?.map(v => ({ ...v, modulo_a: t(v.modulo_a), modulo_b: v.modulo_b == null ? v.modulo_b : t(v.modulo_b) })),
    paredes_compartidas: p.paredes_compartidas?.map(c => ({ ...c, modulo_a: t(c.modulo_a), modulo_b: t(c.modulo_b) })),
  };
}