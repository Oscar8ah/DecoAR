/**
 * P1 · Entrega 2 — Vista 3D y flujo "Generar 3D" (lógica pura + reductor REAL + generador REAL).
 * La vista con Viro y la sesión AR se validan en el iPhone. Ejecutar:  npx tsx tools/test-vista3d.ts
 */
import { Plano } from '../components/plan/planModel';
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, contactosPlanta, planoDe } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import {
  encuadre, miradaDe, distancia, girar, aCamara, transformacion, zoom, puedeAcercar, puedeAlejar, visibles, pisosDe, avisos, sinContenido,
  FOV_SUPUESTO, ACERCA_MIN, ACERCA_MAX, INCLINACION_MIN, INCLINACION_MAX, Vec3,
} from '../components/vista3d/camara3d';
import { generar3D, resumenConversion, volverDesde } from '../components/vista3d/flujo';
import { ladoZoom, ZOOM } from '../components/editor2d/vistaLienzo';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const dosCuartos = () => run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 },
  { type: 'seleccionar', seleccion: null });
const maquetaDe = (e: EditorPlanta) => generarMaqueta(planoDe(e.planta));

// ── 1. Encuadre y vistas para planos pequeños y grandes ──
//     (con la MISMA transformación que aplica la escena: cámara quieta en el origen mirando a −Z)
for (const [n, ancho, largo] of [['una sala 4 × 4', 4, 4], ['una casa 40 × 30', 40, 30]] as const) {
  let e = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  e = run(e, { type: 'fijarDimension', id: String(e.planta.modulos[0].id), campo: 'ancho', valor: ancho },
    { type: 'fijarDimension', id: String(e.planta.modulos[0].id), campo: 'largo', valor: largo });
  const m = maquetaDe(e), enc = encuadre(m);
  const [w, h, d] = m.extension;
  const esquinas: Vec3[] = [];
  for (const x of [-w / 2, w / 2]) for (const y of [0, h]) for (const z of [-d / 2, d / 2]) esquinas.push([x, y, z]);
  t(`1) ${n}: el foco está en el centro, a media altura`, near(enc.foco[0], 0) && near(enc.foco[2], 0) && near(enc.foco[1], h / 2));
  for (const v of ['isometrica', 'arriba'] as const) {
    const mir = miradaDe(v)!;
    const enCam = esquinas.map(q => aCamara(q, enc, mir));
    t(`1) ${n}, ${v}: toda la maqueta queda delante de la cámara`, enCam.every(q => q[2] < 0));
    t(`1) ${n}, ${v}: toda la maqueta cabe en el campo de visión`, enCam.every(q => Math.atan(Math.hypot(q[0], q[1]) / -q[2]) * 180 / Math.PI < FOV_SUPUESTO / 2));
    const f = aCamara(enc.foco, enc, mir);
    t(`1) ${n}, ${v}: centrada frente a la cámara`, near(f[0], 0) && near(f[1], 0) && near(f[2], -distancia(enc, 1)));
  }
  const arriba = miradaDe('arriba')!;
  t(`1) ${n}: desde arriba, el techo mira a la cámara (más cerca que el piso)`,
    aCamara([0, h, 0], enc, arriba)[2] > aCamara([0, 0, 0], enc, arriba)[2]);
  const iso = miradaDe('isometrica')!;
  t(`1) ${n}: isométrica, elevada y desde una esquina`, iso.inclinacion > 0 && iso.inclinacion < 90 && Math.abs(iso.giro) === 45
    && aCamara([0, h, 0], enc, iso)[1] > aCamara([0, 0, 0], enc, iso)[1]);
}
t('1) "Libre" no tiene mirada propia: conserva la actual', miradaDe('libre') === null);
t('1) un plano diminuto no deja la maqueta pegada a la cámara: radio mínimo 1 m', encuadre({ extension: [0.3, 0.3, 0.3] }).radio === 1);
t('1) la transformación de la escena es la que se prueba (centrar, girar, inclinar, alejar)', (() => {
  const tr = transformacion({ foco: [0, 1.3, 0], radio: 5 }, { inclinacion: 35, giro: -45, acerca: 2 });
  return near(tr.centrar[1], -1.3) && tr.girar[1] === -45 && tr.inclinar[0] === 35 && near(tr.alejar[2], -distancia({ radio: 5 }, 2));
})());

// ── 2. Girar con el dedo y zoom ──
{
  const m0 = miradaDe('isometrica')!;
  const g = girar(m0, 100, 0);
  t('2) arrastrar a lo ancho gira alrededor de la vertical', near(g.giro, m0.giro + 40) && g.inclinacion === m0.inclinacion);
  t('2) arrastrar hacia abajo inclina hasta "desde arriba" y no pasa de 90°', girar(m0, 0, 10000).inclinacion === INCLINACION_MAX);
  t('2) arrastrar hacia arriba no pasa de casi de frente (5°): nunca se mira por debajo del piso', girar(m0, 0, -10000).inclinacion === 5 && INCLINACION_MIN === 5);
  let a = 1; for (let i = 0; i < 30; i++) a = zoom(a, true);
  t('2) acercar nunca pasa del máximo y entonces + se apaga', a === ACERCA_MAX && !puedeAcercar(a) && puedeAlejar(a));
  let b = 1; for (let i = 0; i < 30; i++) b = zoom(b, false);
  t('2) alejar nunca baja del mínimo y entonces − se apaga', b === ACERCA_MIN && !puedeAlejar(b) && puedeAcercar(b));
  t('2) + y − se deshacen entre sí', near(zoom(zoom(1, true), false), 1, 1e-3));
  t('2) acercar acerca de verdad la maqueta', distancia({ radio: 5 }, zoom(1, true)) < distancia({ radio: 5 }, 1));
}

// ── 3. Pisos ──
{
  const e = run(dosCuartos(), { type: 'agregarNivel' }, { type: 'agregarModulo', tipo: 'habitacion', x: 0, z: 0 });
  const p = planoDe(e.planta), m = generarMaqueta(p);
  const arriba = String(e.planta.modulos.at(-1)!.id);
  t('3) el plano tiene 2 pisos', pisosDe(p) === 2);
  t('3) "Todos" muestra todo, marcos incluidos', visibles(m, p, null).length === m.cajas.length + m.marcos.length);
  t('3) "Hasta piso 1" oculta lo del piso 2', !visibles(m, p, 0).some(c => c.moduloId === arriba) && visibles(m, p, 0).length > 0);
  t('3) "Hasta piso 2" lo muestra', visibles(m, p, 1).some(c => c.moduloId === arriba));
  const piso2 = m.cajas.find(c => c.moduloId === arriba && c.clase === 'piso')!, piso1 = m.cajas.find(c => c.moduloId === String(e.planta.modulos[0].id) && c.clase === 'piso')!;
  t('3) el piso 2 está 2,80 m encima del piso 1', near(piso2.centro[1] - piso1.centro[1], 2.8));
}

// ── 4. Dimensiones conservadas ──
{
  const e = dosCuartos();
  const m = maquetaDe(e);
  const sala = e.planta.modulos[0];
  const piso = m.cajas.find(c => c.moduloId === String(sala.id) && c.clase === 'piso')!;
  t('4) el piso de la sala mide 4 × 4 m en 3D', near(piso.tamano[0], sala.ancho) && near(piso.tamano[2], sala.largo));
  t('4) la maqueta mide 8 × 4 m en planta', near(m.extension[0], 8) && near(m.extension[2], 4));
}

// ── 5. Avisos: lo que dice el generador real, clasificado ──
{
  let e = dosCuartos();
  for (const tipo of ['vidrio', 'baranda', 'escalera', 'exterior']) e = run(e, { type: 'agregarModulo', tipo, x: 10, z: 10 });
  e = run(e, { type: 'agregarModulo', tipo: 'columna', x: 12, z: 12 });
  const col = e.planta.modulos.at(-1)!;
  const p0 = planoDe(e.planta);
  const p: Plano = { ...p0, modulos: p0.modulos.map(m => (m.id === col.id ? { ...m, forma: 'redonda' } : m)) };
  const lista = avisos(generarMaqueta(p), p);
  for (const nombre of ['Paredes de vidrio', 'Barandas', 'Escaleras', 'Pisos exteriores', 'Columnas redondas'])
    t(`5) "${nombre}" figura como no representado`, lista.some(a => a.fidelidad === 'no-representado' && a.texto.startsWith(nombre)));
  const conPuerta = run(dosCuartos(), { type: 'crearVanoEnContacto', contacto: contactosPlanta(dosCuartos().planta)[0] });
  const idV = String(conPuerta.planta.vanos[0].id);
  const pp = planoDe(run(conPuerta, { type: 'actualizarVano', id: idV, campo: 'tipo', valor: 'puerta' },
    { type: 'actualizarModulo', id: String(conPuerta.planta.modulos[0].id), cambios: { imagen_piso: 'https://img/x.jpg' } }).planta);
  const l2 = avisos(generarMaqueta(pp), pp);
  t('5) puertas: parcial (hueco y marco sí, hoja no)', l2.some(a => a.fidelidad === 'parcial' && a.texto.includes('no la hoja')));
  t('5) piso del catálogo: parcial (color único, sin textura)', l2.some(a => a.fidelidad === 'parcial' && a.texto.includes('color único')));
  t('5) un plano simple no inventa avisos', avisos(maquetaDe(dosCuartos()), planoDe(dosCuartos().planta)).length === 0);
  const varios = run(dosCuartos(), { type: 'agregarNivel' }, { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  t('5) varios pisos: compatible', avisos(maquetaDe(varios), planoDe(varios.planta)).some(a => a.fidelidad === 'compatible' && a.texto.startsWith('Varios pisos')));
  t('5) plano vacío: no hay nada que mostrar', sinContenido(generarMaqueta(planoDe(editorVacio().planta))));
}

// ── 6. Generar 3D: la conversión real del reductor ──
{
  const antes = dosCuartos();
  const despues = generar3D(antes);
  t('6) agrega el arco automático donde se tocan sin vano', despues.planta.vanos.length === 1 && despues.planta.vanos[0].tipo === 'arco');
  t('6) el resumen lo dice', resumenConversion(antes, despues).arcos === 1 && /1 arco automático/.test(resumenConversion(antes, despues).texto!));
  const otra = generar3D(despues);
  t('6) idempotente: generar otra vez no agrega ni cambia nada', JSON.stringify(otra.planta) === JSON.stringify(despues.planta));
  t('6) idempotente: tampoco deja otro paso de deshacer', otra.deshacer.length === despues.deshacer.length);
  t('6) idempotente: el resumen dice que no hubo cambios', resumenConversion(despues, otra).texto === null);
  t('6) se puede deshacer y vuelve al plano anterior', JSON.stringify(run(despues, { type: 'deshacer' }).planta.vanos) === JSON.stringify(antes.planta.vanos));
  // muro cerrado: borrar el último vano y generar no vuelve a poner arco
  const cerrado = run(despues, { type: 'borrarVano', id: String(despues.planta.vanos[0].id) });
  t('6) un muro cerrado no recibe arco automático', generar3D(cerrado).planta.vanos.length === 0);
  // espacios separados: su vano se quita al generar
  const separado = run(despues, { type: 'moverModulo', id: String(despues.planta.modulos[1].id), x: 10, z: 0 });
  const g = generar3D(separado);
  t('6) un vano entre espacios que ya no se tocan se quita y se informa',
    g.planta.vanos.length === 0 && resumenConversion(separado, g).quitados === 1 && /se quitó 1 vano/.test(resumenConversion(separado, g).texto!));
  const vacio = generar3D(editorVacio());
  t('6) plano vacío: el reductor avisa y no cambia nada', vacio.mensaje === 'Agrega al menos un espacio' && vacio.planta.modulos.length === 0);
}

// ── 7. Navegación: nunca sin salida ──
t('7) desde AR se vuelve a 3D, desde 3D al plano', volverDesde('maqueta3dAR') === 'revision3d' && volverDesde('revision3d') === 'editor2d');

// ── 8. Zoom del editor: nunca encima del círculo de estirar ──
{
  const W = 393, H = 600;
  const bajoZoom = { px: W - ZOOM.margen - ZOOM.ancho / 2, py: H - ZOOM.margen - 20 };
  t('8) si el círculo cae bajo los botones de zoom, el zoom pasa a la izquierda', ladoZoom(bajoZoom, W, H) === 'izquierda');
  t('8) en cualquier otro sitio, el zoom sigue a la derecha', ladoZoom({ px: 100, py: 100 }, W, H) === 'derecha' && ladoZoom(null, W, H) === 'derecha');
  t('8) también si solo se rozan (radio del círculo)', ladoZoom({ px: W - ZOOM.margen - ZOOM.ancho - 20, py: H - 30 }, W, H) === 'izquierda');
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
