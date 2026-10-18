/**
 * Panel del vano seleccionado (entregas 1b-3 y 1b-3b).
 *   Compacto:   qué es, entre qué espacios está, su ancho, Borrar, Arco / Vano / Puerta, "Ajustes".
 *   Desplegado: ancho (con "Puerta 0,9 m" y "Toda la pared"), posición en el muro (con "Centrar"),
 *               alto del hueco (vano y puerta) y, si es puerta, tipo, bisagra, sentido y apertura.
 * Todo cambio es una acción existente del reductor (actualizarVano, moverVano, borrarVano); cada
 * deslizamiento completo va entre iniciarGesto y terminarGesto: un solo paso de deshacer.
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { AccionEditor, VanoConEstilo } from '../plan/planEditor';
import { VENTANA, rangosVentana } from '../plan/planEditor';
import type { Vano } from '../plan/planModel';
import { Deslizador, PosicionEnMuro } from './Deslizador';
import {
  ALTO_MAX, ALTO_MIN, AVISO_HOJA_3D, DESCRIPCION, ESTILOS_PUERTA, PASO_ALTO, PASO_ANCHO, PASO_ANGULO,
  anchoRapido, anguloVisible, centroDelTramo, cuantizar, etiquetaBisagra, extremos, llevaAlto, rangoAncho, tramo,
} from './ajustesVano';
import { NOMBRE_VANO } from './vanosLienzo';
import { metros } from './vistaLienzo';
import { T, colorVano } from './paleta';

interface Props {
  vano: Vano;
  donde: string;                 // "entre Sala y Cocina" / "en Sala, hacia afuera"
  huerfano: boolean;
  despachar: (a: AccionEditor) => void;
  expandido: boolean;
  onExpandir: (v: boolean) => void;
  /** Alto del muro donde está (para los rangos de una ventana). */
  altoMuro: number;
}

const ESTILOS_VENTANA: { valor: 'blanca' | 'negra' | 'balcon'; etiqueta: string }[] = [
  { valor: 'blanca', etiqueta: 'Blanca' }, { valor: 'negra', etiqueta: 'Negra' }, { valor: 'balcon', etiqueta: 'Balcón' },
];

export default function PanelVano({ vano: v, donde, huerfano, despachar, expandido, onExpandir, altoMuro }: Props) {
  const { height } = useWindowDimensions();
  const [deslizando, setDeslizando] = useState(false);
  const id = String(v.id);
  const tipo = v.tipo ?? 'arco';
  const color = colorVano(tipo);
  const esVentana = tipo === 'ventana';
  const estiloV = (v as VanoConEstilo).estiloVentana ?? 'blanca';
  const rV = esVentana ? rangosVentana(v as VanoConEstilo, altoMuro) : null;
  const actualizar = (campo: 'ancho' | 'tipo' | 'bisagra' | 'sentido' | 'estilo' | 'apertura' | 'alto' | 'antepecho' | 'estiloVentana', valor: string | number) =>
    despachar({ type: 'actualizarVano', id, campo, valor });
  // Un deslizamiento completo = un paso de deshacer; y mientras dura, el panel no se desplaza.
  const inicio = () => { setDeslizando(true); despachar({ type: 'iniciarGesto' }); };
  const fin = () => { setDeslizando(false); despachar({ type: 'terminarGesto' }); };

  const t = tramo(v), rA = rangoAncho(v);
  const [ext0, ext1] = extremos(v.lado);

  return (
    <View style={s.panel}>
      <View style={s.fila}>
        <View style={s.textos}>
          <Text style={s.titulo} numberOfLines={1}>{NOMBRE_VANO[tipo] ?? tipo} {donde}</Text>
          <Text style={[s.sub, huerfano && s.alerta]} numberOfLines={2}>
            {huerfano ? 'Estos espacios ya no se tocan: el vano se quitará al generar el 3D.'
              : esVentana ? `${metros(v.ancho)} × ${metros(v.alto ?? VENTANA.altoDef)} m, a ${metros(v.alto_antepecho ?? 0)} m del piso.`
              : `${metros(v.ancho)} m de ancho. ${DESCRIPCION[tipo] ?? ''}`}
          </Text>
        </View>
        <Pressable style={({ pressed }) => [s.borrar, pressed && s.pulsado]} onPress={() => despachar({ type: 'borrarVano', id })} accessibilityRole="button">
          <Text style={s.borrarTexto}>Borrar</Text>
        </Pressable>
      </View>

      <View style={s.tipos}>
        {esVentana ? ESTILOS_VENTANA.map(e => (
          <Pressable key={e.valor} accessibilityRole="button" accessibilityState={{ selected: estiloV === e.valor }}
            style={({ pressed }) => [s.chip, s.flex, estiloV === e.valor && { borderColor: colorVano('ventana', e.valor), backgroundColor: '#FFFFFF1A' }, pressed && s.pulsado]}
            onPress={() => { if (estiloV !== e.valor) actualizar('estiloVentana', e.valor); }}>
            <View style={[s.muestra, s.muestraVentana, { backgroundColor: colorVano('ventana', e.valor) }]} />
            <Text style={s.chipTexto}>{e.etiqueta}</Text>
          </Pressable>
        )) : (['arco', 'vano', 'puerta'] as const).map(tp => {
          const activo = tipo === tp;
          return (
            <Pressable key={tp} accessibilityRole="button" accessibilityState={{ selected: activo }}
              style={({ pressed }) => [s.chip, s.flex, activo && { borderColor: colorVano(tp), backgroundColor: colorVano(tp) + '33' }, pressed && s.pulsado]}
              onPress={() => { if (!activo) actualizar('tipo', tp); }}>
              <View style={[s.muestra, { backgroundColor: colorVano(tp) }]} />
              <Text style={s.chipTexto}>{NOMBRE_VANO[tp]}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandido }} accessibilityLabel={expandido ? 'Ocultar ajustes' : 'Mostrar ajustes'}
          style={({ pressed }) => [s.chip, s.ajustes, expandido && s.ajustesActivo, pressed && s.pulsado]} onPress={() => onExpandir(!expandido)}>
          <Text style={s.chipTexto}>{expandido ? 'Ajustes ▴' : 'Ajustes ▾'}</Text>
        </Pressable>
      </View>

      {expandido && (
        <ScrollView style={{ maxHeight: Math.round(height * 0.38) }} contentContainerStyle={s.ajustesCont} scrollEnabled={!deslizando}
          keyboardShouldPersistTaps="handled">
          {!t || !rA ? (
            <Text style={s.nota}>Este vano no trae su tramo de muro, así que su ancho y su posición no se pueden ajustar aquí.</Text>
          ) : (
            <>
              <Text style={s.etiqueta}>Ancho: <Text style={s.valor}>{metros(v.ancho)} m</Text> (máx. {metros(rA.max)} m)</Text>
              <Deslizador valor={v.ancho} min={rA.min} max={rA.max} color={color} etiqueta="Ancho del vano" pasoAccesible={PASO_ANCHO}
                cuantizar={x => cuantizar(x, PASO_ANCHO, rA.min, rA.max)} onCambio={x => actualizar('ancho', x)} onInicio={inicio} onFin={fin} />
              <View style={s.rapidos}>
                {esVentana
                  ? <Rapido texto={`Ventana ${metros(Math.min(estiloV === 'balcon' ? VENTANA.anchoBalcon : VENTANA.anchoDef, rA.max))} m`}
                      onPress={() => actualizar('ancho', Math.min(estiloV === 'balcon' ? VENTANA.anchoBalcon : VENTANA.anchoDef, rA.max))} />
                  : <Rapido texto={`Puerta ${metros(anchoRapido(v, 'puerta')!)} m`} onPress={() => actualizar('ancho', anchoRapido(v, 'puerta')!)} />}
                <Rapido texto="Toda la pared" onPress={() => actualizar('ancho', anchoRapido(v, 'pared')!)} />
              </View>

              <Text style={[s.etiqueta, s.separado]}>Posición en el muro</Text>
              <PosicionEnMuro ini={t.ini} fin={t.fin} centro={v.centro} anchoVano={v.ancho} extremos={[ext0, ext1]} color={color}
                onMover={u => despachar({ type: 'moverVano', id, u })} onInicio={inicio} onFin={fin} />
              <View style={s.rapidos}>
                <Rapido texto="Centrar" onPress={() => despachar({ type: 'moverVano', id, u: centroDelTramo(v)! })} />
              </View>
            </>
          )}

          {esVentana && rV && (
            <>
              <Text style={[s.etiqueta, s.separado]}>Alto de la ventana: <Text style={s.valor}>{metros(v.alto ?? VENTANA.altoDef)} m</Text> (máx. {metros(rV.alto.max)} m)</Text>
              <Deslizador valor={v.alto ?? VENTANA.altoDef} min={rV.alto.min} max={rV.alto.max} color={color} etiqueta="Alto de la ventana" pasoAccesible={0.05}
                cuantizar={x => cuantizar(x, 0.05, rV.alto.min, rV.alto.max)} onCambio={x => actualizar('alto', x)} onInicio={inicio} onFin={fin} />
              <Text style={[s.etiqueta, s.separado]}>Altura desde el piso: <Text style={s.valor}>{metros(v.alto_antepecho ?? 0)} m</Text></Text>
              {estiloV === 'balcon'
                ? <Text style={s.nota}>El balcón va desde el piso.</Text>
                : <Deslizador valor={v.alto_antepecho ?? VENTANA.antepechoDef} min={rV.antepecho.min} max={rV.antepecho.max} color={color}
                    etiqueta="Altura de la ventana desde el piso" pasoAccesible={0.05}
                    cuantizar={x => cuantizar(x, 0.05, rV.antepecho.min, rV.antepecho.max)} onCambio={x => actualizar('antepecho', x)} onInicio={inicio} onFin={fin} />}
              <Text style={[s.nota, s.separado]}>En 3D se ve el hueco con muro abajo y arriba; el marco, el vidrio y el estilo todavía no se dibujan.</Text>
            </>
          )}

          {llevaAlto(tipo) && (
            <>
              <Text style={[s.etiqueta, s.separado]}>Alto del hueco: <Text style={s.valor}>{metros(v.alto ?? 2.1)} m</Text></Text>
              <Deslizador valor={v.alto ?? 2.1} min={ALTO_MIN} max={ALTO_MAX} color={color} etiqueta="Alto del hueco" pasoAccesible={PASO_ALTO}
                cuantizar={x => cuantizar(x, PASO_ALTO, ALTO_MIN, ALTO_MAX)} onCambio={x => actualizar('alto', x)} onInicio={inicio} onFin={fin} />
            </>
          )}

          {tipo === 'puerta' && (
            <>
              <Text style={[s.etiqueta, s.separado]}>Tipo de puerta</Text>
              <View style={s.envolver}>
                {ESTILOS_PUERTA.map(e => (
                  <Opcion key={e.valor} texto={e.etiqueta} activo={(v.estiloPuerta || 'sencilla') === e.valor} color={color} onPress={() => actualizar('estilo', e.valor)} />
                ))}
              </View>
              <Text style={[s.etiqueta, s.separado]}>{etiquetaBisagra(v.estiloPuerta)}</Text>
              <View style={s.rapidos}>
                <Opcion texto="◀ Izquierda" activo={(v.bisagra ?? 'izq') === 'izq'} color={color} onPress={() => actualizar('bisagra', 'izq')} />
                <Opcion texto="Derecha ▶" activo={v.bisagra === 'der'} color={color} onPress={() => actualizar('bisagra', 'der')} />
              </View>
              <Text style={[s.etiqueta, s.separado]}>Abre hacia</Text>
              <View style={s.rapidos}>
                <Opcion texto="Adentro" activo={(v.sentido ?? 'dentro') === 'dentro'} color={color} onPress={() => actualizar('sentido', 'dentro')} />
                <Opcion texto="Afuera" activo={v.sentido === 'fuera'} color={color} onPress={() => actualizar('sentido', 'fuera')} />
              </View>
              <Text style={[s.etiqueta, s.separado]}>Apertura: <Text style={s.valor}>{anguloVisible(v) === 0 ? 'cerrada' : `${anguloVisible(v)}°`}</Text></Text>
              <Deslizador valor={anguloVisible(v)} min={0} max={90} color={color} etiqueta="Ángulo de apertura" pasoAccesible={PASO_ANGULO}
                cuantizar={x => cuantizar(x, PASO_ANGULO, 0, 90)} onCambio={x => actualizar('apertura', x)} onInicio={inicio} onFin={fin} />
              <View style={s.rapidos}>
                <Rapido texto={v.abierta === false ? 'Abrir' : 'Dejar cerrada'} onPress={() => actualizar('apertura', v.abierta === false ? 75 : 0)} />
              </View>
              <Text style={[s.nota, s.separado]}>{AVISO_HOJA_3D}</Text>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Rapido({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [s.chip, s.flex, pressed && s.pulsado]} onPress={onPress} accessibilityRole="button">
      <Text style={s.chipTexto} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

function Opcion({ texto, activo, color, onPress }: { texto: string; activo: boolean; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: activo }} onPress={onPress}
      style={({ pressed }) => [s.chip, s.opcion, activo && { borderColor: color, backgroundColor: color + '33' }, pressed && s.pulsado]}>
      <Text style={s.chipTexto} numberOfLines={1}>{texto}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: T.panel, paddingTop: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  textos: { flex: 1 },
  titulo: { color: T.texto, fontSize: 16, fontWeight: '700' },
  sub: { color: T.textoSuave, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  alerta: { color: '#FCD34D' },
  borrar: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#3A2228', alignItems: 'center', justifyContent: 'center' },
  borrarTexto: { color: '#FCA5A5', fontSize: 15, fontWeight: '600' },
  tipos: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 10 },
  chip: { minHeight: 44, borderRadius: 12, backgroundColor: T.boton, borderWidth: 2, borderColor: 'transparent',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  flex: { flex: 1 },
  ajustes: { paddingHorizontal: 10 },
  ajustesActivo: { borderColor: '#6B7493' },
  muestra: { width: 12, height: 5, borderRadius: 2 },
  muestraVentana: { borderWidth: 1, borderColor: '#94A3B8', height: 7 },
  chipTexto: { color: T.texto, fontSize: 14.5, fontWeight: '600' },
  ajustesCont: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  etiqueta: { color: T.textoSuave, fontSize: 13.5 },
  valor: { color: T.texto, fontWeight: '700', fontVariant: ['tabular-nums'] },
  separado: { marginTop: 12 },
  rapidos: { flexDirection: 'row', gap: 8, marginTop: 6 },
  envolver: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  opcion: { minWidth: 96, flexGrow: 1 },
  nota: { color: T.textoSuave, fontSize: 12.5, lineHeight: 17 },
  pulsado: { opacity: 0.7 },
});
