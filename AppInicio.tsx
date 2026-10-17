/**
 * DecoAR — Raíz de la app (P1, Etapa 1: entregas 1a y 1b-1).
 * ------------------------------------------------------------------
 * Flujo acordado, con UN SOLO proyecto de principio a fin:
 *
 *   editor2d  →  plano2dAR  →  revision3d  →  maqueta3dAR
 *   (sin AR)     (AR, mesa)    (sin AR)       (AR, mesa)
 *
 * Por ahora solo existe 'editor2d'. Las otras etapas se añadirán aquí, una por entrega, leyendo el
 * MISMO `editor` (EditorPlanta + reducirEditor de planEditor.ts): ninguna crea su propia copia.
 *
 * AR: este archivo y el editor NO importan Viro. La versión anterior (App.tsx: escaneo, Dibujar y
 * el editor E2 sobre la mesa) se carga con `require` diferido SOLO al elegir "AR versión anterior";
 * hasta entonces no se evalúa su código, no se pide la cámara y no arranca ninguna sesión AR.
 */
import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AccionEditor, EditorPlanta, editorVacio, reducirEditor } from './components/plan/planEditor';
import { Plano, planoApartamentoSintetico, planoDemo } from './components/plan/planModel';
import { PLANO_REAL_1, PLANO_REAL_2 } from './components/plan/planosReales';
import EditorPlanoScreen from './components/editor2d/EditorPlanoScreen';

/** Etapas del flujo P1. Solo 'editor2d' está implementada. */
export type Etapa = 'editor2d' | 'plano2dAR' | 'revision3d' | 'maqueta3dAR';
type Pantalla = { tipo: 'flujo'; etapa: Etapa } | { tipo: 'arAnterior' };

/** Ejemplos del menú ⋯. Los mismos de la versión anterior (App.tsx). */
export const EJEMPLOS: { nombre: string; crear: () => Plano }[] = [
  { nombre: 'Apartamento de prueba', crear: () => planoApartamentoSintetico() },
  { nombre: 'Sala', crear: () => planoDemo(4, 3, 2.5) },
  { nombre: 'Plano real 1', crear: () => PLANO_REAL_1 },
  { nombre: 'Plano real 2', crear: () => PLANO_REAL_2 },
];

const conEjemplo = (i: number): EditorPlanta =>
  reducirEditor(editorVacio(), { type: 'cargarPlano', plano: EJEMPLOS[i].crear() });

export default function AppInicio() {
  const [pantalla, setPantalla] = useState<Pantalla>({ tipo: 'flujo', etapa: 'editor2d' });
  // El proyecto: vive aquí, por encima de todas las etapas, para que pasar de una a otra no lo pierda.
  // Se empieza con un plano VACÍO: la idea es que cada persona diseñe el suyo; los ejemplos están en ⋯.
  const [editor, setEditor] = useState<EditorPlanta>(() => editorVacio());
  const [titulo, setTitulo] = useState('Mi plano');
  const [ejemplo, setEjemplo] = useState(-1);
  const [claveEncuadre, setClaveEncuadre] = useState(0);
  // Estable (no cambia entre renders): los gestos del lienzo la guardan una sola vez.
  const despachar = useCallback((a: AccionEditor) => setEditor(e => reducirEditor(e, a)), []);

  const planoNuevo = () => { setEditor(editorVacio()); setTitulo('Mi plano'); setClaveEncuadre(k => k + 1); };
  const otroEjemplo = () => {
    const i = (ejemplo + 1) % EJEMPLOS.length;
    setEjemplo(i);
    setEditor(conEjemplo(i));
    setTitulo(EJEMPLOS[i].nombre);
    setClaveEncuadre(k => k + 1);
  };

  // Al volver de la versión anterior, el editor sigue con el mismo plano: su estado vive aquí.
  if (pantalla.tipo === 'arAnterior') return <ARAnterior onVolver={() => setPantalla({ tipo: 'flujo', etapa: 'editor2d' })} />;

  return (
    <>
      <StatusBar style="light" />
      <EditorPlanoScreen
        editor={editor}
        despachar={despachar}
        titulo={titulo}
        claveEncuadre={claveEncuadre}
        onPlanoNuevo={planoNuevo}
        onOtroEjemplo={otroEjemplo}
        onAbrirARAnterior={() => setPantalla({ tipo: 'arAnterior' })}
      />
    </>
  );
}

/**
 * La app anterior, intacta. `require` dentro de la función: Metro no ejecuta App.tsx (ni Viro)
 * hasta este momento. Al volver se desmonta y su sesión AR termina con ella.
 */
function ARAnterior({ onVolver }: { onVolver: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AppAnterior: React.ComponentType = require('./App').default;
  const { height } = useWindowDimensions();
  return (
    <View style={s.lleno}>
      <AppAnterior />
      <Pressable style={[s.volver, { top: height >= 812 ? 54 : 18 }]} onPress={onVolver} hitSlop={10} accessibilityLabel="Volver al editor de plano">
        <Text style={s.volverTexto}>‹ Editor</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  lleno: { flex: 1 },
  volver: { position: 'absolute', left: 14, backgroundColor: '#000000AA', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8 },
  volverTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
