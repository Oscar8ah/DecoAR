/**
 * P1 · 1b-4 — Objetos de construcción. La etiqueta 3D de cada pieza se COMPRUEBA con el generador real
 * (planGeometry.generarMaqueta), no se supone. Ejecutar:  npx tsx tools/test-estructuras.ts
 */
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, planoDe, TIPOS_MODULO, MEDIDAS_DEFECTO } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import { Vista, aPantalla } from '../components/editor2d/vistaLienzo';
import { CONSTRUCCION, SIN_ESTIRAR, iniciar, terminar, queToca, posicionAsa, puedeEstirar, notaConstruccion } from '../components/editor2d/gestosLienzo';
import { botonesMas } from '../components/editor2d/vanosLienzo';
import { resumen } from '../components/editor2d/vistaLienzo';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const V: Vista = { escala: 40, ox: 20, oy: 20 };
/** Coloca una pieza como lo hace la pantalla: modo colocar + toque en (x, z) metros. */
function colocar(e: EditorPlanta, tipo: string, x: number, z: number): EditorPlanta {
  const pieza = CONSTRUCCION.find(c => c.tipo === tipo)!;
  const q = aPantalla(V, x, z);
  const c = { vista: V, planta: e.planta, nivel: e.nivelActivo, seleccion: e.seleccion, colocar: pieza };
  const p = iniciar(c, q.px, q.py);
  return run(run(e, ...p.acciones), ...terminar(p.gesto, c));
}

// ── 1. Los tipos y grupos de la web ──
t('1) las 8 piezas de la web, con el tipo que acepta el reductor',
  CONSTRUCCION.map(c => c.tipo).join() === 'pared,vidrio,columna,viga,baranda,hueco,escalera,exterior' && CONSTRUCCION.every(c => TIPOS_MODULO.includes(c.tipo)));
t('1) grupos: Muros, Estructura, Exteriores', [...new Set(CONSTRUCCION.map(c => c.grupo))].join() === 'Muros,Estructura,Exteriores');

// ── 2. El estado 3D anunciado es el que produce el generador ──
for (const c of CONSTRUCCION) {
  const e = colocar(run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }), c.tipo, 2, 2);
  const id = String(e.planta.modulos.at(-1)!.id);
  const m = generarMaqueta(planoDe(e.planta));
  const cajas = m.cajas.filter(k => k.moduloId === id).length;
  const avisa = (m.avisos || []).some((a: string) => a.includes(`1 ${c.tipo}`));
  if (c.estado3D === 'si') t(`2) ${c.tipo}: se anuncia "se ve en 3D" y el generador lo dibuja`, cajas > 0 && !avisa);
  if (c.estado3D === 'no') t(`2) ${c.tipo}: se anuncia "aún no en 3D" y el generador avisa que no lo representa`, cajas === 0 && avisa);
  if (c.estado3D === 'parcial') t(`2) ${c.tipo}: en el primer piso no genera nada`, cajas === 0 && !avisa);
}
{
  // Hueco en un piso alto: recorta el piso del cuarto de ese piso (por eso es "parcial")
  const base = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'agregarNivel' },
    { type: 'agregarModulo', tipo: 'habitacion', x: 0, z: 0 });
  const hab = String(base.planta.modulos.at(-1)!.id);
  const pisos = (e: EditorPlanta) => generarMaqueta(planoDe(e.planta)).cajas.filter(k => k.moduloId === hab && k.clase === 'piso');
  const conHueco = colocar(base, 'hueco', 2, 2);
  const area = (e: EditorPlanta) => pisos(e).reduce((s, k) => s + k.tamano[0] * k.tamano[2], 0);
  t('2) hueco en el piso 2: el piso de ese cuarto pierde exactamente el área del hueco (1,2 × 2,6)',
    near(area(base) - area(conHueco), 1.2 * 2.6, 1e-6));
}

// ── 3. Colocar con un toque, en el piso visible ──
for (const c of CONSTRUCCION) {
  const e = colocar(run(editorVacio(), { type: 'agregarNivel' }), c.tipo, 6, 6);
  const m = e.planta.modulos.at(-1)!;
  const med = MEDIDAS_DEFECTO[c.tipo];
  t(`3) ${c.tipo}: medidas de la web (${med.ancho} × ${med.largo}) y en el piso activo`, m.tipo === c.tipo && m.ancho === med.ancho && m.largo === med.largo && m.nivel === 1);
}
t('3) la viga trae base 2,20 y 0,40 de alto; la columna, forma cuadrada (valores de la web)', (() => {
  const v = colocar(editorVacio(), 'viga', 3, 3).planta.modulos[0], c = colocar(editorVacio(), 'columna', 3, 3).planta.modulos[0];
  return v.altura_base === 2.2 && v.peralte === 0.4 && c.forma === 'cuadrada';
})());
t('3) piso exterior: nombre "Piso exterior" y no suma área de piso', (() => {
  const e = colocar(run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }), 'exterior', 10, 10);
  return e.planta.modulos[1].nombre === '🟫 Piso exterior' && resumen(e.planta, 0).area === 16 && resumen(e.planta, 0).espacios === 1;
})());

// ── 4. Estirar y girar ──
for (const tipo of ['pared', 'vidrio', 'columna', 'viga', 'baranda']) {
  const e = colocar(editorVacio(), tipo, 5, 5);
  const m = e.planta.modulos[0];
  const a = posicionAsa(V, m);
  t(`4) ${tipo}: sin círculo de estirar (no salta a 1 × 1 m)`, !puedeEstirar(m) && queToca(V, e.planta, 0, e.seleccion, a.px, a.py).tipo !== 'asa');
}
for (const tipo of ['escalera', 'hueco', 'exterior']) {
  const e = colocar(editorVacio(), tipo, 5, 5);
  const a = posicionAsa(V, e.planta.modulos[0]);
  t(`4) ${tipo}: sí se puede estirar (mide más de 1 m)`, puedeEstirar(e.planta.modulos[0]) && queToca(V, e.planta, 0, e.seleccion, a.px, a.py).tipo === 'asa');
}
{
  const e = colocar(editorVacio(), 'pared', 5, 5);
  const g = run(e, { type: 'rotarModulo', id: String(e.planta.modulos[0].id) });
  t('4) "Girar 90°" pone la pared horizontal (0,15 × 2 → 2 × 0,15)', g.planta.modulos[0].ancho === 2 && g.planta.modulos[0].largo === 0.15);
  t('4) girar es un paso de deshacer', run(g, { type: 'deshacer' }).planta.modulos[0].ancho === 0.15);
  const col = colocar(editorVacio(), 'columna', 5, 5);
  const q = aPantalla(V, 5, 5);
  t('4) una columna de 0,30 m se puede tocar (objetivo de 44 pt)', queToca(V, col.planta, 0, null, q.px + 18, q.py).tipo === 'modulo');
}

// ── 5. Contactos: la estructura no abre vanos; el exterior sí, con "+" verde ──
{
  const sala = run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 });
  const conPared = run(sala, { type: 'agregarModulo', tipo: 'pared', x: 4, z: 0 });
  t('5) una pared pegada a la sala no ofrece "+"', botonesMas(conPared.planta, 0).length === 0);
  const conExt = run(sala, { type: 'agregarModulo', tipo: 'exterior', x: 4, z: 0 });
  const mas = botonesMas(conExt.planta, 0);
  t('5) un piso exterior pegado a la sala ofrece un "+" verde (puerta hacia afuera)', mas.length === 1 && mas[0].exterior);
}

// ── 6. Notas ──
t('6) cada pieza tiene su nota 3D y los cuartos no', CONSTRUCCION.every(c => notaConstruccion(c.tipo) === c.nota3D) && notaConstruccion('sala') === null);
t('6) las piezas delgadas son justo las que miden menos de 1 m', [...SIN_ESTIRAR].every(tp => Math.min(MEDIDAS_DEFECTO[tp].ancho, MEDIDAS_DEFECTO[tp].largo) < 1)
  && CONSTRUCCION.filter(c => !SIN_ESTIRAR.has(c.tipo)).every(c => Math.min(MEDIDAS_DEFECTO[c.tipo].ancho, MEDIDAS_DEFECTO[c.tipo].largo) >= 1));

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
