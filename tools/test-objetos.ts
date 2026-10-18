/**
 * Entrega 3b — Objetos: catálogo (frente a la web), REDUCTOR REAL con deshacer/rehacer, gestos simulados y
 * alineación en 3D y AR con la maqueta REAL de planGeometry. Ejecutar:  npx tsx tools/test-objetos.ts
 */
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, planoDe, Mueble } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import { CATALOGO_OBJETOS, objetoPorId, medidasObjeto, aproximadas, piezasEnMundo } from '../components/objetos/catalogoObjetos';
import { objetosEnEscena, centradoMaqueta, baseObjeto, conAproximaciones } from '../components/objetos/objetos3d';
import { Vista, aPantalla } from '../components/editor2d/vistaLienzo';
import { iniciar, mover, terminar, queToca, mueblesBajoDedo, PULSACION_LARGA } from '../components/editor2d/gestosLienzo';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const sala = () => run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'fijarDimension', id: 'm1', campo: 'ancho', valor: 6 },
  { type: 'fijarDimension', id: 'm1', campo: 'largo', valor: 5 }, { type: 'seleccionar', seleccion: null });   // 6 × 5, centro (3, 2.5)
const agregar = (e: EditorPlanta, tipo: string, x: number, z: number) => run(e, { type: 'agregarMueble', tipo, x, z, ...medidasObjeto(objetoPorId(tipo)!) });
const O = (e: EditorPlanta, id: string) => (e.planta.muebles ?? []).find(o => o.id === id)!;

// ── 1. Catálogo: el de la web, sin las 5 piezas de muro ──
const WEB = ['sofa', 'mesa', 'cama', 'mesita', 'escritorio', 'sofa2', 'mesa_cafe', 'armario', 'planta', 'lampara_pie', 'ventana_blanca', 'ventana_negra',
  'ventana_balcon', 'puerta', 'hueco', 'estufa', 'cocina_integral', 'inodoro', 'ducha', 'lavamanos', 'toallero', 'tv', 'nevera', 'lavadora', 'microondas', 'tapete', 'luz_techo'];
const MURO = ['ventana_blanca', 'ventana_negra', 'ventana_balcon', 'puerta', 'hueco'];
t('1) 22 objetos: los 27 de la web menos las 5 piezas de muro (ya son Aberturas)',
  CATALOGO_OBJETOS.length === 22 && CATALOGO_OBJETOS.every(o => WEB.includes(o.id)) && MURO.every(id => !objetoPorId(id)));
t('1) nombres e iconos de la web', objetoPorId('sofa')!.nombre === 'Sofá' && objetoPorId('microondas')!.nombre === 'Horno microondas' && objetoPorId('cama')!.icono === '🛏️');
t('1) medidas del sofá de la web: 2,2 × 0,9 m y 1,05 m de alto', (() => { const m = medidasObjeto(objetoPorId('sofa')!); return m.ancho === 2.2 && m.largo === 0.9 && m.alto === 1.05; })());
t('1) cama de la web: 1,6 × 2,0 m', (() => { const m = medidasObjeto(objetoPorId('cama')!); return m.ancho === 1.6 && m.largo === 2; })());
t('1) la lámpara de pie trae su luz de la web (0xFFF5D0, 0,5, 4 m)', (() => { const l = objetoPorId('lampara_pie')!.luz!; return l.color === '#FFF5D0' && l.intensidad === 0.5 && l.alcance === 4; })());
t('1) piezas redondas marcadas como aproximadas (planta, tapete…), el sofá no', aproximadas(objetoPorId('planta')!) === 3 && aproximadas(objetoPorId('tapete')!) === 1 && aproximadas(objetoPorId('sofa')!) === 0);
t('1) solo cajas y esferas (lo que tiene Viro 3.0.2)', CATALOGO_OBJETOS.every(o => o.piezas.every(p => p.forma === 'caja' || p.forma === 'esfera')));

// ── 2. Reductor: agregar, mover, girar, borrar, con deshacer y rehacer ──
{
  let e = agregar(sala(), 'sofa', 2, 2);
  e = agregar(e, 'sofa', 4, 3);
  const [a, b] = e.planta.muebles!;
  t('2) dos sofás del mismo tipo, cada uno con su id', a.tipo === 'sofa' && b.tipo === 'sofa' && a.id !== b.id);
  t('2) el último queda seleccionado', e.seleccion?.tipo === 'mueble' && e.seleccion.id === b.id);
  t('2) guardan posición, giro, piso y medidas', a.x === 2 && a.z === 2 && a.rot === 0 && a.nivel === 0 && a.ancho === 2.2 && a.largo === 0.9 && a.alto === 1.05);
  t('2) sus ids no chocan con espacios ni vanos', !e.planta.modulos.some(m => m.id === a.id || m.id === b.id));
  const sinUno = run(e, { type: 'deshacer' });
  t('2) deshacer quita el último agregado', sinUno.planta.muebles!.length === 1 && sinUno.planta.muebles![0].id === a.id);
  t('2) rehacer lo devuelve con sus propiedades', JSON.stringify(run(sinUno, { type: 'rehacer' }).planta.muebles) === JSON.stringify(e.planta.muebles));
  const movido = run(e, { type: 'iniciarGesto' }, { type: 'moverMueble', id: a.id, x: 2.3, z: 2.1 }, { type: 'moverMueble', id: a.id, x: 3.1, z: 1.4 }, { type: 'terminarGesto' });
  t('2) mover: queda donde se soltó', O(movido, a.id).x === 3.1 && O(movido, a.id).z === 1.4);
  t('2) un arrastre = un paso de deshacer', O(run(movido, { type: 'deshacer' }), a.id).x === 2 && run(movido, { type: 'deshacer' }).deshacer.length === e.deshacer.length);
  let g = e; for (let i = 0; i < 3; i++) g = run(g, { type: 'girarMueble', id: a.id });
  t('2) girar suma 45° por acción', O(g, a.id).rot === 135);
  for (let i = 0; i < 5; i++) g = run(g, { type: 'girarMueble', id: a.id });
  t('2) ocho giros vuelven a 0°', O(g, a.id).rot === 0);
  t('2) cada giro es un paso: deshacer uno vuelve a 315°', O(run(g, { type: 'deshacer' }), a.id).rot === 315);
  const borrado = run(e, { type: 'eliminarMueble', id: a.id });
  t('2) borrar quita solo ese objeto', borrado.planta.muebles!.length === 1 && borrado.planta.muebles![0].id === b.id && borrado.seleccion === null);
  t('2) deshacer el borrado lo recupera idéntico', JSON.stringify(O(run(borrado, { type: 'deshacer' }), a.id)) === JSON.stringify(a));
  const piso2 = run(e, { type: 'agregarNivel' });
  const intento = run(piso2, { type: 'moverMueble', id: a.id, x: 0, z: 0 });
  t('2) un objeto de otro piso no se mueve desde este', O(intento, a.id).x === 2 && intento.mensaje === 'Ese objeto está en otro piso');
  t('2) en el piso 2 se colocan en el nivel 1', agregar(piso2, 'cama', 1, 1).planta.muebles!.at(-1)!.nivel === 1);
}

// ── 3. Gestos: seleccionar, girar, mantener y arrastrar, sin conflictos ──
{
  const V: Vista = { escala: 40, ox: 20, oy: 20 };
  const gesto = (e: EditorPlanta, x: number, z: number, opts: { dur?: number; pasos?: [number, number][]; t0?: number } = {}) => {
    const q = aPantalla(V, x, z), t0 = opts.t0 ?? 1000;
    const c = { vista: V, planta: e.planta, nivel: e.nivelActivo, seleccion: e.seleccion, colocar: null };
    const r = iniciar(c, q.px, q.py, t0); let x2 = run(e, ...r.acciones); let g = r.gesto; let v = V;
    for (const [i, [dx, dy]] of (opts.pasos ?? []).entries()) { const m = mover(g, dx, dy, t0 + (opts.dur ?? 0) + i * 16); g = m.gesto; x2 = run(x2, ...m.acciones); if (m.vista) v = m.vista; }
    return { e: run(x2, ...terminar(g, { ...c, planta: x2.planta, seleccion: x2.seleccion }, false, t0 + (opts.dur ?? 80) + 50)), v };
  };
  let e = run(agregar(sala(), 'sofa', 3, 2.5), { type: 'seleccionar', seleccion: null });
  const id = e.planta.muebles![0].id;
  let r = gesto(e, 3, 2.5);
  t('3) un toque selecciona el objeto, sin girarlo', r.e.seleccion?.tipo === 'mueble' && O(r.e, id).rot === 0);
  r = gesto(r.e, 3, 2.5);
  t('3) otro toque sobre el ya seleccionado lo gira 45°', O(r.e, id).rot === 45);
  const largo = gesto(r.e, 3, 2.5, { dur: PULSACION_LARGA + 50 });
  t('3) mantener presionado sin mover no lo gira', O(largo.e, id).rot === 45);
  const arrastre = gesto(r.e, 3, 2.5, { dur: PULSACION_LARGA + 20, pasos: [[20, 0], [40, 20]] });
  t('3) mantener y arrastrar lo mueve (40 pt = 1 m, 20 pt = 0,5 m)', near(O(arrastre.e, id).x, 4) && near(O(arrastre.e, id).z, 3));
  t('3) todo el arrastre es un paso de deshacer', O(run(arrastre.e, { type: 'deshacer' }), id).x === 3);
  const rapido = gesto(r.e, 3, 2.5, { dur: 30, pasos: [[20, 0], [40, 20]] });
  t('3) arrastrar sin mantener mueve la VISTA, no el objeto', O(rapido.e, id).x === 3 && rapido.v.ox === V.ox + 40);
  // giro: la huella girada se toca donde realmente está
  const girado = run(e, { type: 'girarMueble', id }, { type: 'girarMueble', id });   // 90°: el sofá de 2,2 m queda de norte a sur
  const p1 = aPantalla(V, 3, 2.5 + 1.0), p2 = aPantalla(V, 3 + 1.0, 2.5);
  t('3) girado 90°, se toca a lo largo (1 m al sur) y no a lo ancho (1 m al este)',
    mueblesBajoDedo(V, girado.planta, 0, p1.px, p1.py).includes(id) && !mueblesBajoDedo(V, girado.planta, 0, p2.px, p2.py).includes(id));
  const c = aPantalla(V, 3, 2.5);
  t('3) el objeto gana sobre el cuarto donde está', queToca(V, e.planta, 0, null, c.px, c.py).tipo === 'mueble');
  const conPiso2 = run(e, { type: 'agregarNivel' });
  t('3) los objetos de otro piso no se tocan', queToca(V, conPiso2.planta, 1, null, c.px, c.py).tipo !== 'mueble');
  const q = aPantalla(V, 1, 1);
  const colocado = run(e, ...terminar(iniciar({ vista: V, planta: e.planta, nivel: 0, seleccion: null,
    colocar: { tipo: 'cama', etiqueta: 'Cama', mueble: medidasObjeto(objetoPorId('cama')!) } }, q.px, q.py, 0).gesto,
    { vista: V, planta: e.planta, nivel: 0, seleccion: null, colocar: { tipo: 'cama', etiqueta: 'Cama', mueble: medidasObjeto(objetoPorId('cama')!) } }));
  t('3) colocar desde la lista de Objetos: centrado donde se tocó', (() => { const o = colocado.planta.muebles!.at(-1)!; return o.tipo === 'cama' && near(o.x, 1) && near(o.z, 1); })());
}

// ── 4. Alineación con la maqueta real (3D y AR) ──
{
  const e = agregar(sala(), 'sofa', 3, 2.5);   // en el centro de la sala
  const p = planoDe(e.planta), maq = generarMaqueta(p), off = centradoMaqueta(p);
  const piso = maq.cajas.find(k => k.moduloId === 'm1' && k.clase === 'piso')!;
  t('4) el centrado es el mismo que usa la maqueta (centro del piso de la sala)', near(piso.centro[0], 3 - off.x) && near(piso.centro[2], 2.5 - off.z));
  const base3D = objetosEnEscena(e.planta.muebles, p, 1)[0];   // pieza 0 del sofá: la base, en (0, 0.25, 0)
  t('4) 3D: el sofá queda en el centro de la sala, igual que su piso', near(base3D.pos[0], piso.centro[0]) && near(base3D.pos[2], piso.centro[2]));
  const baseAR = objetosEnEscena(e.planta.muebles, p, -1)[0];
  t('4) AR: mismo punto con el z invertido de MaquetaScene (Z_SIGN)', near(baseAR.pos[0], piso.centro[0]) && near(baseAR.pos[2], -piso.centro[2]));
  // orientación: girar en sentido horario visto desde arriba (como en el plano 2D)
  const cat = objetoPorId('sofa')!, resp = (rot: number, zSign: 1 | -1) => piezasEnMundo(cat, { x: 0, z: 0, rot }, { x: 0, z: 0 }, 0, zSign)[1].pos;   // respaldo: z −0,35
  t('4) sin girar, el respaldo queda al norte (z menor)', near(resp(0, 1)[2], -0.35) && near(resp(0, 1)[0], 0));
  t('4) girado 90° (horario), el respaldo queda al este', near(resp(90, 1)[0], 0.35) && near(resp(90, 1)[2], 0));
  t('4) girado 180°, al sur', near(resp(180, 1)[2], 0.35));
  t('4) en AR el mismo respaldo con z invertido', near(resp(90, -1)[0], 0.35) && near(resp(0, -1)[2], 0.35));
  t('4) giro de la pieza para Viro: −rot en 3D, +rot en AR (el espejo invierte el sentido)',
    piezasEnMundo(cat, { x: 0, z: 0, rot: 45 }, { x: 0, z: 0 }, 0, 1)[0].rotY === -45 && piezasEnMundo(cat, { x: 0, z: 0, rot: 45 }, { x: 0, z: 0 }, 0, -1)[0].rotY === 45);
  // altura: piso 2 y luz de techo
  const dos = agregar(run(sala(), { type: 'agregarNivel' }, { type: 'agregarModulo', tipo: 'habitacion', x: 0, z: 0 }), 'mesita', 1, 1);
  const p2 = planoDe(dos.planta), m2 = generarMaqueta(p2);
  const pisoAlto = m2.cajas.find(k => k.moduloId === dos.planta.modulos.at(-1)!.id && k.clase === 'piso')!;
  t('4) un objeto del piso 2 se apoya en el piso 2 (2,80 m)', near(baseObjeto(dos.planta.muebles![0], p2), 2.8) && Math.abs(2.8 - (pisoAlto.centro[1] + pisoAlto.tamano[1] / 2)) < 0.06);
  const luz = agregar(sala(), 'luz_techo', 3, 2.5);
  t('4) la luz de techo queda 0,10 m bajo el techo del cuarto (2,6 − 0,1)', near(baseObjeto(luz.planta.muebles![0], planoDe(luz.planta)), 2.5));
  t('4) el microondas va sobre el mesón (0,75 m)', near(baseObjeto(agregar(sala(), 'microondas', 1, 1).planta.muebles![0], p), 0.75));
  t('4) "hasta el piso 1" oculta los objetos del piso 2', objetosEnEscena(dos.planta.muebles, p2, 1, 0).length === 0 && objetosEnEscena(dos.planta.muebles, p2, 1, 1).length > 0);
  const raro: Mueble = { id: 'x', tipo: 'nave_espacial', x: 0, z: 0, rot: 0, nivel: 0, ancho: 1, largo: 1, alto: 1 };
  t('4) un tipo desconocido no se dibuja (no se inventa una forma)', objetosEnEscena([raro], p, 1).length === 0);
  t('4) avisos: los objetos con piezas redondas se nombran', conAproximaciones(agregar(sala(), 'planta', 1, 1).planta.muebles).join() === 'Planta' && conAproximaciones(e.planta.muebles).length === 0);
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
