/**
 * Lienzo del plano 2D. Dibuja con Views de React Native: no hay cámara, ni Viro, ni dependencias nuevas.
 * Solo DIBUJA (pointerEvents="none"): los gestos los recibe la pantalla y los traduce gestosLienzo.ts.
 * Capas, de abajo arriba: cuadrícula, piso de abajo punteado (guía), cuartos, estructura, vanos, ETIQUETAS (encima de todo, para que
 * una viga no tape "Sala 5 × 4 m"), "+" de los muros, cotas, y el asa del espacio seleccionado.
 */
import React, { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Planta } from '../plan/planEditor';
import { esCuarto } from '../plan/planModel';
import type { Modulo } from '../plan/planModel';
import {
  ALTO_TEXTO_COTA, Vista, aPantalla, cotasGenerales, cuadricula, etiquetaCabe, extension, modulosDelNivel,
  nombreVisible, textoMedidas, tipoVisual, tramoVano, vanosDelNivel,
} from './vistaLienzo';
import { COLOR_CERRADO, T, colorMas, colorTipo, colorVano } from './paleta';
import { botonesMas, posicionMenos } from './vanosLienzo';
import { objetoPorId } from '../objetos/catalogoObjetos';
import { posicionAsa, puedeEstirar } from './gestosLienzo';

const TAM_ASA = 24;   // pt dibujados; se agarra en 44 pt (RADIO_ASA en gestosLienzo.ts)
const TAM_MAS = 22;   // pt dibujados; se toca en 44 pt (RADIO_MAS en gestosLienzo.ts)
const TAM_MENOS = 20; // pt dibujados; se toca en 2 × RADIO_MENOS (vanosLienzo.ts)

interface Props {
  planta: Planta; nivel: number; vista: Vista; ancho: number; alto: number;
  seleccionId?: string | null;
  vanoSeleccionadoId?: string | null;
  /** Vanos entre espacios que ya no se tocan: se quitarán al generar el 3D (se dibujan atenuados). */
  vanosHuerfanos?: Set<string>;
  /** Piso de abajo, punteado y sin rellenar, solo como guía para alinear (no se puede tocar ni editar). */
  referencia?: Modulo[];
  /** Objeto seleccionado (Entrega 3b). */
  objetoSeleccionadoId?: string | null;
}

function LienzoPlanta({ planta, nivel, vista, ancho, alto, seleccionId, vanoSeleccionadoId, vanosHuerfanos, referencia, objetoSeleccionadoId }: Props) {
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

      {(referencia ?? []).map(m => {
        const { px, py } = aPantalla(vista, m.x, m.z);
        return <View key={`ref${String(m.id)}`} style={[s.referencia, { left: px, top: py, width: m.ancho * vista.escala, height: m.largo * vista.escala }]} />;
      })}

      {ordenados.map(m => {
        const { px, py } = aPantalla(vista, m.x, m.z);
        const color = colorTipo(tipoVisual(m));
        const sel = String(m.id) === seleccionId;
        return (
          <View key={String(m.id)} style={[s.espacio, { left: px, top: py, width: m.ancho * vista.escala, height: m.largo * vista.escala,
            borderColor: sel ? '#FFFFFF' : color, borderWidth: sel ? 3 : 2, backgroundColor: color + (sel ? '40' : esCuarto(m.tipo) ? '24' : '66') },
            m.tipo === 'hueco' && s.hueco]}>
            {/* Piso del catálogo (imagen_piso): se ve bajo la etiqueta, atenuado para que el texto se lea */}
            {m.imagen_piso && esCuarto(m.tipo) ? <Image source={{ uri: m.imagen_piso }} style={s.pisoImagen} resizeMode="cover" /> : null}
          </View>
        );
      })}

      {/* Objetos (3b): su huella real, girada; franja en el lado de atrás (el respaldo del sofá) para ver la orientación */}
      {(planta.muebles ?? []).filter(o => (o.nivel || 0) === nivel).map(o => {
        const c = aPantalla(vista, o.x, o.z);
        const w = o.ancho * vista.escala, h = o.largo * vista.escala;
        const sel = o.id === objetoSeleccionadoId;
        return (
          <View key={`obj${o.id}`} style={[s.objeto, sel && s.objetoSel, { left: c.px - w / 2, top: c.py - h / 2, width: w, height: h, transform: [{ rotate: `${o.rot}deg` }] }]}>
            <View style={s.objetoAtras} />
            {Math.min(w, h) >= 14 && <Text style={[s.objetoIcono, { transform: [{ rotate: `${-o.rot}deg` }] }]}>{objetoPorId(o.tipo)?.icono ?? '?'}</Text>}
          </View>
        );
      })}

      {/* Etiquetas en su propia capa, por encima de la estructura. La de una pieza de estructura solo
          aparece si está seleccionada, para no tapar el nombre del cuarto que cruza. */}
      {ordenados.filter(m => esCuarto(m.tipo) || String(m.id) === seleccionId).map(m => {
        const { px, py } = aPantalla(vista, m.x, m.z);
        const w = m.ancho * vista.escala, h = m.largo * vista.escala;
        const cabe = etiquetaCabe(w, h);
        if (!cabe.nombre) return null;
        return (
          <View key={`et${String(m.id)}`} style={[s.etiqueta, { left: px, top: py, width: w, height: h }]}>
            {/* Sobre un piso del catálogo (claro u oscuro) la etiqueta lleva un fondo discreto: siempre se lee */}
            <View style={m.imagen_piso ? s.etiquetaFondo : undefined}>
              <Text style={s.nombre} numberOfLines={1}>{nombreVisible(m)}</Text>
              {cabe.medidas && <Text style={[s.medidas, m.imagen_piso && s.medidasSobrePiso]} numberOfLines={1}>{textoMedidas(m)}</Text>}
            </View>
          </View>
        );
      })}

      {/* Vanos: barra sobre su muro con el color de la web; el seleccionado, más gruesa y con borde blanco */}
      {vanosDelNivel(planta, nivel).map((v, i) => {
        const t = tramoVano(v, mods);
        if (!t) return null;
        const a = aPantalla(vista, t.x0, t.z0), b = aPantalla(vista, t.x1, t.z1);
        const horizontal = t.z0 === t.z1;
        const sel = v.id !== undefined && String(v.id) === vanoSeleccionadoId;
        const huerfano = v.id !== undefined && !!vanosHuerfanos?.has(String(v.id));
        const g = sel ? 9 : 6;
        return (
          <View key={`vano${String(v.id ?? i)}`} style={[s.vano, { backgroundColor: colorVano(v.tipo, (v as { estiloVentana?: string }).estiloVentana), opacity: huerfano ? 0.4 : 1 },
            v.tipo === 'ventana' && s.ventana,
            sel && s.vanoSeleccionado,
            horizontal ? { left: a.px, top: a.py - g / 2, width: b.px - a.px, height: g }
                       : { left: a.px - g / 2, top: a.py, width: g, height: b.py - a.py }]} />
        );
      })}

      {/* Muros compartidos sin vano del piso visible: "+" (poner paso) y "−" (cerrar a propósito) */}
      {botonesMas(planta, nivel).map((m, i) => {
        const q = aPantalla(vista, m.x, m.z);
        const color = colorMas(m.exterior);
        const menos = posicionMenos(q, m.contacto.lado);
        const horizontal = m.contacto.lado === 'norte' || m.contacto.lado === 'sur';
        const a = horizontal ? aPantalla(vista, m.contacto.ini, m.z) : aPantalla(vista, m.x, m.contacto.ini);
        const b = horizontal ? aPantalla(vista, m.contacto.fin, m.z) : aPantalla(vista, m.x, m.contacto.fin);
        return (
          <React.Fragment key={`mas${i}`}>
            {m.cerrado && <View style={[s.cerrado, horizontal ? { left: a.px, top: a.py - 2, width: b.px - a.px, height: 4 } : { left: a.px - 2, top: a.py, width: 4, height: b.py - a.py }]} />}
            <View style={[s.mas, { left: q.px - TAM_MAS / 2, top: q.py - TAM_MAS / 2, borderColor: color }]}>
              <Text style={[s.masTexto, { color }]}>+</Text>
            </View>
            <View style={[s.menos, { left: menos.px - TAM_MENOS / 2, top: menos.py - TAM_MENOS / 2 }, m.cerrado && s.menosCerrado]}>
              <Text style={[s.menosTexto, m.cerrado && s.menosTextoCerrado]}>{m.cerrado ? '×' : '−'}</Text>
            </View>
          </React.Fragment>
        );
      })}

      {ext && <Cotas ext={ext} vista={vista} />}

      {(() => {
        const m = mods.find(x => String(x.id) === seleccionId);
        if (!m || !puedeEstirar(m)) return null;
        const a = posicionAsa(vista, m);
        return <View style={[s.asa, { left: a.px - TAM_ASA / 2, top: a.py - TAM_ASA / 2 }]} />;
      })()}
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
  espacio: { position: 'absolute', borderRadius: 2, overflow: 'hidden' },
  pisoImagen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.55 },
  hueco: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  objeto: { position: 'absolute', borderWidth: 1.5, borderColor: '#C4B5FD', backgroundColor: '#C4B5FD33', borderRadius: 3, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  objetoSel: { borderColor: '#FFFFFF', borderWidth: 2.5, backgroundColor: '#C4B5FD66' },
  objetoAtras: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: '#C4B5FD' },
  objetoIcono: { fontSize: 13 },
  referencia: { position: 'absolute', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#8A93AD' },
  etiqueta: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  asa: { position: 'absolute', width: TAM_ASA, height: TAM_ASA, borderRadius: TAM_ASA / 2, backgroundColor: T.acento, borderWidth: 3, borderColor: '#FFFFFF' },
  nombre: { color: T.texto, fontSize: 15, fontWeight: '600', textShadowColor: '#000000AA', textShadowRadius: 3 },
  medidas: { color: T.textoSuave, fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'], textShadowColor: '#000000AA', textShadowRadius: 3 },
  medidasSobrePiso: { color: T.texto },
  etiquetaFondo: { alignItems: 'center', backgroundColor: '#0D1018B8', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  vano: { position: 'absolute', borderRadius: 4 },
  vanoSeleccionado: { borderWidth: 2, borderColor: '#FFFFFF' },
  mas: { position: 'absolute', width: TAM_MAS, height: TAM_MAS, borderRadius: TAM_MAS / 2, borderWidth: 2,
    backgroundColor: '#0F0F1A', alignItems: 'center', justifyContent: 'center' },
  masTexto: { fontSize: 16, fontWeight: '700', lineHeight: 18, marginTop: -1 },
  menos: { position: 'absolute', width: TAM_MENOS, height: TAM_MENOS, borderRadius: TAM_MENOS / 2, borderWidth: 2, borderColor: '#8A93AD',
    backgroundColor: '#0F0F1A', alignItems: 'center', justifyContent: 'center' },
  menosCerrado: { borderColor: COLOR_CERRADO, backgroundColor: COLOR_CERRADO },
  menosTexto: { color: '#C2C8D8', fontSize: 15, fontWeight: '700', lineHeight: 17, marginTop: -1 },
  menosTextoCerrado: { color: '#FFFFFF' },
  cerrado: { position: 'absolute', backgroundColor: COLOR_CERRADO, borderRadius: 2, opacity: 0.85 },
  ventana: { borderWidth: 1, borderColor: '#94A3B8' },
  cotaH: { position: 'absolute', height: 1.5, backgroundColor: T.cota },
  cotaV: { position: 'absolute', width: 1.5, backgroundColor: T.cota },
  tope: { position: 'absolute', width: 2, height: 11, backgroundColor: T.cota },
  topeH: { position: 'absolute', width: 11, height: 2, backgroundColor: T.cota },
  cotaTexto: { position: 'absolute', color: T.cota, fontSize: 13, lineHeight: ALTO_TEXTO_COTA, textAlign: 'center', fontVariant: ['tabular-nums'] },
});

export default memo(LienzoPlanta);
