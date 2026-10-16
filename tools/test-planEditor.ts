/**
 * Pruebas del editor de planta (lógica pura). Cada bloque reproduce una regla de visor3d.js
 * o una prueba de aceptación del encargo. Ejecutar: npx tsx tools/test-planEditor.ts
 */
import {
  editorVacio, reducirEditor, contactosPlanta, paredesCompartidas, planoDe, claveMuro,
  EditorPlanta, AccionEditor, HISTORIAL_MAX, TIPOS_MODULO,
} from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import { Plano } from '../components/plan/planModel';
declare const process: any;

let ok = 0, fail = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.error('✗', n); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const mod = (e: EditorPlanta, id: string) => e.planta.modulos.find(m => m.id === id)!;
/** Proyecto con dos cuartos 4×4 pegados por el lado este de 'm1' (x = 4). */
const dosCuartos = () => run(editorVacio(),
  { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 },
  { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 });

// ═════════ A1. Proyecto vacío ═════════
{
  const e = editorVacio();
  t('A1) empieza sin espacios, sin vanos y sin historial', e.planta.modulos.length === 0 && e.planta.vanos.length === 0 && e.deshacer.length === 0);
  t('A1) convertir un proyecto vacío avisa y no hace nada', run(e, { type: 'convertir' }).mensaje === 'Agrega al menos un espacio');
}

// ═════════ A2. Crear espacios de distintos tipos (agregarModulo, visor3d.js:6859) ═════════
{
  const e = run(editorVacio(),
    { type: 'agregarModulo', tipo: 'sala' }, { type: 'agregarModulo', tipo: 'cocina' }, { type: 'agregarModulo', tipo: 'pasillo' },
    { type: 'agregarModulo', tipo: 'bano' }, { type: 'agregarModulo', tipo: 'columna' }, { type: 'agregarModulo', tipo: 'viga' });
  t('A2) se crean 6 espacios de 6 tipos', e.planta.modulos.length === 6 && new Set(e.planta.modulos.map(m => m.tipo)).size === 6);
  t('A2) cuartos de 4 × 4 m y alto 2.6 (por defecto de la web)', mod(e, 'm1').ancho === 4 && mod(e, 'm1').largo === 4 && mod(e, 'm1').alto === 2.6);
  t('A2) pasillo 1.5 × 6, columna 0.3 × 0.3', mod(e, 'm3').ancho === 1.5 && mod(e, 'm3').largo === 6 && mod(e, 'm5').ancho === 0.3);
  t('A2) columna cuadrada; viga con peralte 0.40 y altura base 2.20', mod(e, 'm5').forma === 'cuadrada' && mod(e, 'm6').peralte === 0.4 && mod(e, 'm6').altura_base === 2.2);
  t('A2) nombre con emoji, como la web', mod(e, 'm1').nombre === '🛋️ Sala' && mod(e, 'm4').nombre === '🚿 Bano');
  t('A2) sin punto: misma colocación que la web (x = 2.5 + (n%3)·4.25, z = 2 + ⌊n/3⌋·4.25)',
    near(mod(e, 'm1').x, 2.5) && near(mod(e, 'm2').x, 6.75) && near(mod(e, 'm4').x, 2.5) && near(mod(e, 'm4').z, 6.25));
  const enPunto = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 1.37, z: 2.81 });
  t('A2) con punto (D2): el punto tocado se ajusta a la cuadrícula de 0.5', mod(enPunto, 'm1').x === 1.5 && mod(enPunto, 'm1').z === 3);
  t('A2) el espacio nuevo queda seleccionado', enPunto.seleccion?.tipo === 'modulo' && enPunto.seleccion.id === 'm1');
  t('A2) un tipo desconocido no crea nada y avisa', run(editorVacio(), { type: 'agregarModulo', tipo: 'comedor' }).planta.modulos.length === 0);
  t('A2) están todos los tipos de la web', ['sala', 'cocina', 'habitacion', 'bano', 'pasillo', 'zona', 'columna', 'viga', 'exterior'].every(x => TIPOS_MODULO.includes(x)));
}

// ═════════ A3. Mover y redimensionar (visor3d.js:7748-7766) ═════════
{
  let e = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  e = run(e, { type: 'moverModulo', id: 'm1', x: 1.26, z: 0.74 });
  t('A3) mover ajusta la esquina a la cuadrícula de 0.5', mod(e, 'm1').x === 1.5 && mod(e, 'm1').z === 0.5);
  e = run(e, { type: 'redimensionar', id: 'm1', esquina: 'se', x: 1.5 + 3.3, z: 0.5 + 5.1 });
  t('A3) esquina SE = regla web: 3.3 → 3.5 y 5.1 → 5.0', mod(e, 'm1').ancho === 3.5 && mod(e, 'm1').largo === 5);
  t('A3) esquina SE no mueve la esquina mínima', mod(e, 'm1').x === 1.5 && mod(e, 'm1').z === 0.5);
  e = run(e, { type: 'redimensionar', id: 'm1', esquina: 'se', x: 1.6, z: 0.4 });
  t('A3) mínimo de 1 m por lado (Math.max(1, …))', mod(e, 'm1').ancho === 1 && mod(e, 'm1').largo === 1);
  // D1: las otras esquinas dejan fija la opuesta
  let f = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 2, z: 2 });   // ocupa x 2–6, z 2–6
  f = run(f, { type: 'redimensionar', id: 'm1', esquina: 'no', x: 0.6, z: 1.1 });
  t('A3) esquina NO: deja fija la esquina SE (6, 6)', near(mod(f, 'm1').x + mod(f, 'm1').ancho, 6) && near(mod(f, 'm1').z + mod(f, 'm1').largo, 6));
  t('A3) esquina NO: medidas ajustadas a 0.5 (5.4 → 5.5 y 4.9 → 5.0)', mod(f, 'm1').ancho === 5.5 && mod(f, 'm1').largo === 5);
  const g = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 2, z: 2 }, { type: 'redimensionar', id: 'm1', esquina: 'ne', x: 7.1, z: 3.4 });
  t('A3) esquina NE: x crece hacia la derecha, z mueve el borde norte', mod(g, 'm1').ancho === 5 && mod(g, 'm1').x === 2 && near(mod(g, 'm1').z + mod(g, 'm1').largo, 6) && mod(g, 'm1').largo === 2.5);
  const h = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 2, z: 2 }, { type: 'redimensionar', id: 'm1', esquina: 'so', x: 5.8, z: 2 });
  t('A3) esquina SO llevada más allá del lado opuesto: mínimo 1 m sin invertirse', mod(h, 'm1').ancho === 1 && near(mod(h, 'm1').x, 5) && mod(h, 'm1').largo === 1);
  const r = run(editorVacio(), { type: 'agregarModulo', tipo: 'pasillo', x: 0, z: 0 }, { type: 'rotarModulo', id: 'm1' });
  t('A3) rotar intercambia ancho y largo (1.5 × 6 → 6 × 1.5)', mod(r, 'm1').ancho === 6 && mod(r, 'm1').largo === 1.5);
  const n = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'fijarDimension', id: 'm1', campo: 'ancho', valor: 3.25 });
  t('A3) escribir el ancho a mano: sin cuadrícula (3.25 se respeta, como la web)', mod(n, 'm1').ancho === 3.25);
  t('A3) un valor no positivo vuelve al defecto (D3)', mod(run(n, { type: 'fijarDimension', id: 'm1', campo: 'largo', valor: -2 }), 'm1').largo === 4);
}

// ═════════ A4. Conectar dos espacios → arco correcto (contactosPlanta y generarDesdePlanta) ═════════
{
  const e = dosCuartos();
  const cs = contactosPlanta(e.planta);
  t('A4) dos cuartos pegados → un contacto, lado este, tramo 0–4', cs.length === 1 && cs[0].lado === 'este' && cs[0].ini === 0 && cs[0].fin === 4 && !cs[0].exterior);
  t('A4) tolerancia de 15 cm: a 0.14 m sigue habiendo contacto, a 0.16 ya no',
    contactosPlanta(run(e, { type: 'fijarDimension', id: 'm1', campo: 'ancho', valor: 3.86 }).planta).length === 1 &&
    contactosPlanta(run(e, { type: 'fijarDimension', id: 'm1', campo: 'ancho', valor: 3.84 }).planta).length === 0);
  const c = run(e, { type: 'convertir' });
  t('A4) convertir crea UN arco automático', c.planta.vanos.length === 1 && c.planta.vanos[0].tipo === 'arco');
  const arco = c.planta.vanos[0];
  t('A4) arco de 90 cm, centrado en el tramo (z = 2), con su tramo como límite', arco.ancho === 0.9 && arco.centro === 2 && arco.limIni === 0 && arco.limFin === 4);
  const m = generarMaqueta(planoDe(c.planta));
  t('A4) en 3D el arco va de piso a techo: sin dintel ni marco', m.errores.length === 0 && !m.cajas.some(x => x.clase === 'dintel') && m.marcos.length === 0);
  t('A4) y la pared compartida queda con un hueco de 0.9 (dos tramos que suman 3.1)',
    near(m.cajas.filter(x => x.clase === 'pared' && near(x.centro[0], 0) && x.tamano[0] < 0.2).reduce((q, w) => q + w.tamano[2], 0), 3.1, 1e-6));
  t('A4) convertir dos veces no duplica el arco', run(c, { type: 'convertir' }).planta.vanos.length === 1);
  const corto = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'bano', x: 4, z: 3 },
    { type: 'convertir' });
  t('A4) contacto de 1 m → arco de 1 − 0.2 = 0.8 m', near(corto.planta.vanos[0].ancho, 0.8));
  const exterior = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'exterior', x: 4, z: 0 }, { type: 'convertir' });
  t('A4) un cuarto junto a un exterior NO recibe arco automático (la web solo lo hace entre cuartos)', exterior.planta.vanos.length === 0);
  t('A4) pero sí aparece como contacto exterior, para poner una puerta', contactosPlanta(exterior.planta).some(k => k.exterior));
  const columna = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'columna', x: 4, z: 1 }, { type: 'convertir' });
  t('A4) una columna pegada no abre ningún hueco', columna.planta.vanos.length === 0 && contactosPlanta(columna.planta).length === 0);
}

// ═════════ A5. Añadir, mover y eliminar vanos ═════════
{
  const e = dosCuartos();
  const c = contactosPlanta(e.planta)[0];
  let v = run(e, { type: 'crearVanoEnContacto', contacto: c });
  t('A5) ＋ entre cuartos crea un ARCO de 0.9', v.planta.vanos.length === 1 && v.planta.vanos[0].tipo === 'arco' && v.planta.vanos[0].ancho === 0.9);
  t('A5) el vano nuevo queda seleccionado', v.seleccion?.tipo === 'vano');
  const ext = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'exterior', x: 4, z: 0 });
  t('A5) ＋ hacia un exterior crea una PUERTA', run(ext, { type: 'crearVanoEnContacto', contacto: contactosPlanta(ext.planta)[0] }).planta.vanos[0].tipo === 'puerta');
  v = run(v, { type: 'moverVano', id: 'v3', u: 3.9 });
  t('A5) mover un vano lo desliza sin salirse del tramo (centro máx 4 − 0.45)', near(v.planta.vanos[0].centro, 3.55));
  v = run(v, { type: 'moverVano', id: 'v3', u: 1.234 });
  t('A5) dentro del tramo se mueve libremente, sin cuadrícula', near(v.planta.vanos[0].centro, 1.234));
  // propiedades (actualizarVano, visor3d.js:7213)
  let p = run(v, { type: 'actualizarVano', id: 'v3', campo: 'tipo', valor: 'puerta' });
  const pv = p.planta.vanos[0];
  t('A5) pasar a puerta pone bisagra izq, sentido dentro, 75° y abierta', pv.tipo === 'puerta' && pv.bisagra === 'izq' && pv.sentido === 'dentro' && pv.anguloApertura === 75 && pv.abierta === true);
  p = run(p, { type: 'actualizarVano', id: 'v3', campo: 'apertura', valor: 120 });
  t('A5) el ángulo se limita a 90°', p.planta.vanos[0].anguloApertura === 90);
  p = run(p, { type: 'actualizarVano', id: 'v3', campo: 'apertura', valor: 0 });
  t('A5) ángulo 0 → cerrada', p.planta.vanos[0].abierta === false);
  t('A5) el alto se limita entre 1.6 y 2.5', run(p, { type: 'actualizarVano', id: 'v3', campo: 'alto', valor: 3 }).planta.vanos[0].alto === 2.5 &&
    run(p, { type: 'actualizarVano', id: 'v3', campo: 'alto', valor: 1 }).planta.vanos[0].alto === 1.6);
  t('A5) el ancho se limita entre 0.4 y el tramo, y recoloca el centro',
    run(p, { type: 'actualizarVano', id: 'v3', campo: 'ancho', valor: 0.1 }).planta.vanos[0].ancho === 0.4 &&
    run(p, { type: 'actualizarVano', id: 'v3', campo: 'ancho', valor: 9 }).planta.vanos[0].ancho === 4);
  t('A5) estilo doble ensancha a 1.2 m si cabe', run(p, { type: 'actualizarVano', id: 'v3', campo: 'estilo', valor: 'doble' }).planta.vanos[0].ancho === 1.2);
  t('A5) bisagra y sentido se cambian', run(p, { type: 'actualizarVano', id: 'v3', campo: 'bisagra', valor: 'der' }, { type: 'actualizarVano', id: 'v3', campo: 'sentido', valor: 'fuera' }).planta.vanos[0].sentido === 'fuera');
  // duplicar y borrar (visor3d.js:7250-7272)
  const d = run(v, { type: 'duplicarVano', id: 'v3' });
  t('A5) duplicar crea un segundo vano en la misma pared, 0.3 m más allá', d.planta.vanos.length === 2 && near(d.planta.vanos[1].centro, 1.234 + 0.9 + 0.3));
  const b1 = run(d, { type: 'borrarVano', id: 'v3' });
  t('A5) borrar uno de dos: la pared NO queda cerrada', b1.planta.murosCerrados.length === 0);
  const b2 = run(b1, { type: 'borrarVano', id: 'v4' });
  t('A5) borrar el último: la pared queda cerrada', b2.planta.murosCerrados.length === 1 && b2.planta.murosCerrados[0] === claveMuro(c));
  t('A5) y al convertir NO se le vuelve a abrir un arco solo', run(b2, { type: 'convertir' }).planta.vanos.length === 0);
  t('A5) ＋ de nuevo la reabre', run(b2, { type: 'crearVanoEnContacto', contacto: c }).planta.murosCerrados.length === 0);
  t('A5) un contacto que ya no existe no crea vano', run(e, { type: 'moverModulo', id: 'm2', x: 8, z: 0 }, { type: 'crearVanoEnContacto', contacto: c }).planta.vanos.length === 0);
}

// ── Puerta libre (ponerPuertaLibre, visor3d.js:7150) ──
{
  const e = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  const p = run(e, { type: 'ponerPuertaLibre', x: 1.5, z: 0.1 });
  const v = p.planta.vanos[0];
  t('L) tocar cerca del muro norte pone una puerta libre ahí', v && v.lado === 'norte' && v.tipo === 'puerta' && v.libre === true && v.modulo_b === null);
  t('L) su centro sigue el dedo y su tramo es el muro entero', near(v.centro, 1.5) && v.limIni === 0 && v.limFin === 4);
  t('L) cerca de una esquina, el centro se separa 5 cm del borde', near(run(e, { type: 'ponerPuertaLibre', x: 0.05, z: 0.05 }).planta.vanos[0].centro, 0.5));
  t('L) lejos de los muros no pone nada y avisa', run(e, { type: 'ponerPuertaLibre', x: 2, z: 2 }).planta.vanos.length === 0);
  const dos = dosCuartos();
  const entre = run(dos, { type: 'ponerPuertaLibre', x: 4, z: 2 });
  t('L) sobre un muro compartido queda ligada al vecino y no es libre', entre.planta.vanos[0].modulo_b === 'm2' && entre.planta.vanos[0].libre === false);
  t('L) una puerta libre sobrevive al convertir', run(p, { type: 'convertir' }).planta.vanos.length === 1);
  t('L) …y desaparece si se elimina su cuarto', run(p, { type: 'eliminarModulo', id: 'm1' }, { type: 'agregarModulo', tipo: 'sala', x: 9, z: 9 }, { type: 'convertir' }).planta.vanos.length === 0);
}

// ── Limpieza de vanos al separar espacios (generarDesdePlanta) ──
{
  const e = run(dosCuartos(), { type: 'convertir' });
  const separados = run(e, { type: 'moverModulo', id: 'm2', x: 6, z: 0 });
  t('X) separar los cuartos no borra el vano al momento (como la web)', separados.planta.vanos.length === 1);
  t('X) pero al convertir se descarta porque ya no se tocan', run(separados, { type: 'convertir' }).planta.vanos.length === 0);
  t('X) eliminar un espacio deja su vano hasta convertir', run(e, { type: 'eliminarModulo', id: 'm2' }).planta.vanos.length === 1 &&
    run(e, { type: 'eliminarModulo', id: 'm2' }, { type: 'convertir' }).planta.vanos.length === 0);
  t('X) eliminar quita la selección', run(e, { type: 'seleccionar', seleccion: { tipo: 'modulo', id: 'm2' } }, { type: 'eliminarModulo', id: 'm2' }).seleccion === null);
}

// ═════════ A6. Deshacer y rehacer (visor3d.js:6996-7057) ═════════
{
  let e = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 });
  t('A6) dos acciones = dos pasos', e.deshacer.length === 2);
  // un arrastre completo con muchas posiciones intermedias = UN paso
  e = run(e, { type: 'iniciarGesto' },
    ...[0.2, 0.4, 0.7, 1.1, 1.6, 2.0].map(d => ({ type: 'moverModulo', id: 'm2', x: 4 + d, z: d } as AccionEditor)),
    { type: 'terminarGesto' });
  t('A6) un arrastre con 6 posiciones intermedias es UN solo paso', e.deshacer.length === 3 && mod(e, 'm2').x === 6);
  e = run(e, { type: 'deshacer' });
  t('A6) deshacer devuelve el espacio a donde estaba antes del arrastre', mod(e, 'm2').x === 4 && mod(e, 'm2').z === 0);
  e = run(e, { type: 'rehacer' });
  t('A6) rehacer lo vuelve a llevar', mod(e, 'm2').x === 6);
  e = run(e, { type: 'deshacer' }, { type: 'agregarModulo', tipo: 'bano', x: 0, z: 4 });
  t('A6) una acción nueva tras deshacer borra la pila de rehacer', e.rehacer.length === 0);
  t('A6) mover a la misma casilla no crea un paso vacío', run(e, { type: 'moverModulo', id: 'm1', x: 0.1, z: 0.1 }).deshacer.length === e.deshacer.length);
  t('A6) seleccionar no crea pasos', run(e, { type: 'seleccionar', seleccion: { tipo: 'modulo', id: 'm1' } }).deshacer.length === e.deshacer.length);
  t('A6) sin pasos: avisa "Nada que deshacer"', run(editorVacio(), { type: 'deshacer' }).mensaje === 'Nada que deshacer');
  // los muros cerrados también se deshacen (están en la foto, como en la web)
  const c = run(dosCuartos(), { type: 'convertir' });
  const cerrado = run(c, { type: 'borrarVano', id: c.planta.vanos[0].id! });
  t('A6) deshacer el borrado recupera el vano y reabre el muro', run(cerrado, { type: 'deshacer' }).planta.vanos.length === 1 && run(cerrado, { type: 'deshacer' }).planta.murosCerrados.length === 0);
  // máximo 60 pasos
  let largo = editorVacio();
  for (let i = 0; i < 75; i++) largo = run(largo, { type: 'agregarModulo', tipo: 'sala', x: i * 5, z: 0 });
  t('A6) el historial guarda como máximo 60 pasos', largo.deshacer.length === HISTORIAL_MAX);
  for (let i = 0; i < 60; i++) largo = run(largo, { type: 'deshacer' });
  t('A6) tras deshacer 60 veces quedan los 15 primeros espacios', largo.planta.modulos.length === 15);
  t('A6) deshacer durante un arrastre primero cierra el arrastre', (() => {
    const g = run(dosCuartos(), { type: 'iniciarGesto' }, { type: 'moverModulo', id: 'm2', x: 9, z: 9 }, { type: 'deshacer' });
    return g.fotoGesto === null && mod(g, 'm2').x === 4;
  })());
  t('A6) la selección se suelta si el elemento deja de existir al deshacer',
    run(run(editorVacio(), { type: 'agregarModulo', tipo: 'sala' }), { type: 'deshacer' }).seleccion === null);
}

// ═════════ A7 y A8. Diseño propio → 3D, y volver a editar el MISMO proyecto ═════════
{
  // Un diseño hecho desde cero: sala + cocina abierta + pasillo + baño + habitación
  let e = run(editorVacio(),
    { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 },
    { type: 'redimensionar', id: 'm1', esquina: 'se', x: 5, z: 4 },
    { type: 'agregarModulo', tipo: 'cocina', x: 5, z: 0 },
    { type: 'redimensionar', id: 'm2', esquina: 'se', x: 8, z: 4 },
    { type: 'agregarModulo', tipo: 'pasillo', x: 0, z: 4 },
    { type: 'rotarModulo', id: 'm3' },                                     // 6 × 1.5
    { type: 'redimensionar', id: 'm3', esquina: 'se', x: 8, z: 5.5 },      // 8 × 1.5
    { type: 'agregarModulo', tipo: 'bano', x: 5, z: 5.5 },
    { type: 'redimensionar', id: 'm4', esquina: 'se', x: 8, z: 8 },
    { type: 'agregarModulo', tipo: 'habitacion', x: 0, z: 5.5 },
    { type: 'redimensionar', id: 'm5', esquina: 'se', x: 5, z: 9 },
    { type: 'convertir' });
  const plano = planoDe(e.planta);
  const m = generarMaqueta(plano);
  t('A7) mi diseño se convierte en una maqueta válida, sin NaN', m.errores.length === 0 && m.cajas.every(c => [...c.centro, ...c.tamano].every(Number.isFinite)));
  t('A7) 5 pisos con el área exacta (20 + 12 + 12 + 7.5 + 17.5 = 69)', m.cajas.filter(c => c.clase === 'piso').length === 5 && near(m.areaM2, 69, 1e-6));
  t('A7) un arco por cada pareja de cuartos que se tocan', e.planta.vanos.length === paredesCompartidas(e.planta).length && e.planta.vanos.every(v => v.tipo === 'arco'));
  t('A7) el plano tiene la forma del serializador web (paredes compartidas con tramo)', (plano.paredes_compartidas ?? []).every(p => typeof p.ini === 'number' && typeof p.fin === 'number'));

  // A8: volver a la planta y seguir editando el mismo proyecto
  const arcosAntes = e.planta.vanos.length;
  e = run(e, { type: 'borrarVano', id: e.planta.vanos[0].id! },                // cierro un muro a propósito
             { type: 'redimensionar', id: 'm5', esquina: 'se', x: 5, z: 10 },   // agrando la habitación
             { type: 'convertir' });
  t('A8) tras editar y reconvertir, el muro cerrado sigue cerrado', e.planta.vanos.length === arcosAntes - 1);
  t('A8) y la maqueta refleja el cambio (área + 5 m²)', near(generarMaqueta(planoDe(e.planta)).areaM2, 74, 1e-6));
  t('A8) los ids de los espacios no cambian entre conversiones', ['m1', 'm2', 'm3', 'm4', 'm5'].every(id => e.planta.modulos.some(x => x.id === id)));
}

// ── Compatibilidad: abrir un plano existente (de la web o de la IA) y seguir editándolo ──
{
  const web: Plano = { alto_piso: 2.6, modulos: [
    { id: 1760000000001 as any, tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4, alto: 2.6 },
    { id: 1760000000002 as any, tipo: 'cocina', x: 4, z: 0, ancho: 3, largo: 4, alto: 2.6 }],
    vanos: [{ id: 'v_web', modulo_a: 1760000000001 as any, modulo_b: 1760000000002 as any, lado: 'este', centro: 2, ancho: 0.9, tipo: 'arco', limIni: 0, limFin: 4 }] };
  let e = run(editorVacio(), { type: 'cargarPlano', plano: web });
  t('C) cargar un plano web convierte sus ids a texto y conserva el vano', e.planta.modulos[0].id === '1760000000001' && e.planta.vanos[0].modulo_a === '1760000000001');
  t('C) cargar empieza un historial nuevo', e.deshacer.length === 0);
  e = run(e, { type: 'convertir' });
  t('C) convertir no duplica el arco que ya traía', e.planta.vanos.length === 1);
  e = run(e, { type: 'agregarModulo', tipo: 'bano', x: 7, z: 0 });
  t('C) los ids nuevos no chocan con los cargados', new Set(e.planta.modulos.map(m => m.id)).size === 3);
  const ia: Plano = { alto_piso: 2.6, modulos: [{ id: 'estancia', x: 0, z: 0, ancho: 3, largo: 3.5 }], vanos: [{ modulo_a: 'estancia', lado: 'norte', centro: 1.5, ancho: 0.9 }] };
  const ei = run(editorVacio(), { type: 'cargarPlano', plano: ia }, { type: 'moverVano', id: 'undefined', u: 2 });
  t('C) un plano de la IA (sin ids de vano) se carga sin errores', ei.planta.modulos.length === 1);
}

// ── Inmutabilidad: el reductor nunca modifica el estado anterior ──
{
  const e = run(dosCuartos(), { type: 'convertir' });
  const copia = JSON.stringify(e);
  run(e, { type: 'moverModulo', id: 'm1', x: 9, z: 9 }, { type: 'borrarVano', id: e.planta.vanos[0].id! }, { type: 'rotarModulo', id: 'm2' }, { type: 'deshacer' });
  t('I) ninguna acción modifica el editor anterior', JSON.stringify(e) === copia);
}


// ── E2: Comedor = tipo 'zona' con nombre visible, en UN solo paso de historial ──
{
  const e = run(editorVacio(), { type: 'agregarModulo', tipo: 'zona', x: 0, z: 0, nombre: '🍽️ Comedor' });
  t('E2) comedor: tipo zona (compatible con la web) y nombre visible "Comedor"', mod(e, 'm1').tipo === 'zona' && mod(e, 'm1').nombre === '🍽️ Comedor');
  t('E2) crear el comedor es UN solo paso de historial', e.deshacer.length === 1);
  t('E2) sin nombre se conserva el de la web', mod(run(editorVacio(), { type: 'agregarModulo', tipo: 'zona' }), 'm1').nombre === '📦 Zona');
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);