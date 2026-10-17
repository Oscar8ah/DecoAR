/**
 * Selector de pisos del catálogo REAL de las tiendas (entrega 1b-5). Lógica en catalogoPisos.ts.
 * Estados: cargando, error (con Reintentar), sin configuración (.env.local), catálogo vacío,
 * producto sin imagen (se ve, pero no se puede aplicar: no hay qué mostrar ni qué guardar en imagen_piso).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { AVISO_PISO_3D, PisoCatalogo, ResultadoCatalogo, cargarPisos, leerConfig, precioTexto } from './catalogoPisos';
import { T } from './paleta';

/** Se conserva mientras la app está abierta: abrir el selector otra vez no vuelve a descargar. */
let enMemoria: ResultadoCatalogo | null = null;

interface Props {
  nombreEspacio: string;
  pisoActual: string | null | undefined;     // imagen_piso del espacio
  onElegir: (imagenUrl: string) => void;
  onQuitar: () => void;
  onCerrar: () => void;
}

export default function SelectorPisos({ nombreEspacio, pisoActual, onElegir, onQuitar, onCerrar }: Props) {
  const { height } = useWindowDimensions();
  const [resultado, setResultado] = useState<ResultadoCatalogo | null>(enMemoria);
  const cargar = () => {
    setResultado(null);
    // Expo inserta estas dos variables de .env.local al empaquetar (deben escribirse así, literalmente).
    const config = leerConfig(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
    cargarPisos(fetch as never, config).then(r => { if (r.estado !== 'error') enMemoria = r; setResultado(r); });
  };
  useEffect(() => { if (!enMemoria) cargar(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[s.hoja, { maxHeight: Math.round(height * 0.72) }]}>
      <View style={s.cabecera}>
        <View style={s.flex}>
          <Text style={s.titulo}>Pisos de las tiendas</Text>
          <Text style={s.sub} numberOfLines={1}>Para {nombreEspacio}</Text>
        </View>
        <Pressable style={s.cerrar} onPress={onCerrar} accessibilityRole="button" hitSlop={6}><Text style={s.cerrarTexto}>Cerrar</Text></Pressable>
      </View>

      {!resultado && <View style={s.centro}><ActivityIndicator color={T.texto} /><Text style={s.nota}>Cargando el catálogo…</Text></View>}

      {resultado?.estado === 'sin-config' && (
        <View style={s.centro}>
          <Text style={s.notaFuerte}>Falta configurar el catálogo en este equipo.</Text>
          <Text style={s.nota}>Crea el archivo .env.local en la carpeta de DecoAR con EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY, y reinicia npx expo start.</Text>
        </View>
      )}

      {resultado?.estado === 'error' && (
        <View style={s.centro}>
          <Text style={s.notaFuerte}>{resultado.mensaje}</Text>
          <Pressable style={s.boton} onPress={cargar} accessibilityRole="button"><Text style={s.botonTexto}>Reintentar</Text></Pressable>
        </View>
      )}

      {resultado?.estado === 'ok' && !resultado.pisos.length && (
        <View style={s.centro}><Text style={s.notaFuerte}>Las tiendas todavía no tienen pisos publicados.</Text></View>
      )}

      {resultado?.estado === 'ok' && resultado.pisos.length > 0 && (
        <ScrollView contentContainerStyle={s.rejilla}>
          {resultado.pisos.map(p => <Tarjeta key={p.id} piso={p} actual={!!pisoActual && p.imagenUrl === pisoActual} onElegir={onElegir} />)}
        </ScrollView>
      )}

      <View style={s.pie}>
        {pisoActual ? (
          <Pressable style={s.quitar} onPress={onQuitar} accessibilityRole="button"><Text style={s.quitarTexto}>Quitar el piso de este espacio</Text></Pressable>
        ) : null}
        <Text style={s.notaPie}>{AVISO_PISO_3D}</Text>
      </View>
    </View>
  );
}

function Tarjeta({ piso, actual, onElegir }: { piso: PisoCatalogo; actual: boolean; onElegir: (u: string) => void }) {
  const [falla, setFalla] = useState(false);
  const sinImagen = !piso.imagenUrl;
  return (
    <Pressable disabled={sinImagen} onPress={() => piso.imagenUrl && onElegir(piso.imagenUrl)} accessibilityRole="button"
      accessibilityState={{ disabled: sinImagen, selected: actual }}
      style={({ pressed }) => [s.tarjeta, actual && s.tarjetaActual, sinImagen && s.inactiva, pressed && s.pulsado]}>
      {piso.imagenUrl && !falla
        ? <Image source={{ uri: piso.imagenUrl }} style={s.foto} resizeMode="cover" onError={() => setFalla(true)} />
        : <View style={[s.foto, s.sinFoto]}><Text style={s.sinFotoTexto}>{sinImagen ? 'Sin imagen' : 'Imagen no disponible'}</Text></View>}
      <Text style={s.nombre} numberOfLines={2}>{piso.nombre}</Text>
      {precioTexto(piso) && <Text style={s.precio}>{precioTexto(piso)}</Text>}
      {sinImagen && <Text style={s.aviso}>No se puede aplicar sin imagen</Text>}
      {actual && <Text style={s.actual}>En este espacio</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  hoja: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1A1F2D', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 14, borderTopWidth: 1, borderColor: '#39415A' },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
  flex: { flex: 1 },
  titulo: { color: T.texto, fontSize: 18, fontWeight: '700' },
  sub: { color: T.textoSuave, fontSize: 13, marginTop: 2 },
  cerrar: { minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: T.boton, justifyContent: 'center' },
  cerrarTexto: { color: T.texto, fontSize: 15, fontWeight: '600' },
  centro: { alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 28 },
  nota: { color: T.textoSuave, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  notaFuerte: { color: T.texto, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  boton: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: T.acento, justifyContent: 'center' },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 14, paddingBottom: 10 },
  tarjeta: { width: '48%', backgroundColor: T.boton, borderRadius: 14, padding: 8, borderWidth: 2, borderColor: 'transparent' },
  tarjetaActual: { borderColor: T.acento },
  inactiva: { opacity: 0.55 },
  pulsado: { opacity: 0.7 },
  foto: { width: '100%', aspectRatio: 1.4, borderRadius: 10, backgroundColor: '#2C3348' },
  sinFoto: { alignItems: 'center', justifyContent: 'center' },
  sinFotoTexto: { color: T.textoSuave, fontSize: 13 },
  nombre: { color: T.texto, fontSize: 14, fontWeight: '600', marginTop: 6 },
  precio: { color: T.textoSuave, fontSize: 12.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  aviso: { color: '#FCD34D', fontSize: 12, marginTop: 3 },
  actual: { color: '#C4B5FD', fontSize: 12, marginTop: 3, fontWeight: '700' },
  pie: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 26, gap: 8 },
  quitar: { minHeight: 44, borderRadius: 12, backgroundColor: '#3A2228', alignItems: 'center', justifyContent: 'center' },
  quitarTexto: { color: '#FCA5A5', fontSize: 15, fontWeight: '600' },
  notaPie: { color: T.textoSuave, fontSize: 12, textAlign: 'center' },
});
