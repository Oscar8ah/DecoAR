/**
 * Pantalla del editor de plano 2D — Etapa 1, entrega 1a.
 *   · Sin cámara ni AR: este archivo y todo lo que importa son React Native puro.
 *   · Lienzo de SOLO LECTURA con un ejemplo y la acción "Ajustar vista".
 *   · "+ Espacio" y "Revisar plano" se ven en su sitio definitivo pero aún no actúan:
 *     se activan en la entrega 1b y en la Etapa 2, respectivamente.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { EditorPlanta } from '../plan/planEditor';
import LienzoPlanta from './LienzoPlanta';
import { Vista, encuadrar, metros, modulosDelNivel, resumen } from './vistaLienzo';
import { T } from './paleta';

interface Props {
  editor: EditorPlanta;
  nombreEjemplo: string;
  onOtroEjemplo: () => void;
  onAbrirARAnterior: () => void;
}

/**
 * Márgenes seguros. SafeAreaView de React Native 0.86 está marcado como obsoleto y su sustituto
 * (react-native-safe-area-context) sería una dependencia nueva, así que en 1a se usan los márgenes
 * de los iPhone con isla o muesca (alto ≥ 812 pt) y unos mínimos para los demás.
 */
function usarMargenes() {
  const { height } = useWindowDimensions();
  if (Platform.OS !== 'ios') return { arriba: 28, abajo: 12 };
  return height >= 812 ? { arriba: 59, abajo: 30 } : { arriba: 22, abajo: 10 };
}

export default function EditorPlanoScreen({ editor, nombreEjemplo, onOtroEjemplo, onAbrirARAnterior }: Props) {
  const m = usarMargenes();
  const nivel = editor.nivelActivo;
  const [lienzo, setLienzo] = useState({ ancho: 0, alto: 0 });
  const [vista, setVista] = useState<Vista | null>(null);
  const [menu, setMenu] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ajustarVista = useCallback(() => {
    if (lienzo.ancho > 0) setVista(encuadrar(modulosDelNivel(editor.planta, nivel), lienzo.ancho, lienzo.alto));
  }, [editor.planta, nivel, lienzo]);

  // Al abrir, al girar el teléfono o al cargar otro ejemplo, el plano se encuadra solo.
  useEffect(() => { ajustarVista(); }, [lienzo.ancho, lienzo.alto, editor.planta]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (reloj.current) clearTimeout(reloj.current); }, []);
  const avisar = (texto: string) => {
    setAviso(texto);
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => setAviso(null), 2600);
  };

  const alMedir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (Math.abs(width - lienzo.ancho) > 0.5 || Math.abs(height - lienzo.alto) > 0.5) setLienzo({ ancho: width, alto: height });
  };

  const r = resumen(editor.planta, nivel);
  const linea1 = r.espacios === 1 ? '1 espacio' : `${r.espacios} espacios`;
  const linea2 = r.espacios ? `${metros(r.ancho)} × ${metros(r.largo)} m en total, ${metros(r.area)} m² de piso` : 'Plano vacío';

  return (
    <View style={[s.pantalla, { paddingTop: m.arriba }]}>
      {/* Cabecera: qué plano es y cuánto mide */}
      <View style={s.cabecera}>
        <View style={s.cabeceraTexto}>
          <Text style={s.titulo} numberOfLines={1}>{nombreEjemplo}</Text>
          <Text style={s.subtitulo} numberOfLines={1}>{linea1}, {linea2}</Text>
          {r.niveles > 1 && (
            <Text style={s.subtitulo} numberOfLines={1}>Nivel {nivel + 1} de {r.niveles}. Los demás niveles se conservan sin cambios.</Text>
          )}
        </View>
        <Pressable style={s.botonMenu} onPress={() => setMenu(v => !v)} accessibilityLabel="Más opciones" hitSlop={8}>
          <Text style={s.botonMenuTexto}>⋯</Text>
        </Pressable>
      </View>

      {/* Lienzo */}
      <View style={s.zonaLienzo} onLayout={alMedir}>
        {vista && lienzo.ancho > 0 && (
          <LienzoPlanta planta={editor.planta} nivel={nivel} vista={vista} ancho={lienzo.ancho} alto={lienzo.alto} />
        )}
      </View>

      {aviso && <View style={s.aviso}><Text style={s.avisoTexto}>{aviso}</Text></View>}

      {/* Barra inferior: tres acciones, siempre visibles */}
      <View style={[s.barra, { paddingBottom: m.abajo }]}>
        <Boton texto="+ Espacio" inactivo onPress={() => avisar('Agregar espacios llega en la siguiente entrega.')} />
        <Boton texto="Ajustar vista" onPress={ajustarVista} />
        <Boton texto="Revisar plano" principal inactivo onPress={() => avisar('La revisión del plano llega después del editor.')} />
      </View>

      {menu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="Cerrar menú" />
          <View style={[s.menu, { top: m.arriba + 52 }]}>
            <Pressable style={s.opcion} onPress={() => { setMenu(false); onOtroEjemplo(); }}>
              <Text style={s.opcionTexto}>Cargar otro ejemplo</Text>
            </Pressable>
            <View style={s.separador} />
            <Pressable style={s.opcion} onPress={() => { setMenu(false); onAbrirARAnterior(); }}>
              <Text style={s.opcionTexto}>AR versión anterior</Text>
              <Text style={s.opcionNota}>Abre la cámara con el editor sobre la mesa</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Boton({ texto, onPress, principal, inactivo }: { texto: string; onPress: () => void; principal?: boolean; inactivo?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactivo }}
      style={({ pressed }) => [s.boton, principal && s.botonPrincipal, inactivo && s.botonInactivo, pressed && s.botonPulsado]}>
      <Text style={[s.botonTexto, inactivo && s.botonTextoInactivo]} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: T.panel },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12 },
  cabeceraTexto: { flex: 1, paddingRight: 12 },
  titulo: { color: T.texto, fontSize: 20, fontWeight: '700' },
  subtitulo: { color: T.textoSuave, fontSize: 13, marginTop: 3, fontVariant: ['tabular-nums'] },
  botonMenu: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.boton, alignItems: 'center', justifyContent: 'center' },
  botonMenuTexto: { color: T.texto, fontSize: 22, marginTop: -4 },
  zonaLienzo: { flex: 1, backgroundColor: T.fondo },
  aviso: { position: 'absolute', left: 18, right: 18, bottom: 110, backgroundColor: '#2A3145', borderRadius: 12, padding: 12 },
  avisoTexto: { color: T.texto, fontSize: 14, textAlign: 'center' },
  barra: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingTop: 12, backgroundColor: T.panel },
  boton: { flex: 1, minHeight: 50, borderRadius: 14, backgroundColor: T.boton, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  botonPrincipal: { backgroundColor: T.acento },
  botonInactivo: { opacity: 0.45 },
  botonPulsado: { opacity: 0.7 },
  botonTexto: { color: T.texto, fontSize: 15, fontWeight: '600' },
  botonTextoInactivo: { color: T.texto },
  menu: { position: 'absolute', right: 14, width: 260, backgroundColor: '#20263A', borderRadius: 14, paddingVertical: 6 },
  opcion: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  opcionTexto: { color: T.texto, fontSize: 16 },
  opcionNota: { color: T.textoSuave, fontSize: 12.5, marginTop: 3 },
  separador: { height: StyleSheet.hairlineWidth, backgroundColor: '#39415A', marginHorizontal: 12 },
});
