/**
 * Maqueta 3D en AR (Entrega 2). Monta la escena EXISTENTE components/ar/MaquetaScene.tsx, sin
 * modificarla, como lo hace App.tsx (E2): ViroARSceneNavigator + viroAppProps. MaquetaScene ya resuelve
 * la detección de la mesa, el toque para colocar, la escala 1:20 y la sombra; aquí no se reimplementa nada.
 *
 * AppInicio la carga con require diferido: la cámara solo se activa al entrar aquí. Al volver, el
 * navegador se desmonta y la sesión AR termina con él (nunca hay dos sesiones: solo una pantalla a la vez).
 */
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import MaquetaScene, { ESCALA_MAQUETA } from '../ar/MaquetaScene';
import type { Plano } from '../plan/planModel';
import type { Mueble } from '../plan/planEditor';
import { contenidoConObjetos } from './contenidoMesaAR';

interface Props { plano: Plano; onVolver: () => void; /** Objetos del editor: si hay, se dibujan sobre la mesa con la maqueta. */ muebles?: Mueble[] }

/** Si Viro falla al iniciar la sesión AR, se ofrece volver en vez de dejar la pantalla en blanco. */
class Protegido extends React.Component<{ onVolver: () => void; children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { error: e instanceof Error ? e.message : String(e) }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={s.error}>
        <Text style={s.errorTitulo}>No se pudo abrir la realidad aumentada</Text>
        <Text style={s.errorTexto}>{this.state.error}</Text>
        <Pressable style={s.boton} onPress={this.props.onVolver}><Text style={s.botonTexto}>‹ Volver a 3D</Text></Pressable>
      </View>
    );
  }
}

export default function MaquetaARScreen({ plano, onVolver, muebles }: Props) {
  const { height } = useWindowDimensions();
  const arriba = Platform.OS === 'ios' ? (height >= 812 ? 54 : 18) : 24;
  const [info, setInfo] = useState<string | null>(null);
  const [reinicio, setReinicio] = useState(0);
  // Mismas propiedades que App.tsx le pasa a MaquetaScene sin contenido editable (App.tsx:155-158):
  // la escena dibuja la maqueta del `plano` como siempre.
  // Con objetos, se usa la entrada existente `contenidoMesa` de MaquetaScene (maqueta + objetos); sin objetos,
  // nada cambia respecto a la Entrega 2.
  const contenido = useMemo(() => ((muebles ?? []).length ? contenidoConObjetos(plano, muebles!) : undefined), [plano, muebles]);
  const appProps = useMemo(() => ({
    plano, escalaMaqueta: ESCALA_MAQUETA, maquetaResetTick: reinicio, onMaquetaInfo: setInfo,
    ...(contenido ? { contenidoMesa: contenido } : {}),
  }), [plano, reinicio, contenido]);

  return (
    <View style={s.lleno}>
      <Protegido onVolver={onVolver}>
        <ViroARSceneNavigator style={s.lleno} initialScene={{ scene: MaquetaScene as any }} viroAppProps={appProps} />
      </Protegido>
      <View style={[s.arriba, { top: arriba }]} pointerEvents="box-none">
        <Pressable style={s.boton} onPress={onVolver} accessibilityRole="button" hitSlop={8}><Text style={s.botonTexto}>‹ 3D</Text></Pressable>
        {info ? <View style={s.info}><Text style={s.infoTexto}>{info}</Text></View> : null}
      </View>
      <View style={s.abajo} pointerEvents="box-none">
        <Pressable style={s.boton} onPress={() => setReinicio(t => t + 1)} accessibilityRole="button"><Text style={s.botonTexto}>Recolocar</Text></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  lleno: { flex: 1, backgroundColor: '#000000' },
  arriba: { position: 'absolute', left: 14, right: 14, gap: 10 },
  abajo: { position: 'absolute', left: 0, right: 0, bottom: 40, alignItems: 'center' },
  boton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: '#000000AA', justifyContent: 'center' },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  info: { backgroundColor: '#000000AA', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  infoTexto: { color: '#FFFFFF', fontSize: 14 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28, backgroundColor: '#161A25' },
  errorTitulo: { color: '#E8EBF3', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  errorTexto: { color: '#98A1B7', fontSize: 13, textAlign: 'center' },
});
