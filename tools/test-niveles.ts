/**
 * P1 · Niveles — acciones cambiarNivel / agregarNivel / duplicarNivel del REDUCTOR (planEditor.ts),
 * comparadas con la web (visor3d.js:6428-6466).
 * Ejecutar:  npx tsx tools/test-niveles.ts
 */
import { Plano } from '../components/plan/planModel';
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, contactosPlanta, planoDe, exportarPlano } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const delNivel = (e: EditorPlanta, n: number) => e.planta.modulos.filter(m => (m.nivel || 0) === n);

/** Planta de un piso: sala + cocina pegadas, con un arco entre ellas. */
function unPiso() {
  let e = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarModulo', tipo: 'cocina', x: 4, z: 0 });
  e = run(e, { type: 'crearVanoEnContacto', contacto: contactosPlanta(e.planta)[0] }, { type: 'seleccionar', seleccion: null });
  return e;
}

// ── 1. Cambiar de piso ──
{
  const e = unPiso();
  const r = run(e, { type: 'cambiarNivel', delta: -1 });
  t('1) en el primer piso, bajar avisa como la web', r.nivelActivo === 0 && r.mensaje === 'Ya estás en el primer piso');
  const r2 = run(e, { type: 'cambiarNivel', delta: 1 });
  t('1) sin más pisos, subir avisa', r2.nivelActivo === 0 && r2.mensaje === 'No hay más pisos: usa "Agregar piso"');
  const e3 = run(e, { type: 'agregarNivel' }, { type: 'seleccionar', seleccion: { tipo: 'modulo', id: String(e.planta.modulos[0].id) } });
  const r3 = run(e3, { type: 'cambiarNivel', delta: -1 });
  t('1) cambiar de piso funciona y quita la selección', r3.nivelActivo === 0 && r3.seleccion === null);
  t('1) cambiar de piso no deja paso de deshacer (solo cambia lo que se ve)', r3.deshacer.length === e3.deshacer.length);
}

// ── 2. Agregar piso ──
{
  const e = unPiso();
  const a = run(e, { type: 'agregarNivel' });
  t('2) agrega un piso arriba de todos y lo activa', a.planta.niveles === 2 && a.nivelActivo === 1);
  t('2) el piso nuevo está vacío', delNivel(a, 1).length === 0 && delNivel(a, 0).length === 2);
  t('2) avisa como la web', a.mensaje === 'Piso 2 creado: el de abajo se ve punteado para alinear');
  const b = run(a, { type: 'cambiarNivel', delta: -1 }, { type: 'agregarNivel' });
  t('2) desde el piso 1 de 2, se crea el piso 3 (arriba de todos, como la web)', b.planta.niveles === 3 && b.nivelActivo === 2);
  const c = run(a, { type: 'agregarModulo', tipo: 'habitacion', x: 0, z: 0 });
  t('2) un espacio colocado en el piso 2 queda en el nivel 1', c.planta.modulos.at(-1)!.nivel === 1);
  t('2) espacios superpuestos de pisos distintos no se tocan', contactosPlanta(c.planta).length === 1);
  const d = run(a, { type: 'deshacer' });
  t('2) deshacer quita el piso y vuelve al último que existe', d.planta.niveles === 1 && d.nivelActivo === 0);
  const f = run(d, { type: 'rehacer' });
  t('2) rehacer lo vuelve a crear', f.planta.niveles === 2);
  const g = run(c, { type: 'deshacer' }, { type: 'deshacer' });
  t('2) deshacer el espacio y luego el piso deja todo como antes', g.planta.niveles === 1 && g.planta.modulos.length === 2 && g.nivelActivo === 0);
}

// ── 3. Duplicar piso ──
{
  let e = unPiso();
  // un campo anidado para comprobar que la copia no comparte referencias
  e = run(e, { type: 'cargarPlano', plano: { niveles: 1, modulos: [
    ...e.planta.modulos.map(m => ({ ...m })), { id: 'esc', tipo: 'escalera', x: 0, z: 5, ancho: 1, largo: 4.5, nivel: 0, escalera: { forma: 'recta', peldanos: 16 } } as any],
    vanos: e.planta.vanos.map(v => ({ ...v })) } });
  const antesIds = new Set(e.planta.modulos.map(m => String(m.id)));
  const d = run(e, { type: 'duplicarNivel' });
  const copias = delNivel(d, 1);
  t('3) copia los 3 elementos del piso actual a un piso nuevo arriba', d.planta.niveles === 2 && d.nivelActivo === 1 && copias.length === 3);
  t('3) ids nuevos, sin repetir ninguno', copias.every(m => !antesIds.has(String(m.id))) && new Set(d.planta.modulos.map(m => String(m.id))).size === d.planta.modulos.length);
  t('3) mismas medidas y posición', copias.every((c, i) => { const o = delNivel(d, 0)[i]; return c.x === o.x && c.z === o.z && c.ancho === o.ancho && c.largo === o.largo && c.tipo === o.tipo; }));
  const original = delNivel(d, 0).find(m => m.tipo === 'escalera') as any, copia = copias.find(m => m.tipo === 'escalera') as any;
  t('3) copia profunda: el objeto anidado no se comparte', original.escalera !== copia.escalera && JSON.stringify(original.escalera) === JSON.stringify(copia.escalera));
  copia.escalera.peldanos = 99;
  t('3) cambiar la copia no toca el original', original.escalera.peldanos === 16);
  t('3) no copia los vanos (como la web)', d.planta.vanos.length === e.planta.vanos.length);
  t('3) avisa cuántos elementos copió', d.mensaje === 'Piso 2 copiado del 1: 3 elementos');
  const v = run(d, { type: 'agregarNivel' }, { type: 'duplicarNivel' });
  t('3) un piso vacío no se duplica y se avisa', v.mensaje === 'Este piso está vacío' && v.planta.niveles === 3);
  const u = run(d, { type: 'deshacer' });
  t('3) deshacer quita las copias y el piso', u.planta.niveles === 1 && u.planta.modulos.length === 3 && u.nivelActivo === 0);
  t('3) los contactos del piso copiado son del piso 2', contactosPlanta(d.planta).filter(c => c.nivel === 1).length === contactosPlanta(d.planta).filter(c => c.nivel === 0).length);
}

// ── 4. Maqueta 3D y exportación ──
{
  const d = run(unPiso(), { type: 'duplicarNivel' });
  const maq = generarMaqueta(planoDe(d.planta));
  const pisoDe = (id: string) => maq.cajas.find(c => c.moduloId === id && c.clase === 'piso')!.centro[1];
  const [a0] = delNivel(d, 0), [a1] = delNivel(d, 1);
  t('4) 3D: el piso 2 se levanta la altura de entrepiso (2,80 m)', near(pisoDe(String(a1.id)) - pisoDe(String(a0.id)), 2.8));
  const ex = exportarPlano(d.planta).plano as any;
  t('4) exportar: niveles = 2 y cada espacio con su nivel', ex.niveles === 2 && ex.modulos.filter((m: any) => m.nivel === 1).length === 2);
  const tres: Plano = { ...JSON.parse(JSON.stringify(exportarPlano(d.planta).plano)), altura_entrepiso: 3 };
  const e3 = run(editorVacio(), { type: 'cargarPlano', plano: tres }, { type: 'agregarNivel' });
  t('4) un plano con entrepiso de 3 m lo conserva al agregar pisos', (exportarPlano(e3.planta).plano as any).altura_entrepiso === 3 && e3.planta.niveles === 3);
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
