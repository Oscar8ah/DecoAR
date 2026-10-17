/**
 * P1 · 1b-3b — Panel del vano: lógica pura + las mismas acciones que envía el panel, sobre el
 * REDUCTOR REAL, + su efecto en la maqueta 3D (planGeometry). Ejecutar:  npx tsx tools/test-panelVano.ts
 */
import { Plano } from '../components/plan/planModel';
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, contactosPlanta, planoDe } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import {
  ANCHO_MIN, ALTO_MIN, ALTO_MAX, PASO_ANCHO, PASO_ALTO, PASO_ANGULO, tramo, rangoAncho, rangoCentro, cuantizar,
  anchoRapido, centroDelTramo, extremos, fraccion, deFraccion, llevaAlto, ESTILOS_PUERTA, etiquetaBisagra, anguloVisible, DESCRIPCION,
} from '../components/editor2d/ajustesVano';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

/** Editor con un vano creado en el único contacto del plano, como lo haría el "+". */
function conVano(p: Plano) {
  let e = reducirEditor(editorVacio(), { type: 'cargarPlano', plano: p });
  e = reducirEditor(e, { type: 'crearVanoEnContacto', contacto: contactosPlanta(e.planta)[0] });
  return { e, id: String(e.planta.vanos[0].id) };
}
const aplicar = (e: EditorPlanta, as: AccionEditor[]) => as.reduce(reducirEditor, e);
const V = (e: EditorPlanta, id: string) => e.planta.vanos.find(v => String(v.id) === id)!;
/** Lo que envía un deslizamiento del panel: iniciarGesto, un valor por movimiento, terminarGesto. */
const deslizar = (e: EditorPlanta, valores: AccionEditor[]) => aplicar(e, [{ type: 'iniciarGesto' }, ...valores, { type: 'terminarGesto' }]);

// Muro VERTICAL: sala (0,0) 4×4 y cocina (4,0) 3×4 → muro x = 4, tramo z 0…4
const VERTICAL: Plano = { modulos: [
  { id: 'sala', tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4 }, { id: 'cocina', tipo: 'cocina', x: 4, z: 0, ancho: 3, largo: 4 }] };
// Muro HORIZONTAL: sala (0,0) 5×4 y habitación (0,4) 5×3 → muro z = 4, tramo x 0…5
const HORIZONTAL: Plano = { modulos: [
  { id: 'sala', tipo: 'sala', x: 0, z: 0, ancho: 5, largo: 4 }, { id: 'hab', tipo: 'habitacion', x: 0, z: 4, ancho: 5, largo: 3 }] };
// Muro CORTO: solo se tocan 0,7 m (cocina desplazada hacia el sur)
const CORTO: Plano = { modulos: [
  { id: 'sala', tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4 }, { id: 'cocina', tipo: 'cocina', x: 4, z: 3.3, ancho: 3, largo: 4 }] };

// ── 1. Lógica pura ──
{
  const { e, id } = conVano(VERTICAL);
  const v = V(e, id);
  t('1) el tramo es el del contacto: 0 … 4', tramo(v)!.ini === 0 && tramo(v)!.fin === 4);
  t('1) ancho: de 0,40 a 4 m (todo el tramo)', rangoAncho(v)!.min === ANCHO_MIN && rangoAncho(v)!.max === 4);
  t('1) centro con 0,9 m de ancho: de 0,45 a 3,55', near(rangoCentro(v)!.min, 0.45) && near(rangoCentro(v)!.max, 3.55));
  t('1) pasos de 0,05 m', cuantizar(1.234, PASO_ANCHO, 0.4, 4) === 1.25 && cuantizar(1.21, PASO_ANCHO, 0.4, 4) === 1.2);
  t('1) por debajo del mínimo se queda en 0,40', cuantizar(0.1, PASO_ANCHO, 0.4, 4) === 0.4);
  t('1) el máximo se alcanza aunque no sea múltiplo del paso', cuantizar(3.99, PASO_ANCHO, 0.4, 3.97) === 3.97);
  t('1) al final del control se llega a toda la pared (3,96 → 3,97, no 3,95)', cuantizar(3.96, PASO_ANCHO, 0.4, 3.97) === 3.97);
  t('1) fracción e inversa', near(deFraccion(fraccion(2.2, 0.4, 4), 0.4, 4), 2.2));
  t('1) vano sin tramo: no se inventan límites', tramo({ limIni: undefined, limFin: undefined }) === null && rangoAncho({ ...v, limIni: undefined }) === null);
  t('1) extremos: muro norte/sur va de oeste a este; oeste/este de norte a sur',
    extremos('sur').join() === 'Oeste,Este' && extremos('este').join() === 'Norte,Sur');
  t('1) alto solo en vano y puerta', llevaAlto('vano') && llevaAlto('puerta') && !llevaAlto('arco'));
  t('1) descripciones por tipo', DESCRIPCION.arco.includes('piso a techo') && DESCRIPCION.vano === 'Hueco con marco.' && DESCRIPCION.puerta === 'Hueco con marco y hoja.');
  t('1) los 5 estilos de la web con su valor exacto', ESTILOS_PUERTA.map(x => x.valor).join() === 'sencilla,doble,corrediza,vidrio,plegable');
  t('1) etiqueta de la bisagra según el estilo, como la web', etiquetaBisagra('corrediza') === 'Se corre hacia' && etiquetaBisagra(undefined) === 'Bisagra');
}

// ── 2. Ancho ──
{
  const { e, id } = conVano(VERTICAL);
  const r = rangoAncho(V(e, id))!;
  let e2 = deslizar(e, [1.1, 1.6, 2.35].map(x => ({ type: 'actualizarVano', id, campo: 'ancho', valor: cuantizar(x, PASO_ANCHO, r.min, r.max) } as AccionEditor)));
  t('2) deslizar deja 2,35 m', near(V(e2, id).ancho, 2.35));
  t('2) un deslizamiento completo = un paso de deshacer', near(V(reducirEditor(e2, { type: 'deshacer' }), id).ancho, 0.9));
  e2 = aplicar(e, [{ type: 'actualizarVano', id, campo: 'ancho', valor: anchoRapido(V(e, id), 'pared')! }]);
  t('2) "Toda la pared": ancho 4 y centrado en el tramo', near(V(e2, id).ancho, 4) && near(V(e2, id).centro, 2));
  e2 = aplicar(e2, [{ type: 'actualizarVano', id, campo: 'ancho', valor: anchoRapido(V(e2, id), 'puerta')! }]);
  t('2) "Puerta 0,9 m" vuelve a 0,9', near(V(e2, id).ancho, 0.9));
  e2 = aplicar(e, [{ type: 'actualizarVano', id, campo: 'ancho', valor: 0.1 }, { type: 'actualizarVano', id, campo: 'ancho', valor: 99 }]);
  t('2) el reductor nunca deja pasar del tramo (99 → 4)', near(V(e2, id).ancho, 4));
  // vano en un extremo: al ensancharlo, el centro se recoloca dentro del tramo
  let e3 = aplicar(e, [{ type: 'moverVano', id, u: 3.55 }]);
  e3 = aplicar(e3, [{ type: 'actualizarVano', id, campo: 'ancho', valor: 2 }]);
  t('2) ensanchar junto al extremo recoloca el centro (3,55 → 3)', near(V(e3, id).centro, 3) && near(V(e3, id).ancho, 2));
  const c = conVano(CORTO);
  t('2) muro de 0,7 m: el máximo del control es 0,7', near(rangoAncho(V(c.e, c.id))!.max, 0.7));
  t('2) muro de 0,7 m: "Puerta 0,9 m" se limita a 0,7', near(anchoRapido(V(c.e, c.id), 'puerta')!, 0.7));
  const c2 = aplicar(c.e, [{ type: 'actualizarVano', id: c.id, campo: 'ancho', valor: anchoRapido(V(c.e, c.id), 'puerta')! }]);
  t('2) y el vano queda válido: 0,7 de ancho, dentro del tramo', near(V(c2, c.id).ancho, 0.7) && near(V(c2, c.id).centro, 3.65));
}

// ── 3. Posición ──
for (const [n, p, ini, fin] of [['vertical', VERTICAL, 0, 4], ['horizontal', HORIZONTAL, 0, 5]] as const) {
  const { e, id } = conVano(p);
  const v0 = V(e, id);
  t(`3) ${n}: el tramo del contacto es ${ini} … ${fin}`, tramo(v0)!.ini === ini && tramo(v0)!.fin === fin);
  let e2 = deslizar(e, [-5, -10, -50].map(u => ({ type: 'moverVano', id, u } as AccionEditor)));
  t(`3) ${n}: al extremo inicial, sin sobresalir (centro = ${ini} + 0,45)`, near(V(e2, id).centro, ini + 0.45));
  e2 = deslizar(e2, [99].map(u => ({ type: 'moverVano', id, u } as AccionEditor)));
  t(`3) ${n}: al extremo final, sin sobresalir`, near(V(e2, id).centro, fin - 0.45));
  e2 = aplicar(e2, [{ type: 'moverVano', id, u: centroDelTramo(V(e2, id))! }]);
  t(`3) ${n}: "Centrar" lo deja en la mitad`, near(V(e2, id).centro, (ini + fin) / 2));
  const lados = V(e2, id).lado;
  t(`3) ${n}: lado del muro ${lados} con el eje correcto`, n === 'vertical' ? (lados === 'este' || lados === 'oeste') : (lados === 'norte' || lados === 'sur'));
  e2 = aplicar(e2, [{ type: 'actualizarVano', id, campo: 'ancho', valor: 3 }, { type: 'moverVano', id, u: 0 }]);
  t(`3) ${n}: con 3 m de ancho el rango del centro se encoge (mín. ${ini} + 1,5)`, near(V(e2, id).centro, ini + 1.5) && near(rangoCentro(V(e2, id))!.min, ini + 1.5));
  t(`3) ${n}: mover con el control también es un solo paso de deshacer`,
    deslizar(e, [1, 1.5, 1.2].map(u => ({ type: 'moverVano', id, u } as AccionEditor))).deshacer.length === e.deshacer.length + 1);
  t(`3) ${n}: un deslizamiento que vuelve al mismo sitio no deja pasos de deshacer`,
    deslizar(e, [1, V(e, id).centro].map(u => ({ type: 'moverVano', id, u } as AccionEditor))).deshacer.length === e.deshacer.length);
}

// ── 4. Alto ──
{
  let { e, id } = conVano(VERTICAL);
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'tipo', valor: 'puerta' }]);
  e = deslizar(e, [{ type: 'actualizarVano', id, campo: 'alto', valor: cuantizar(2.33, PASO_ALTO, ALTO_MIN, ALTO_MAX) }]);
  t('4) pasos de 0,05: 2,33 → 2,35', near(V(e, id).alto!, 2.35));
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'alto', valor: 1 }]);
  t('4) límite inferior 1,60 (lo aplica el reductor)', near(V(e, id).alto!, 1.6));
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'alto', valor: 9 }]);
  t('4) límite superior 2,50', near(V(e, id).alto!, 2.5));
  t('4) el control no se muestra para un arco', !llevaAlto('arco'));
}

// ── 5. Puertas ──
{
  let { e, id } = conVano(VERTICAL);
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'tipo', valor: 'puerta' }]);
  for (const est of ESTILOS_PUERTA) {
    const e2 = aplicar(e, [{ type: 'actualizarVano', id, campo: 'estilo', valor: est.valor }]);
    t(`5) tipo de puerta "${est.etiqueta}" se guarda como '${est.valor}'`, V(e2, id).estiloPuerta === est.valor);
  }
  t('5) "Doble" ensancha la puerta a 1,2 m si el muro lo permite (regla del reductor y de la web)',
    near(V(aplicar(e, [{ type: 'actualizarVano', id, campo: 'estilo', valor: 'doble' }]), id).ancho, 1.2));
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'bisagra', valor: 'der' }]);
  t('5) bisagra derecha', V(e, id).bisagra === 'der');
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'bisagra', valor: 'izq' }]);
  t('5) bisagra izquierda', V(e, id).bisagra === 'izq');
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'sentido', valor: 'fuera' }]);
  t('5) abre hacia afuera', V(e, id).sentido === 'fuera');
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'sentido', valor: 'dentro' }]);
  t('5) abre hacia adentro', V(e, id).sentido === 'dentro');
  e = deslizar(e, [{ type: 'actualizarVano', id, campo: 'apertura', valor: cuantizar(0, PASO_ANGULO, 0, 90) }]);
  t('5) 0° = cerrada', V(e, id).anguloApertura === 0 && V(e, id).abierta === false && anguloVisible(V(e, id)) === 0);
  e = deslizar(e, [{ type: 'actualizarVano', id, campo: 'apertura', valor: cuantizar(91, PASO_ANGULO, 0, 90) }]);
  t('5) 90° = abierta del todo', V(e, id).anguloApertura === 90 && V(e, id).abierta === true);
  t('5) pasos de 5°', cuantizar(47, PASO_ANGULO, 0, 90) === 45);
}

// ── 6. Los valores se conservan al seleccionar otro vano y volver ──
{
  let e = reducirEditor(editorVacio(), { type: 'cargarPlano', plano: { modulos: [
    { id: 'a', tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4 }, { id: 'b', tipo: 'cocina', x: 4, z: 0, ancho: 3, largo: 4 },
    { id: 'c', tipo: 'bano', x: 0, z: 4, ancho: 4, largo: 2 }] } });
  const cs = contactosPlanta(e.planta);
  e = aplicar(e, [{ type: 'crearVanoEnContacto', contacto: cs[0] }, { type: 'crearVanoEnContacto', contacto: cs[1] }]);
  const [v1, v2] = e.planta.vanos.map(v => String(v.id));
  e = aplicar(e, [{ type: 'seleccionar', seleccion: { tipo: 'vano', id: v1 } }, { type: 'actualizarVano', id: v1, campo: 'tipo', valor: 'puerta' },
    { type: 'actualizarVano', id: v1, campo: 'estilo', valor: 'corrediza' }, { type: 'actualizarVano', id: v1, campo: 'bisagra', valor: 'der' },
    { type: 'actualizarVano', id: v1, campo: 'apertura', valor: 30 }, { type: 'actualizarVano', id: v1, campo: 'alto', valor: 2.2 }]);
  e = aplicar(e, [{ type: 'seleccionar', seleccion: { tipo: 'vano', id: v2 } }, { type: 'seleccionar', seleccion: { tipo: 'vano', id: v1 } }]);
  const v = V(e, v1);
  t('6) tras ir a otro vano y volver, se conservan tipo, estilo, bisagra, apertura y alto',
    v.tipo === 'puerta' && v.estiloPuerta === 'corrediza' && v.bisagra === 'der' && v.anguloApertura === 30 && near(v.alto!, 2.2));
  t('6) el otro vano no se tocó', V(e, v2).tipo === 'arco' && V(e, v2).estiloPuerta === undefined);
}

// ── 7. Efecto real en la maqueta 3D (planGeometry) ──
{
  let { e, id } = conVano(VERTICAL);
  e = aplicar(e, [{ type: 'actualizarVano', id, campo: 'tipo', valor: 'puerta' }, { type: 'actualizarVano', id, campo: 'ancho', valor: 1.5 },
    { type: 'actualizarVano', id, campo: 'alto', valor: 2.3 }, { type: 'moverVano', id, u: 1 }]);
  const maq = generarMaqueta(planoDe(e.planta));
  const jI = maq.marcos.find(c => c.id === `marco-${id}-jamba-i`)!, jD = maq.marcos.find(c => c.id === `marco-${id}-jamba-d`)!;
  t('7) 3D: el marco usa el alto del hueco (2,3 m)', near(jI.tamano[1], 2.3));
  const sep = Math.abs(jD.centro[2] - jI.centro[2]);   // muro vertical: las jambas se separan en z
  t('7) 3D: las jambas se separan según el ancho (1,5 m + espesor del marco)', sep > 1.5 && sep < 1.5 + 0.2);
  const e2 = aplicar(e, [{ type: 'moverVano', id, u: 3 }]);
  const jI2 = generarMaqueta(planoDe(e2.planta)).marcos.find(c => c.id === `marco-${id}-jamba-i`)!;
  t('7) 3D: mover el vano 2 m mueve el marco 2 m', near(jI2.centro[2] - jI.centro[2], 2, 1e-6));
  const e3 = aplicar(e, [{ type: 'actualizarVano', id, campo: 'bisagra', valor: 'der' }, { type: 'actualizarVano', id, campo: 'sentido', valor: 'fuera' },
    { type: 'actualizarVano', id, campo: 'apertura', valor: 10 }, { type: 'actualizarVano', id, campo: 'estilo', valor: 'vidrio' }]);
  t('7) 3D: bisagra, sentido, apertura y estilo aún NO cambian la maqueta (no hay hoja): se avisa en la app',
    JSON.stringify(generarMaqueta(planoDe(e3.planta))) === JSON.stringify(maq));
  const arco = aplicar(e, [{ type: 'actualizarVano', id, campo: 'tipo', valor: 'arco' }]);
  t('7) 3D: un arco no lleva marco', !generarMaqueta(planoDe(arco.planta)).marcos.some(c => c.id.startsWith(`marco-${id}`)));
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
