/**
 * Pruebas del modo Dibujar (lógica pura, sin teléfono).
 * Ejecutar:  npx tsx tools/test-drawModel.ts
 */
import {
  drawReducer, initialDrawState, drawStats, outwardNormal, areaXZ, axisSnap, simplifyPolygon,
  DrawAction, DrawState, Vec3,
} from '../components/ar/draw/drawModel';

let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const run = (actions: DrawAction[], s: DrawState = initialDrawState()) => actions.reduce(drawReducer, s);
const P = (x: number, z: number): Vec3 => [x, 0, z];
const adds = (pts: Vec3[]): DrawAction[] => pts.map(point => ({ type: 'add', point }));

// Piso 4 × 3 m
const rect = [P(0, 0), P(4, 0), P(4, 3), P(0, 3)];
const base = run([...adds(rect), { type: 'close' }]);

// ── Dibujo y cierre
t('cierra el piso', base.phase === 'floorDone' && base.floor?.length === 4);
t('área 12 m²', near(drawStats(base, null).floorArea, 12));
t('selecciona el piso al cerrar', base.selected === 'floor');
t('cierre por imán al primer punto', run([...adds(rect), { type: 'add', point: P(0.05, 0.05) }]).phase === 'floorDone');
t('rechaza figura cruzada', run([...adds([P(0, 0), P(2, 2), P(2, 0), P(0, 2)]), { type: 'close' }]).phase === 'floor');

// ── Normal saliente: también en figuras cóncavas (habitación en L) y en ambos sentidos de giro
const L = [P(0, 0), P(4, 0), P(4, 2), P(2, 2), P(2, 4), P(0, 4)];
const nL = outwardNormal(L, 3);            // lado (2,2)->(2,4): afuera es +x
t('normal saliente en L (bug del centroide)', near(nL[0], 1) && near(nL[1], 0));
const nRev = outwardNormal([...rect].reverse(), 0); // (0,3)->(4,3) en sentido inverso: afuera es +z
t('normal saliente en sentido inverso', near(nRev[1], 1));

// ── Mover un lado (estilo edge de Maya)
const grown = run([{ type: 'dragEdge', edge: 1, amount: 1 }], base);   // lado x=4 → x=5
t('estirar lado agranda a 15 m²', near(areaXZ(grown.floor!), 15));
t('sigue siendo rectángulo', grown.floor![1][0] === 5 && grown.floor![2][0] === 5 && grown.floor![0][0] === 0);
const inL = run([...adds(L), { type: 'close' }, { type: 'dragEdge', edge: 3, amount: 0.5 }]);
t('estirar lado interior de la L agranda el área', areaXZ(inL.floor!) > 12);

// ── Mover vértice
const v = run([{ type: 'dragVertex', index: 2, to: P(5, 4), snap: false }], base);
t('mueve vértice suelto', v.floor![2][0] === 5 && v.floor![2][2] === 4 && v.floor![1][0] === 4);
const vs = run([{ type: 'dragVertex', index: 2, to: P(4.02, 3.5) }], base);
t('imán alinea el vértice con su vecino', near(vs.floor![2][0], 4) && vs.axisSnapped);
t('el vértice no sale del plano', run([{ type: 'dragVertex', index: 2, to: [5, 9, 4], snap: false }], base).floor![2][1] === 0);
const bad = run([{ type: 'dragVertex', index: 2, to: P(2, -1), snap: false }], base);
t('rechaza vértice que cruza lados', bad.floor === base.floor && !!bad.message);
const deg = run([{ type: 'dragVertex', index: 2, to: P(4.01, 0.02), snap: false }], base);
t('rechaza lado degenerado', deg.floor === base.floor);
const sn = axisSnap(rect, 2, P(4.1, 3.1));
t('imán fuera de tolerancia no actúa', !sn.snapped);

// ── Traslación rígida
const mv = run([{ type: 'translate', delta: [1, 5, 2] }], base);
t('trasladar conserva forma y área', near(areaXZ(mv.floor!), 12) && mv.floor![0][0] === 1 && mv.floor![0][2] === 2);
t('trasladar no cambia la altura', mv.floor!.every(p => p[1] === 0));

// ── Objetos (huecos)
const sofa = [P(1, 1), P(2, 1), P(2, 2), P(1, 2)];
const withHole = run([{ type: 'startHole' }, ...adds(sofa), { type: 'close' }], base);
t('marca objeto', withHole.holes.length === 1 && withHole.selected === 0);
t('área útil descuenta objeto', near(drawStats(withHole, null).floorArea, 11));
const holeOut = run([{ type: 'startHole' }, ...adds([P(3, 1), P(5, 1), P(5, 2), P(3, 2)]), { type: 'close' }], base);
t('rechaza objeto fuera del piso', holeOut.holes.length === 0 && holeOut.phase === 'hole');
const hv = run([{ type: 'dragVertex', target: 0, index: 2, to: P(2.5, 2.5), snap: false }], withHole);
t('edita vértice del objeto', hv.holes[0][2][0] === 2.5);
const hOut = run([{ type: 'translate', target: 0, delta: [3, 0, 0] }], withHole);
t('rechaza sacar el objeto del piso', hOut.holes[0] === withHole.holes[0]);
const fMove = run([{ type: 'translate', target: 'floor', delta: [1, 0, 1] }], withHole);
t('mover el piso arrastra sus objetos', fMove.holes[0][0][0] === 2 && fMove.holes[0][0][2] === 2);
const shrink = run([{ type: 'dragEdge', target: 'floor', edge: 1, amount: -2.5 }], withHole);
t('rechaza encoger el piso sobre un objeto', shrink.floor === withHole.floor);
const del = run([{ type: 'deleteSelected' }], withHole);
t('borra el objeto seleccionado', del.holes.length === 0 && del.selected === 'floor');
const cyc = run([{ type: 'cycleSelection' }, { type: 'cycleSelection' }], withHole);
t('ciclo de selección piso ↔ objeto', cyc.selected === 0);

// ── Historial: un arrastre entero = un paso
const dragged = run([
  { type: 'beginEdit' },
  { type: 'dragEdge', edge: 1, amount: 0.3 },
  { type: 'dragEdge', edge: 1, amount: 0.3 },
  { type: 'dragEdge', edge: 1, amount: 0.4 },
  { type: 'endEdit' },
], base);
t('arrastre aplicado', near(dragged.floor![1][0], 5));
const undone = run([{ type: 'undo' }], dragged);
t('deshacer revierte el arrastre completo de una vez', near(undone.floor![1][0], 4));
const redone = run([{ type: 'redo' }], undone);
t('rehacer lo vuelve a aplicar', near(redone.floor![1][0], 5));
const tap = run([{ type: 'beginEdit' }, { type: 'endEdit' }], base);
t('tocar sin mover no ensucia el historial', tap.past.length === base.past.length);
const branch = run([{ type: 'translate', delta: [1, 0, 0] }], undone);
t('editar tras deshacer invalida el rehacer', !drawStats(branch, null).canRedo);
const reopened = run([{ type: 'undo' }], base);
t('deshacer el cierre reabre la figura con sus puntos', reopened.phase === 'floor' && reopened.current.length === 4);
const rst = run([{ type: 'reset' }, { type: 'undo' }], withHole);
t('la papelera también se puede deshacer', rst.holes.length === 1 && !!rst.floor);
const undoHole = run([{ type: 'undo' }], withHole);
t('selección se corrige si el objeto desaparece', undoHole.selected === 'floor' || undoHole.selected === null);
const many = run(Array.from({ length: 100 }, () => ({ type: 'translate', delta: [0.01, 0, 0] } as DrawAction)), base);
t('historial acotado', many.past.length <= 60);

// ── Importar el piso detectado (puente automático → humano)
const noisy: Vec3[] = [];
for (let i = 0; i < 40; i++) {  // rectángulo 5×4 muestreado con 40 puntos y ruido de ±1 cm
  const k = i / 10, side = Math.floor(k), f = k - side, r = () => (Math.random() - 0.5) * 0.02;
  const c = [P(0, 0), P(5, 0), P(5, 4), P(0, 4)], a = c[side], b = c[(side + 1) % 4];
  noisy.push([a[0] + (b[0] - a[0]) * f + r(), 0, a[2] + (b[2] - a[2]) * f + r()]);
}
t('simplificación deja las 4 esquinas', simplifyPolygon(noisy).length === 4);
t('simplificación conserva una L', simplifyPolygon(L).length === 6);
const imp = run([{ type: 'importFloor', polygon: noisy }]);
t('importa el piso detectado como editable', imp.phase === 'floorDone' && near(areaXZ(imp.floor!), 20, 0.5));
t('no importa encima de un piso dibujado', run([{ type: 'importFloor', polygon: noisy }], base).floor === base.floor);

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);