/**
 * P1 · 1b-1 — Gestos del lienzo, simulados con el REDUCTOR REAL de planEditor.ts (sin teléfono).
 * Ejecutar:  npx tsx tools/test-gestosLienzo.ts
 */
import { planoApartamentoSintetico, Plano } from '../components/plan/planModel';
import { EditorPlanta, editorVacio, reducirEditor, AccionEditor, contactosPlanta } from '../components/plan/planEditor';
import { Vista, aPantalla, encuadrar, modulosDelNivel } from '../components/editor2d/vistaLienzo';
import {
  ESPACIOS, Pieza, RADIO_ASA, UMBRAL_ARRASTRE, MIN_OBJETIVO, iniciar, mover, terminar, queToca, posicionAsa, mismaVista, candidatos,
} from '../components/editor2d/gestosLienzo';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-9) => Math.abs(a - b) < e;

/** Simula el lienzo: estado del editor + vista, y aplica cada gesto como lo hará la pantalla. */
class Banco {
  e: EditorPlanta; v: Vista; colocar: Pieza | null = null; enviadas: AccionEditor[] = [];
  constructor(e: EditorPlanta, v: Vista) { this.e = e; this.v = v; }
  ctx() { return { vista: this.v, planta: this.e.planta, nivel: this.e.nivelActivo, seleccion: this.e.seleccion, colocar: this.colocar }; }
  aplicar(as: AccionEditor[]) { for (const a of as) { this.enviadas.push(a); this.e = reducirEditor(this.e, a); } }
  /** Un gesto completo: dedo en (px,py), recorrido por `pasos` (desplazamientos acumulados), dedo arriba. */
  gesto(px: number, py: number, pasos: [number, number][] = [], cancelado = false) {
    let p = iniciar(this.ctx(), px, py);
    this.aplicar(p.acciones);
    let g = p.gesto;
    for (const [dx, dy] of pasos) {
      const r = mover(g, dx, dy);
      g = r.gesto; this.aplicar(r.acciones); if (r.vista) this.v = r.vista;
    }
    this.aplicar(terminar(g, this.ctx(), cancelado));
    if (!cancelado && !g.arrastrando && g.colocar) this.colocar = null;   // la pantalla sale del modo colocar
  }
  mod(id: string) { return this.e.planta.modulos.find(m => m.id === id)!; }
  centro(id: string) { const m = this.mod(id); return aPantalla(this.v, m.x + m.ancho / 2, m.z + m.largo / 2); }
}
const VISTA: Vista = { escala: 40, ox: 20, oy: 20 };   // 40 pt/m: la escala de la web
const vacio = () => new Banco(editorVacio(), VISTA);
const cargado = (p: Plano) => {
  const e = reducirEditor(editorVacio(), { type: 'cargarPlano', plano: JSON.parse(JSON.stringify(p)) });
  return new Banco(e, encuadrar(modulosDelNivel(e.planta, 0), 393, 600));
};

// ── 1. Colocar espacios tocando el lienzo ──
{
  const b = vacio();
  b.colocar = ESPACIOS[0];                                   // Sala (4 × 4 por defecto)
  b.gesto(20 + 5 * 40, 20 + 5 * 40);                         // toca el punto (5 m, 5 m)
  const m = b.e.planta.modulos[0];
  t('1) un toque coloca una sala', b.e.planta.modulos.length === 1 && m.tipo === 'sala');
  t('1) queda centrada donde se tocó: esquina en (3, 3) para una sala de 4 × 4', m.x === 3 && m.z === 3 && m.ancho === 4 && m.largo === 4);
  t('1) el espacio nuevo queda seleccionado', b.e.seleccion?.tipo === 'modulo' && b.e.seleccion.id === m.id);
  t('1) se sale del modo colocar', b.colocar === null);
  b.colocar = ESPACIOS[1];                                   // Comedor
  b.gesto(20 + 10.3 * 40, 20 + 1.1 * 40);
  const c = b.e.planta.modulos[1];
  t('1) Comedor = tipo zona con nombre Comedor (como E2 y la web)', c.tipo === 'zona' && c.nombre === '🍽️ Comedor');
  t('1) la posición se ajusta a la cuadrícula de 0,5 m (la aplica el reductor)', c.x % 0.5 === 0 && c.z % 0.5 === 0);
  for (let i = 0; i < 25; i++) { b.colocar = ESPACIOS[i % ESPACIOS.length]; b.gesto(20 + (i % 5) * 200, 20 + Math.floor(i / 5) * 200); }
  t('1) sin límite artificial: 27 espacios colocados', b.e.planta.modulos.length === 27);
  const b2 = vacio(); b2.colocar = ESPACIOS[2];
  b2.gesto(100, 100, [[30, 0], [60, 10]]);                    // en modo colocar, arrastrar desplaza la vista
  t('1) en modo colocar, arrastrar no coloca nada y sigue esperando el toque', b2.e.planta.modulos.length === 0 && b2.colocar !== null);
  b2.gesto(100, 100, [], true);
  t('1) un gesto cancelado por el sistema no coloca nada', b2.e.planta.modulos.length === 0);
}

// ── 2. Seleccionar ──
{
  const b = cargado(planoApartamentoSintetico());
  const cs = b.centro('cocina');
  b.gesto(cs.px, cs.py);
  t('2) tocar la cocina la selecciona', b.e.seleccion?.tipo === 'modulo' && b.e.seleccion.id === 'cocina');
  b.gesto(cs.px + 3, cs.py - 2, [[3, 2]]);                  // temblor de 3 pt
  t('2) el temblor del dedo no mueve nada', b.mod('cocina').x === 5 && b.mod('cocina').z === 0);
  b.gesto(2, 2);                                             // esquina del lienzo: fondo
  t('2) tocar el fondo deselecciona', b.e.seleccion === null);
  const cv = b.centro('viga-1');                             // la viga cruza la sala justo por su centro
  const cerca = { px: cv.px, py: cv.py + MIN_OBJETIVO / 2 - 1 };   // fuera del trazo de la viga, dentro de sus 44 pt
  t('2) fuera de su trazo, la viga sigue alcanzable, pero detrás del cuarto que se toca de verdad',
    candidatos(b.v, b.e.planta, 0, cerca.px, cerca.py).join() === 'sala,viga-1');
  t('2) la estructura gana sobre el cuarto de debajo', (queToca(b.v, b.e.planta, 0, null, cv.px, cv.py) as any).id === 'viga-1');
  b.gesto(cv.px, cv.py);
  t('2) tocar el centro de la sala selecciona primero la viga', (b.e.seleccion as any)?.id === 'viga-1');
  b.gesto(cv.px, cv.py);
  t('2) tocar otra vez el mismo punto pasa a la sala', (b.e.seleccion as any)?.id === 'sala');
  b.gesto(cv.px, cv.py);
  t('2) y otra vez vuelve a la viga', (b.e.seleccion as any)?.id === 'viga-1');
  b.gesto(cv.px, cv.py);                                     // sala seleccionada otra vez
  b.gesto(cv.px, cv.py, [[b.v.escala * 1, 0]]);
  t('2) con la sala seleccionada, arrastrar sobre la viga mueve la SALA', b.mod('sala').x === 1 && b.mod('viga-1').x === 0);
  b.aplicar([{ type: 'deshacer' }]);
  t('2) tocar no deja pasos de deshacer', b.e.deshacer.length === 0);
}

// ── 3. Mover un espacio: un arrastre = un solo paso de deshacer ──
{
  const b = cargado(planoApartamentoSintetico());
  const e = b.v.escala;
  const cs = b.centro('cocina');
  b.gesto(cs.px, cs.py, [[0.3 * e, 0], [0.9 * e, 0.4 * e], [1.6 * e, 1.2 * e], [2.2 * e, 1.1 * e]]);
  t('3) arrastrar 2,2 m y 1,1 m mueve a la cuadrícula más cercana (+2, +1)', b.mod('cocina').x === 7 && b.mod('cocina').z === 1);
  t('3) todo el arrastre es un solo paso de deshacer', b.e.deshacer.length === 1);
  t('3) solo se usan acciones existentes del reductor',
    b.enviadas.every(a => ['seleccionar', 'iniciarGesto', 'moverModulo', 'terminarGesto'].includes(a.type)));
  b.aplicar([{ type: 'deshacer' }]);
  t('3) deshacer lo devuelve a su sitio', b.mod('cocina').x === 5 && b.mod('cocina').z === 0);
  b.aplicar([{ type: 'rehacer' }]);
  t('3) rehacer lo vuelve a mover', b.mod('cocina').x === 7);
  const b2 = cargado(planoApartamentoSintetico());
  const c2 = b2.centro('bano');
  b2.gesto(c2.px, c2.py);                                    // primero se selecciona…
  b2.gesto(c2.px, c2.py, [[b2.v.escala * 3, 0]]);            // …y luego se arrastra
  t('3) mover un espacio separado de otro cambia los contactos (el reductor los recalcula)',
    !contactosPlanta(b2.e.planta).some(c => [c.modulo_a, c.modulo_b].includes('bano') && [c.modulo_a, c.modulo_b].includes('cuarto')));
}

// ── 4. Estirar con el asa ──
{
  const b = cargado(planoApartamentoSintetico());
  const e = b.v.escala;
  const p1 = aPantalla(b.v, 1, 1);                           // un punto de la sala lejos de la viga
  b.gesto(p1.px, p1.py);                                     // seleccionar la sala (5 × 4)
  const asa = posicionAsa(b.v, b.mod('sala'));
  t('4) el asa se agarra dentro de 22 pt', queToca(b.v, b.e.planta, 0, b.e.seleccion, asa.px + RADIO_ASA - 1, asa.py).tipo === 'asa');
  t('4) sin selección no hay asa', queToca(b.v, b.e.planta, 0, null, asa.px, asa.py).tipo !== 'asa');
  b.gesto(asa.px, asa.py, [[0.6 * e, 0], [1.1 * e, 0.4 * e], [1.4 * e, 0.6 * e]]);
  t('4) estirar 1,4 m y 0,6 m deja 6,5 × 4,5 (cuadrícula de 0,5)', b.mod('sala').ancho === 6.5 && b.mod('sala').largo === 4.5);
  t('4) la esquina opuesta no se mueve', b.mod('sala').x === 0 && b.mod('sala').z === 0);
  t('4) un estirón = un paso de deshacer', b.e.deshacer.length === 1);
  const asa2 = posicionAsa(b.v, b.mod('sala'));             // el asa ya está en la nueva esquina
  b.gesto(asa2.px, asa2.py, [[-20 * e, -20 * e]]);         // intentar dejarlo de 0 m
  t('4) nunca baja del mínimo de 1 m (regla del reductor)', b.mod('sala').ancho === 1 && b.mod('sala').largo === 1);
}

// ── 5. Desplazar la vista no toca el plano ──
{
  const b = cargado(planoApartamentoSintetico());
  const antes = JSON.stringify(b.e.planta), v0 = b.v;
  b.gesto(5, 5, [[40, 0], [80, -30]]);
  t('5) arrastrar el fondo desplaza la vista', near(b.v.ox, v0.ox + 80) && near(b.v.oy, v0.oy - 30) && b.v.escala === v0.escala);
  t('5) y no cambia el plano ni el historial', JSON.stringify(b.e.planta) === antes && b.e.deshacer.length === 0);
  const ajustada = encuadrar(modulosDelNivel(b.e.planta, 0), 393, 600);
  t('5) "Ajustar vista" detecta que la vista se movió', !mismaVista(b.v, ajustada));
  t('5) y reconoce cuando ya está encuadrado', mismaVista(ajustada, encuadrar(modulosDelNivel(b.e.planta, 0), 393, 600)));
}

// ── 6. Borrar y deshacer ──
{
  const b = cargado(planoApartamentoSintetico());
  const cs = b.centro('cuarto');
  b.gesto(cs.px, cs.py);
  b.aplicar([{ type: 'eliminarModulo', id: 'cuarto' }]);
  t('6) borrar quita el espacio y la selección', !b.e.planta.modulos.some(m => m.id === 'cuarto') && b.e.seleccion === null);
  b.aplicar([{ type: 'deshacer' }]);
  t('6) deshacer lo recupera', b.e.planta.modulos.some(m => m.id === 'cuarto'));
}

// ── 7. Solo se toca el nivel visible ──
{
  const dos = { niveles: 2, modulos: [
    { id: 'abajo', tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4, nivel: 0 },
    { id: 'arriba', tipo: 'habitacion', x: 0, z: 0, ancho: 4, largo: 4, nivel: 1 }] } as any as Plano;
  const b = cargado(dos);
  const cs = b.centro('abajo');
  t('7) en el nivel 0 se toca el espacio del nivel 0 aunque haya otro encima', (queToca(b.v, b.e.planta, 0, null, cs.px, cs.py) as any).id === 'abajo');
  b.gesto(cs.px, cs.py, [[200, 0]]);
  t('7) mover no afecta al espacio del otro nivel', b.mod('arriba').x === 0 && b.mod('abajo').x !== 0);
}

// ── 8. Umbral de arrastre ──
t('8) por debajo de 8 pt es un toque', mover(iniciar({ vista: VISTA, planta: editorVacio().planta, nivel: 0, seleccion: null, colocar: null }, 0, 0).gesto, UMBRAL_ARRASTRE - 0.5, 0).gesto.arrastrando === false);

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
