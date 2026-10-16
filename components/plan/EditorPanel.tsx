import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AccionEditor, EditorPlanta } from './planEditor';

/**
 * Controles en pantalla del editor sobre la mesa. Cada botón usa las MISMAS acciones del editor que
 * los gestos, así que respeta las mismas reglas (cuadrícula de 0,5 m, mínimo de 1 m, historial).
 * Sirven además de respaldo si el arrastre resultara impreciso en algún teléfono.
 */

/** Espacios que se ofrecen. "Comedor" es el tipo 'zona' de la web con un nombre visible propio. */
export const PALETA: { etiqueta: string; tipo: string; nombre?: string }[] = [
  { etiqueta: '🛋️ Sala', tipo: 'sala' },
  { etiqueta: '🍽️ Comedor', tipo: 'zona', nombre: '🍽️ Comedor' },
  { etiqueta: '🍳 Cocina', tipo: 'cocina' },
  { etiqueta: '🛏️ Habitación', tipo: 'habitacion', nombre: '🛏️ Habitación' },
  { etiqueta: '🚿 Baño', tipo: 'bano', nombre: '🚿 Baño' },
  { etiqueta: '🚶 Pasillo', tipo: 'pasillo' },
  { etiqueta: '📦 Zona', tipo: 'zona' },
  { etiqueta: '🧱 Pared', tipo: 'pared' },
  { etiqueta: '🏛️ Columna', tipo: 'columna' },
  { etiqueta: '🪵 Viga', tipo: 'viga' },
];

export const ESCALAS = [20, 30, 50];

interface Props {
  editor: EditorPlanta;
  vista: 'planta' | '3d';
  colocado: boolean;
  pendiente: { tipo: string; nombre?: string } | null;
  escalaDen: number;
  onAccion: (a: AccionEditor) => void;
  onElegirTipo: (p: { tipo: string; nombre?: string } | null) => void;
  onConvertir: () => void;
  onVolver: () => void;
  onEscala: (den: number) => void;
  onEjemplo: () => void;
  onRecolocar: () => void;
}

const fmt = (v: number) => (Math.round(v * 100) / 100).toString();

export default function EditorPanel(p: Props) {
  const { editor, vista } = p;
  const sel = editor.seleccion?.tipo === 'modulo' ? editor.planta.modulos.find(m => m.id === editor.seleccion!.id) : undefined;
  const sigEscala = () => p.onEscala(ESCALAS[(ESCALAS.indexOf(p.escalaDen) + 1) % ESCALAS.length]);
  const Chip = ({ t, on, activo, off }: { t: string; on: () => void; activo?: boolean; off?: boolean }) => (
    <TouchableOpacity style={[s.chip, activo && s.chipActivo, off && s.chipOff]} onPress={on} disabled={off}>
      <Text style={s.chipText}>{t}</Text>
    </TouchableOpacity>
  );

  if (!p.colocado) return null;   // primero hay que tocar la mesa (lo indica el texto de ayuda)

  if (vista === '3d') {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fila}>
        <Chip t="← Volver a la planta" on={p.onVolver} activo />
        <Chip t={`Escala 1:${p.escalaDen}`} on={sigEscala} />
        <Chip t="↺ Recolocar" on={p.onRecolocar} />
      </ScrollView>
    );
  }

  return (
    <View style={s.panel}>
      {/* 1. Qué espacio añadir: se elige aquí y se coloca tocando la mesa */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fila}>
        {PALETA.map(x => {
          const activo = p.pendiente?.tipo === x.tipo && p.pendiente?.nombre === x.nombre;
          return <Chip key={x.etiqueta} t={x.etiqueta} activo={activo} on={() => p.onElegirTipo(activo ? null : { tipo: x.tipo, nombre: x.nombre })} />;
        })}
      </ScrollView>

      {/* 2. El espacio seleccionado: medidas y ajustes finos con las mismas reglas que los gestos */}
      {sel && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fila}>
          <Text style={s.selTexto}>{sel.nombre} · {fmt(sel.ancho)} × {fmt(sel.largo)} m</Text>
          <Chip t="←" on={() => p.onAccion({ type: 'moverModulo', id: sel.id, x: sel.x - 0.5, z: sel.z })} />
          <Chip t="→" on={() => p.onAccion({ type: 'moverModulo', id: sel.id, x: sel.x + 0.5, z: sel.z })} />
          <Chip t="↑" on={() => p.onAccion({ type: 'moverModulo', id: sel.id, x: sel.x, z: sel.z - 0.5 })} />
          <Chip t="↓" on={() => p.onAccion({ type: 'moverModulo', id: sel.id, x: sel.x, z: sel.z + 0.5 })} />
          <Chip t="Ancho −" on={() => p.onAccion({ type: 'redimensionar', id: sel.id, esquina: 'se', x: sel.x + sel.ancho - 0.5, z: sel.z + sel.largo })} />
          <Chip t="Ancho +" on={() => p.onAccion({ type: 'redimensionar', id: sel.id, esquina: 'se', x: sel.x + sel.ancho + 0.5, z: sel.z + sel.largo })} />
          <Chip t="Largo −" on={() => p.onAccion({ type: 'redimensionar', id: sel.id, esquina: 'se', x: sel.x + sel.ancho, z: sel.z + sel.largo - 0.5 })} />
          <Chip t="Largo +" on={() => p.onAccion({ type: 'redimensionar', id: sel.id, esquina: 'se', x: sel.x + sel.ancho, z: sel.z + sel.largo + 0.5 })} />
          <Chip t="⟳ Girar" on={() => p.onAccion({ type: 'rotarModulo', id: sel.id })} />
          <Chip t="🗑 Borrar" on={() => p.onAccion({ type: 'eliminarModulo', id: sel.id })} />
        </ScrollView>
      )}

      {/* 3. Historial, conversión y vista */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.fila}>
        <Chip t="↶" on={() => p.onAccion({ type: 'deshacer' })} off={!editor.deshacer.length} />
        <Chip t="↷" on={() => p.onAccion({ type: 'rehacer' })} off={!editor.rehacer.length} />
        <Chip t="▣ Convertir a 3D" on={p.onConvertir} off={!editor.planta.modulos.length} activo />
        <Chip t={`Escala 1:${p.escalaDen}`} on={sigEscala} />
        <Chip t="Ejemplo" on={p.onEjemplo} />
        <Chip t="↺ Recolocar" on={p.onRecolocar} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { gap: 6 },
  fila: { gap: 6, paddingHorizontal: 2, alignItems: 'center' },
  chip: { backgroundColor: 'rgba(20,20,31,0.82)', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 14, minHeight: 40, justifyContent: 'center' },
  chipActivo: { backgroundColor: '#3b2a6b', borderColor: '#7c5cff', borderWidth: 1 },
  chipOff: { opacity: 0.35 },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  selTexto: { color: '#fff', fontSize: 13, fontWeight: '700', backgroundColor: 'rgba(124,92,255,0.85)', paddingVertical: 9, paddingHorizontal: 12, borderRadius: 14, overflow: 'hidden' },
});