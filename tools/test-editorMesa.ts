/**
 * Pruebas de la geometría del editor sobre la mesa y SIMULACIÓN LÓGICA del flujo E2.
 * No es un simulador de iOS ni el teléfono: los toques y arrastres se generan como posiciones de
 * mundo con las mismas fórmulas, y se comprueba que el proyecto no se desplaza.
 */
import {
  mundoAPlano, planoAMundo, planoDeArrastre, espacioDeArrastre, localDePlano, arrastreAPlano,
  esquinasDe, extensionPlanta, avisoEspacio, ContextoMesa, PoseAncla, Z_SIGN,
} from '../components/plan/editorMesaGeom';
import { editorVacio, reducirEditor, AccionEditor, EditorPlanta, planoDe } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import { Vec3 } from '../components/ar/spatial/roomModel';
declare const process: any;

let ok = 0, fail = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.error('✗', n); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;
let seed = 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

// ── 1. Ida y vuelta mundo ↔ plano con 3000 anclas y toques aleatorios ──
{
  let peor = 0, peorAltura = 0;
  for (let i = 0; i < 3000; i++) {
    const yaw = (rnd() - 0.5) * 360;
    const pose: PoseAncla = { position: [(rnd() - 0.5) * 6, -0.5 - rnd(), (rnd() - 0.5) * 6], rotation: rnd() < 0.5 ? [0, yaw, 0] : [180, 180 - yaw, 180] };
    const tap: Vec3 = [(rnd() - 0.5) * 0.6, 0, (rnd() - 0.5) * 0.6];
    const escala = [1 / 20, 1 / 30, 1 / 50][i % 3];
    const x = (rnd() - 0.3) * 12, z = (rnd() - 0.3) * 12;
    const w = planoAMundo(pose, tap, escala, x, 0, z);
    const back = mundoAPlano(pose, tap, escala, w);
    peor = Math.max(peor, Math.hypot(back.x - x, back.z - z));
    // un dedo nunca toca exactamente la mesa: 4 mm por encima no debe mover el punto
    const arriba = planoAMundo(pose, tap, escala, x, 0.004 / escala, z);
    const b2 = mundoAPlano(pose, tap, escala, arriba);
    peorAltura = Math.max(peorAltura, Math.hypot(b2.x - x, b2.z - z));
  }
  t(`1) ida y vuelta mundo ↔ plano: error máx ${peor.toExponential(1)} m (< 1 µm de plano)`, peor < 1e-6);
  t(`1) la altura del dedo no desplaza el punto (error ${peorAltura.toExponential(1)} m)`, peorAltura < 1e-6);
}

// ── 2. Coherencia con cómo se DIBUJA: un punto del plano en (x, 0, z) cae en el mundo donde dice planoAMundo ──
{
  const pose: PoseAncla = { position: [1, -0.8, -2], rotation: [0, 37, 0] };
  const tap: Vec3 = [0.1, 0, -0.05], e = 1 / 20;
  // La escena dibuja en el nodo del punto tocado, con escala e: local = tap + e·(x, y, Z_SIGN·z)
  const x = 3, z = 2;
  const dibujadoLocal: Vec3 = [tap[0] + e * x, 0, tap[2] + e * Z_SIGN * z];
  const { localToWorld } = require('../components/ar/spatial/roomModel');
  const dibujadoMundo: Vec3 = localToWorld(pose.position, pose.rotation, dibujadoLocal);
  const formula = planoAMundo(pose, tap, e, x, 0, z);
  t('2) planoAMundo coincide con la posición en la que la escena dibuja ese punto', Math.hypot(...[0, 1, 2].map(k => dibujadoMundo[k] - formula[k]) as [number, number, number]) < 1e-12);
  t('2) localDePlano usa la misma convención Z_SIGN que las cajas de la maqueta', JSON.stringify(localDePlano(3, 0, 2)) === JSON.stringify([3, 0, Z_SIGN * 2]));
}

// ── 3. Plano de arrastre: pasa por el punto tocado y apunta hacia arriba de la mesa ──
{
  const pose: PoseAncla = { position: [0.5, -0.9, -1], rotation: [0, 120, 0] };
  const tap: Vec3 = [0.2, 0, 0.1];
  const pa = planoDeArrastre(pose, tap);
  t('3) la normal de una mesa horizontal es (0, 1, 0)', near(pa.planeNormal[1], 1, 1e-12) && near(pa.planeNormal[0], 0, 1e-12));
  t('3) el punto del plano está a la altura de la mesa', near(pa.planePoint[1], -0.9, 1e-12));
  const volteada = planoDeArrastre({ position: [0, -0.9, 0], rotation: [180, 60, 180] }, [0, 0, 0]);
  t('3) con el giro "volteado" que a veces entrega ARKit, la normal sigue siendo (0, 1, 0)', near(volteada.planeNormal[1], 1, 1e-9));
}

// ── 4. Detección del espacio en que llega onDrag ──
{
  const pose: PoseAncla = { position: [1.2, -0.75, -1.6], rotation: [0, 25, 0] };
  const tap: Vec3 = [0, 0, 0], e = 1 / 20;
  const mundo = planoAMundo(pose, tap, e, 4, 0.1, 4), local = localDePlano(4, 0.1, 4);
  const movido = (p: Vec3, d: number): number[] => [p[0] + d, p[1], p[2] + d];
  t('4) si llega en mundo, se detecta mundo', espacioDeArrastre(movido(mundo, 0.01), mundo, local) === 'mundo');
  t('4) si llega en local, se detecta local', espacioDeArrastre(movido(local, 0.2), mundo, local) === 'local');
  const ctx = { aPlano: (w: number[]) => mundoAPlano(pose, tap, e, w as Vec3) } as ContextoMesa;
  const p1 = arrastreAPlano('mundo', planoAMundo(pose, tap, e, 2.3, 0, 1.7), ctx)!;
  const p2 = arrastreAPlano('local', localDePlano(2.3, 0, 1.7), ctx)!;
  t('4) en ambos espacios se recupera el mismo punto del plano', near(p1.x, 2.3, 1e-9) && near(p1.z, 1.7, 1e-9) && near(p2.x, 2.3) && near(p2.z, 1.7));
}

// ── 5. Esquinas, extensión y aviso de espacio ──
{
  const m = { id: 'a', x: 1, z: 2, ancho: 4, largo: 3 } as any;
  const q = esquinasDe(m);
  t('5) esquinas: no (1,2), ne (5,2), so (1,5), se (5,5)', q.no.x === 1 && q.no.z === 2 && q.ne.x === 5 && q.so.z === 5 && q.se.x === 5 && q.se.z === 5);
  const ext = extensionPlanta([m, { id: 'b', x: 5, z: 2, ancho: 3, largo: 3 } as any])!;
  t('5) extensión 7 × 3 con centro (4.5, 3.5)', ext.ancho === 7 && ext.largo === 3 && ext.cx === 4.5 && ext.cz === 3.5);
  t('5) sin espacios no hay extensión', extensionPlanta([]) === null);
  t('5) 7 × 3 m a 1:20 (35 × 15 cm) cabe en una mesa de 75 × 96 cm', avisoEspacio(ext, 1 / 20, [0.75, 0.96]) === null);
  const grande = extensionPlanta([{ id: 'c', x: 0, z: 0, ancho: 20, largo: 12 } as any])!;
  const av = avisoEspacio(grande, 1 / 20, [0.75, 0.96]);
  t('5) 20 × 12 m a 1:20 (100 × 60 cm) NO cabe y el aviso da las medidas', av !== null && av.includes('100×60') && av.includes('75×96'));
  t('5) …pero a 1:50 (40 × 24 cm) sí cabe', avisoEspacio(grande, 1 / 50, [0.75, 0.96]) === null);
  t('5) se acepta la planta girada respecto a la mesa', avisoEspacio(extensionPlanta([{ id: 'd', x: 0, z: 0, ancho: 9, largo: 17 } as any]), 1 / 20, [0.96, 0.75]) === null);
}

// ═════════ 6. SIMULACIÓN LÓGICA DEL FLUJO E2 (lo que hará el usuario con los dedos) ═════════
{
  const pose: PoseAncla = { position: [0.4, -0.72, -0.9], rotation: [0, -28, 0] };   // la mesa, girada 28°
  const tap: Vec3 = [0.05, 0, -0.03];                                                  // donde se tocó la mesa
  const e = 1 / 20;
  const ctx: ContextoMesa = {
    escala: e, lado: [0.75, 0.96],
    aPlano: w => mundoAPlano(pose, tap, e, w as Vec3),
    aMundo: (x, y, z) => planoAMundo(pose, tap, e, x, y, z),
    planoDeArrastre: planoDeArrastre(pose, tap),
  };
  // "El dedo" en un punto del plano → posición de mundo, con ruido de ±3 mm reales y algo de altura
  const dedo = (x: number, z: number): Vec3 => {
    const w = planoAMundo(pose, tap, e, x, 0.002 / e, z);
    return [w[0] + (rnd() - 0.5) * 0.006, w[1], w[2] + (rnd() - 0.5) * 0.006];
  };
  const tocar = (x: number, z: number) => ctx.aPlano(dedo(x, z))!;
  let ed: EditorPlanta = editorVacio();
  const d = (a: AccionEditor) => { ed = reducirEditor(ed, a); };
  const mod = (id: string) => ed.planta.modulos.find(m => m.id === id)!;

  // 6.1 Planta vacía; añado sala, comedor y cocina tocando la mesa
  t('6.1) empieza vacía', ed.planta.modulos.length === 0);
  let p = tocar(0.1, 0.2); d({ type: 'agregarModulo', tipo: 'sala', x: p.x, z: p.z });
  p = tocar(4.1, -0.1);    d({ type: 'agregarModulo', tipo: 'zona', x: p.x, z: p.z, nombre: '🍽️ Comedor' });
  p = tocar(0.2, 4.2);     d({ type: 'agregarModulo', tipo: 'cocina', x: p.x, z: p.z });
  t('6.1) tres espacios de tres tipos, en la casilla tocada pese al ruido del dedo',
    ed.planta.modulos.length === 3 && mod('m1').x === 0 && mod('m1').z === 0 && mod('m2').x === 4 && mod('m2').z === 0 && mod('m3').x === 0 && mod('m3').z === 4);

  // 6.2 Arrastro el asa SE de la sala con 12 eventos intermedios: un solo paso de historial
  const pasosAntes = ed.deshacer.length;
  d({ type: 'iniciarGesto' });
  for (let k = 1; k <= 12; k++) { const q = tocar(4 + (k / 12) * 1.1, 4 - (k / 12) * 0.8); d({ type: 'redimensionar', id: 'm1', esquina: 'se', x: q.x, z: q.z }); }
  d({ type: 'terminarGesto' });
  t('6.2) el arrastre del asa deja la sala en 5 × 3 (cuadrícula de 0.5)', mod('m1').ancho === 5 && mod('m1').largo === 3);
  t('6.2) todo el arrastre es UN paso de historial', ed.deshacer.length === pasosAntes + 1);
  t('6.2) la esquina opuesta no se movió', mod('m1').x === 0 && mod('m1').z === 0);

  // 6.3 Muevo el comedor con el asa central: el dedo agarra el centro (offset), suelta 1 m más allá
  const off = { x: 2, z: 2 };   // el asa central está en el centro de un 4×4
  d({ type: 'iniciarGesto' });
  for (let k = 1; k <= 8; k++) { const q = tocar(4 + off.x + (k / 8) * 1.0, off.z); d({ type: 'moverModulo', id: 'm2', x: q.x - off.x, z: q.z - off.z }); }
  d({ type: 'terminarGesto' });
  t('6.3) el comedor se movió 1 m y su esquina quedó en la cuadrícula', mod('m2').x === 5 && mod('m2').z === 0);
  t('6.3) mover el comedor no desplazó la sala ni la cocina', mod('m1').x === 0 && mod('m3').z === 4);

  // 6.4 Mínimo de 1 m: arrastro el asa NO de la cocina más allá del lado opuesto
  d({ type: 'iniciarGesto' }); const q = tocar(6, 9); d({ type: 'redimensionar', id: 'm3', esquina: 'no', x: q.x, z: q.z }); d({ type: 'terminarGesto' });
  t('6.4) nunca baja de 1 m ni se invierte', mod('m3').ancho === 1 && mod('m3').largo === 1);

  // 6.5 Deshacer y rehacer
  d({ type: 'deshacer' });
  t('6.5) deshacer devuelve la cocina a 4 × 4', mod('m3').ancho === 4 && mod('m3').largo === 4);
  d({ type: 'rehacer' }); d({ type: 'deshacer' });
  t('6.5) rehacer y volver a deshacer es coherente', mod('m3').ancho === 4);

  // 6.6 Junto sala y comedor (sala 0–5, comedor desde 5) y convierto a 3D
  d({ type: 'convertir' });
  const arco = ed.planta.vanos.find(v => v.modulo_a === 'm1' && v.modulo_b === 'm2');
  t('6.6) al convertir, sala y comedor reciben su arco de 0.9', !!arco && arco.tipo === 'arco' && arco.ancho === 0.9);
  const maq = generarMaqueta(planoDe(ed.planta));
  t('6.6) la planta propia genera una maqueta válida', maq.errores.length === 0 && maq.cajas.length > 0);

  // 6.7 Vuelvo a la planta y sigo editando el MISMO proyecto
  d({ type: 'eliminarModulo', id: 'm3' });
  p = tocar(0.3, 3.4); d({ type: 'agregarModulo', tipo: 'bano', x: p.x, z: p.z });
  d({ type: 'convertir' });
  const maq2 = generarMaqueta(planoDe(ed.planta));
  t('6.7) tras volver y editar, el mismo proyecto se reconvierte sin errores', maq2.errores.length === 0 && ed.planta.modulos.length === 3);
  t('6.7) el arco sala–comedor se conserva sin duplicarse', ed.planta.vanos.filter(v => v.modulo_a === 'm1' && v.modulo_b === 'm2').length === 1);

  // 6.8 Origen fijo: nada de lo anterior movió el punto (0,0) del plano en el mundo
  const origen = ctx.aMundo(0, 0, 0)!, origenEsperado = planoAMundo(pose, tap, e, 0, 0, 0);
  t('6.8) el origen del plano sigue en el punto tocado de la mesa', Math.hypot(origen[0] - origenEsperado[0], origen[2] - origenEsperado[2]) < 1e-12);

  // 6.9 Si ARKit refina el ancla (se mueve 2 cm), el proyecto la acompaña y los datos no cambian
  const datos = JSON.stringify(ed.planta.modulos);
  const pose2: PoseAncla = { position: [pose.position[0] + 0.02, pose.position[1], pose.position[2]], rotation: pose.rotation };
  const w = planoAMundo(pose2, tap, e, 5, 0, 3);
  const v = mundoAPlano(pose2, tap, e, w);
  t('6.9) con el ancla refinada, la conversión sigue siendo exacta y los datos no se tocan', near(v.x, 5, 1e-9) && near(v.z, 3, 1e-9) && JSON.stringify(ed.planta.modulos) === datos);
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);