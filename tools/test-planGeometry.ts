/**
 * Pruebas del generador de maqueta (lógica pura, sin teléfono).
 * Ejecutar:  npx tsx tools/test-planGeometry.ts
 */
import { Plano, planoDemo, conDimension, validarPlano, ALTO_VANO_DEF, planoApartamentoSintetico, esCuarto, Modulo } from '../components/plan/planModel';
import { PLANO_REAL_1, PLANO_REAL_2 } from '../components/plan/planosReales';
import {
  generarMaqueta, restarIntervalos, escalaParaCaber, denominadorEscala,
  GROSOR_PARED, GROSOR_PISO, Caja,
} from '../components/plan/planGeometry';
declare const process: any;
let ok = 0, fail = 0;
const t = (n: string, c: boolean) => { if (c) ok++; else { fail++; console.error('✗', n); } };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const paredes = (c: Caja[]) => c.filter(x => x.clase === 'pared');
const pisos = (c: Caja[]) => c.filter(x => x.clase === 'piso');
const dinteles = (c: Caja[]) => c.filter(x => x.clase === 'dintel');

// ── 1. Habitación simple 4×3×2.5, SIN vanos: 1 piso + 4 paredes ──
const simple: Plano = { alto_piso: 2.5, modulos: [{ id: 'sala', x: 0, z: 0, ancho: 4, largo: 3, alto: 2.5 }] };
{
  const m = generarMaqueta(simple);
  t('1) sin errores', m.errores.length === 0);
  t('1) exactamente 1 piso y 4 paredes', pisos(m.cajas).length === 1 && paredes(m.cajas).length === 4);
  t('1) área = 12 m²', near(m.areaM2, 12));
  t('1) extensión = 4 × 2.5 × 3', near(m.extension[0], 4) && near(m.extension[1], 2.5) && near(m.extension[2], 3));
  const p = pisos(m.cajas)[0];
  t('1) el piso mide 4 × 3 y está centrado en el origen', near(p.tamano[0], 4) && near(p.tamano[2], 3) && near(p.centro[0], 0) && near(p.centro[2], 0));
  t('1) el piso queda justo bajo el nivel 0', near(p.centro[1], -GROSOR_PISO / 2));
  // norte (z menor) y sur (z mayor) corren en X: largo 4. oeste/este corren en Z: largo 3.
  const enX = paredes(m.cajas).filter(w => near(w.tamano[0], 4)), enZ = paredes(m.cajas).filter(w => near(w.tamano[2], 3));
  t('1) 2 paredes de 4 m (norte y sur)', enX.length === 2);
  t('1) 2 paredes de 3 m (oeste y este)', enZ.length === 2);
  t('1) todas las paredes miden 2.5 m de alto y su centro está a 1.25', paredes(m.cajas).every(w => near(w.tamano[1], 2.5) && near(w.centro[1], 1.25)));
  t('1) grosor correcto en las paredes', enX.every(w => near(w.tamano[2], GROSOR_PARED)) && enZ.every(w => near(w.tamano[0], GROSOR_PARED)));
  // Posiciones: con el origen centrado, norte en z=-1.5 y sur en z=+1.5; oeste x=-2, este x=+2
  const zs = enX.map(w => w.centro[2]).sort((a, b) => a - b);
  const xs = enZ.map(w => w.centro[0]).sort((a, b) => a - b);
  t('1) norte y sur en z = ∓1.5', near(zs[0], -1.5) && near(zs[1], 1.5));
  t('1) oeste y este en x = ∓2', near(xs[0], -2) && near(xs[1], 2));
}

// ── 2. Cambiar el ancho y regenerar ──
{
  const antes = generarMaqueta(simple);
  const despues = generarMaqueta(conDimension(simple, 'sala', 'ancho', 5));
  t('2) el área pasa de 12 a 15 m²', near(antes.areaM2, 12) && near(despues.areaM2, 15));
  t('2) sigue habiendo 1 piso y 4 paredes', pisos(despues.cajas).length === 1 && paredes(despues.cajas).length === 4);
  t('2) las paredes norte/sur pasan a medir 5 m', paredes(despues.cajas).filter(w => near(w.tamano[0], 5)).length === 2);
  t('2) las paredes este/oeste siguen en 3 m', paredes(despues.cajas).filter(w => near(w.tamano[2], 3)).length === 2);
  t('2) se re-centra: este/oeste ahora en x = ∓2.5', (() => {
    const xs = paredes(despues.cajas).filter(w => near(w.tamano[2], 3)).map(w => w.centro[0]).sort((a, b) => a - b);
    return near(xs[0], -2.5) && near(xs[1], 2.5);
  })());
  t('2) conDimension NO muta el plano original', simple.modulos[0].ancho === 4);
}

// ── 3. Huecos: puerta y ventana ──
{
  const m = generarMaqueta(planoDemo(4, 3, 2.5));
  // Puerta de 0.9 centrada en el lado norte → ese lado se parte en 2 segmentos
  const norte = paredes(m.cajas).filter(w => near(w.centro[2], -1.5));
  t('3) el lado con puerta se parte en 2 segmentos', norte.length === 2);
  t('3) los dos segmentos suman 4 − 0.9 = 3.1 m', near(norte.reduce((s, w) => s + w.tamano[0], 0), 3.1));
  // Ventana de 1.2 en el este → también 2 segmentos
  const este = paredes(m.cajas).filter(w => near(w.centro[0], 2));
  t('3) el lado con ventana se parte en 2 segmentos', este.length === 2);
  t('3) los dos segmentos suman 3 − 1.2 = 1.8 m', near(este.reduce((s, w) => s + w.tamano[2], 0), 1.8));
  // Dinteles: puerta (2.1) deja 0.4 arriba; ventana con antepecho 0.9 y alto 1.2 deja 0.4 arriba + antepecho
  const dp = dinteles(m.cajas).filter(d => d.id.includes('-alto'));
  t('3) hay dintel sobre la puerta y sobre la ventana', dp.length === 2);
  t('3) el dintel de la puerta mide 2.5 − 2.1 = 0.4 m', dp.some(d => near(d.tamano[1], 0.4) && near(d.tamano[0], 0.9)));
  const ante = dinteles(m.cajas).filter(d => d.id.includes('-bajo'));
  t('3) hay antepecho bajo la ventana, de 0.9 m', ante.length === 1 && near(ante[0].tamano[1], 0.9));
  t('3) el antepecho arranca del piso (centro a 0.45)', near(ante[0].centro[1], 0.45));
}

// ── 4. restarIntervalos ──
t('4) sin huecos devuelve el tramo entero', JSON.stringify(restarIntervalos(0, 4, [])) === JSON.stringify([[0, 4]]));
t('4) un hueco central parte en dos', JSON.stringify(restarIntervalos(0, 4, [[1, 2]])) === JSON.stringify([[0, 1], [2, 4]]));
t('4) un hueco en el borde deja un solo tramo', JSON.stringify(restarIntervalos(0, 4, [[0, 1]])) === JSON.stringify([[1, 4]]));
t('4) un hueco que cubre todo no deja nada', restarIntervalos(0, 4, [[0, 4]]).length === 0);
t('4) descarta tramos menores de 5 cm', restarIntervalos(0, 4, [[0.03, 4]]).length === 0);
t('4) dos huecos dan tres tramos', restarIntervalos(0, 6, [[1, 2], [3, 4]]).length === 3);

// ── 5. Dos módulos contiguos: la pared compartida se dibuja UNA vez ──
{
  const dos: Plano = { alto_piso: 2.5, modulos: [
    { id: 'a', x: 0, z: 0, ancho: 4, largo: 3 },
    { id: 'b', x: 4, z: 0, ancho: 3, largo: 3 },   // pegado al este de 'a'
  ] };
  const m = generarMaqueta(dos);
  t('5) 2 pisos', pisos(m.cajas).length === 2);
  t('5) área = 12 + 9 = 21 m²', near(m.areaM2, 21));
  // La pared en x=4 debe aparecer una sola vez (no dos superpuestas)
  const enX4 = paredes(m.cajas).filter(w => near(w.centro[0], 4 - 3.5) && near(w.tamano[2], 3));
  t('5) la pared compartida no está duplicada', enX4.length === 1);
  t('5) extensión total 7 × 3', near(m.extension[0], 7) && near(m.extension[2], 3));
}

// ── 6. Niveles (pisos apilados) ──
{
  const dosNiveles: Plano = { alto_piso: 2.5, altura_entrepiso: 2.8, modulos: [
    { id: 'pb', x: 0, z: 0, ancho: 4, largo: 3, nivel: 0 },
    { id: 'p1', x: 0, z: 0, ancho: 4, largo: 3, nivel: 1 },
  ] };
  const m = generarMaqueta(dosNiveles);
  t('6) el nivel 1 se levanta 2.8 m', paredes(m.cajas).filter(w => near(w.centro[1], 2.8 + 1.25)).length === 4);
  t('6) avisa de que hay varios niveles', m.avisos.some(a => a.includes('niveles')));
  t('6) extensión en altura = 2.8 + 2.5', near(m.extension[1], 5.3));
}

// ── 7. Escala de visualización (no toca los datos) ──
{
  const m = generarMaqueta(simple);
  const e = escalaParaCaber(m.extension, 0.6);     // caber en 60 cm de mesa
  t('7) 4 m → 0.6 m da escala 0.15 (1:6.7)', near(e, 0.15));
  const e20 = escalaParaCaber([4, 2.5, 3], 0.2);
  t('7) 1:20 se obtiene con 0.2 m de mesa', near(denominadorEscala(e20), 20));
  t('7) la escala es uniforme: aplicarla conserva proporciones', (() => {
    const p = pisos(m.cajas)[0];
    return near((p.tamano[0] * e) / (p.tamano[2] * e), 4 / 3);
  })());
  t('7) los datos del plano siguen en metros tras calcular la escala', simple.modulos[0].ancho === 4);
}

// ── 8. Validación y casos degenerados: nunca lanza ──
{
  const casos: [string, Plano | null][] = [
    ['plano nulo', null],
    ['sin módulos', { modulos: [] }],
    ['ancho cero', { modulos: [{ id: 'a', x: 0, z: 0, ancho: 0, largo: 3 }] }],
    ['ancho NaN', { modulos: [{ id: 'a', x: 0, z: 0, ancho: NaN, largo: 3 }] }],
    ['ids repetidos', { modulos: [{ id: 'a', x: 0, z: 0, ancho: 2, largo: 2 }, { id: 'a', x: 5, z: 0, ancho: 2, largo: 2 }] }],
    ['vano en módulo inexistente', { modulos: [{ id: 'a', x: 0, z: 0, ancho: 4, largo: 3 }], vanos: [{ modulo_a: 'zzz', lado: 'norte', centro: 2, ancho: 0.9 }] }],
  ];
  let threw = false;
  for (const [nombre, p] of casos) {
    try {
      const m = generarMaqueta(p as Plano);
      t(`8) no lanza y reporta error: ${nombre}`, m.errores.length > 0 && m.cajas.length === 0);
    } catch (e) { threw = true; t(`8) no lanza: ${nombre}`, false); console.error('   →', String(e)); }
  }
  t('8) ninguna excepción escapó', !threw);
  t('8) un plano válido no reporta errores', validarPlano(simple).length === 0);
}

// ── 9. Límite documentado: vano más alto que la pared ──
{
  const malo: Plano = { alto_piso: 2.0, modulos: [{ id: 'a', x: 0, z: 0, ancho: 4, largo: 3, alto: 2.0 }],
    vanos: [{ modulo_a: 'a', lado: 'norte', centro: 2, ancho: 0.9, alto: 2.5, tipo: 'puerta' }] };
  const m = generarMaqueta(malo);
  t('9) avisa si el vano supera la altura de la pared', m.avisos.some(a => a.includes('más alto')));
  t('9) y no genera un dintel de tamaño negativo', dinteles(m.cajas).every(d => d.tamano[1] > 0));
}

// ── 10. Alto por defecto del vano ──
{
  const sinAlto: Plano = { alto_piso: 2.5, modulos: [{ id: 'a', x: 0, z: 0, ancho: 4, largo: 3 }],
    vanos: [{ modulo_a: 'a', lado: 'norte', centro: 2, ancho: 0.9, tipo: 'puerta' }] };
  const m = generarMaqueta(sinAlto);
  t('10) usa 2.1 m por defecto (como visor3d.js)', dinteles(m.cajas).some(d => near(d.tamano[1], 2.5 - ALTO_VANO_DEF)));
}


// ═════════════ FASE 1: tipos, paredes eliminadas, huecos y estructura ═════════════
// TODOS los planos de estas pruebas son SINTÉTICOS (no hay aún un JSON real exportado).
const finitas = (c: Caja[]) => c.every(x => [...x.centro, ...x.tamano].every(Number.isFinite) && x.tamano.every(v => v > 0));
const cuarto = (id: string, x: number, z: number, ancho: number, largo: number, extra: Partial<Modulo> = {}): Modulo =>
  ({ id, tipo: 'sala', x, z, ancho, largo, alto: 2.5, ...extra });

// ── 11. Tipos: pasillo es cuarto; los tipos estructurales no ──
t('11) pasillo, sala, cocina, bano, cuarto, habitacion y tipo ausente cuentan como cuarto',
  ['pasillo', 'sala', 'cocina', 'bano', 'cuarto', 'habitacion', undefined, null, 'otro'].every(x => esCuarto(x as any)));
t('11) los 10 tipos de TIPOS_NO_CUARTO no cuentan como cuarto',
  ['pared', 'vidrio', 'columna', 'viga', 'plafon', 'cubierta', 'exterior', 'escalera', 'hueco', 'baranda'].every(x => !esCuarto(x)));
{
  const m = generarMaqueta({ alto_piso: 2.5, modulos: [cuarto('p', 0, 0, 6, 1.2, { tipo: 'pasillo' })] });
  t('11) un pasillo genera piso y 4 paredes', pisos(m.cajas).length === 1 && paredes(m.cajas).length === 4);
}

// ── 12. paredes_eliminadas en un cuarto solo ──
{
  const m = generarMaqueta({ alto_piso: 2.5, modulos: [cuarto('a', 0, 0, 4, 3, { paredes_eliminadas: ['norte'] })],
    vanos: [{ modulo_a: 'a', lado: 'norte', centro: 2, ancho: 0.9, tipo: 'puerta' }] });
  t('12) eliminar el norte deja 3 paredes', paredes(m.cajas).length === 3);
  t('12) no queda ninguna pared en el lado norte (z = −1.5)', !paredes(m.cajas).some(w => near(w.centro[2], -1.5)));
  t('12) tampoco queda dintel de la puerta de un muro eliminado', dinteles(m.cajas).length === 0);
  t('12) el piso no se ve afectado', pisos(m.cajas).length === 1 && near(m.areaM2, 12));
}

// ── 13. Pared compartida: se ve mientras al menos uno la conserve ──
{
  const enX0 = (c: Caja[]) => paredes(c).filter(w => near(w.centro[0], 0) && near(w.tamano[2], 3)).length;   // x = 4 − offX(4)
  const caso = (ea: any[], eb: any[]) => generarMaqueta({ alto_piso: 2.5, modulos: [
    cuarto('a', 0, 0, 4, 3, { paredes_eliminadas: ea }), cuarto('b', 4, 0, 4, 3, { paredes_eliminadas: eb })] });
  t('13) ninguno la elimina → una sola pared', enX0(caso([], []).cajas) === 1);
  t('13) solo A la elimina → sigue una (B la conserva)', enX0(caso(['este'], []).cajas) === 1);
  t('13) solo B la elimina → sigue una (A la conserva)', enX0(caso([], ['oeste']).cajas) === 1);
  t('13) ambos la eliminan → no hay pared (concepto abierto)', enX0(caso(['este'], ['oeste']).cajas) === 0);
  t('13) eliminar el muro compartido no toca los muros exteriores', paredes(caso(['este'], ['oeste']).cajas).length === 6);
}

// ── 14. Estructura simple ──
{
  const m = generarMaqueta({ alto_piso: 2.5, modulos: [
    cuarto('sala', 0, 0, 4, 3),
    { id: 'muro', tipo: 'pared', x: 1, z: 1, ancho: 2, largo: 0.15 },
    { id: 'col', tipo: 'columna', x: 3.7, z: 2.7, ancho: 0.3, largo: 0.3, forma: 'cuadrada' },
    { id: 'v1', tipo: 'viga', x: 0, z: 1.4, ancho: 4, largo: 0.25 },                                  // sin peralte ni altura_base
    { id: 'v2', tipo: 'viga', x: 0, z: 0.5, ancho: 4, largo: 0.25, peralte: 0.35, altura_base: 2.0 },
  ] });
  const e = (id: string) => m.cajas.find(c => c.id === `est-${id}`)!;
  t('14) pared: caja 2 × 2.5 × 0.15 apoyada en el piso', near(e('muro').tamano[0], 2) && near(e('muro').tamano[1], 2.5) && near(e('muro').tamano[2], 0.15) && near(e('muro').centro[1], 1.25));
  t('14) columna cuadrada: caja 0.3 × 2.5 × 0.3', near(e('col').tamano[0], 0.3) && near(e('col').tamano[1], 2.5));
  t('14) viga sin datos: peralte 0.4 pegada al techo (centro 2.3)', near(e('v1').tamano[1], 0.4) && near(e('v1').centro[1], 2.3));
  t('14) viga con datos: peralte 0.35 desde 2.0 m (centro 2.175)', near(e('v2').tamano[1], 0.35) && near(e('v2').centro[1], 2.175));
  t('14) la estructura no suma área de piso', near(m.areaM2, 12));
  t('14) cada elemento queda marcado con su tipo', e('muro').elemento === 'pared' && e('col').elemento === 'columna' && e('v1').elemento === 'viga');
}

// ── 15. Tipos que aún no se representan: se informan, no se dibujan mal ──
{
  const m = generarMaqueta({ alto_piso: 2.5, modulos: [
    cuarto('sala', 0, 0, 4, 3),
    { id: 'vid', tipo: 'vidrio', x: 1, z: 1, ancho: 1, largo: 0.05 },
    { id: 'colr', tipo: 'columna', x: 2, z: 2, ancho: 0.3, largo: 0.3, forma: 'redonda' },
    { id: 'pla', tipo: 'plafon', x: 0, z: 0, ancho: 2, largo: 2 },
    { id: 'esc', tipo: 'escalera', x: 3, z: 0, ancho: 1, largo: 2 },
  ] });
  t('15) no genera cajas para vidrio, columna redonda, plafón ni escalera', !m.cajas.some(c => ['vid', 'colr', 'pla', 'esc'].includes(c.moduloId)));
  const av = m.avisos.join(' | ');
  t('15) avisa de cada uno', ['vidrio', 'columna redonda', 'plafon', 'escalera'].every(x => av.includes(x)));
  t('15) el cuarto se sigue generando normalmente', pisos(m.cajas).length === 1 && paredes(m.cajas).length === 4);
}

// ── 16. Huecos: solo recortan pisos de niveles superiores ──
{
  const hueco = (nivel: number): Modulo => ({ id: `h${nivel}`, tipo: 'hueco', x: 1, z: 1, ancho: 1, largo: 1, nivel });
  const n0 = generarMaqueta({ alto_piso: 2.5, modulos: [cuarto('a', 0, 0, 4, 3, { nivel: 0 }), hueco(0)] });
  t('16) en planta baja el hueco NO recorta el piso (como la web)', pisos(n0.cajas).length === 1 && near(n0.areaM2, 12));
  const n1 = generarMaqueta({ alto_piso: 2.5, modulos: [cuarto('a', 0, 0, 4, 3, { nivel: 1 }), hueco(1)] });
  t('16) en el nivel 1 recorta: el piso se parte en pedazos', pisos(n1.cajas).length === 4);
  t('16) y el área baja exactamente 1 m²', near(n1.areaM2, 11));
  t('16) el hueco nunca genera cajas propias', !n1.cajas.some(c => c.moduloId === 'h1'));
}

// ── 17. Campos en null, como los emite el serializador web ──
{
  const m = generarMaqueta({ alto_piso: 2.5, modulos: [
    { ...cuarto('a', 0, 0, 4, 3), alto: undefined, paredes_eliminadas: null, diseno_paredes: null, forma: null },
    { id: 'v', tipo: 'viga', x: 0, z: 1, ancho: 4, largo: 0.2, peralte: null, altura_base: null },
    { id: 'c', tipo: 'columna', x: 3.7, z: 0, ancho: 0.3, largo: 0.3, forma: null },
  ] });
  t('17) con nulls no aparece ningún NaN ni tamaño ≤ 0', m.errores.length === 0 && finitas(m.cajas));
  t('17) alto ausente usa alto_piso (2.5)', paredes(m.cajas).filter(w => w.elemento === 'cuarto').every(w => near(w.tamano[1], 2.5)));
  t('17) columna con forma null se trata como cuadrada', m.cajas.some(c => c.id === 'est-c'));
}

// ── 18. Apartamento SINTÉTICO con la forma del serializador web ──
{
  const ap = planoApartamentoSintetico();
  const m = generarMaqueta(ap);
  t('18) es válido y sin NaN', m.errores.length === 0 && finitas(m.cajas));
  t('18) 5 pisos (sala, cocina, pasillo, cuarto, baño)', pisos(m.cajas).length === 5);
  t('18) área = 20 + 12 + 9.6 + 15 + 7.5 = 64.1 m²', near(m.areaM2, 64.1));
  t('18) extensión 8 × 8.2 m', near(m.extension[0], 8) && near(m.extension[2], 8.2));
  // Cocina abierta: en x = 5 (centro x = 1) no hay muro a lo largo de z entre z 0 y 4 (centro z de −4.1 a −0.1)
  t('18) cocina abierta: no hay muro entre sala y cocina',
    !paredes(m.cajas).some(w => w.elemento === 'cuarto' && near(w.centro[0], 1) && w.centro[2] < -0.1 && w.tamano[0] < 0.2));
  t('18) pero sí entre cuarto y baño (nadie lo eliminó)',
    paredes(m.cajas).some(w => w.elemento === 'cuarto' && near(w.centro[0], 1) && w.centro[2] > 1 && w.tamano[0] < 0.2));
  t('18) hay columna y viga', m.cajas.some(c => c.elemento === 'columna') && m.cajas.some(c => c.elemento === 'viga'));
  t('18) 3 puertas dejan 3 dinteles altos y la ventana su dintel y antepecho',
    dinteles(m.cajas).filter(d => d.id.endsWith('-alto')).length === 4 && dinteles(m.cajas).filter(d => d.id.endsWith('-bajo')).length === 1);
  t('18) no se generan avisos de tipos omitidos', !m.avisos.some(a => a.startsWith('Aún no se representan')));
  t('18) el plano original no se modifica al generar', JSON.stringify(ap) === JSON.stringify(planoApartamentoSintetico()));
}

// ── 19. Compatibilidad hacia atrás: la sala de la demo sigue dando 10 piezas ──
t('19) planoDemo sigue generando exactamente 10 piezas (lo que mostró el iPhone)', generarMaqueta(planoDemo(4, 3, 2.5)).cajas.length === 10);


// ═════════════ 20. Regresión con los dos planos REALES de modelos_3d_plano ═════════════
for (const [nombre, plano, pisosEsperados, areaEsperada, ext] of [
  ['real 1', PLANO_REAL_1, 5, 45.25, [8.5, 7.5]],
  ['real 2', PLANO_REAL_2, 4, 49.0, [8, 7.5]],
] as [string, Plano, number, number, [number, number]][]) {
  const m = generarMaqueta(plano);
  const par = paredes(m.cajas);
  t(`20) ${nombre}: válido, sin avisos y sin NaN`, m.errores.length === 0 && m.avisos.length === 0 && finitas(m.cajas));
  t(`20) ${nombre}: un piso por módulo`, pisos(m.cajas).length === pisosEsperados);
  t(`20) ${nombre}: el área coincide con la suma de los módulos`, near(m.areaM2, areaEsperada));
  t(`20) ${nombre}: extensión correcta`, near(m.extension[0], ext[0]) && near(m.extension[2], ext[1]));
  t(`20) ${nombre}: sin vanos no hay dinteles`, dinteles(m.cajas).length === 0);
  // Ninguna pared se dibuja dos veces ni se pisa con otra en la misma línea
  let pisadas = 0;
  for (let a = 0; a < par.length; a++) for (let b = a + 1; b < par.length; b++) {
    const A = par[a], B = par[b];
    const enX = A.tamano[2] < 0.2 && B.tamano[2] < 0.2 && near(A.centro[2], B.centro[2]);
    const enZ = A.tamano[0] < 0.2 && B.tamano[0] < 0.2 && near(A.centro[0], B.centro[0]);
    const ov = (c: number, s: number, c2: number, s2: number) => Math.min(c + s / 2, c2 + s2 / 2) - Math.max(c - s / 2, c2 - s2 / 2);
    if (enX && ov(A.centro[0], A.tamano[0], B.centro[0], B.tamano[0]) > 0.01) pisadas++;
    if (enZ && ov(A.centro[2], A.tamano[2], B.centro[2], B.tamano[2]) > 0.01) pisadas++;
  }
  t(`20) ${nombre}: ninguna pared duplicada ni superpuesta`, pisadas === 0);
}
// El campo paredes_compartidas de la IA trae lados equivocados: el resultado no debe depender de él
{
  const sinCampo = generarMaqueta({ ...PLANO_REAL_1, paredes_compartidas: [] });
  t('20) ignorar paredes_compartidas de la IA da exactamente la misma maqueta', JSON.stringify(sinCampo.cajas) === JSON.stringify(generarMaqueta(PLANO_REAL_1).cajas));
}


// ═════════════ E0: arco, vano y puerta como en la construcción 3D de la web ═════════════
{
  const conVano = (tipo: any, lado: 'norte' | 'este' = 'norte', extra: any = {}) => generarMaqueta({ alto_piso: 2.5,
    modulos: [{ id: 'a', x: 0, z: 0, ancho: 4, largo: 3, alto: 2.5 }],
    vanos: [{ id: 'v1', modulo_a: 'a', lado, centro: lado === 'norte' ? 2 : 1.5, ancho: 0.9, ...(tipo === undefined ? {} : { tipo }), ...extra }] });

  const arco = conVano('arco');
  t('E0) arco: el muro queda partido en 2 tramos que suman 4 − 0.9', paredes(arco.cajas).filter(w => near(w.centro[2], -1.5)).length === 2
    && near(paredes(arco.cajas).filter(w => near(w.centro[2], -1.5)).reduce((q, w) => q + w.tamano[0], 0), 3.1));
  t('E0) arco: SIN dintel (de piso a techo)', dinteles(arco.cajas).length === 0);
  t('E0) arco: sin marco', arco.marcos.length === 0);

  const vano = conVano('vano');
  t('E0) vano: SIN dintel (la web solo le pone marco, visor3d.js:9022)', dinteles(vano.cajas).length === 0);
  t('E0) vano: marco de 3 piezas (dos jambas y cabezal)', vano.marcos.length === 3);
  const jamba = vano.marcos.find(c => c.id.endsWith('jamba-i'))!, cab = vano.marcos.find(c => c.id.endsWith('cabezal'))!;
  t('E0) vano: jambas de 2.1 m de alto, 6 cm de espesor y 16 cm de fondo', near(jamba.tamano[1], 2.1) && near(jamba.tamano[0], 0.06) && near(jamba.tamano[2], 0.16));
  t('E0) vano: jamba izquierda junto al hueco (x = 2 − 0.45 − 0.03 − offX 2)', near(jamba.centro[0], -0.48) && near(jamba.centro[2], -1.5));
  t('E0) vano: cabezal de 0.9 + 0.12 m de ancho, centrado a 2.13 m', near(cab.tamano[0], 1.02) && near(cab.centro[1], 2.13));
  t('E0) los marcos van aparte: no se mezclan con las cajas de la maqueta', !vano.cajas.some(c => c.elemento === 'marco'));

  const puerta = conVano('puerta');
  t('E0) puerta: dintel de 2.5 − 2.1 = 0.4 m', dinteles(puerta.cajas).length === 1 && near(dinteles(puerta.cajas)[0].tamano[1], 0.4));
  t('E0) puerta: también lleva marco', puerta.marcos.length === 3);
  t('E0) puerta sin alto: usa 2.1 (|| como la web)', near(dinteles(conVano('puerta', 'norte', { alto: 0 }).cajas)[0].tamano[1], 0.4));

  const sinTipo = conVano(undefined);
  t('E0) vano sin tipo: igual que la web, hueco de piso a techo sin dintel ni marco', dinteles(sinTipo.cajas).length === 0 && sinTipo.marcos.length === 0);

  const lateral = conVano('vano', 'este');
  const jL = lateral.marcos.find(c => c.id.endsWith('jamba-i'))!, cL = lateral.marcos.find(c => c.id.endsWith('cabezal'))!;
  t('E0) en el lado este el marco gira: el fondo va en X y el ancho en Z', near(jL.tamano[0], 0.16) && near(jL.tamano[2], 0.06) && near(cL.tamano[2], 1.02));
  t('E0) y se apoya en x = este (4 − offX 2 = 2)', near(jL.centro[0], 2) && near(cL.centro[0], 2));

  const ventana = conVano('ventana', 'norte', { alto: 1.2, alto_antepecho: 0.9 });
  t('E0) ventana (extensión de DecoAR): conserva antepecho y dintel, sin marco',
    dinteles(ventana.cajas).length === 2 && ventana.marcos.length === 0);
}

// ── E0: plano con la forma EXACTA del editor web: ids numéricos y vanos en camelCase ──
{
  const web: any = { alto_piso: 2.6, modulos: [
      { id: 1760000000001, tipo: 'sala',   nombre: '🛋️ Sala',   x: 0, z: 0, ancho: 4, largo: 4, alto: 2.6, nivel: 0, capa: 'planta', paredes_eliminadas: [] },
      { id: 1760000000002, tipo: 'cocina', nombre: '🍳 Cocina', x: 4, z: 0, ancho: 3, largo: 4, alto: 2.6, nivel: 0, capa: 'planta', paredes_eliminadas: [] }],
    vanos: [
      { id: 'v_1760000000003_ab12', modulo_a: 1760000000001, modulo_b: 1760000000002, lado: 'este', nivel: 0, centro: 2, ancho: 0.9,
        tipo: 'arco', alto: 2.1, bisagra: 'izq', sentido: 'dentro', anguloApertura: 75, abierta: true, limIni: 0, limFin: 4 },
      { id: 'v_1760000000004_cd34', modulo_a: 1760000000001, modulo_b: null, lado: 'norte', nivel: 0, centro: 2, ancho: 0.9,
        tipo: 'puerta', alto: 2.1, bisagra: 'izq', sentido: 'dentro', anguloApertura: 75, abierta: true, limIni: 0, limFin: 4, libre: true }],
    paredes_compartidas: [{ modulo_a: 1760000000001, modulo_b: 1760000000002, lado: 'este', ini: 0, fin: 4 }] };
  const copia = JSON.stringify(web);
  const m = generarMaqueta(web);
  t('E0) plano del editor web (ids numéricos): válido y sin NaN', m.errores.length === 0 && finitas(m.cajas) && finitas(m.marcos));
  t('E0) el arco entre sala y cocina no lleva dintel; la puerta libre sí', dinteles(m.cajas).length === 1);
  t('E0) solo la puerta lleva marco (3 piezas)', m.marcos.length === 3);
  t('E0) la pared compartida se dibuja una sola vez, con el hueco del arco', paredes(m.cajas).filter(w => near(w.centro[0], 4 - 3.5) && w.tamano[0] < 0.2).length === 2);
  t('E0) no modifica el plano recibido', JSON.stringify(web) === copia);
  t('E0) ids repetidos siguen siendo error aunque sean números', generarMaqueta({ ...web, modulos: [web.modulos[0], { ...web.modulos[1], id: 1760000000001 }] }).errores.length > 0);
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);