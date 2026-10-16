import React, { useMemo, useRef, useState } from 'react';
import { ViroBox, ViroMaterials, ViroNode, ViroSphere, ViroText } from '@reactvision/react-viro';
import { AccionEditor, EditorPlanta, Esquina, planoDe, reducirEditor } from '../plan/planEditor';
import { Caja, generarMaqueta } from '../plan/planGeometry';
import { Modulo } from '../plan/planModel';
import {
  ContextoMesa, Z_SIGN, arrastreAPlano, espacioDeArrastre, esquinasDe, extensionPlanta, localDePlano,
} from '../plan/editorMesaGeom';
import { Vec3 } from './spatial/roomModel';

/**
 * Contenido EDITABLE sobre la mesa. Lo dibuja MaquetaScene dentro de su nodo anclado (punto tocado),
 * así que la detección de la superficie, el anclaje, la sombra y "Recolocar" siguen siendo suyos.
 *
 * Todo se dibuja en METROS REALES dentro de un nodo con la escala de visualización: un punto del plano
 * (x, y, z) va en localDePlano(x, y, z). El origen del plano es el punto tocado y no se recentra.
 *
 * Gestos separados (para que un toque nunca mueva nada por accidente):
 *   tocar un espacio      → seleccionarlo
 *   arrastrar el asa ✥    → moverlo        (solo aparece en el seleccionado)
 *   arrastrar una esquina → redimensionar  (cuatro asas, solo en el seleccionado)
 *   tocar la mesa vacía   → colocar el espacio elegido, o quitar la selección
 */

ViroMaterials.createMaterials({
  edSala:       { diffuseColor: '#93C5FDCC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edZona:       { diffuseColor: '#FCD34DCC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edCocina:     { diffuseColor: '#FCA5A5CC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edHabitacion: { diffuseColor: '#C4B5FDCC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edBano:       { diffuseColor: '#67E8F9CC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edPasillo:    { diffuseColor: '#D1D5DBCC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edOtro:       { diffuseColor: '#A7F3D0CC', blendMode: 'Alpha', lightingModel: 'Constant' },
  edEstructura: { diffuseColor: '#6B7280DD', blendMode: 'Alpha', lightingModel: 'Constant' },
  edSeleccion:  { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  edAsa:        { diffuseColor: '#7C5CFF', lightingModel: 'Constant' },
  edAsaMover:   { diffuseColor: '#22C55E', lightingModel: 'Constant' },
  edVano:       { diffuseColor: '#F59E0B', lightingModel: 'Constant' },
  edTrabajo:    { diffuseColor: '#FFFFFF0A', blendMode: 'Alpha', lightingModel: 'Constant', writesToDepthBuffer: false },
  ed3dPiso:     { diffuseColor: '#D8CBB4', lightingModel: 'Lambert' },
  ed3dPared:    { diffuseColor: '#F2F2F2', lightingModel: 'Lambert' },
  ed3dDintel:   { diffuseColor: '#E8E8E8', lightingModel: 'Lambert' },
  ed3dMarco:    { diffuseColor: '#8B6914', lightingModel: 'Lambert' },
});

const MATERIAL_TIPO: Record<string, string> = {
  sala: 'edSala', zona: 'edZona', cocina: 'edCocina', habitacion: 'edHabitacion', bano: 'edBano', pasillo: 'edPasillo',
  pared: 'edEstructura', vidrio: 'edEstructura', columna: 'edEstructura', viga: 'edEstructura',
};
const material3d = (c: Caja) => (c.elemento === 'marco' ? 'ed3dMarco' : c.clase === 'piso' ? 'ed3dPiso' : c.clase === 'pared' ? 'ed3dPared' : 'ed3dDintel');
const ESQUINAS: Esquina[] = ['no', 'ne', 'so', 'se'];
const fmt = (v: number) => (Math.round(v * 100) / 100).toString();
const CLICK_DOWN = 1, CLICK_UP = 2, CLICKED = 3;   // ViroClickState
const MS_ENTRE_ARRASTRES = 50;                     // ~20 por segundo: suficiente y sin saturar React
const MS_FIN_SIN_SOLTAR = 700;                      // si no llega el "soltar", el gesto se cierra solo

interface Props {
  ctx: ContextoMesa;
  editor: EditorPlanta;
  vista: 'planta' | '3d';
  arrastreActivo: boolean;                          // false con seguimiento limitado
  onAccion: (a: AccionEditor) => void;
  onTocarPlano: (p: { x: number; z: number }, idModulo?: string) => void;
}

interface Gesto {
  tipo: 'mover' | 'esquina';
  id: string;
  esquina?: Esquina;
  off: { x: number; z: number };
  espacio: 'mundo' | 'local' | null;
  esperadoMundo: Vec3 | null;
  esperadoLocal: Vec3;
  ultimo: number;
}

export default function EditorMesa({ ctx, editor, vista, arrastreActivo, onAccion, onTocarPlano }: Props) {
  const e = ctx.escala;
  const edRef = useRef(editor); edRef.current = editor;
  const gesto = useRef<Gesto | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gestoN, setGestoN] = useState(0);   // al cerrar un gesto, las asas se recrean en su sitio exacto

  const modulos = editor.planta.modulos.filter(m => (m.nivel || 0) === editor.nivelActivo);
  const ext = extensionPlanta(editor.planta.modulos);
  const sel = editor.seleccion?.tipo === 'modulo' ? modulos.find(m => m.id === editor.seleccion!.id) : undefined;

  // Tamaños pensados en centímetros REALES sobre la mesa, pasados a metros del plano (÷ escala)
  const real = (m: number) => m / e;
  const yAsa = real(0.006);

  // ── Gestos ──
  const asaDe = (m: Modulo, tipo: 'mover' | 'esquina', esquina?: Esquina) =>
    tipo === 'mover' ? { x: m.x + m.ancho / 2, z: m.z + m.largo / 2 } : esquinasDe(m)[esquina as Esquina];

  const empezar = (tipo: 'mover' | 'esquina', id: string, esquina?: Esquina, puntoMundo?: number[]) => {
    const m = edRef.current.planta.modulos.find(x => x.id === id);
    if (!m || !arrastreActivo || gesto.current) return;
    const asa = asaDe(m, tipo, esquina);
    const p = (puntoMundo && ctx.aPlano(puntoMundo)) || asa;
    gesto.current = {
      tipo, id, esquina, espacio: null, ultimo: 0,
      off: tipo === 'mover' ? { x: p.x - m.x, z: p.z - m.z } : { x: 0, z: 0 },
      esperadoMundo: ctx.aMundo(asa.x, yAsa, asa.z),
      esperadoLocal: localDePlano(asa.x, yAsa, asa.z),
    };
    onAccion({ type: 'iniciarGesto' });
  };

  const terminar = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!gesto.current) return;
    gesto.current = null;
    onAccion({ type: 'terminarGesto' });
    setGestoN(n => n + 1);
  };

  const arrastrar = (dragToPos: number[], tipo: 'mover' | 'esquina', id: string, esquina?: Esquina) => {
    if (!gesto.current) empezar(tipo, id, esquina);       // por si el "tocar" no llegó antes del arrastre
    const g = gesto.current;
    if (!g || g.id !== id) return;
    const ahora = Date.now();
    if (ahora - g.ultimo < MS_ENTRE_ARRASTRES) return;
    g.ultimo = ahora;
    if (!g.espacio) {
      g.espacio = g.esperadoMundo ? espacioDeArrastre(dragToPos, g.esperadoMundo, g.esperadoLocal) : 'local';
      console.log(`[MAQ] onDrag llega en espacio: ${g.espacio}`);   // diagnóstico: ver en Metro
    }
    const p = arrastreAPlano(g.espacio, dragToPos, ctx);
    if (!p) return;
    const accion: AccionEditor = g.tipo === 'mover'
      ? { type: 'moverModulo', id, x: p.x - g.off.x, z: p.z - g.off.z }
      : { type: 'redimensionar', id, esquina: g.esquina as Esquina, x: p.x, z: p.z };
    // Solo se envía si cambia algo: la cuadrícula hace que la mayoría de eventos no cambien nada
    const antes = edRef.current.planta.modulos.find(x => x.id === id);
    const despues = reducirEditor(edRef.current, accion).planta.modulos.find(x => x.id === id);
    if (JSON.stringify(antes) !== JSON.stringify(despues)) onAccion(accion);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(terminar, MS_FIN_SIN_SOLTAR);
  };

  const propsArrastre = (tipo: 'mover' | 'esquina', id: string, esquina?: Esquina) => {
    const base = {
      onClickState: (estado: number, pos: number[]) => {
        if (estado === CLICK_DOWN) empezar(tipo, id, esquina, pos);
        else if (estado === CLICK_UP || estado === CLICKED) terminar();
      },
    };
    if (!arrastreActivo || !ctx.planoDeArrastre) return base;
    return {
      ...base,
      dragType: 'FixedToPlane' as const,
      dragPlane: { planePoint: ctx.planoDeArrastre.planePoint, planeNormal: ctx.planoDeArrastre.planeNormal, maxDistance: 5 },
      onDrag: (pos: number[]) => arrastrar(pos, tipo, id, esquina),
    };
  };

  const tocar = (pos: number[], idModulo?: string) => {
    const p = ctx.aPlano(pos);
    if (p) onTocarPlano(p, idModulo);
  };

  // ── Vista 3D: el mismo proyecto, por el generador existente ──
  const maqueta = useMemo(() => (vista === '3d' && editor.planta.modulos.length ? generarMaqueta(planoDe(editor.planta)) : null),
    [vista, editor.planta]);

  // Superficie de trabajo: cubre la mesa (y algo más) para poder tocar donde no hay espacios
  const lado = real(Math.max(ctx.lado[0], ctx.lado[1]) * 1.6);
  const centroTrabajo = ext ? { x: ext.cx, z: ext.cz } : { x: 0, z: 0 };

  return (
    <ViroNode scale={[e, e, e]}>
      <ViroBox
        position={localDePlano(centroTrabajo.x, -real(0.002), centroTrabajo.z)}
        width={lado} height={real(0.001)} length={lado} materials={['edTrabajo']}
        onClick={(pos: any) => tocar(pos)} />

      {vista === 'planta' && modulos.map(m => {
        const cx = m.x + m.ancho / 2, cz = m.z + m.largo / 2;
        const esSel = sel?.id === m.id;
        return (
          <ViroNode key={`mod-${m.id}`}>
            {esSel && (
              <ViroBox position={localDePlano(cx, real(0.0015), cz)}
                width={m.ancho + real(0.006)} height={real(0.002)} length={m.largo + real(0.006)} materials={['edSeleccion']} />
            )}
            <ViroBox
              position={localDePlano(cx, real(0.003), cz)}
              width={Math.max(m.ancho - real(0.002), 0.05)} height={real(0.003)} length={Math.max(m.largo - real(0.002), 0.05)}
              materials={[MATERIAL_TIPO[m.tipo ?? ''] ?? 'edOtro']}
              onClick={(pos: any) => tocar(pos, m.id)} />
            <ViroText
              text={`${m.nombre ?? m.tipo ?? ''}\n${fmt(m.ancho)} × ${fmt(m.largo)} m`}
              position={localDePlano(cx, real(0.02), cz)} scale={[real(0.03), real(0.03), real(0.03)]}
              width={3} height={1}
              style={{ fontFamily: 'Arial', fontSize: 18, color: esSel ? '#FFFFFF' : '#111827', textAlign: 'center', textAlignVertical: 'center' }}
              transformBehaviors={['billboard']} />
          </ViroNode>
        );
      })}

      {/* Vanos en la planta (solo se muestran; editarlos es E3) */}
      {vista === 'planta' && editor.planta.vanos.map((v, i) => {
        const a = modulos.find(m => m.id === v.modulo_a);
        if (!a) return null;
        const horiz = v.lado === 'norte' || v.lado === 'sur';
        const x = horiz ? v.centro : v.lado === 'oeste' ? a.x : a.x + a.ancho;
        const z = horiz ? (v.lado === 'norte' ? a.z : a.z + a.largo) : v.centro;
        return (
          <ViroBox key={`vano-${v.id ?? i}`} position={localDePlano(x, real(0.005), z)}
            width={horiz ? v.ancho : real(0.005)} height={real(0.002)} length={horiz ? real(0.005) : v.ancho} materials={['edVano']} />
        );
      })}

      {/* Asas del espacio seleccionado: cuatro esquinas para redimensionar y una central para mover */}
      {vista === 'planta' && sel && (
        <ViroNode key={`asas-${sel.id}-${gestoN}`}>
          {ESQUINAS.map(q => {
            const p = esquinasDe(sel)[q];
            return (
              <ViroSphere key={`asa-${q}`} position={localDePlano(p.x, yAsa, p.z)} radius={real(0.012)}
                widthSegmentCount={12} heightSegmentCount={8} materials={['edAsa']}
                {...propsArrastre('esquina', sel.id, q)} />
            );
          })}
          <ViroSphere key="asa-mover" position={localDePlano(sel.x + sel.ancho / 2, yAsa, sel.z + sel.largo / 2)} radius={real(0.014)}
            widthSegmentCount={12} heightSegmentCount={8} materials={['edAsaMover']}
            {...propsArrastre('mover', sel.id)} />
        </ViroNode>
      )}

      {/* Vista 3D: el generador centra la maqueta; se devuelve a su sitio para que coincida con la planta */}
      {vista === '3d' && maqueta && ext && maqueta.errores.length === 0 && (
        <ViroNode position={localDePlano(ext.cx, 0, ext.cz)}>
          {[...maqueta.cajas, ...maqueta.marcos].map(c => (
            <ViroBox key={c.id}
              position={[c.centro[0], c.centro[1], Z_SIGN * c.centro[2]]}
              width={c.tamano[0]} height={c.tamano[1]} length={c.tamano[2]}
              materials={[material3d(c)]} />
          ))}
        </ViroNode>
      )}
    </ViroNode>
  );
}