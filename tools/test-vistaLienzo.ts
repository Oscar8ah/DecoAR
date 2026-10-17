/**
 * P1 · 1a — Lógica del lienzo 2D (pura, sin teléfono).
 * Ejecutar:  npx tsx tools/test-vistaLienzo.ts
 */
import { Plano, planoApartamentoSintetico, planoDemo, Modulo } from '../components/plan/planModel';
import { PLANO_REAL_1, PLANO_REAL_2 } from '../components/plan/planosReales';
import { editorVacio, reducirEditor, EditorPlanta } from '../components/plan/planEditor';
import {
  aPantalla, aPlano, encuadrar, cuadricula, metros, textoMedidas, tipoVisual, nombreVisible, etiquetaCabe,
  tramoVano, modulosDelNivel, vanosDelNivel, resumen, extension, cotasGenerales, zoomVista, puedeAcercar, puedeAlejar, PASO_ZOOM,
  ESCALA_MAX, ESCALA_MIN, ESCALA_INICIAL, MARGEN_ENCUADRE, MAX_LINEAS, Vista,
} from '../components/editor2d/vistaLienzo';
import { colorTipo } from '../components/editor2d/paleta';

declare const process: any;
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const cargar = (p: Plano): EditorPlanta => reducirEditor(editorVacio(), { type: 'cargarPlano', plano: JSON.parse(JSON.stringify(p)) });

// Lienzo típico de un iPhone 15 en vertical: 393 pt de ancho; alto restando cabecera y barra.
const ANCHO = 393, ALTO = 600;
const EJEMPLOS: [string, Plano][] = [
  ['apartamento', planoApartamentoSintetico()], ['sala', planoDemo(4, 3, 2.5)], ['real 1', PLANO_REAL_1], ['real 2', PLANO_REAL_2],
];

// ── 1. Conversión pantalla ↔ plano ──
for (const v of [{ escala: 40, ox: 0, oy: 0 }, { escala: 23.7, ox: 81.2, oy: -12.5 }, { escala: 160, ox: 196, oy: 300 }] as Vista[]) {
  const ida = [[0, 0], [3.5, 4], [-2, 7.25]].every(([x, z]) => { const p = aPantalla(v, x, z); const b = aPlano(v, p.px, p.py); return near(b.x, x) && near(b.z, z); });
  t(`1) ida y vuelta exacta con escala ${v.escala}`, ida);
}
t('1) norte (z menor) queda arriba y este (x mayor) a la derecha',
  aPantalla({ escala: 40, ox: 0, oy: 0 }, 0, 1).py < aPantalla({ escala: 40, ox: 0, oy: 0 }, 0, 2).py
  && aPantalla({ escala: 40, ox: 0, oy: 0 }, 2, 0).px > aPantalla({ escala: 40, ox: 0, oy: 0 }, 1, 0).px);

// ── 2. Ajustar vista ──
for (const [n, p] of EJEMPLOS) {
  const mods = modulosDelNivel(cargar(p).planta, 0);
  const v = encuadrar(mods, ANCHO, ALTO);
  const e = extension(mods)!;
  const a = aPantalla(v, e.x0, e.z0), b = aPantalla(v, e.x1, e.z1);
  const dentro = a.px >= MARGEN_ENCUADRE - 1e-6 && a.py >= MARGEN_ENCUADRE - 1e-6 && b.px <= ANCHO - MARGEN_ENCUADRE + 1e-6 && b.py <= ALTO - MARGEN_ENCUADRE + 1e-6;
  t(`2) ${n}: todo el plano cabe dentro del margen`, dentro);
  t(`2) ${n}: queda centrado`, near((a.px + b.px) / 2, ANCHO / 2) && near((a.py + b.py) / 2, ALTO / 2));
  const llena = near(b.px - a.px, ANCHO - 2 * MARGEN_ENCUADRE, 1e-6) || near(b.py - a.py, ALTO - 2 * MARGEN_ENCUADRE, 1e-6) || near(v.escala, ESCALA_MAX);
  t(`2) ${n}: aprovecha todo el ancho o todo el alto disponible`, llena);
}
t('2) plano vacío: escala inicial de la web y origen en el centro',
  (() => { const v = encuadrar([], ANCHO, ALTO); return v.escala === ESCALA_INICIAL && v.ox === ANCHO / 2 && v.oy === ALTO / 2; })());
const mini: Modulo[] = [{ id: 'a', x: 0, z: 0, ancho: 0.3, largo: 0.3 }];
const enorme: Modulo[] = [{ id: 'a', x: 0, z: 0, ancho: 400, largo: 300 }];
t('2) un espacio diminuto no supera la escala máxima', encuadrar(mini, ANCHO, ALTO).escala === ESCALA_MAX);
t('2) un plano enorme no baja de la escala mínima', encuadrar(enorme, ANCHO, ALTO).escala === ESCALA_MIN);
t('2) un lienzo sin medir no rompe nada', Number.isFinite(encuadrar(mini, 0, 0).escala));

// ── 3. Cuadrícula ──
{
  const v: Vista = { escala: 40, ox: 17.3, oy: -9.1 };
  const r = cuadricula(v, ANCHO, ALTO);
  t('3) a 40 pt/m la cuadrícula es de 0,5 m, la de la web', r.paso === 0.5);
  const enMultiplos = [...r.verticales.map(l => (l.pos - v.ox) / v.escala), ...r.horizontales.map(l => (l.pos - v.oy) / v.escala)]
    .every(m => near(m / 0.5, Math.round(m / 0.5), 1e-9));
  t('3) cada línea cae en un múltiplo exacto de 0,5 m', enMultiplos);
  t('3) las líneas de metro entero son las fuertes', r.verticales.every(l => l.fuerte === near(((l.pos - v.ox) / v.escala) % 1, 0, 1e-9) || near(Math.abs(((l.pos - v.ox) / v.escala) % 1), 1, 1e-9)));
  t('3) cubre todo el lienzo', r.verticales[0].pos <= 0 && r.verticales[r.verticales.length - 1].pos >= ANCHO);
  t('3) con poca escala la cuadrícula se hace más gruesa', cuadricula({ escala: 10, ox: 0, oy: 0 }, ANCHO, ALTO).paso >= 1.5 - 1e-9);
  t('3) nunca más líneas del máximo', cuadricula({ escala: 8, ox: 0, oy: 0 }, 5000, 5000).verticales.length <= MAX_LINEAS);
}

// ── 4. Textos: la etiqueta sale del mismo dato que verá el panel (error 1 de E2) ──
t('4) formato de metros con coma', metros(4) === '4' && metros(4.5) === '4,5' && metros(4.25) === '4,25' && metros(0.1 + 0.2) === '0,3' && metros(8.2) === '8,2');
for (const [n, p] of EJEMPLOS) {
  const mods = cargar(p).planta.modulos;
  const coinciden = mods.every(m => {
    const [a, l] = textoMedidas(m).replace(' m', '').split(' × ').map(x => Number(x.replace(',', '.')));
    return near(a, Math.round(m.ancho * 100) / 100) && near(l, Math.round(m.largo * 100) / 100);
  });
  t(`4) ${n}: las medidas de cada etiqueta son exactamente las del módulo`, coinciden);
}
t('4) nombre visible: nombre, si no el tipo, si no el id',
  nombreVisible({ id: 'x', nombre: 'Estudio', x: 0, z: 0, ancho: 1, largo: 1 }) === 'Estudio'
  && nombreVisible({ id: 'x', tipo: 'cocina', x: 0, z: 0, ancho: 1, largo: 1 }) === 'Cocina'
  && nombreVisible({ id: 7 as any, x: 0, z: 0, ancho: 1, largo: 1 }) === '7');
t('4) una etiqueta no se dibuja si no cabe', !etiquetaCabe(30, 30).nombre && etiquetaCabe(80, 30).nombre && !etiquetaCabe(80, 30).medidas && etiquetaCabe(80, 50).medidas);

// ── 5. Colores: tipo de los planos de la IA deducido SOLO para pintar ──
{
  const e = cargar(PLANO_REAL_1);
  const por = Object.fromEntries(e.planta.modulos.map(m => [m.id, tipoVisual(m)]));
  t('5) IA: estancia→sala, cocina, baño, recámara→habitación, lavado→zona',
    por.estancia === 'sala' && por.cocina === 'cocina' && por.bano === 'bano' && por.recamara === 'habitacion' && por.area_lavado === 'zona');
  t('5) deducir el tipo no lo escribe en el plano', e.planta.modulos.every(m => !('tipo' in m)));
  t('5) si el módulo trae tipo, manda el tipo', tipoVisual({ id: 'a', tipo: 'bano', nombre: 'Sala grande', x: 0, z: 0, ancho: 1, largo: 1 }) === 'bano');
  t('5) cada pieza de construcción con su color, gris si no tiene uno (plafón), y cuartos con color propio',
    colorTipo('columna') === '#A8A29E' && colorTipo('hueco') !== colorTipo('pared') && colorTipo('plafon') === '#6B7280' && colorTipo('sala') !== colorTipo('cocina'));
}

// ── 6. Vanos sobre su muro ──
{
  const p = cargar(planoApartamentoSintetico()).planta;
  const mods = modulosDelNivel(p, 0);
  const sobreSuMuro = p.vanos.every(v => {
    const tr = tramoVano(v, mods)!;
    const a = mods.find(m => m.id === v.modulo_a)!;
    const largo = Math.hypot(tr.x1 - tr.x0, tr.z1 - tr.z0);
    const centro = v.lado === 'norte' || v.lado === 'sur' ? (tr.x0 + tr.x1) / 2 : (tr.z0 + tr.z1) / 2;
    const muro = v.lado === 'norte' ? tr.z0 === a.z : v.lado === 'sur' ? tr.z0 === a.z + a.largo : v.lado === 'oeste' ? tr.x0 === a.x : tr.x0 === a.x + a.ancho;
    return near(largo, v.ancho) && near(centro, v.centro) && muro;
  });
  t('6) cada vano del ejemplo cae sobre su muro, con su ancho y su centro', sobreSuMuro && p.vanos.length === 4);
  t('6) un vano de un módulo inexistente no se dibuja', tramoVano({ modulo_a: 'nadie', lado: 'norte', centro: 1, ancho: 1 }, mods) === null);
}

// ── 7. Niveles: solo se dibuja el nivel activo; el resto se conserva ──
{
  const dos: Plano = { niveles: 2, altura_entrepiso: 3, modulos: [
    { id: 1 as any, tipo: 'sala', x: 0, z: 0, ancho: 4, largo: 4, nivel: 0 },
    { id: 2 as any, tipo: 'habitacion', x: 0, z: 0, ancho: 4, largo: 4, nivel: 1 }],
    vanos: [{ modulo_a: 2 as any, lado: 'sur', centro: 2, ancho: 0.9, tipo: 'puerta' }] } as any;
  const p = cargar(dos).planta;
  t('7) nivel 0 muestra solo su espacio', modulosDelNivel(p, 0).length === 1 && modulosDelNivel(p, 0)[0].id === '1');
  t('7) el vano del nivel 1 no aparece en el nivel 0', vanosDelNivel(p, 0).length === 0 && vanosDelNivel(p, 1).length === 1);
  t('7) el resumen cuenta 2 niveles', resumen(p, 0).niveles === 2);
}

// ── 8. Resumen del ejemplo principal ──
{
  const r = resumen(cargar(planoApartamentoSintetico()).planta, 0);
  t('8) apartamento: 5 cuartos (columna y viga no cuentan), 4 vanos', r.espacios === 5 && r.vanos === 4);
  t('8) apartamento: 8 × 8,2 m y 64,1 m² de piso', near(r.ancho, 8) && near(r.largo, 8.2) && near(r.area, 64.1));
}

// ── 9. En un iPhone 15, tras ajustar la vista, los cuartos del ejemplo muestran nombre ──
{
  const p = cargar(planoApartamentoSintetico()).planta;
  const mods = modulosDelNivel(p, 0);
  const v = encuadrar(mods, ANCHO, ALTO);
  const cuartos = mods.filter(m => m.tipo !== 'columna' && m.tipo !== 'viga');
  t('9) apartamento: los 5 cuartos tienen sitio para su nombre', cuartos.every(m => etiquetaCabe(m.ancho * v.escala, m.largo * v.escala).nombre));
  t('9) apartamento: sala, cocina, cuarto y baño también para sus medidas',
    cuartos.filter(m => m.id !== 'pasillo').every(m => etiquetaCabe(m.ancho * v.escala, m.largo * v.escala).medidas));
}

// ── 10. Las cotas generales quedan DENTRO del lienzo tras ajustar la vista ──
//     (en la primera versión el texto de la cota izquierda empezaba ~34 pt fuera de la pantalla)
for (const [n, p] of [...EJEMPLOS, ['muy ancho', { modulos: [{ id: 'a', x: 0, z: 0, ancho: 30, largo: 2 }] }] as [string, Plano],
  ['muy alto', { modulos: [{ id: 'a', x: 0, z: 0, ancho: 2, largo: 30 }] }] as [string, Plano]]) {
  for (const [w, h] of [[393, 600], [320, 460], [430, 700]]) {
    const mods = modulosDelNivel(cargar(p).planta, 0);
    const c = cotasGenerales(encuadrar(mods, w, h), extension(mods)!);
    const dentro = [c.horizontal.cajaTexto, c.vertical.cajaTexto].every(k => k.x0 >= 0 && k.y0 >= 0 && k.x1 <= w && k.y1 <= h);
    t(`10) ${n} en ${w}×${h}: los textos de las cotas caben en el lienzo`, dentro);
  }
}
t('10) la cota muestra el ancho y el largo totales', (() => {
  const mods = modulosDelNivel(cargar(planoApartamentoSintetico()).planta, 0);
  const c = cotasGenerales(encuadrar(mods, 393, 600), extension(mods)!);
  return c.horizontal.texto === '8 m' && c.vertical.texto === '8,2 m';
})());

// ── 11. Zoom con + y − ──
{
  const v: Vista = { escala: 40, ox: 37, oy: -12 };
  const cx = 196.5, cy = 300;
  const antes = aPlano(v, cx, cy);
  const cerca = zoomVista(v, PASO_ZOOM, cx, cy);
  const despues = aPlano(cerca, cx, cy);
  t('11) "+" acerca un 25 %', near(cerca.escala, 50));
  t('11) el punto del centro del lienzo no se mueve al acercar', near(antes.x, despues.x) && near(antes.z, despues.z));
  const vuelta = zoomVista(cerca, 1 / PASO_ZOOM, cx, cy);
  t('11) "−" deshace exactamente el "+"', near(vuelta.escala, v.escala) && near(vuelta.ox, v.ox) && near(vuelta.oy, v.oy));
  let w = v; for (let i = 0; i < 40; i++) w = zoomVista(w, PASO_ZOOM, cx, cy);
  t('11) nunca pasa de la escala máxima, y entonces "+" se apaga', w.escala === ESCALA_MAX && !puedeAcercar(w) && puedeAlejar(w));
  let z = v; for (let i = 0; i < 40; i++) z = zoomVista(z, 1 / PASO_ZOOM, cx, cy);
  t('11) nunca baja de la escala mínima, y entonces "−" se apaga', z.escala === ESCALA_MIN && !puedeAlejar(z) && puedeAcercar(z));
  const quieto = zoomVista(w, PASO_ZOOM, cx, cy);
  t('11) en el tope, otro "+" no desplaza la vista', near(quieto.ox, w.ox) && near(quieto.oy, w.oy));
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
