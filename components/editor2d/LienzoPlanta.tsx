/**
 * Lienzo del plano 2D (entrega 1a: SOLO LECTURA). Dibuja con Views de React Native: no hay cámara,
 * ni Viro, ni dependencias nuevas. No recibe gestos todavía (pointerEvents="none"): mover, estirar y
 * seleccionar llegan en la entrega 1b, y entonces enviarán acciones al reductor de planEditor.ts.
 */
import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Planta } from '../plan/planEditor';
import { esCuarto } from '../plan/planModel';
import {
  ALTO_TEXTO_COTA, Vista, aPantalla, cotasGenerales, cuadricula, etiquetaCabe, extension, modulosDelNivel,
  nombreVisible, textoMedidas, tipoVisual, tramoVano, vanosDelNivel,
} from './vistaLienzo';
import { T, colorTipo, colorVano } from './paleta';

interface Props { planta: Planta; nivel: number; vista: Vista; ancho: number; alto: number }

function LienzoPlanta({ planta, nivel, vista, ancho, alto }: Props) {
  const mods = modulosDelNivel(planta, nivel);
  // Cuartos primero; columnas, vigas y demás estructura encima, para que no queden tapadas.
  const ordenados = [...mods.filter(m => esCuarto(m.tipo)), ...mods.filter(m => !esCuarto(m.tipo))];
  const red = cuadricula(vista, ancho, alto);
  const ext = extension(mods);

  return (
    <View style={[s.lienzo, { width: ancho, height: alto }]} pointerEvents="none">
      {red.verticales.map((l, i) => (
        <View key={`v${i}`} style={[s.lineaV, { left: l.pos, backgroundColor: l.fuerte ? T.lineaFuerte : T.linea }]} />
      ))}
      {red.horizontales.map((l, i) => (
        <View key={`h${i}`} style={[s.lineaH, { top: l.pos, backgroundColor: l.fuerte ? T.lineaFuerte : T.linea }]} />
      ))}

      {ordenados.map(m => {
        const { px, py } = aPantalla(vista, m.x, m.z);
        const w = m.ancho * vista.escala, h = m.largo * vista.escala;
        const color = colorTipo(tipoVisual(m));
        const cabe = etiquetaCabe(w, h);
        return (
          <View key={String(m.id)} style={[s.espacio, { left: px, top: py, width: w, height: h, borderColor: color, backgroundColor: color + '24' }]}>
            {cabe.nombre && <Text style={s.nombre} numberOfLines={1}>{nombreVisible(m)}</Text>}
            {cabe.medidas && <Text style={s.medidas} numberOfLines={1}>{textoMedidas(m)}</Text>}
          </View>
        );
      })}

      {vanosDelNivel(planta, nivel).map((v, i) => {
        const t = tramoVano(v, mods);
        if (!t) return null;
        const a = aPantalla(vista, t.x0, t.z0), b = aPantalla(vista, t.x1, t.z1);
        const horizontal = t.z0 === t.z1;
        return (
          <View key={`vano${i}`} style={[s.vano, { backgroundColor: colorVano(v.tipo) },
            horizontal ? { left: a.px, top: a.py - 2.5, width: b.px - a.px, height: 5 }
                       : { left: a.px - 2.5, top: a.py, width: 5, height: b.py - a.py }]} />
        );
      })}

      {ext && <Cotas ext={ext} vista={vista} />}
    </View>
  );
}

/** Medida total del plano: ancho arriba y largo a la izquierda, como el "4,00 m" del concepto. */
function Cotas({ ext, vista }: { ext: NonNullable<ReturnType<typeof extension>>; vista: Vista }) {
  const { horizontal: h, vertical: v } = cotasGenerales(vista, ext);
  const largoV = v.y1 - v.y0;
  return (
    <>
      <View style={[s.cotaH, { left: h.x0, top: h.y, width: h.x1 - h.x0 }]} />
      <View style={[s.tope, { left: h.x0 - 1, top: h.y - 5 }]} />
      <View style={[s.tope, { left: h.x1 - 1, top: h.y - 5 }]} />
      <Text style={[s.cotaTexto, { left: h.cajaTexto.x0, width: h.cajaTexto.x1 - h.cajaTexto.x0, top: h.cajaTexto.y0 }]} numberOfLines={1}>{h.texto}</Text>

      <View style={[s.cotaV, { left: v.x, top: v.y0, height: largoV }]} />
      <View style={[s.topeH, { left: v.x - 5, top: v.y0 - 1 }]} />
      <View style={[s.topeH, { left: v.x - 5, top: v.y1 - 1 }]} />
      {/* Texto girado -90°: la caja se define horizontal (largoV × alto) y se gira sobre su centro. */}
      <Text numberOfLines={1} style={[s.cotaTexto, {
        width: largoV, height: ALTO_TEXTO_COTA,
        left: (v.cajaTexto.x0 + v.cajaTexto.x1) / 2 - largoV / 2,
        top: (v.y0 + v.y1) / 2 - ALTO_TEXTO_COTA / 2,
        transform: [{ rotate: '-90deg' }],
      }]}>{v.texto}</Text>
    </>
  );
}

const s = StyleSheet.create({
  lienzo: { backgroundColor: T.fondo, overflow: 'hidden' },
  lineaV: { position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth },
  lineaH: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  espacio: { position: 'absolute', borderWidth: 2, borderRadius: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  nombre: { color: T.texto, fontSize: 15, fontWeight: '600' },
  medidas: { color: T.textoSuave, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
  vano: { position: 'absolute', borderRadius: 2 },
  cotaH: { position: 'absolute', height: 1.5, backgroundColor: T.cota },
  cotaV: { position: 'absolute', width: 1.5, backgroundColor: T.cota },
  tope: { position: 'absolute', width: 2, height: 11, backgroundColor: T.cota },
  topeH: { position: 'absolute', width: 11, height: 2, backgroundColor: T.cota },
  cotaTexto: { position: 'absolute', color: T.cota, fontSize: 13, lineHeight: ALTO_TEXTO_COTA, textAlign: 'center', fontVariant: ['tabular-nums'] },
});

export default memo(LienzoPlanta);
