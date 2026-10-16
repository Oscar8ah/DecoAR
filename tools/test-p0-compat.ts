/**
 * P0 — Compatibilidad del modelo con los planos de DecoiArte (lógica pura, sin teléfono).
 * Ejecutar:  npx tsx tools/test-p0-compat.ts
 *
 * Dialecto IA: los dos planos REALES de planosReales.ts (exportados de modelos_3d_plano).
 * Dialecto web: no hay todavía una fila real exportada desde el editor web, así que se usa un plano
 * armado campo por campo según el serializador verificado (visor3d.js:8340-8392). Es una limitación:
 * se debe repetir con un plano web real en cuanto exista uno.
 */
import { Plano, planoDemo, planoApartamentoSintetico } from '../components/plan/planModel';
import { PLANO_REAL_1, PLANO_REAL_2 } from '../components/plan/planosReales';
import {
  AccionEditor, EditorPlanta, editorVacio, reducirEditor, exportarPlano, detectarDialecto,
  planoDe, contactosPlanta, paredesCompartidas,
} from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';

declare const process: any;

let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const cargar = (p: Plano) => run(editorVacio(), { type: 'cargarPlano', plano: p });
const clon = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Igualdad ESTRICTA: mismo conjunto de claves (ausente ≠ null), mismo tipo (1 ≠ '1'); el orden de claves no importa. */
function igual(a: unknown, b: unknown, ruta = '$', dif: string[] = []): string[] {
  if (a === b) return dif;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { dif.push(`${ruta}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); return dif; }
  if (Array.isArray(a) !== Array.isArray(b)) { dif.push(`${ruta}: arreglo vs objeto`); return dif; }
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) dif.push(`${ruta}: largo ${a.length} ≠ ${bb.length}`);
    a.forEach((x, i) => igual(x, bb[i], `${ruta}[${i}]`, dif));
    return dif;
  }
  const ka = Object.keys(a as object).sort(), kb = Object.keys(b as object).sort();
  for (const k of ka) if (!kb.includes(k)) dif.push(`${ruta}.${k}: sobra al exportar`);
  for (const k of kb) if (!ka.includes(k)) dif.push(`${ruta}.${k}: falta al exportar`);
  for (const k of ka) if (kb.includes(k)) igual((a as any)[k], (b as any)[k], `${ruta}.${k}`, dif);
  return dif;
}
const sinDif = (nombre: string, a: unknown, b: unknown) => {
  const d = igual(a, b);
  if (d.length) console.error(`   ${nombre}:\n     ` + d.slice(0, 8).join('\n     '));
  t(nombre, d.length === 0);
};

// ── Plano del dialecto web, con la forma exacta de generarDesdePlanta ──
const A = 1760000000001, B = 1760000000002, C = 1760000000003, D = 1760000000004;
const modWeb = (id: number, tipo: string, x: number, nivel: number, extra: object = {}) => ({
  id, nombre: tipo, tipo, x, z: 0, ancho: x === 0 ? 4 : 3, largo: 4, alto: 2.6,
  color_pared: '#F5F5F5', material_piso: 'ceramica', imagen_piso: null, paredes_eliminadas: [], diseno_paredes: null,
  forma: null, altura_base: null, peralte: null, descuelgue: null, tipo_techo: null, pendiente: null, voladizo: null,
  orientacion: null, espesor: null, subtipo: null, acabado: null, nivel_exterior: null, baranda: null, escalera: null,
  nivel, capa: 'planta', ...extra,
});
const PLANO_WEB: Plano = {
  alto_piso: 2.6,
  modulos: [
    modWeb(A, 'sala', 0, 0, { campo_futuro: { a: 1 } }),   // clave que DecoAR no conoce
    modWeb(B, 'cocina', 4, 0),
    modWeb(C, 'habitacion', 0, 1),                          // misma huella que A, en el nivel 1
    modWeb(D, 'bano', 4, 1),
  ] as any,
  niveles: 2,
  altura_entrepiso: 3,
  paredes_compartidas: [
    { modulo_a: A, modulo_b: B, lado: 'este', ini: 0, fin: 4 },
    { modulo_a: C, modulo_b: D, lado: 'este', ini: 0, fin: 4 },
  ] as any,
  vanos: [
    { id: 'v_1760000000100_ab12', modulo_a: A, modulo_b: B, lado: 'este', nivel: 0, centro: 2, ancho: 0.9, tipo: 'arco', alto: 2.1,
      bisagra: 'izq', sentido: 'dentro', anguloApertura: 75, abierta: true, limIni: 0, limFin: 4 },
    { id: 'v_1760000000200_cd34', modulo_a: C, modulo_b: D, lado: 'este', nivel: 1, centro: 2, ancho: 0.9, tipo: 'puerta', alto: 2.1,
      bisagra: 'der', sentido: 'fuera', anguloApertura: 60, abierta: false, limIni: 0, limFin: 4, estiloPuerta: 'doble' },
  ] as any,
  envolvente: { techos: false, material_techo: 'drywall', color_techo: '#F7F7F5', fachada: true, material_fachada: 'pintura',
    color_fachada: '#D9CFC2', grueso_fachada: 0.2, cubierta: 'ninguna', pendiente: 35, alero: 0.5, girar_cubierta: false },
  campo_futuro_raiz: 'se conserva',
} as any;

// ── 1. Detección de dialecto ──
t('1) planos reales → ia', detectarDialecto(clon(PLANO_REAL_1)) === 'ia' && detectarDialecto(clon(PLANO_REAL_2)) === 'ia');
t('1) plano web → web', detectarDialecto(clon(PLANO_WEB)) === 'web');
t('1) ejemplos propios de DecoAR (señales mezcladas) → desconocido',
  detectarDialecto(planoApartamentoSintetico()) === 'desconocido');

// ── 2. Ida y vuelta sin cambios: igualdad estricta ──
for (const [n, p] of [['real 1', PLANO_REAL_1], ['real 2', PLANO_REAL_2], ['web', PLANO_WEB]] as const) {
  const r = exportarPlano(cargar(clon(p)).planta);
  sinDif(`2) ida y vuelta exacta (${n})`, r.plano, clon(p));
  t(`2) ${n}: no recalcula paredes ni reporta conflictos`, !r.paredesRecalculadas && r.conflictos.length === 0);
}

// ── 3. Ausente frente a null, ids numéricos y claves desconocidas ──
{
  const ia = exportarPlano(cargar(clon(PLANO_REAL_1)).planta).plano as any;
  t('3) ia: no aparecen claves que no tenía (vanos, niveles, altura_entrepiso, envolvente)',
    !('vanos' in ia) && !('niveles' in ia) && !('altura_entrepiso' in ia) && !('envolvente' in ia));
  t('3) ia: los módulos no ganan nivel, tipo, capa ni paredes_eliminadas',
    ia.modulos.every((m: any) => !('nivel' in m) && !('tipo' in m) && !('capa' in m) && !('paredes_eliminadas' in m)));
  t('3) ia: paredes_compartidas sin ini/fin', ia.paredes_compartidas.every((c: any) => !('ini' in c) && !('fin' in c)));
  t('3) ia: tipo de la raíz intacto', ia.tipo === 'apartamento');

  const w = exportarPlano(cargar(clon(PLANO_WEB)).planta).plano as any;
  t('3) web: ids de módulo siguen siendo números', w.modulos.every((m: any) => typeof m.id === 'number'));
  t('3) web: modulo_a/modulo_b de vanos y paredes siguen siendo números',
    w.vanos.every((v: any) => typeof v.modulo_a === 'number' && typeof v.modulo_b === 'number')
    && w.paredes_compartidas.every((c: any) => typeof c.modulo_a === 'number' && typeof c.modulo_b === 'number'));
  t('3) web: null sigue siendo null', 'imagen_piso' in w.modulos[0] && w.modulos[0].imagen_piso === null);
  t('3) web: claves desconocidas en raíz y módulo', w.campo_futuro_raiz === 'se conserva' && w.modulos[0].campo_futuro?.a === 1);
  t('3) web: capitalización de vanos intacta', 'anguloApertura' in w.vanos[1] && 'limIni' in w.vanos[1] && w.vanos[1].estiloPuerta === 'doble');
  t('3) web: envolvente, niveles y entrepiso intactos', w.envolvente.grueso_fachada === 0.2 && w.niveles === 2 && w.altura_entrepiso === 3);
}

// ── 4. Ediciones NO geométricas: paredes_compartidas no se toca ──
for (const [n, p, id] of [['real 1', PLANO_REAL_1, 'cocina'], ['web', PLANO_WEB, String(A)]] as const) {
  const e = run(cargar(clon(p)),
    { type: 'seleccionar', seleccion: { tipo: 'modulo', id } },
    { type: 'actualizarModulo', id, cambios: { nombre: 'Renombrado', material_piso: 'porcelanato', color_pared: '#000000' } },
    { type: 'iniciarGesto' }, { type: 'terminarGesto' });
  const r = exportarPlano(e.planta);
  sinDif(`4) ${n}: paredes_compartidas idénticas tras cambiar nombre, material y color`, (r.plano as any).paredes_compartidas, (clon(p) as any).paredes_compartidas);
  t(`4) ${n}: no recalcula`, r.paredesRecalculadas === false);
  // Todo lo demás igual salvo los tres campos editados
  const esperado: any = clon(p);
  const m = esperado.modulos.find((x: any) => String(x.id) === id);
  Object.assign(m, { nombre: 'Renombrado', material_piso: 'porcelanato', color_pared: '#000000' });
  sinDif(`4) ${n}: solo cambian los tres campos editados`, r.plano, esperado);
}

// ── 5. Mover y devolver: no es un cambio geométrico (sin falsos positivos) ──
{
  const e = run(cargar(clon(PLANO_REAL_1)), { type: 'moverModulo', id: 'recamara', x: 20, z: 20 }, { type: 'moverModulo', id: 'recamara', x: 5, z: 3.5 });
  const r = exportarPlano(e.planta);
  t('5) mover y devolver no recalcula', r.paredesRecalculadas === false);
  sinDif('5) mover y devolver deja el plano idéntico', r.plano, clon(PLANO_REAL_1));
}

// ── 6. Cambio geométrico en dialecto IA: recalcula con la forma IA ──
{
  const e = run(cargar(clon(PLANO_REAL_1)), { type: 'moverModulo', id: 'recamara', x: 20, z: 0 });
  const r = exportarPlano(e.planta);
  const pcs = (r.plano as any).paredes_compartidas as any[];
  t('6) ia: alejar la recámara recalcula', r.paredesRecalculadas === true && r.dialecto === 'ia');
  t('6) ia: cada pared tiene exactamente modulo_a, modulo_b y lado',
    pcs.every(c => Object.keys(c).sort().join() === 'lado,modulo_a,modulo_b'));
  t('6) ia: ya no hay paredes con la recámara', pcs.every(c => c.modulo_a !== 'recamara' && c.modulo_b !== 'recamara'));
  t('6) ia: cocina–baño queda con el lado de la geometría (baño al sur, z mayor)',
    pcs.some(c => c.modulo_a === 'cocina' && c.modulo_b === 'bano' && c.lado === 'sur'));
  const esperadas = paredesCompartidas(e.planta).map(c => ({ modulo_a: c.modulo_a, modulo_b: c.modulo_b, lado: c.lado }));
  sinDif('6) ia: coincide con las reglas portadas de la web', pcs, esperadas);
  // Antes esta prueba exigía 0 conflictos y así ocultaba el cambio de lado cocina–baño (auditoría P0, riesgo 1).
  t('6) ia: un único conflicto, el del lado cocina–baño', r.conflictos.length === 1 && r.conflictos[0].includes('cocina–bano'));
}

// ── 7. Cambio geométrico en dialecto web: recalcula con ini/fin e ids numéricos ──
{
  const e = run(cargar(clon(PLANO_WEB)), { type: 'fijarDimension', id: String(B), campo: 'largo', valor: 3 });
  const r = exportarPlano(e.planta);
  const pcs = (r.plano as any).paredes_compartidas as any[];
  t('7) web: acortar la cocina recalcula', r.paredesRecalculadas === true);
  const ab = pcs.find(c => c.modulo_a === A && c.modulo_b === B);
  t('7) web: la pared sala–cocina ahora va de 0 a 3, con ids numéricos', !!ab && ab.ini === 0 && ab.fin === 3 && ab.lado === 'este');
  t('7) web: la pared del nivel 1 sigue igual', pcs.some(c => c.modulo_a === C && c.modulo_b === D && c.ini === 0 && c.fin === 4));
  t('7) web: todas las paredes llevan ini/fin', pcs.every(c => 'ini' in c && 'fin' in c));
  t('7) web: la raíz y el entrepiso no cambian', (r.plano as any).altura_entrepiso === 3 && (r.plano as any).campo_futuro_raiz === 'se conserva');
}

// ── 8. Separación de niveles ──
{
  const e = cargar(clon(PLANO_WEB));
  const cs = contactosPlanta(e.planta);
  t('8) cuartos superpuestos en niveles distintos no se tocan',
    !cs.some(c => [c.modulo_a, c.modulo_b].sort().join() === [String(A), String(C)].sort().join()));
  t('8) cuartos vecinos del mismo nivel sí (uno por nivel)', cs.length === 2 && cs.some(c => c.nivel === 0) && cs.some(c => c.nivel === 1));
  const conv = run(cargar(clon(PLANO_WEB)), { type: 'convertir' });
  const mismosNivel = conv.planta.vanos.every(v => {
    const a = conv.planta.modulos.find(m => m.id === v.modulo_a), b = conv.planta.modulos.find(m => m.id === v.modulo_b);
    return !a || !b || (a.nivel || 0) === (b.nivel || 0);
  });
  t('8) convertir no crea vanos entre niveles distintos', mismosNivel && conv.planta.vanos.length === 2);
}

// ── 9. Entrepiso de 3 m: se conserva al exportar y al generar la geometría ──
{
  const e = cargar(clon(PLANO_WEB));
  t('9) exportar conserva altura_entrepiso = 3', (exportarPlano(e.planta).plano as any).altura_entrepiso === 3);
  t('9) planoDe usa 3 para la maqueta', planoDe(e.planta).altura_entrepiso === 3);
  const con28: any = clon(PLANO_WEB); con28.altura_entrepiso = 2.8;
  const yPiso = (p: Plano) => generarMaqueta(planoDe(cargar(p).planta)).cajas.find(c => c.moduloId === String(C) && c.clase === 'piso')!.centro[1];
  t('9) el piso del nivel 1 sube 0,20 m más con entrepiso de 3 m', Math.abs((yPiso(clon(PLANO_WEB)) - yPiso(con28)) - 0.2) < 1e-9);
  const nuevo = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  t('9) un plano nuevo sigue usando 2,80 (sin cambios de comportamiento)', planoDe(nuevo.planta).altura_entrepiso === 2.8);
}

// ── 10. Lo que el editor añade y el dialecto IA no usa: se exporta y se informa ──
{
  const conv = run(cargar(clon(PLANO_REAL_1)), { type: 'convertir' });
  const r = exportarPlano(conv.planta);
  t('10) ia + convertir: los arcos creados se exportan', Array.isArray((r.plano as any).vanos) && (r.plano as any).vanos.length > 0);
  t('10) ia + convertir: se informa el conflicto de dialecto', r.conflictos.some(c => c.includes('"vanos"')));
  t('10) ia + convertir: convertir no mueve nada, las paredes no se recalculan', r.paredesRecalculadas === false);
  const mas = run(cargar(clon(PLANO_REAL_1)), { type: 'agregarModulo', tipo: 'bano', x: 20, z: 20 });
  t('10) ia + espacio nuevo: se informa', exportarPlano(mas.planta).conflictos.some(c => c.includes('espacio')));
}

// ── 11. Sin forma conocida de paredes: no se inventa, se informa ──
{
  const e = run(cargar(planoApartamentoSintetico()), { type: 'moverModulo', id: 'bano', x: 20, z: 20 });
  const r = exportarPlano(e.planta);
  t('11) desconocido + cambio geométrico: conserva las originales y reporta', r.paredesRecalculadas === false
    && r.conflictos.some(c => c.includes('no se puede saber')) && JSON.stringify((r.plano as any).paredes_compartidas) === '[]');
}

// ── 12. Deshacer conserva el original ──
{
  const e = run(cargar(clon(PLANO_WEB)), { type: 'moverModulo', id: String(B), x: 10, z: 10 }, { type: 'deshacer' });
  sinDif('12) mover y deshacer: exportación idéntica al original', exportarPlano(e.planta).plano, clon(PLANO_WEB));
  const r = run(e, { type: 'rehacer' });
  t('12) rehacer vuelve a ser un cambio geométrico', exportarPlano(r.planta).paredesRecalculadas === true);
}

// ── 13. Plano nuevo: comportamiento anterior ──
{
  const e = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 });
  const r = exportarPlano(e.planta);
  t('13) sin origen: dialecto nuevo', r.dialecto === 'nuevo');
  sinDif('13) sin origen: exporta lo mismo que planoDe', r.plano, planoDe(e.planta));
  t('13) el ejemplo Sala se puede seguir exportando', exportarPlano(cargar(planoDemo(4, 3, 2.5)).planta).plano.modulos.length === 1);
}

// ── 14. El plano de entrada nunca se modifica ──
{
  const p = clon(PLANO_WEB), copia = JSON.stringify(p);
  const e = run(cargar(p), { type: 'moverModulo', id: String(A), x: 9, z: 9 }, { type: 'convertir' });
  exportarPlano(e.planta);
  t('14) cargar, editar y exportar no mutan el plano recibido', JSON.stringify(p) === copia);
}

// ── 15. Mismo plano con los espacios en otro orden: los muros son los mismos, no se recalcula ──
//     (hoy ninguna acción reordena, pero la detección no debe depender del orden ni de qué cuarto es modulo_a)
for (const [n, p] of [['real 1', PLANO_REAL_1], ['web', PLANO_WEB]] as const) {
  const e = cargar(clon(p));
  const invertida = { ...e.planta, modulos: [...e.planta.modulos].reverse() };
  t(`15) ${n}: espacios en orden inverso no cuentan como cambio geométrico`, exportarPlano(invertida).paredesRecalculadas === false);
}

// ── 16. Cambio de lado de una pared que ya existía: se detecta y se comunica ──
{
  // Caso exacto de la auditoría: plano real 1, alejar la recámara; cocina–baño pasa de norte a sur.
  const r = exportarPlano(run(cargar(clon(PLANO_REAL_1)), { type: 'moverModulo', id: 'recamara', x: 20, z: 0 }).planta);
  const cb = (r.plano as any).paredes_compartidas.find((c: any) => c.modulo_a === 'cocina' && c.modulo_b === 'bano');
  const aviso = r.conflictos.find(c => c.includes('cocina–bano'));
  t('16) real 1: se exporta el lado de la geometría (sur)', cb?.lado === 'sur');
  t('16) real 1: el cambio norte → sur se comunica con la pared y los dos lados',
    !!aviso && aviso.includes('"norte"') && aviso.includes('"sur"'));
  t('16) real 1: las paredes que no cambian de lado (este) no generan aviso', r.conflictos.length === 1);
  t('16) real 1: una pared que desaparece por la edición no se reporta como cambio de lado',
    !r.conflictos.some(c => c.includes('recamara')));

  // Plano real 2: sala_comedor–cocina dice "sur", la geometría da "norte".
  const r2 = exportarPlano(run(cargar(clon(PLANO_REAL_2)), { type: 'moverModulo', id: 'dormitorio', x: 20, z: 20 }).planta);
  t('16) real 2: se comunica sala_comedor–cocina sur → norte', r2.conflictos.length === 1
    && r2.conflictos[0].includes('sala_comedor–cocina') && r2.conflictos[0].includes('"sur"') && r2.conflictos[0].includes('"norte"'));

  // La misma pared escrita desde el otro cuarto y con el lado correcto: no hay cambio, no hay aviso.
  const invertida: any = clon(PLANO_REAL_1);
  invertida.paredes_compartidas[2] = { modulo_a: 'bano', modulo_b: 'cocina', lado: 'norte' };
  const r3 = exportarPlano(run(cargar(invertida), { type: 'moverModulo', id: 'recamara', x: 20, z: 0 }).planta);
  t('16) pared escrita desde el otro cuarto con el lado correcto: sin aviso', r3.paredesRecalculadas && r3.conflictos.length === 0);

  // Dialecto web: un cambio de lado real (la cocina pasa al oeste de la sala) también se comunica.
  const r4 = exportarPlano(run(cargar(clon(PLANO_WEB)), { type: 'moverModulo', id: String(B), x: -3, z: 0 }).planta);
  t('16) web: la cocina al otro lado de la sala se comunica este → oeste',
    r4.conflictos.some(c => c.includes(`${A}–${B}`) && c.includes('"este"') && c.includes('"oeste"')));
  t('16) web: los ids de esa pared siguen siendo números',
    (r4.plano as any).paredes_compartidas.some((c: any) => c.modulo_a === A && c.modulo_b === B && c.lado === 'oeste'));

  // Dialecto web con cambio geométrico SIN cambio de lado: ningún aviso (comportamiento anterior intacto).
  const r5 = exportarPlano(run(cargar(clon(PLANO_WEB)), { type: 'fijarDimension', id: String(B), campo: 'largo', valor: 3 }).planta);
  t('16) web: recalcular sin cambiar lados no genera avisos', r5.paredesRecalculadas && r5.conflictos.length === 0);

  // Sin cambio geométrico no se recalcula ni se avisa, aunque el original traiga lados al revés.
  const r6 = exportarPlano(cargar(clon(PLANO_REAL_1)).planta);
  t('16) sin edición geométrica: lados originales intactos y sin avisos', !r6.paredesRecalculadas && r6.conflictos.length === 0
    && (r6.plano as any).paredes_compartidas[2].lado === 'norte');
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
