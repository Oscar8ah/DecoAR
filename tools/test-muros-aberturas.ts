/**
 * Entrega 3 — Muros cerrados ("−"), puertas y ventanas en cualquier muro (REDUCTOR REAL + GENERADOR REAL).
 * Ejecutar:  npx tsx tools/test-muros-aberturas.ts
 */
import {
  EditorPlanta, editorVacio, reducirEditor, AccionEditor, contactosPlanta, claveMuro, planoDe, VENTANA, VanoConEstilo,
} from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import { generar3D } from '../components/vista3d/flujo';
import { Vista, aPantalla } from '../components/editor2d/vistaLienzo';
import { ABERTURAS, RADIO_MAS, iniciar, mover, terminar, queToca } from '../components/editor2d/gestosLienzo';
import { botonesMas, posicionMenos, RADIO_MENOS, SEPARACION_MENOS } from '../components/editor2d/vanosLienzo';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
/** Sala (0,0) 4×4 y cocina (4,0) 4×4: un muro compartido en x = 4, de z 0 a 4. Alto de muro 2,6. */
const dos = () => run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 },
  { type: 'seleccionar', seleccion: null });
const V = (e: EditorPlanta) => e.planta.vanos.at(-1) as VanoConEstilo;

// ── 1. "−": cerrar el muro a propósito ──
{
  const e = dos();
  const c = contactosPlanta(e.planta)[0];
  const cerrado = run(e, { type: 'cerrarMuro', contacto: c });
  t('1) el muro queda cerrado en el modelo (murosCerrados)', cerrado.planta.murosCerrados.includes(claveMuro(c)));
  t('1) avisa', cerrado.mensaje === 'Muro cerrado: no tendrá paso al generar el 3D');
  t('1) es un paso de deshacer', run(cerrado, { type: 'deshacer' }).planta.murosCerrados.length === 0);
  t('1) al generar el 3D, un muro cerrado no recibe arco automático', generar3D(cerrado).planta.vanos.length === 0);
  t('1) un muro sin decidir sí lo recibe (comportamiento de la web)', generar3D(e).planta.vanos.length === 1);
  t('1) cerrar dos veces no duplica ni deja otro paso de deshacer', (() => { const x = run(cerrado, { type: 'cerrarMuro', contacto: c });
    return x.planta.murosCerrados.length === 1 && x.deshacer.length === cerrado.deshacer.length; })());
  const abierto = run(cerrado, { type: 'abrirMuro', contacto: c });
  t('1) "abrir" lo devuelve al modo automático', !abierto.planta.murosCerrados.length && generar3D(abierto).planta.vanos.length === 1);
  const conVano = run(e, { type: 'crearVanoEnContacto', contacto: c });
  const r = run(conVano, { type: 'cerrarMuro', contacto: c });
  t('1) un muro con paso no se cierra con "−" (hay que borrar el paso)', r.planta.murosCerrados.length === 0 && r.mensaje === 'Ese muro tiene un paso: bórralo para cerrarlo');
  t('1) "+" sobre un muro cerrado lo abre con su vano', (() => { const x = run(cerrado, { type: 'crearVanoEnContacto', contacto: c }); return x.planta.vanos.length === 1 && !x.planta.murosCerrados.length; })());
  t('1) planos antiguos sin decisiones: todos los muros en automático', run(editorVacio(), { type: 'cargarPlano', plano: planoDe(e.planta) }).planta.murosCerrados.length === 0);
}

// ── 2. Puerta en cualquier muro ──
{
  const e = dos();
  const ext = run(e, { type: 'ponerPuertaLibre', x: 2, z: 0.05 });   // muro norte de la sala: exterior
  t('2) puerta en un muro exterior: da hacia afuera (libre, sin otro cuarto)', V(ext).tipo === 'puerta' && V(ext).modulo_b === null && V(ext).libre === true && V(ext).lado === 'norte');
  t('2) con sus valores de puerta (0,9 × 2,1, bisagra, sentido, apertura)', near(V(ext).ancho, 0.9) && V(ext).alto === 2.1 && V(ext).bisagra === 'izq' && V(ext).anguloApertura === 75);
  t('2) queda seleccionada para ajustarla en el panel', ext.seleccion?.tipo === 'vano' && ext.seleccion.id === String(V(ext).id));
  const int = run(e, { type: 'ponerPuertaLibre', x: 4.02, z: 1.5 });   // muro compartido sala–cocina
  t('2) puerta en un muro interior: queda en el contacto entre los dos cuartos', V(int).modulo_b !== null && !V(int).libre && V(int).limIni === 0 && V(int).limFin === 4);
  const otra = run(int, { type: 'ponerPuertaLibre', x: 4.02, z: 1.7 });
  t('2) no se encima otra abertura en el mismo tramo', otra.planta.vanos.length === 1 && otra.mensaje === 'Ya hay una abertura en ese tramo del muro');
  const desdeOtroLado = run(int, { type: 'ponerPuertaLibre', x: 3.98, z: 1.6 });
  t('2) tampoco tocando el mismo muro desde el otro cuarto', desdeOtroLado.planta.vanos.length === 1);
  const separada = run(int, { type: 'ponerPuertaLibre', x: 4.02, z: 3.4 });
  t('2) sí cabe otra más allá en el mismo muro', separada.planta.vanos.length === 2);
  const cerradoYPuerta = run(e, { type: 'cerrarMuro', contacto: contactosPlanta(e.planta)[0] }, { type: 'ponerPuertaLibre', x: 4.02, z: 2 });
  t('2) una puerta sobre un muro cerrado lo abre', cerradoYPuerta.planta.murosCerrados.length === 0 && cerradoYPuerta.planta.vanos.length === 1);
  t('2) lejos de un muro no pone nada y lo dice', run(e, { type: 'ponerPuertaLibre', x: 2, z: 2 }).mensaje === 'Toca justo sobre el borde de un cuarto');
  const maq = generarMaqueta(planoDe(ext.planta));
  t('2) 3D: la puerta exterior tiene su marco', maq.marcos.some(m => m.id.startsWith(`marco-${V(ext).id}`)));
}

// ── 3. Ventana en cualquier muro ──
{
  const e = dos();
  const w = run(e, { type: 'ponerVentanaLibre', x: 2, z: 0.05 });
  t('3) ventana blanca por defecto: 1,2 × 0,9, antepecho 0,9 (valores de la web)', V(w).tipo === 'ventana' && V(w).estiloVentana === 'blanca'
    && near(V(w).ancho, VENTANA.anchoDef) && near(V(w).alto!, 0.9) && near(V(w).alto_antepecho!, 0.9));
  const b = run(e, { type: 'ponerVentanaLibre', x: 2, z: 0.05, estilo: 'balcon' });
  t('3) balcón: 2,4 × 2,2 y desde el piso', near(V(b).ancho, 2.4) && near(V(b).alto!, 2.2) && V(b).alto_antepecho === 0);
  const id = String(V(w).id);
  const set = (x: EditorPlanta, campo: 'alto' | 'antepecho' | 'ancho' | 'estiloVentana', valor: number | string) => run(x, { type: 'actualizarVano', id, campo, valor });
  t('3) ancho: hasta todo el muro y no más', near(V(set(w, 'ancho', 99)).ancho, 4));
  t('3) alto: mínimo 0,3', near(V(set(w, 'alto', 0.1)).alto!, 0.3));
  const alta = set(w, 'alto', 2.4);
  t('3) alto: nunca sobresale del muro (2,6 − 0,15 − 0,25 = 2,2)', near(V(alta).alto!, 2.2) && near(V(alta).alto_antepecho!, 0.25));
  t('3) antepecho: mínimo 0,25', near(V(set(w, 'antepecho', 0)).alto_antepecho!, 0.25));
  t('3) antepecho: deja 0,15 m bajo el techo (2,6 − 0,15 − 0,9 = 1,55)', near(V(set(w, 'antepecho', 9)).alto_antepecho!, 1.55));
  const negra = set(w, 'estiloVentana', 'negra');
  t('3) estilo negra se guarda y no cambia las medidas', V(negra).estiloVentana === 'negra' && near(V(negra).alto_antepecho!, 0.9));
  const balcon = set(w, 'estiloVentana', 'balcon');
  t('3) pasar a balcón la baja al piso', V(balcon).alto_antepecho === 0);
  t('3) en balcón el antepecho no se puede subir', V(set(balcon, 'antepecho', 1)).alto_antepecho === 0);
  t('3) dejar de ser balcón vuelve al antepecho inicial', near(V(set(balcon, 'estiloVentana', 'blanca')).alto_antepecho!, 0.9));
  t('3) un estilo inexistente se ignora', V(set(w, 'estiloVentana', 'dorada')).estiloVentana === 'blanca');
  t('3) a una puerta no se le cambia el antepecho', (() => { const d = run(e, { type: 'ponerPuertaLibre', x: 2, z: 0.05 });
    return run(d, { type: 'actualizarVano', id: String(V(d).id), campo: 'antepecho', valor: 1 }).planta.vanos[0].alto_antepecho === undefined; })());
  t('3) no se encima con otra abertura', run(w, { type: 'ponerVentanaLibre', x: 2.3, z: 0.05 }).planta.vanos.length === 1);
  t('3) muro corto: la ventana se ajusta al muro', (() => {
    const x = run(editorVacio(), { type: 'agregarModulo', tipo: 'bano', x: 0, z: 0 }, { type: 'fijarDimension', id: 'm1', campo: 'ancho', valor: 1 },
      { type: 'ponerVentanaLibre', x: 0.5, z: 0.02 });
    return x.planta.vanos.length === 1 && V(x).ancho <= 1 - 0.2 + 1e-9 && V(x).centro - V(x).ancho / 2 >= 0 && V(x).centro + V(x).ancho / 2 <= 1;
  })());
  // 3D: el muro queda con antepecho abajo y dintel arriba (planGeometry, sin cambios)
  const maq = generarMaqueta(planoDe(w.planta));
  const bajo = maq.cajas.find(c => c.id.endsWith('-bajo') && c.id.includes('-norte-')), alto = maq.cajas.find(c => c.id.endsWith('-alto') && c.id.includes('-norte-'));
  t('3) 3D: muro bajo la ventana de 0,9 m (antepecho)', !!bajo && near(bajo.tamano[1], 0.9));
  t('3) 3D: muro sobre la ventana hasta el techo (2,6 − 0,9 − 0,9 = 0,8)', !!alto && near(alto.tamano[1], 0.8, 1e-6));
  t('3) 3D: la ventana no lleva marco (planGeometry solo los hace en puerta y vano)', !maq.marcos.some(m => m.id.startsWith(`marco-${id}`)));
  const mb = generarMaqueta(planoDe(b.planta));
  t('3) 3D: el balcón no deja muro debajo', !mb.cajas.some(c => c.id.endsWith('-bajo')));
  t('3) se puede deshacer', run(w, { type: 'deshacer' }).planta.vanos.length === 0);
}

// ── 4. En la pantalla: "+" y "−", y colocar puerta o ventana tocando un muro (gestos simulados) ──
{
  const VI: Vista = { escala: 40, ox: 20, oy: 20 };
  const tocar = (e: EditorPlanta, px: number, py: number, colocar: any = null, pasos: [number, number][] = []) => {
    const c = { vista: VI, planta: e.planta, nivel: e.nivelActivo, seleccion: e.seleccion, colocar };
    const r = iniciar(c, px, py); let x = run(e, ...r.acciones); let g = r.gesto;
    for (const [dx, dy] of pasos) { const m = mover(g, dx, dy); g = m.gesto; x = run(x, ...m.acciones); }
    return run(x, ...terminar(g, { ...c, planta: x.planta, seleccion: x.seleccion }));
  };
  const e = dos();
  const b = botonesMas(e.planta, 0)[0];
  const mas = aPantalla(VI, b.x, b.z), menos = posicionMenos(mas, b.contacto.lado);
  t('4) el "−" queda fuera del área táctil del "+" (no se confunden)', SEPARACION_MENOS - RADIO_MENOS >= RADIO_MAS);
  t('4) el "+" sigue donde estaba (centro del contacto)', queToca(VI, e.planta, 0, null, mas.px, mas.py).tipo === 'mas');
  t('4) junto a él, a lo largo del muro, está el "−"', queToca(VI, e.planta, 0, null, menos.px, menos.py).tipo === 'menos');
  const cerrado = tocar(e, menos.px, menos.py);
  t('4) tocar "−" cierra el muro', cerrado.planta.murosCerrados.length === 1 && botonesMas(cerrado.planta, 0)[0].cerrado);
  t('4) el "+" sigue disponible en un muro cerrado (para abrirlo con un paso)', botonesMas(cerrado.planta, 0).length === 1);
  const reabierto = tocar(cerrado, menos.px, menos.py);
  t('4) tocar otra vez el "×" lo vuelve a automático', reabierto.planta.murosCerrados.length === 0);
  t('4) arrastrar desde el "−" solo mueve la vista', tocar(e, menos.px, menos.py, null, [[40, 0]]).planta.murosCerrados.length === 0);
  t('4) en "Construcción" están Puerta y Ventana, en el grupo Aberturas', ABERTURAS.map(a => a.vano).join() === 'puerta,ventana' && ABERTURAS.every(a => a.grupo === 'Aberturas'));
  const borde = aPantalla(VI, 2, 0);   // muro norte de la sala
  const conPuerta = tocar(e, borde.px, borde.py + 6, ABERTURAS[0]);
  t('4) tocar cerca de un muro con "Puerta" la pone ahí, hacia afuera', conPuerta.planta.vanos.length === 1 && V(conPuerta).tipo === 'puerta' && V(conPuerta).lado === 'norte');
  const conVentana = tocar(e, borde.px, borde.py + 6, ABERTURAS[1]);
  t('4) igual con "Ventana"', V(conVentana).tipo === 'ventana' && V(conVentana).estiloVentana === 'blanca');
  const centro = aPantalla(VI, 2, 2);
  const lejos = tocar(e, centro.px, centro.py, ABERTURAS[1]);
  t('4) tocar en medio del cuarto no pone nada y el reductor lo explica', lejos.planta.vanos.length === 0 && lejos.mensaje === 'Toca justo sobre el borde de un cuarto');
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
