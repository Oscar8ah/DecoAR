/**
 * DecoAR — Editor de planta: las REGLAS del editor de DecoiArte, en lógica pura.
 * ------------------------------------------------------------------
 * Sin React, sin Viro, sin DOM: se prueba en Node y lo usa cualquier interfaz (sobre la mesa en AR
 * o en pantalla). Cada regla está portada de `frontend/visor3d.js` y lleva la línea de la que sale.
 *
 * El estado es inmutable: `reducirEditor(editor, accion)` devuelve un editor NUEVO.
 *
 * Diferencias con la web, todas documentadas y compatibles con sus datos:
 *  D1. Asas en las CUATRO esquinas. La esquina 'se' (x máx, z máx) es exactamente la regla web
 *      (visor3d.js:7751-7754); las otras tres son su espejo, dejando fija la esquina opuesta.
 *  D2. Al añadir un espacio en un punto (el que el usuario toca), ese punto se ajusta a la cuadrícula.
 *      Sin punto, se usa la misma colocación que la web (visor3d.js:6862-6863).
 *  D3. Un ancho, largo o alto escrito a mano que no sea positivo vuelve al valor por defecto (la web
 *      solo lo hace con texto no numérico; un negativo rompería la geometría).
 *  D4. Ids como texto ('m1', 'v1'). La web usa números; el generador acepta ambos.
 *  D5. El historial agrupa un gesto completo (iniciarGesto … terminarGesto) en UN paso, que es lo
 *      que la web consigue esperando a que se suelte el puntero (visor3d.js:7011-7014).
 */

import { Lado, Modulo, ParedCompartida, Plano, Vano, esCuarto } from './planModel';

// ───────────────────────────── Constantes de la web ─────────────────────────────
export const ESCALA_WEB = 40;                 // px por metro (visor3d.js:6310); solo para traducir tolerancias
export const CUADRICULA = 0.5;                // m: snap = ESCALA * 0.5 px (visor3d.js:7750, 7762)
export const LADO_MIN = 1;                    // m: Math.max(1, …) (visor3d.js:7753-7754)
export const TOL_CONTACTO = 0.15;             // m (visor3d.js:6964, 8268)
export const MIN_SOLAPE = 0.05;               // m (visor3d.js:6964, 8269)
export const ANCHO_VANO_DEF = 0.9;            // m (visor3d.js:8299)
export const ALTO_VANO_DEF = 2.1;             // m
export const ALTO_MODULO_DEF = 2.6;           // m (visor3d.js:6884)
export const ALTURA_ENTREPISO_DEF = 2.8;      // m
export const HISTORIAL_MAX = 60;              // pasos (visor3d.js:6998)
export const TOL_PUERTA_LIBRE = 12 / ESCALA_WEB;   // 12 px → 0.3 m (visor3d.js:7151)

/** Medidas iniciales por tipo (visor3d.js:6864-6877). Cualquier otro tipo: 4 × 4 m. */
export const MEDIDAS_DEFECTO: Record<string, { ancho: number; largo: number }> = {
  pasillo:  { ancho: 1.5,  largo: 6.0 },
  pared:    { ancho: 0.15, largo: 2.0 },
  vidrio:   { ancho: 0.15, largo: 2.0 },
  columna:  { ancho: 0.30, largo: 0.30 },
  viga:     { ancho: 0.25, largo: 4.00 },
  plafon:   { ancho: 2.50, largo: 2.50 },
  cubierta: { ancho: 8.00, largo: 6.00 },
  exterior: { ancho: 1.20, largo: 6.00 },
  escalera: { ancho: 1.00, largo: 4.50 },
  hueco:    { ancho: 1.20, largo: 2.60 },
  baranda:  { ancho: 3.00, largo: 0.08 },
};

/** Tipos que ofrece la web, con su emoji (visor3d.js:6341-6345). No hay un tipo "comedor". */
export const EMOJIS_MODULO: Record<string, string> = {
  sala: '🛋️', cocina: '🍳', habitacion: '🛏️', bano: '🚿', pasillo: '🚶', zona: '📦',
  pared: '🧱', vidrio: '🪟', columna: '🏛️', viga: '🪵', plafon: '⬜', cubierta: '🏠',
  exterior: '🟫', escalera: '🪜', hueco: '⬚', baranda: '🚧',
};
export const TIPOS_MODULO = Object.keys(EMOJIS_MODULO);

// ───────────────────────────── Tipos ─────────────────────────────
/** Esquina que se arrastra: 'no' = x mín y z mín … 'se' = x máx y z máx (la única de la web). */
export type Esquina = 'no' | 'ne' | 'so' | 'se';

export interface Contacto { modulo_a: string; modulo_b: string; lado: Lado; ini: number; fin: number; exterior: boolean; nivel: number }

/** Lo mismo que guarda la foto del historial web: módulos, vanos, muros cerrados y niveles (visor3d.js:7002). */
export interface Planta { modulos: Modulo[]; vanos: Vano[]; murosCerrados: string[]; niveles: number; origen?: OrigenPlano }

// ── P0 compatibilidad: el plano tal como llegó, para exportarlo sin perder nada ──
/**
 * 'ia'  = plano de plano_a_json_3d / WhatsApp (openai_service.py): `tipo` en la raíz, sin `tipo` por módulo.
 * 'web' = plano de generarDesdePlanta (visor3d.js:8340-8392): niveles, altura_entrepiso, envolvente…
 * 'desconocido' = señales de ambos o de ninguno (p. ej. los ejemplos propios de DecoAR).
 * 'nuevo' = dibujado desde cero en DecoAR: no hay original que conservar.
 */
export type Dialecto = 'ia' | 'web' | 'desconocido' | 'nuevo';

/** Copia intacta del plano cargado. Nunca se edita: es la referencia para exportar. */
export interface OrigenPlano {
  plano: Plano;
  /** id interno (texto) → id original con su tipo (número del editor web o texto de la IA). */
  ids: Record<string, string | number>;
  dialecto: Exclude<Dialecto, 'nuevo'>;
}

export interface ResultadoExportacion {
  plano: Plano;
  dialecto: Dialecto;
  /** true solo si cambió algún contacto entre cuartos y por eso se recalcularon. */
  paredesRecalculadas: boolean;
  /** Casos que la exportación no resolvió sola. Vacío = sin conflictos. */
  conflictos: string[];
}

export type Seleccion = { tipo: 'modulo'; id: string } | { tipo: 'vano'; id: string } | null;

export interface EditorPlanta {
  planta: Planta;
  nivelActivo: number;
  seleccion: Seleccion;
  deshacer: string[];         // fotos en JSON, como pilaDeshacer de la web
  rehacer: string[];
  fotoGesto: string | null;   // foto al empezar un arrastre: todo el arrastre es UN paso
  contador: number;           // para ids; no se deshace, así un id nunca se reutiliza
  mensaje: string | null;     // aviso para la interfaz (el equivalente a mostrarToast)
}

export type CampoVano = 'ancho' | 'tipo' | 'bisagra' | 'sentido' | 'estilo' | 'apertura' | 'alto';

export type AccionEditor =
  | { type: 'agregarModulo'; tipo: string; x?: number; z?: number; nombre?: string }   // nombre: p. ej. 'Comedor' sobre el tipo 'zona'
  | { type: 'moverModulo'; id: string; x: number; z: number }                     // esquina mínima deseada
  | { type: 'redimensionar'; id: string; esquina: Esquina; x: number; z: number }  // posición del dedo
  | { type: 'fijarDimension'; id: string; campo: 'ancho' | 'largo' | 'alto'; valor: number }
  | { type: 'rotarModulo'; id: string }
  | { type: 'actualizarModulo'; id: string; cambios: Partial<Pick<Modulo, 'nombre' | 'material_piso' | 'color_pared'>> }
  | { type: 'eliminarModulo'; id: string }
  | { type: 'crearVanoEnContacto'; contacto: Contacto }
  | { type: 'ponerPuertaLibre'; x: number; z: number; tolerancia?: number }
  | { type: 'moverVano'; id: string; u: number }                                    // coordenada a lo largo de su pared
  | { type: 'actualizarVano'; id: string; campo: CampoVano; valor: string | number }
  | { type: 'duplicarVano'; id: string }
  | { type: 'borrarVano'; id: string }
  | { type: 'convertir' }
  | { type: 'cargarPlano'; plano: Plano }
  | { type: 'seleccionar'; seleccion: Seleccion }
  | { type: 'iniciarGesto' }
  | { type: 'terminarGesto' }
  | { type: 'deshacer' }
  | { type: 'rehacer' };

// ───────────────────────────── Utilidades ─────────────────────────────
const ajustar = (v: number) => Math.round(v / CUADRICULA) * CUADRICULA;
export const claveMuro = (o: { modulo_a: string; modulo_b?: string | null; lado: Lado }) => `${o.modulo_a}|${o.modulo_b}|${o.lado}`;
const nivelDe = (m: { nivel?: number | null }) => m.nivel || 0;
const foto = (p: Planta) => JSON.stringify({ m: p.modulos, v: p.vanos, c: p.murosCerrados, n: p.niveles, o: p.origen });
const deFoto = (s: string): Planta => {
  const e = JSON.parse(s);
  const p: Planta = { modulos: e.m, vanos: e.v, murosCerrados: e.c || [], niveles: e.n || 1 };
  if (e.o) p.origen = e.o;   // el original no cambia nunca; solo viaja con la foto
  return p;
};
const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export function editorVacio(): EditorPlanta {
  return {
    planta: { modulos: [], vanos: [], murosCerrados: [], niveles: 1 },
    nivelActivo: 0, seleccion: null, deshacer: [], rehacer: [], fotoGesto: null, contador: 0, mensaje: null,
  };
}

function nuevoId(e: EditorPlanta, prefijo: 'm' | 'v'): { id: string; contador: number } {
  let c = e.contador;
  const usados = new Set([...e.planta.modulos.map(m => String(m.id)), ...e.planta.vanos.map(v => String(v.id))]);
  let id: string;
  do { c += 1; id = `${prefijo}${c}`; } while (usados.has(id));
  return { id, contador: c };
}

// ───────────────────── Contactos y paredes compartidas (portados) ─────────────────────
/** Puerto de `contactosPlanta` (visor3d.js:6963-6984): cuarto-cuarto y cuarto-exterior, mismo nivel. */
export function contactosPlanta(p: Planta): Contacto[] {
  const lista: Contacto[] = [];
  const ms = p.modulos;
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const mi = ms[i], mj = ms[j];
      let cu: Modulo, ot: Modulo, exterior: boolean;
      if (esCuarto(mi.tipo) && esCuarto(mj.tipo)) { cu = mi; ot = mj; exterior = false; }
      else if (esCuarto(mi.tipo) && mj.tipo === 'exterior') { cu = mi; ot = mj; exterior = true; }
      else if (esCuarto(mj.tipo) && mi.tipo === 'exterior') { cu = mj; ot = mi; exterior = true; }
      else continue;
      if (nivelDe(cu) !== nivelDe(ot)) continue;
      const a = { x: cu.x, z: cu.z, an: cu.ancho, la: cu.largo }, b = { x: ot.x, z: ot.z, an: ot.ancho, la: ot.largo };
      const push = (lado: Lado, ini: number, fin: number) => {
        if (fin - ini > MIN_SOLAPE) lista.push({ modulo_a: String(cu.id), modulo_b: String(ot.id), lado, ini, fin, exterior, nivel: nivelDe(cu) });
      };
      if (Math.abs(a.z - (b.z + b.la)) < TOL_CONTACTO) push('norte', Math.max(a.x, b.x), Math.min(a.x + a.an, b.x + b.an));
      if (Math.abs((a.z + a.la) - b.z) < TOL_CONTACTO) push('sur', Math.max(a.x, b.x), Math.min(a.x + a.an, b.x + b.an));
      if (Math.abs(a.x - (b.x + b.an)) < TOL_CONTACTO) push('oeste', Math.max(a.z, b.z), Math.min(a.z + a.la, b.z + b.la));
      if (Math.abs((a.x + a.an) - b.x) < TOL_CONTACTO) push('este', Math.max(a.z, b.z), Math.min(a.z + a.la, b.z + b.la));
    }
  }
  return lista;
}

/** Puerto de la detección de `generarDesdePlanta` (visor3d.js:8266-8294): solo cuarto-cuarto, por tramo exacto. */
export function paredesCompartidas(p: Planta): ParedCompartida[] {
  return contactosPlanta(p)
    .filter(c => !c.exterior)
    .map(c => ({ modulo_a: c.modulo_a, modulo_b: c.modulo_b, lado: c.lado, ini: c.ini, fin: c.fin }));
}

/**
 * Puerto de la parte de vanos de `generarDesdePlanta` (visor3d.js:8296-8338):
 *  1. Cada pared compartida sin vano, y que el usuario no haya cerrado, recibe un ARCO automático.
 *  2. Se descartan los vanos cuyas zonas ya no se tocan, salvo las puertas libres de un cuarto que existe.
 */
function convertirPlanta(p: Planta, generarId: () => string): Planta {
  const pcs = paredesCompartidas(p);
  const vanos = p.vanos.map(v => ({ ...v }));
  for (const pc of pcs) {
    const yaExiste = vanos.some(v => v.modulo_a === pc.modulo_a && v.modulo_b === pc.modulo_b && v.lado === pc.lado);
    if (yaExiste) continue;
    if (p.murosCerrados.includes(claveMuro(pc))) continue;   // el usuario lo dejó cerrado a propósito
    const largoContacto = (pc.fin as number) - (pc.ini as number);
    const a = p.modulos.find(m => String(m.id) === pc.modulo_a);
    vanos.push({
      id: generarId(), modulo_a: pc.modulo_a, modulo_b: pc.modulo_b, lado: pc.lado, nivel: a ? nivelDe(a) : 0,
      centro: ((pc.ini as number) + (pc.fin as number)) / 2,
      ancho: Math.min(ANCHO_VANO_DEF, Math.max(0.6, largoContacto - 0.2)),
      tipo: 'arco', alto: ALTO_VANO_DEF, bisagra: 'izq', sentido: 'dentro', anguloApertura: 75, abierta: true,
      limIni: pc.ini, limFin: pc.fin,
    });
  }
  const contactosExt = contactosPlanta(p).filter(c => c.exterior);
  const vivos = vanos.filter(v =>
    pcs.some(pc => pc.modulo_a === v.modulo_a && pc.modulo_b === v.modulo_b && pc.lado === v.lado) ||
    contactosExt.some(c => claveMuro(c) === claveMuro(v)) ||
    (v.libre === true && p.modulos.some(m => String(m.id) === v.modulo_a)));
  return { ...p, vanos: vivos };
}

/** El plano que entiende el generador de maqueta, con la forma del serializador web. */
export function planoDe(p: Planta): Plano {
  // P0: si el plano vino de fuera, su alto_piso y su altura_entrepiso mandan (un entrepiso de 3 m
  // no se apila a 2,80). Sin origen, o si el original no los trae, todo queda exactamente como antes.
  const o = p.origen?.plano;
  return {
    tipo: 'apartamento',
    alto_piso: typeof o?.alto_piso === 'number' ? o.alto_piso : (p.modulos[0]?.alto || ALTO_MODULO_DEF),
    altura_entrepiso: typeof o?.altura_entrepiso === 'number' ? o.altura_entrepiso : ALTURA_ENTREPISO_DEF,
    niveles: p.niveles,
    modulos: p.modulos.map(m => ({ ...m, paredes_eliminadas: m.paredes_eliminadas ?? [] })),
    vanos: p.vanos.map(v => ({ ...v })),
    paredes_compartidas: paredesCompartidas(p),
  };
}

// ───────────────────── P0: dialecto y exportación fiel ─────────────────────
const tiene = (o: unknown, k: string) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);

/**
 * Señales verificadas en el código de DecoiArte:
 *  · solo la WEB escribe en la raíz `altura_entrepiso`, `niveles` y `envolvente`, en cada módulo `nivel` y
 *    `capa`, y en cada pared compartida `ini`/`fin` (visor3d.js:8277-8392);
 *  · solo la IA escribe `tipo` en la raíz y `es_humeda` en los módulos, y sus paredes compartidas no
 *    llevan `ini`/`fin` (openai_service.py:296-318 y 485-510).
 * Si aparecen señales de los dos, o de ninguno, es 'desconocido': no se adivina.
 */
export function detectarDialecto(plano: Plano): Exclude<Dialecto, 'nuevo'> {
  const mods = (plano.modulos ?? []) as unknown[];
  const pcs = (plano.paredes_compartidas ?? []) as unknown[];
  const web = ['altura_entrepiso', 'niveles', 'envolvente'].some(k => tiene(plano, k))
    || mods.some(m => tiene(m, 'nivel') || tiene(m, 'capa'))
    || pcs.some(c => tiene(c, 'ini') || tiene(c, 'fin'));
  const ia = tiene(plano, 'tipo')
    || mods.some(m => tiene(m, 'es_humeda'))
    || pcs.some(c => !tiene(c, 'ini') && !tiene(c, 'fin'));
  if (web && !ia) return 'web';
  if (ia && !web) return 'ia';
  return 'desconocido';
}

const OPUESTO: Record<Lado, Lado> = { norte: 'sur', sur: 'norte', este: 'oeste', oeste: 'este' };

/**
 * Huella de los contactos entre cuartos, independiente del orden de los módulos y de qué cuarto
 * quedó como `modulo_a`: el mismo muro visto desde el otro lado da la misma clave. Los extremos se
 * redondean a micras para que mover y devolver un cuarto no cuente como cambio por ruido decimal.
 */
function huellaContactos(p: Planta): string {
  const um = (v: number | undefined) => Math.round((v ?? 0) * 1e6);
  return paredesCompartidas(p).map(c => {
    const [a, b, lado] = c.modulo_a < c.modulo_b ? [c.modulo_a, c.modulo_b, c.lado] : [c.modulo_b, c.modulo_a, OPUESTO[c.lado]];
    return `${a}|${b}|${lado}|${um(c.ini)}|${um(c.fin)}`;
  }).sort().join(';');
}

/** Copia sin las claves cuyo valor es `undefined` (en JSON no existen: ausente sigue siendo ausente). */
function sinIndefinidos<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Devuelve el plano para guardarlo, partiendo del ORIGINAL y cambiando solo lo que se editó.
 *  · Ids con su tipo original; claves desconocidas, `null` y ausencias tal cual; raíz intacta.
 *  · `paredes_compartidas`: si ningún contacto entre cuartos cambió, se devuelven las originales sin
 *    tocar. Si cambió alguno, se recalculan con las reglas de la web y con la forma del original
 *    (con `ini`/`fin` solo si el original las usaba). Si no hay forma de saberlo, se conservan las
 *    originales y se informa el conflicto: no se inventa una conversión.
 *  · Lo que el editor añadió y el dialecto original no usa se exporta y se informa como conflicto.
 */
export function exportarPlano(p: Planta): ResultadoExportacion {
  const o = p.origen;
  if (!o) return { plano: planoDe(p), dialecto: 'nuevo', paredesRecalculadas: true, conflictos: [] };

  const orig = o.plano;
  const idOrig = (id: unknown) => (id == null ? id : (o.ids[String(id)] ?? id)) as any;
  const conflictos: string[] = [];
  const out: any = JSON.parse(JSON.stringify(orig));   // raíz completa: tipo, alto_piso, envolvente, claves desconocidas…

  out.modulos = p.modulos.map(m => sinIndefinidos({ ...m, id: idOrig(m.id) }));

  const vanos = p.vanos.map(v => sinIndefinidos({ ...v, modulo_a: idOrig(v.modulo_a), modulo_b: idOrig(v.modulo_b) }));
  if (tiene(orig, 'vanos')) out.vanos = vanos;
  else if (vanos.length) {
    out.vanos = vanos;
    conflictos.push(`El plano original (${o.dialecto}) no tenía "vanos"; se exportan ${vanos.length} creados en DecoAR.`);
  }

  const nivelesCargados = orig.niveles || 1;   // lo mismo que hace cargar()
  if (p.niveles !== nivelesCargados) {
    out.niveles = p.niveles;
    if (!tiene(orig, 'niveles')) conflictos.push(`El plano original (${o.dialecto}) no tenía "niveles"; se exporta niveles = ${p.niveles}.`);
  }

  const nuevos = p.modulos.filter(m => !(String(m.id) in o.ids)).length;
  if (nuevos && o.dialecto === 'ia') conflictos.push(`Se añadieron ${nuevos} espacio(s) con campos del editor web (tipo, nivel, capa…) a un plano de la IA.`);

  // Contactos del original, con los mismos ids internos que usa el editor
  const plantaOriginal: Planta = { modulos: (orig.modulos ?? []).map(m => ({ ...m, id: String(m.id) })), vanos: [], murosCerrados: [], niveles: nivelesCargados };
  const cambioGeometrico = huellaContactos(plantaOriginal) !== huellaContactos(p);
  if (!cambioGeometrico) return { plano: out, dialecto: o.dialecto, paredesRecalculadas: false, conflictos };

  // Forma de las paredes: la del original si tenía alguna; si no, la de su dialecto; si tampoco, no se adivina.
  const pcsOrig = (orig.paredes_compartidas ?? []) as unknown[];
  const conTramo = pcsOrig.length ? pcsOrig.some(c => tiene(c, 'ini') || tiene(c, 'fin'))
    : o.dialecto === 'web' ? true : o.dialecto === 'ia' ? false : null;
  if (conTramo === null) {
    conflictos.push('Cambiaron los contactos, pero no se puede saber qué forma de paredes_compartidas usa este plano: se conservaron las originales.');
    return { plano: out, dialecto: o.dialecto, paredesRecalculadas: false, conflictos };
  }
  out.paredes_compartidas = paredesCompartidas(p).map(c => conTramo
    ? { modulo_a: idOrig(c.modulo_a), modulo_b: idOrig(c.modulo_b), lado: c.lado, ini: c.ini, fin: c.fin }
    : { modulo_a: idOrig(c.modulo_a), modulo_b: idOrig(c.modulo_b), lado: c.lado });
  return { plano: out, dialecto: o.dialecto, paredesRecalculadas: true, conflictos };
}

// ───────────────────────────── Reductor ─────────────────────────────
/** Acciones que solo cambian la vista, sin entrar al historial. */
const SIN_HISTORIAL = new Set(['seleccionar', 'iniciarGesto', 'terminarGesto', 'deshacer', 'rehacer', 'cargarPlano']);

export function reducirEditor(e: EditorPlanta, a: AccionEditor): EditorPlanta {
  const limpio = { ...e, mensaje: null };
  switch (a.type) {
    case 'seleccionar': return { ...limpio, seleccion: a.seleccion };
    case 'iniciarGesto': return e.fotoGesto !== null ? limpio : { ...limpio, fotoGesto: foto(e.planta) };
    case 'terminarGesto': return terminarGesto(limpio);
    case 'deshacer': return deshacer(limpio);
    case 'rehacer': return rehacer(limpio);
    case 'cargarPlano': return cargar(a.plano);
  }
  const antes = foto(e.planta);
  const n = aplicar(limpio, a);
  if (SIN_HISTORIAL.has(a.type) || e.fotoGesto !== null) return n;   // dentro de un arrastre: se agrupa al final
  return confirmar(n, antes);
}

function confirmar(e: EditorPlanta, antes: string): EditorPlanta {
  if (foto(e.planta) === antes) return e;                             // nada cambió: no hay paso nuevo
  const deshacerPila = [...e.deshacer, antes].slice(-HISTORIAL_MAX);   // máximo 60, como la web
  return { ...e, deshacer: deshacerPila, rehacer: [] };
}

function terminarGesto(e: EditorPlanta): EditorPlanta {
  if (e.fotoGesto === null) return e;
  return confirmar({ ...e, fotoGesto: null }, e.fotoGesto);
}

function conSeleccionValida(e: EditorPlanta): EditorPlanta {
  const s = e.seleccion;
  if (!s) return e;
  const existe = s.tipo === 'modulo' ? e.planta.modulos.some(m => String(m.id) === s.id) : e.planta.vanos.some(v => String(v.id) === s.id);
  return existe ? e : { ...e, seleccion: null };
}

function deshacer(e0: EditorPlanta): EditorPlanta {
  const e = terminarGesto(e0);   // si había un arrastre a medias, primero se guarda (visor3d.js:7044)
  if (!e.deshacer.length) return { ...e, mensaje: 'Nada que deshacer' };
  const pila = [...e.deshacer];
  const anterior = pila.pop() as string;
  return conSeleccionValida({ ...e, planta: deFoto(anterior), deshacer: pila, rehacer: [...e.rehacer, foto(e.planta)],
    mensaje: `Deshecho: quedan ${pila.length} paso${pila.length === 1 ? '' : 's'} atrás` });
}

function rehacer(e0: EditorPlanta): EditorPlanta {
  const e = terminarGesto(e0);
  if (!e.rehacer.length) return { ...e, mensaje: 'Nada que rehacer' };
  const pila = [...e.rehacer];
  const siguiente = pila.pop() as string;
  return conSeleccionValida({ ...e, planta: deFoto(siguiente), rehacer: pila, deshacer: [...e.deshacer, foto(e.planta)].slice(-HISTORIAL_MAX), mensaje: 'Rehecho' });
}

function cargar(plano: Plano): EditorPlanta {
  const e = editorVacio();
  const t = (x: unknown) => (x == null ? (x as null) : String(x));
  // P0: copia intacta (vía JSON, que es como vive en modelo_json) y tipo original de cada id.
  const copia: Plano = JSON.parse(JSON.stringify(plano));
  const ids: Record<string, string | number> = {};
  for (const m of copia.modulos ?? []) ids[String(m.id)] = m.id as string | number;
  return {
    ...e,
    planta: {
      modulos: (plano.modulos ?? []).map(m => ({ ...m, id: String(m.id) })),
      vanos: (plano.vanos ?? []).map(v => ({ ...v, modulo_a: String(v.modulo_a), modulo_b: t(v.modulo_b) })),
      murosCerrados: [],
      niveles: plano.niveles || 1,
      origen: { plano: copia, ids, dialecto: detectarDialecto(copia) },
    },
  };
}

// Cambia un módulo; solo los del nivel activo se editan (modulosEditables, visor3d.js:6332)
function conModulo(e: EditorPlanta, id: string, f: (m: Modulo) => Modulo | null): EditorPlanta {
  const m = e.planta.modulos.find(x => String(x.id) === id);
  if (!m) return { ...e, mensaje: 'Ese espacio no existe' };
  if (nivelDe(m) !== e.nivelActivo) return { ...e, mensaje: 'Ese espacio está en otro nivel' };
  const nuevo = f(m);
  if (!nuevo) return e;
  return { ...e, planta: { ...e.planta, modulos: e.planta.modulos.map(x => (x === m ? nuevo : x)) } };
}

function conVano(e: EditorPlanta, id: string, f: (v: Vano) => Vano): EditorPlanta {
  const v = e.planta.vanos.find(x => String(x.id) === id);
  if (!v) return { ...e, mensaje: 'Ese vano no existe' };
  return { ...e, planta: { ...e.planta, vanos: e.planta.vanos.map(x => (x === v ? f(v) : x)) } };
}

/** Puerto de `actualizarVano` (visor3d.js:7213-7248), campo por campo. */
function actualizarVano(v0: Vano, campo: CampoVano, valor: string | number): Vano {
  const v: Vano = { ...v0 };
  const limIni = v.limIni ?? 0, limFin = v.limFin ?? v.centro + v.ancho / 2;
  if (campo === 'ancho') {
    const maxAncho = limFin - limIni;
    v.ancho = Math.max(0.4, Math.min(maxAncho, Number(valor)));
    const mitad = v.ancho / 2;
    v.centro = Math.max(limIni + mitad, Math.min(limFin - mitad, v.centro));
  } else if (campo === 'tipo') {
    v.tipo = valor as Vano['tipo'];
    if (valor === 'puerta') {
      v.bisagra = v.bisagra || 'izq';
      v.sentido = v.sentido || 'dentro';
      v.anguloApertura = v.anguloApertura ?? 75;
      if (v.abierta === undefined) v.abierta = true;
    }
  } else if (campo === 'bisagra') {
    v.bisagra = valor as Vano['bisagra'];
  } else if (campo === 'sentido') {
    v.sentido = valor as Vano['sentido'];
  } else if (campo === 'estilo') {
    v.estiloPuerta = String(valor);
    const minimo = ({ doble: 1.2, corrediza: 0.8, plegable: 0.8 } as Record<string, number>)[String(valor)];
    if (minimo && v.ancho < minimo && limFin - limIni >= minimo) return actualizarVano(v, 'ancho', minimo);
  } else if (campo === 'apertura') {
    const ang = Math.max(0, Math.min(90, Number(valor) || 0));
    v.anguloApertura = ang;
    v.abierta = ang > 0;
  } else if (campo === 'alto') {
    v.alto = Math.max(1.6, Math.min(2.5, Number(valor)));
  }
  return v;
}

/** Rango del muro de un lado de un módulo (para vanos sin límites, p. ej. de planos de la IA). */
function rangoMuro(m: Modulo, lado: Lado): [number, number] {
  return lado === 'norte' || lado === 'sur' ? [m.x, m.x + m.ancho] : [m.z, m.z + m.largo];
}

function aplicar(e: EditorPlanta, a: AccionEditor): EditorPlanta {
  const p = e.planta;
  switch (a.type) {
    // ── Espacios ──
    case 'agregarModulo': {
      if (!TIPOS_MODULO.includes(a.tipo)) return { ...e, mensaje: `Tipo de espacio desconocido: ${a.tipo}` };
      const { id, contador } = nuevoId(e, 'm');
      const n = p.modulos.length;
      const med = MEDIDAS_DEFECTO[a.tipo] || { ancho: 4, largo: 4 };
      const x = a.x !== undefined ? ajustar(a.x) : (100 + (n % 3) * (4 * ESCALA_WEB + 10)) / ESCALA_WEB;   // D2
      const z = a.z !== undefined ? ajustar(a.z) : (80 + Math.floor(n / 3) * (4 * ESCALA_WEB + 10)) / ESCALA_WEB;
      const nuevo: Modulo = {
        id, tipo: a.tipo, nombre: a.nombre ?? `${EMOJIS_MODULO[a.tipo]} ${capitalizar(a.tipo)}`,
        x, z, ancho: med.ancho, largo: med.largo, alto: ALTO_MODULO_DEF,
        nivel: e.nivelActivo, capa: a.tipo === 'plafon' ? 'techo' : 'planta', paredes_eliminadas: [],
      };
      // Valores iniciales propios de cada tipo (visor3d.js:6890-6916), con los nombres del plano guardado
      if (a.tipo === 'columna') nuevo.forma = 'cuadrada';
      if (a.tipo === 'viga') { nuevo.peralte = 0.40; nuevo.altura_base = 2.20; }
      if (a.tipo === 'plafon') { nuevo.forma = 'rect'; nuevo.descuelgue = 0.25; nuevo.espesor = 0.10; nuevo.color_pared = '#F7F7F5'; }
      if (a.tipo === 'cubierta') {
        nuevo.forma = 'rect'; nuevo.tipo_techo = 'dos_aguas'; nuevo.pendiente = 35;
        nuevo.altura_base = 2.60; nuevo.voladizo = 0.50; nuevo.orientacion = 0;
      }
      return { ...e, contador, seleccion: { tipo: 'modulo', id }, planta: { ...p, modulos: [...p.modulos, nuevo] } };
    }
    case 'moverModulo':   // visor3d.js:7761-7766: la esquina mínima se ajusta a la cuadrícula
      return conModulo(e, a.id, m => ({ ...m, x: ajustar(a.x), z: ajustar(a.z) }));
    case 'redimensionar':
      return conModulo(e, a.id, m => {
        const x1 = m.x + m.ancho, z1 = m.z + m.largo;
        let { x, z, ancho, largo } = m;
        if (a.esquina === 'se' || a.esquina === 'ne') ancho = Math.max(LADO_MIN, ajustar(a.x - m.x));        // regla web (7753)
        else { ancho = Math.max(LADO_MIN, ajustar(x1 - a.x)); x = x1 - ancho; }                                // espejo (D1)
        if (a.esquina === 'se' || a.esquina === 'so') largo = Math.max(LADO_MIN, ajustar(a.z - m.z));          // regla web (7754)
        else { largo = Math.max(LADO_MIN, ajustar(z1 - a.z)); z = z1 - largo; }                                // espejo (D1)
        return { ...m, x, z, ancho, largo };
      });
    case 'fijarDimension':   // visor3d.js:8140-8142: valor escrito || por defecto, sin cuadrícula ni mínimo
      return conModulo(e, a.id, m => {
        const def = a.campo === 'alto' ? ALTO_MODULO_DEF : 4;
        const v = Number.isFinite(a.valor) && a.valor > 0 ? a.valor : def;    // D3
        return { ...m, [a.campo]: v };
      });
    case 'rotarModulo':   // visor3d.js:8126-8136: solo intercambia ancho y largo
      return conModulo(e, a.id, m => ({ ...m, ancho: m.largo, largo: m.ancho }));
    case 'actualizarModulo': {
      const permitidos = ['nombre', 'material_piso', 'color_pared'];
      const cambios = Object.fromEntries(Object.entries(a.cambios).filter(([k]) => permitidos.includes(k)));
      return conModulo(e, a.id, m => ({ ...m, ...cambios }));
    }
    case 'eliminarModulo': {   // visor3d.js:8216-8224: los vanos no se tocan aquí; se limpian al convertir
      const m = p.modulos.find(x => String(x.id) === a.id);
      if (!m) return { ...e, mensaje: 'Ese espacio no existe' };
      return { ...e, seleccion: null, planta: { ...p, modulos: p.modulos.filter(x => x !== m) } };
    }

    // ── Vanos ──
    case 'crearVanoEnContacto': {   // visor3d.js:7119-7141
      const c = contactosPlanta(p).find(k => claveMuro(k) === claveMuro(a.contacto) && Math.abs(k.ini - a.contacto.ini) < 1e-6 && Math.abs(k.fin - a.contacto.fin) < 1e-6);
      if (!c) return { ...e, mensaje: 'Esos espacios ya no se tocan' };
      const { id, contador } = nuevoId(e, 'v');
      const nuevo: Vano = {
        id, modulo_a: c.modulo_a, modulo_b: c.modulo_b, lado: c.lado, nivel: c.nivel || 0,
        centro: (c.ini + c.fin) / 2, ancho: Math.min(ANCHO_VANO_DEF, Math.max(0.6, c.fin - c.ini - 0.2)),
        tipo: c.exterior ? 'puerta' : 'arco',   // hacia afuera, una puerta; entre cuartos, un arco
        alto: ALTO_VANO_DEF, bisagra: 'izq', sentido: 'dentro', anguloApertura: 75, abierta: true,
        limIni: c.ini, limFin: c.fin,
      };
      return { ...e, contador, seleccion: { tipo: 'vano', id },
        planta: { ...p, vanos: [...p.vanos, nuevo], murosCerrados: p.murosCerrados.filter(k => k !== claveMuro(c)) } };
    }
    case 'ponerPuertaLibre': {   // visor3d.js:7150-7181
      const TOL = a.tolerancia ?? TOL_PUERTA_LIBRE;
      let mejor: { lado: Lado; d: number; u: number; ini: number; fin: number; m: Modulo } | null = null;
      for (const m of p.modulos.filter(x => esCuarto(x.tipo) && nivelDe(x) === e.nivelActivo)) {
        const x0 = m.x, x1 = m.x + m.ancho, z0 = m.z, z1 = m.z + m.largo;
        const lados = [
          { lado: 'norte' as Lado, d: Math.abs(a.z - z0), dentro: a.x >= x0 && a.x <= x1, u: a.x, ini: x0, fin: x1 },
          { lado: 'sur' as Lado,   d: Math.abs(a.z - z1), dentro: a.x >= x0 && a.x <= x1, u: a.x, ini: x0, fin: x1 },
          { lado: 'oeste' as Lado, d: Math.abs(a.x - x0), dentro: a.z >= z0 && a.z <= z1, u: a.z, ini: z0, fin: z1 },
          { lado: 'este' as Lado,  d: Math.abs(a.x - x1), dentro: a.z >= z0 && a.z <= z1, u: a.z, ini: z0, fin: z1 },
        ];
        for (const l of lados) if (l.dentro && l.d <= TOL && (!mejor || l.d < mejor.d)) mejor = { ...l, m };
      }
      if (!mejor) return { ...e, mensaje: 'Toca justo sobre el borde de un cuarto' };
      const largoMuro = mejor.fin - mejor.ini;
      const ancho = Math.min(ANCHO_VANO_DEF, Math.max(0.6, largoMuro - 0.2));
      const centro = Math.max(mejor.ini + ancho / 2 + 0.05, Math.min(mejor.fin - ancho / 2 - 0.05, mejor.u));
      const mid = String(mejor.m.id);
      const c = contactosPlanta(p).find(k => k.modulo_a === mid && k.lado === mejor!.lado && !k.exterior && centro >= k.ini && centro <= k.fin);
      const { id, contador } = nuevoId(e, 'v');
      const nuevo: Vano = {
        id, modulo_a: mid, modulo_b: c ? c.modulo_b : null, lado: mejor.lado, nivel: nivelDe(mejor.m),
        centro, ancho, tipo: 'puerta', alto: ALTO_VANO_DEF, bisagra: 'izq', sentido: 'dentro', anguloApertura: 75, abierta: true,
        limIni: c ? c.ini : mejor.ini, limFin: c ? c.fin : mejor.fin, libre: !c,
      };
      return { ...e, contador, seleccion: { tipo: 'vano', id }, planta: { ...p, vanos: [...p.vanos, nuevo] } };
    }
    case 'moverVano':   // visor3d.js:7203-7211: solo a lo largo de su pared, dentro de su tramo; sin cuadrícula
      return conVano(e, a.id, v => {
        let limIni = v.limIni, limFin = v.limFin;
        if (limIni === undefined || limFin === undefined) {
          const m = p.modulos.find(x => String(x.id) === v.modulo_a);
          if (!m) return v;
          [limIni, limFin] = rangoMuro(m, v.lado);
        }
        const mitad = v.ancho / 2;
        return { ...v, centro: Math.max(limIni + mitad, Math.min(limFin - mitad, a.u)) };
      });
    case 'actualizarVano':
      return conVano(e, a.id, v => actualizarVano(v, a.campo, a.valor));
    case 'duplicarVano': {   // visor3d.js:7263-7272
      const v = p.vanos.find(x => String(x.id) === a.id);
      if (!v) return { ...e, mensaje: 'Ese vano no existe' };
      const { id, contador } = nuevoId(e, 'v');
      const limFin = v.limFin ?? v.centro + v.ancho / 2;
      const copia: Vano = { ...v, id, centro: Math.min(limFin - v.ancho / 2, v.centro + v.ancho + 0.3) };
      return { ...e, contador, seleccion: { tipo: 'vano', id }, planta: { ...p, vanos: [...p.vanos, copia] } };
    }
    case 'borrarVano': {   // visor3d.js:7250-7258: si era el último de ese muro, el muro queda cerrado
      const v = p.vanos.find(x => String(x.id) === a.id);
      if (!v) return { ...e, mensaje: 'Ese vano no existe' };
      const clave = claveMuro(v);
      const vanos = p.vanos.filter(x => x !== v);
      const cerrados = !vanos.some(x => claveMuro(x) === clave) && !p.murosCerrados.includes(clave) ? [...p.murosCerrados, clave] : p.murosCerrados;
      return { ...e, seleccion: null, mensaje: 'Vano eliminado: la pared queda cerrada', planta: { ...p, vanos, murosCerrados: cerrados } };
    }

    // ── Convertir a 3D ──
    case 'convertir': {
      if (!p.modulos.length) return { ...e, mensaje: 'Agrega al menos un espacio' };
      let contador = e.contador;
      const usados = new Set([...p.modulos.map(m => String(m.id)), ...p.vanos.map(v => String(v.id))]);
      const generarId = () => { let id: string; do { contador += 1; id = `v${contador}`; } while (usados.has(id)); usados.add(id); return id; };
      const planta = convertirPlanta(p, generarId);
      return conSeleccionValida({ ...e, contador, planta });
    }
  }
  return e;
}