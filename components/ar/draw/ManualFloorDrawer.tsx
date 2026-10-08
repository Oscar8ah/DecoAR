import React, { useRef } from 'react';
import {
  ViroNode,
  ViroPolygon,
  ViroPolyline,
  ViroSphere,
  ViroText,
  ViroMaterials,
  ViroClickStateTypes,
} from '@reactvision/react-viro';
import { DrawState, Vec3, distXZ, outwardNormal, snapReticle, centroidXZ, areaXZ } from './drawModel';

/**
 * Dibuja en AR el estado del modo "Dibujar" (la lógica vive en drawModel.ts).
 * Ya no hay plano invisible para tocar: se apunta con la MIRA central y se
 * presiona "+", como en el Medir de iPhone.
 */

const TILE_METERS = 0.6;   // tamaño físico de la textura de prueba (cambiar con el catálogo real)
const Z_SIGN = -1;         // misma convención que RoomScanScene
const LIFT = 0.004;        // separa del piso para que no parpadee contra el piso automático

ViroMaterials.createMaterials({
  drawFill: {
    diffuseTexture: require('../../../assets/textures/floor-test-tile.jpg'),
    wrapS: 'Repeat', wrapT: 'Repeat',
    cullMode: 'None', lightingModel: 'Constant',
  },
  drawLine: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawLive: { diffuseColor: '#FFFFFFAA', blendMode: 'Alpha', lightingModel: 'Constant' },
  drawPoint: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawPointFirst: { diffuseColor: '#FACC15', lightingModel: 'Constant' },
  drawHole: { diffuseColor: '#F97316', lightingModel: 'Constant' },
  drawHandle: { diffuseColor: '#3B82F6', lightingModel: 'Constant' },
  drawReticle: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawReticleSnap: { diffuseColor: '#FACC15', lightingModel: 'Constant' },
});

interface Props {
  state: DrawState;
  reticle: Vec3 | null;
  floorY: number;
  onDragEdge: (edge: number, amount: number) => void;
}

const fmt = (m: number) => (m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(2)} m`);
const toXZ = (pts: Vec3[]): [number, number][] => pts.map(p => [p[0], Z_SIGN * p[2]]);
const lift = (p: Vec3, dy = LIFT): Vec3 => [p[0], p[1] + dy, p[2]];

/** Círculo en el piso (la mira), como polilínea de 24 segmentos. */
function ring(c: Vec3, r: number): Vec3[] {
  return Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [c[0] + Math.cos(a) * r, c[1] + LIFT, c[2] + Math.sin(a) * r] as Vec3;
  });
}

/** UV a escala real: la textura se repite cada TILE_METERS. */
function uvFor(points: Vec3[]): [number, number, number, number] {
  const xs = points.map(p => p[0]), zs = points.map(p => p[2]);
  const w = Math.max(0.01, Math.max(...xs) - Math.min(...xs));
  const d = Math.max(0.01, Math.max(...zs) - Math.min(...zs));
  return [0, 0, w / TILE_METERS, d / TILE_METERS];
}

function SideLabels({ poly, closed, y }: { poly: Vec3[]; closed: boolean; y: number }) {
  const n = poly.length;
  return (
    <>
      {poly.map((p, i) => {
        if (!closed && i === n - 1) return null;
        const q = poly[(i + 1) % n];
        return (
          <ViroText key={`lbl-${i}`} text={fmt(distXZ(p, q))}
            position={[(p[0] + q[0]) / 2, y + 0.12, (p[2] + q[2]) / 2]}
            scale={[0.12, 0.12, 0.12]} style={labelStyle} transformBehaviors={['billboard']} />
        );
      })}
    </>
  );
}

export default function ManualFloorDrawer({ state, reticle, floorY, onDragEdge }: Props) {
  const lastDrag = useRef(new Map<number, Vec3 | null>());
  const { point: aim, snapped } = snapReticle(state, reticle);
  const drawingHole = state.phase === 'hole';
  const cur = state.current;
  const last = cur[cur.length - 1];

  return (
    <ViroNode position={[0, 0, 0]}>
      {/* PISO CERRADO: textura a escala + huecos donde el humano marcó objetos */}
      {state.floor && (
        <>
          <ViroPolygon
            position={[0, floorY + LIFT, 0]} rotation={[-90, 0, 0]}
            vertices={toXZ(state.floor)} holes={state.holes.map(toXZ)}
            materials={['drawFill']} uvCoordinates={uvFor(state.floor)} />
          <ViroPolyline position={[0, 0, 0]} points={[...state.floor, state.floor[0]].map(p => lift(p, 2 * LIFT))}
            thickness={0.008} materials={['drawLine']} />
          <SideLabels poly={state.floor} closed y={floorY} />

          {/* Manijas para estirar cada lado (solo cuando no se está marcando un objeto) */}
          {!drawingHole && state.floor.map((p, i) => {
            const q = state.floor![(i + 1) % state.floor!.length];
            const nrm = outwardNormal(state.floor!, i);
            return (
              <ViroSphere
                key={`h-${i}`}
                position={[(p[0] + q[0]) / 2, floorY + 0.02, (p[2] + q[2]) / 2]}
                radius={0.03}
                materials={['drawHandle']}
                dragType="FixedToPlane"
                dragPlane={{ planePoint: [0, floorY, 0], planeNormal: [0, 1, 0], maxDistance: 20 }}
                onClickState={(st: number) => {
                  if (st === ViroClickStateTypes.CLICK_DOWN || st === ViroClickStateTypes.CLICK_UP) lastDrag.current.set(i, null);
                }}
                onDrag={(to: Vec3) => {
                  const prev = lastDrag.current.get(i) ?? to;
                  lastDrag.current.set(i, to);
                  const amount = (to[0] - prev[0]) * nrm[0] + (to[2] - prev[2]) * nrm[1];
                  if (Math.abs(amount) > 0.002) onDragEdge(i, amount);
                }}
              />
            );
          })}
        </>
      )}

      {/* OBJETOS marcados: contorno naranja y su área */}
      {state.holes.map((h, k) => {
        const c = centroidXZ(h);
        return (
          <React.Fragment key={`hole-${k}`}>
            <ViroPolyline position={[0, 0, 0]} points={[...h, h[0]].map(p => lift(p, 3 * LIFT))}
              thickness={0.01} materials={['drawHole']} />
            <ViroText text={`Objeto · ${areaXZ(h).toFixed(2)} m²`} position={[c[0], floorY + 0.2, c[2]]}
              scale={[0.12, 0.12, 0.12]} style={labelStyle} transformBehaviors={['billboard']} />
          </React.Fragment>
        );
      })}

      {/* POLÍGONO EN CONSTRUCCIÓN (piso u objeto) */}
      {cur.map((p, i) => (
        <ViroSphere key={`p-${i}`} position={lift(p)} radius={0.018}
          materials={[i === 0 && cur.length >= 3 ? 'drawPointFirst' : drawingHole ? 'drawHole' : 'drawPoint']} />
      ))}
      {cur.length >= 2 && (
        <ViroPolyline position={[0, 0, 0]} points={cur.map(p => lift(p, 2 * LIFT))} thickness={0.008}
          materials={[drawingHole ? 'drawHole' : 'drawLine']} />
      )}
      {cur.length >= 2 && <SideLabels poly={cur} closed={false} y={floorY} />}

      {/* LÍNEA VIVA: del último punto a la mira, con su medida, como el Medir de iPhone */}
      {last && aim && (
        <>
          <ViroPolyline position={[0, 0, 0]} points={[lift(last, 2 * LIFT), lift(aim, 2 * LIFT)]}
            thickness={0.006} materials={['drawLive']} />
          <ViroText text={fmt(distXZ(last, aim))}
            position={[(last[0] + aim[0]) / 2, floorY + 0.12, (last[2] + aim[2]) / 2]}
            scale={[0.14, 0.14, 0.14]} style={labelStyle} transformBehaviors={['billboard']} />
        </>
      )}

      {/* MIRA en el piso: se vuelve amarilla y se pega al primer punto cuando puede cerrar */}
      {aim && state.phase !== 'floorDone' && (
        <ViroPolyline position={[0, 0, 0]} points={ring(aim, snapped ? 0.05 : 0.035)} thickness={0.005}
          materials={[snapped ? 'drawReticleSnap' : 'drawReticle']} />
      )}
    </ViroNode>
  );
}

const labelStyle = {
  fontFamily: 'Arial', fontSize: 14, color: '#ffffff',
  textAlignVertical: 'center' as const, textAlign: 'center' as const,
};