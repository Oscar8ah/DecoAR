/**
 * P1 · 1a — El editor 2D NO puede arrancar AR.
 * Recorre los `import` estáticos desde index.ts y comprueba que ninguno alcanza Viro ni las escenas
 * AR. La versión anterior (App.tsx) solo puede entrar por el `require` diferido de AppInicio.tsx.
 * Ejecutar:  npx tsx tools/test-sin-ar.ts
 */
declare const require: any;
declare const process: any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

let ok = 0, fail = 0;
const t = (name: string, cond: boolean) => { if (cond) ok++; else { fail++; console.error('✗', name); } };

const RAIZ = path.resolve(__dirname, '..');
const resolver = (desde: string, spec: string): string | null => {
  const base = path.resolve(path.dirname(desde), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')])
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
// Solo `import … from '…'` y `export … from '…'` (estáticos). Un require dentro de una función no cuenta.
const importsDe = (codigo: string) => [...codigo.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gms)].map(m => m[1]);

function grafo(entrada: string) {
  const archivos = new Set<string>(), externos = new Set<string>();
  const pendientes = [entrada];
  while (pendientes.length) {
    const f = pendientes.pop()!;
    if (archivos.has(f)) continue;
    archivos.add(f);
    for (const spec of importsDe(fs.readFileSync(f, 'utf8'))) {
      if (spec.startsWith('.')) { const r = resolver(f, spec); if (r) pendientes.push(r); else externos.add(`(sin resolver) ${spec}`); }
      else externos.add(spec);
    }
  }
  return { archivos: [...archivos].map(a => path.relative(RAIZ, a).split(path.sep).join('/')), externos: [...externos] };
}

const g = grafo(path.join(RAIZ, 'index.ts'));
const PROHIBIDOS = ['App.tsx', 'components/ar/MaquetaScene.tsx', 'components/ar/RoomScanScene.tsx', 'components/ar/EditorMesa.tsx',
  'components/ar/FloorScanScene.tsx', 'components/plan/EditorPanel.tsx', 'components/perf/usePerformance.ts'];

t('index.ts arranca AppInicio', g.archivos.includes('AppInicio.tsx'));
t('ningún import estático alcanza @reactvision/react-viro', !g.externos.some(e => e.includes('react-viro')));
for (const p of PROHIBIDOS) t(`no se carga al abrir: ${p}`, !g.archivos.includes(p));
t('todos los imports relativos se resuelven', !g.externos.some(e => e.startsWith('(sin resolver)')));
t('el editor reutiliza el modelo y el reductor existentes',
  ['components/plan/planEditor.ts', 'components/plan/planModel.ts'].every(f => g.archivos.includes(f)));

const inicio = fs.readFileSync(path.join(RAIZ, 'AppInicio.tsx'), 'utf8');
t('la versión anterior entra solo por require diferido', /function ARAnterior[\s\S]*require\('\.\/App'\)/.test(inicio));
t('App.tsx sigue existiendo (E2 no se elimina)', fs.existsSync(path.join(RAIZ, 'App.tsx')));
const anterior = grafo(path.join(RAIZ, 'App.tsx'));
t('App.tsx sigue usando MaquetaScene y RoomScanScene (E2 intacto)',
  anterior.archivos.includes('components/ar/MaquetaScene.tsx') && anterior.archivos.includes('components/ar/RoomScanScene.tsx'));

// ── Entrega 2: vista 3D sin AR y maqueta en AR ──
const PANTALLAS_VIRO = ['components/vista3d/Vista3DScreen.tsx', 'components/vista3d/Escena3D.tsx', 'components/vista3d/MaquetaARScreen.tsx'];
for (const f of PANTALLAS_VIRO) t(`E2: no se carga al abrir: ${f}`, !g.archivos.includes(f));
t('E2: la vista 3D y la AR entran solo por require diferido, cada una en su etapa',
  /etapa === 'revision3d'[\s\S]*?require\('\.\/components\/vista3d\/Vista3DScreen'\)/.test(inicio)
  && /etapa === 'maqueta3dAR'[\s\S]*?require\('\.\/components\/vista3d\/MaquetaARScreen'\)/.test(inicio));
const vista3d = grafo(path.join(RAIZ, 'components/vista3d/Vista3DScreen.tsx'));
const textoVista3d = vista3d.archivos.map((f: string) => fs.readFileSync(path.join(RAIZ, f), 'utf8')).join('\n');
t('E2: la vista 3D no abre sesión AR (ningún componente ViroAR*)', !/\bViroAR[A-Za-z]*/.test(textoVista3d));
t('E2: la vista 3D no carga la escena AR de la mesa ni la versión anterior',
  !['components/ar/MaquetaScene.tsx', 'components/ar/RoomScanScene.tsx', 'App.tsx'].some(f => vista3d.archivos.includes(f)));
t('E2: la vista 3D usa el navegador 3D sin AR y la geometría existente',
  /Viro3DSceneNavigator/.test(textoVista3d) && vista3d.archivos.includes('components/plan/planGeometry.ts'));
const ar = grafo(path.join(RAIZ, 'components/vista3d/MaquetaARScreen.tsx'));
const textoAR = fs.readFileSync(path.join(RAIZ, 'components/vista3d/MaquetaARScreen.tsx'), 'utf8');
t('E2: la pantalla AR reutiliza MaquetaScene (no la reimplementa)', ar.archivos.includes('components/ar/MaquetaScene.tsx'));
t('E2: le pasa las mismas propiedades que App.tsx (plano, escala, recolocar, información)',
  ['plano', 'escalaMaqueta: ESCALA_MAQUETA', 'maquetaResetTick', 'onMaquetaInfo'].every(k => textoAR.includes(k)));
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
t('E2: sin dependencias nuevas', Object.keys(paquete.dependencies).sort().join() ===
  '@reactvision/react-viro,expo,expo-build-properties,expo-dev-client,expo-device,expo-status-bar,react,react-native');

const lienzo = fs.readFileSync(path.join(RAIZ, 'components/editor2d/LienzoPlanta.tsx'), 'utf8');
t('Lienzo: sigue dibujando todas sus capas (cuadrícula, referencia, espacios, etiquetas, vanos, "+", cotas, asa)',
  ['red.verticales', 'referencia ?? []', 'ordenados.map', 'etiquetaCabe', 'vanosDelNivel(planta, nivel).map', 'botonesMas(planta, nivel).map', '<Cotas', 'posicionAsa(vista, m)']
    .every(k => lienzo.includes(k)));

console.log(`   módulos que se cargan al abrir: ${g.archivos.length}; paquetes externos: ${g.externos.sort().join(', ')}`);
console.log(`\n${ok} pruebas OK, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
