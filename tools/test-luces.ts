/**
 * Entrega 3c — Iluminación de la vista 3D (lógica pura frente a los valores de la web).
 * La luz real en pantalla se valida en el iPhone. Ejecutar:  npx tsx tools/test-luces.ts
 */
import { editorVacio, reducirEditor, AccionEditor, EditorPlanta, planoDe } from '../components/plan/planEditor';
import { generarMaqueta } from '../components/plan/planGeometry';
import { objetoPorId, medidasObjeto } from '../components/objetos/catalogoObjetos';
import { centradoMaqueta } from '../components/objetos/objetos3d';
import { Ambiente, AMBIENTES, COLORES_AMBIENTE, ESCALA_VIRO, INTENSIDAD_DEF, MAX_LUMINARIAS, lucesEscena, limitarIntensidad } from '../components/vista3d/luces3d';

declare const require: any;
declare const process: any;
declare const __dirname: string;
const fs = require('fs');
let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
const run = (e: EditorPlanta, ...as: AccionEditor[]) => as.reduce(reducirEditor, e);
const sala = () => run(editorVacio(), { type: 'agregarModulo', tipo: 'sala', x: 0, z: 0 }, { type: 'fijarDimension', id: 'm1', campo: 'ancho', valor: 6 },
  { type: 'seleccionar', seleccion: null });
const con = (e: EditorPlanta, tipo: string, x: number, z: number) => run(e, { type: 'agregarMueble', tipo, x, z, ...medidasObjeto(objetoPorId(tipo)!) });
const luces = (e: EditorPlanta, amb: Ambiente = 'dia', i = INTENSIDAD_DEF, hasta: number | null = null) => {
  const p = planoDe(e.planta); return lucesEscena(amb, i, p, generarMaqueta(p).extension, e.planta.muebles, hasta);
};

// ── 1. Los cuatro ambientes de la web ──
t('1) día, noche, cálida y fría', AMBIENTES.map(a => a.valor).join() === 'dia,noche,calida,fria');
t('1) colores exactos de cambiarTipoLuz (visor3d.js:3094)',
  COLORES_AMBIENTE.dia.a === '#FFFFFF' && COLORES_AMBIENTE.noche.a === '#1A1A3A' && COLORES_AMBIENTE.noche.d === '#4444FF' && COLORES_AMBIENTE.noche.p === '#FFAA44'
  && COLORES_AMBIENTE.calida.d === '#FFB347' && COLORES_AMBIENTE.calida.p === '#FF8C00' && COLORES_AMBIENTE.fria.d === '#ADD8E6' && COLORES_AMBIENTE.fria.p === '#E0F0FF');
for (const a of AMBIENTES) {
  const l = luces(sala(), a.valor);
  t(`1) ${a.etiqueta}: el ambiente, el sol y la puntual llevan su color`, l.ambientes[0].color === COLORES_AMBIENTE[a.valor].a
    && l.direccionales[0].color === COLORES_AMBIENTE[a.valor].d && l.puntuales[0].color === COLORES_AMBIENTE[a.valor].p);
}
t('1) el cielo y el relleno no cambian de color con el tipo (como la web)', luces(sala(), 'noche').ambientes[1].color === '#E8F0FF' && luces(sala(), 'calida').direccionales[1].color === '#CCDDFF');

// ── 2. Intensidad ──
{
  const l = luces(sala(), 'dia', 0.7), K = ESCALA_VIRO;
  t('2) coeficientes de configurarLuces × intensidad (0,14 · 0,55 · 1,1 · 0,25 · 0,5)',
    near(l.ambientes[0].intensidad, 0.14 * 0.7 * K) && near(l.ambientes[1].intensidad, 0.55 * 0.7 * K) && near(l.direccionales[0].intensidad, 1.1 * 0.7 * K)
    && near(l.direccionales[1].intensidad, 0.25 * 0.7 * K) && near(l.puntuales[0].intensidad, 0.5 * 0.7 * K));
  const doble = luces(sala(), 'dia', 1), mitad = luces(sala(), 'dia', 0.35);
  t('2) todo escala junto: 35 % es la mitad de 70 %', near(mitad.direccionales[0].intensidad * 2, l.direccionales[0].intensidad) && doble.direccionales[0].intensidad > l.direccionales[0].intensidad);
  t('2) rango 10–100 % como la web', limitarIntensidad(0) === 0.1 && limitarIntensidad(5) === 1 && INTENSIDAD_DEF === 0.7);
  t('2) calibración: al 70 % la escena queda como la validada (ambiente ≈ 420, sol ≈ 650)',
    Math.abs((l.ambientes[0].intensidad + l.ambientes[1].intensidad) - 420) < 15 && Math.abs(l.direccionales[0].intensidad - 650) < 20);
  t('2) el sol viene de arriba', l.direccionales.every(d => d.direccion[1] < 0 && near(Math.hypot(...d.direccion), 1)));
}

// ── 3. Luminarias ──
{
  const e = con(sala(), 'lampara_pie', 1, 2);
  const p = planoDe(e.planta), off = centradoMaqueta(p);
  const lamp = luces(e).puntuales.find(x => x.origen === 'lampara_pie')!;
  t('3) la lámpara de pie ilumina, con la luz de la web (0xFFF5D0, 0,5, 4 m)', !!lamp && lamp.color === '#FFF5D0' && near(lamp.intensidad, 0.5 * ESCALA_VIRO) && lamp.alcance === 4);
  t('3) en su sitio: x, z del objeto y 1,6 m de alto (la bombilla)', near(lamp.pos[0], 1 - off.x) && near(lamp.pos[2], 2 - off.z) && near(lamp.pos[1], 1.6));
  const girada = run(e, { type: 'girarMueble', id: e.planta.muebles![0].id });
  t('3) girar la lámpara no mueve su luz (está en su eje)', JSON.stringify(luces(girada).puntuales.find(x => x.origen === 'lampara_pie')!.pos) === JSON.stringify(lamp.pos));
  const techo = luces(con(sala(), 'luz_techo', 3, 2)).puntuales.find(x => x.origen === 'luz_techo')!;
  t('3) la luz de techo también ilumina (añadido de DecoAR) bajo el techo: 2,6 − 0,1 − 0,15', !!techo && near(techo.pos[1], 2.35));
  t('3) un sofá no ilumina', luces(con(sala(), 'sofa', 2, 2)).puntuales.length === 1);
  let muchas = sala(); for (let k = 0; k < 6; k++) muchas = con(muchas, 'lampara_pie', 0.5 + k * 0.8, 1);
  const lm = luces(muchas);
  t(`3) como máximo ${MAX_LUMINARIAS} luminarias encendidas, y se informa cuántas quedan sin luz`,
    lm.puntuales.filter(x => x.origen !== 'escena').length === MAX_LUMINARIAS && lm.apagadas === 2);
  const dosPisos = con(run(sala(), { type: 'agregarNivel' }, { type: 'agregarModulo', tipo: 'habitacion', x: 0, z: 0 }), 'lampara_pie', 1, 1);
  t('3) "hasta el piso 1" apaga las luminarias del piso 2', luces(dosPisos, 'dia', 0.7, 0).puntuales.length === 1 && luces(dosPisos, 'dia', 0.7, 1).puntuales.length === 2);
  t('3) la del piso 2 está 2,80 m más arriba', near(luces(dosPisos).puntuales.find(x => x.origen === 'lampara_pie')!.pos[1], 2.8 + 1.6));
}

// ── 4. La escena usa estas luces ──
{
  const escena = fs.readFileSync(require('path').resolve(__dirname, '../components/vista3d/Escena3D.tsx'), 'utf8');
  t('4) Escena3D dibuja ambientes, direccionales y puntuales (ViroOmniLight) de luces3d',
    /luces\.ambientes\.map/.test(escena) && /luces\.direccionales\.map/.test(escena) && /ViroOmniLight/.test(escena) && /luces\?\.puntuales\.map/.test(escena));
}

console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
