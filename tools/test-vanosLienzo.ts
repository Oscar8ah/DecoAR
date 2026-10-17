/**
 * P1 · 1b-3 — Contactos y vanos en el lienzo, con gestos simulados sobre el REDUCTOR REAL.
 * Ejecutar:  npx tsx tools/test-vanosLienzo.ts
 */
import { Plano, planoApartamentoSintetico } from '../components/plan/planModel';
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, claveMuro } from '../components/plan/planEditor';
import { Vista, aPantalla, tramoVano, modulosDelNivel } from '../components/editor2d/vistaLienzo';
import { iniciar, mover, terminar, queToca, vanoBajoDedo, RADIO_MAS } from '../components/editor2d/gestosLienzo';
import { botonesMas, vanosQueSeQuitarian } from '../components/editor2d/vanosLienzo';
import { colorMas, colorVano } from '../components/editor2d/paleta';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

class Banco {
  e: EditorPlanta; v: Vista = { escala: 40, ox: 20, oy: 20 };
  constructor(e: EditorPlanta) { this.e = e; }
  ctx() { return { vista: this.v, planta: this.e.planta, nivel: this.e.nivelActivo, seleccion: this.e.seleccion, colocar: null }; }
  aplicar(as: AccionEditor[]) { for (const a of as) this.e = reducirEditor(this.e, a); }
  gesto(px: number, py: number, pasos: [number, number][] = []) {
    const p = iniciar(this.ctx(), px, py); this.aplicar(p.acciones); let g = p.gesto;
    for (const [dx, dy] of pasos) { const r = mover(g, dx, dy); g = r.gesto; this.aplicar(r.acciones); if (r.vista) this.v = r.vista; }
    this.aplicar(terminar(g, this.ctx()));
  }
  pt(x: number, z: number) { return aPantalla(this.v, x, z); }
  tocarMas(i = 0) { const b = botonesMas(this.e.planta, this.e.nivelActivo)[i]; const q = this.pt(b.x, b.z); this.gesto(q.px, q.py); }
  vano(id: string) { return this.e.planta.vanos.find(x => String(x.id) === id)!; }
  centroVano(id: string) { const tr = tramoVano(this.vano(id), modulosDelNivel(this.e.planta, this.e.nivelActivo))!; return this.pt((tr.x0 + tr.x1) / 2, (tr.z0 + tr.z1) / 2); }
}
// Sala 4 × 4 en (0,0) y cocina 3 × 4 pegada al este, en (4,0): un muro compartido x = 4, de z 0 a 4.
const dos = () => {
  let e = editorVacio();
  e = reducirEditor(e, { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  e = reducirEditor(e, { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 });
  e = reducirEditor(e, { type: 'fijarDimension', id: e.planta.modulos[1].id, campo: 'ancho', valor: 3 });
  return new Banco(reducirEditor(e, { type: 'seleccionar', seleccion: null }));
};

// ── 1. El "+" aparece en el muro compartido ──
{
  const b = dos();
  const mas = botonesMas(b.e.planta, 0);
  t('1) un "+" en el único muro que se toca', mas.length === 1);
  t('1) en el centro del contacto: x = 4, z = 2', near(mas[0].x, 4) && near(mas[0].z, 2));
  t('1) entre cuartos es celeste, como la web', !mas[0].exterior && colorMas(false) === '#38BDF8');
  const q = b.pt(4, 2);
  t('1) tocar el "+" gana sobre los espacios de los lados', queToca(b.v, b.e.planta, 0, null, q.px + RADIO_MAS - 2, q.py).tipo === 'mas');
}

// ── 2. Crear un vano tocando el "+" ──
{
  const b = dos();
  b.tocarMas();
  const v = b.e.planta.vanos[0];
  t('2) tocar el "+" crea un vano', b.e.planta.vanos.length === 1);
  t('2) entre cuartos es un arco (regla del reductor y de la web)', v.tipo === 'arco');
  t('2) queda seleccionado', b.e.seleccion?.tipo === 'vano' && b.e.seleccion.id === String(v.id));
  t('2) centrado en el contacto, con el ancho por defecto', near(v.centro, 2) && near(v.ancho, 0.9));
  t('2) ese muro ya no muestra "+"', botonesMas(b.e.planta, 0).length === 0);
  t('2) crear el vano es un paso de deshacer', b.e.deshacer.length > 0);
  b.aplicar([{ type: 'deshacer' }]);
  t('2) deshacer lo quita y vuelve el "+"', b.e.planta.vanos.length === 0 && botonesMas(b.e.planta, 0).length === 1);
  const b2 = dos();
  const q = b2.pt(4, 2);
  b2.gesto(q.px, q.py, [[30, 0], [60, 20]]);
  t('2) arrastrar desde el "+" desplaza la vista y no crea nada', b2.e.planta.vanos.length === 0 && b2.v.ox !== 20);
}

// ── 3. Hacia un espacio exterior: "+" verde y puerta ──
{
  let e = editorVacio();
  e = reducirEditor(e, { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  e = reducirEditor(e, { type: 'agregarModulo', tipo: 'exterior', x: 4, z: 0 });
  const b = new Banco(reducirEditor(e, { type: 'seleccionar', seleccion: null }));
  const mas = botonesMas(b.e.planta, 0);
  t('3) hacia el exterior el "+" es verde lima', mas.length === 1 && mas[0].exterior && colorMas(true) === '#A3E635');
  b.tocarMas();
  t('3) hacia afuera crea una puerta', b.e.planta.vanos[0]?.tipo === 'puerta');
}

// ── 4. Seleccionar, cambiar tipo y prioridad sobre el espacio ──
{
  const b = dos();
  b.tocarMas();
  const id = String(b.e.planta.vanos[0].id);
  b.gesto(2, 2);                                             // fondo: deselecciona
  t('4) tocar el fondo deselecciona el vano', b.e.seleccion === null);
  const c = b.centroVano(id);
  b.gesto(c.px - 10, c.py);                                  // dentro de la sala, a 10 pt del vano
  t('4) tocar junto al vano lo selecciona a él y no a la sala', b.e.seleccion?.tipo === 'vano' && b.e.seleccion.id === id);
  const sala = b.e.planta.modulos[0];
  b.aplicar([{ type: 'seleccionar', seleccion: { tipo: 'modulo', id: String(sala.id) } }]);
  b.gesto(c.px, c.py);
  t('4) con un espacio seleccionado, tocar el vano pasa al vano', b.e.seleccion?.tipo === 'vano');
  for (const tp of ['puerta', 'vano', 'arco'] as const) {
    b.aplicar([{ type: 'actualizarVano', id, campo: 'tipo', valor: tp }]);
    t(`4) cambiar a ${tp}`, b.vano(id).tipo === tp);
  }
  t('4) al pasar por puerta recibe bisagra, sentido y ángulo (reductor)', b.vano(id).bisagra === 'izq' && b.vano(id).anguloApertura === 75);
  t('4) colores de la web: arco verde, vano celeste, puerta naranja',
    colorVano('arco') === '#22C55E' && colorVano('vano') === '#38BDF8' && colorVano('puerta') === '#F59E0B');
}

// ── 5. Mover el vano a lo largo del muro ──
{
  const b = dos();
  b.tocarMas();
  const id = String(b.e.planta.vanos[0].id);
  const c = b.centroVano(id);
  const e = b.v.escala;
  b.gesto(c.px, c.py, [[5, 0.3 * e], [10, 0.8 * e], [12, 1.0 * e]]);   // muro vertical: cuenta el eje z
  t('5) baja 1 m a lo largo del muro (el movimiento horizontal no cuenta)', near(b.vano(id).centro, 3));
  t('5) todo el arrastre es un paso de deshacer', (() => { const d = reducirEditor(b.e, { type: 'deshacer' }); return near(d.planta.vanos[0].centro, 2); })());
  const c2 = b.centroVano(id);
  b.gesto(c2.px, c2.py, [[0, 10 * e]]);
  t('5) no se sale del tramo compartido: queda a medio ancho del extremo (4 − 0,45)', near(b.vano(id).centro, 4 - 0.45));
  const c3 = b.centroVano(id);
  b.gesto(c3.px, c3.py, [[0, -10 * e]]);
  t('5) ni por el otro extremo (0 + 0,45)', near(b.vano(id).centro, 0.45));
}

// ── 6. Borrar el último vano: muro cerrado ──
{
  const b = dos();
  b.tocarMas();
  const v = b.e.planta.vanos[0];
  b.aplicar([{ type: 'borrarVano', id: String(v.id) }]);
  t('6) borrar quita el vano y la selección', b.e.planta.vanos.length === 0 && b.e.seleccion === null);
  t('6) el muro queda cerrado', b.e.planta.murosCerrados.includes(claveMuro(v)));
  t('6) y lo avisa el reductor', b.e.mensaje === 'Vano eliminado: la pared queda cerrada');
  const conv = reducirEditor(b.e, { type: 'convertir' });
  t('6) al generar el 3D, ese muro cerrado no recibe arco automático', conv.planta.vanos.length === 0);
  t('6) el "+" vuelve, como en la web, por si se quiere abrir otra vez', botonesMas(b.e.planta, 0).length === 1);
  b.tocarMas();
  t('6) volver a crear un vano abre el muro (deja de estar cerrado)', !b.e.planta.murosCerrados.includes(claveMuro(v)));
}

// ── 7. Separar espacios: el vano se marca y se quita al generar el 3D ──
{
  const b = dos();
  b.tocarMas();
  const id = String(b.e.planta.vanos[0].id);
  const cocina = String(b.e.planta.modulos[1].id);
  b.aplicar([{ type: 'moverModulo', id: cocina, x: 10, z: 0 }]);
  t('7) separar: el vano sigue en el plano mientras se edita (como la web)', b.e.planta.vanos.length === 1);
  t('7) pero se identifica como que se quitará al generar el 3D', vanosQueSeQuitarian(b.e).has(id));
  t('7) y efectivamente convertir lo quita', !reducirEditor(b.e, { type: 'convertir' }).planta.vanos.some(v => String(v.id) === id));
  b.aplicar([{ type: 'moverModulo', id: cocina, x: 4, z: 0 }]);
  t('7) al volver a juntarlos deja de estar marcado', !vanosQueSeQuitarian(b.e).has(id));
  t('7) consultar no modifica el plano', b.e.planta.vanos.length === 1);
}

// ── 8. Solo el piso visible ──
{
  const p = { niveles: 2, modulos: [
    { id: 'a', tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4, nivel: 1 },
    { id: 'b', tipo: 'cocina', x: 4, z: 0, ancho: 3, largo: 4, nivel: 1 },
    { id: 'd', tipo: 'bano', x: 7, z: 0, ancho: 2, largo: 4, nivel: 1 },      // b–d: contacto del piso 2 SIN vano
    { id: 'c', tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4, nivel: 0 }],
    vanos: [{ id: 'v1', modulo_a: 'a', modulo_b: 'b', lado: 'este', nivel: 1, centro: 2, ancho: 0.9, tipo: 'puerta' }] } as any as Plano;
  const e = reducirEditor(editorVacio(), { type: 'cargarPlano', plano: p });
  const b = new Banco(e);
  t('8) en el piso 1 (nivel 0) no hay "+" de los contactos del piso 2', botonesMas(b.e.planta, 0).length === 0);
  t('8) en el piso 2 sí: uno, en el muro cocina–baño que no tiene vano', botonesMas(b.e.planta, 1).length === 1);
  const tr = tramoVano(b.vano('v1'), modulosDelNivel(b.e.planta, 1))!;
  const q = b.pt(tr.x0, (tr.z0 + tr.z1) / 2);
  t('8) ni se puede tocar un vano del otro piso', vanoBajoDedo(b.v, b.e.planta, 0, q.px, q.py) === null);
  t('8) en su propio piso sí', vanoBajoDedo(b.v, b.e.planta, 1, q.px, q.py) === 'v1');
}

// ── 9. Vanos sin id (ejemplos propios de DecoAR): se ven pero no se pueden seleccionar ──
{
  const e = reducirEditor(editorVacio(), { type: 'cargarPlano', plano: planoApartamentoSintetico() });
  const b = new Banco(e);
  const v = b.e.planta.vanos[0];
  const tr = tramoVano(v, modulosDelNivel(b.e.planta, 0))!;
  const q = b.pt((tr.x0 + tr.x1) / 2, tr.z0);
  t('9) un vano sin id no se selecciona (el reductor los maneja por id)', vanoBajoDedo(b.v, b.e.planta, 0, q.px, q.py) === null);
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
