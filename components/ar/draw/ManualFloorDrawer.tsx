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
import { DrawAction, DrawState, Target, Vec3, distXZ, outwardNormal, snapReticle, centroidXZ, areaXZ } from './drawModel';

/**
 * Dibuja en AR el estado del modo "Dibujar" (la lógica vive en drawModel.ts).
 * Se apunta con la MIRA central y se presiona "+", como en el Medir de iPhone.
 *
 * Edición estilo Maya sobre la figura seleccionada (amarilla):
 *   ⚪ esferas blancas  = vértices (mover una esquina)
 *   🔵 esferas azules   = lados (desplazar un lado por su normal)
 *   🟢 esfera verde     = mover la figura completa
 * Tocar el piso o un objeto lo selecciona.
 */

const TILE_METERS = 0.6;   // tamaño físico de la textura de prueba (cambiar con el catálogo real)
const Z_SIGN = -1;         // misma convención que RoomScanScene
const LIFT = 0.004;        // separa del piso para que no parpadee contra el piso automático
const MIN_EDGE_FOR_HANDLE = 0.2; // m: en lados más cortos la manija del lado taparía las de las esquinas

ViroMaterials.createMaterials({
  drawFill: {
    diffuseTexture: require('../../../assets/textures/floor-test-tile.jpg'),
    wrapS: 'Repeat', wrapT: 'Repeat',
    cullMode: 'None', lightingModel: 'Constant',
  },
  drawLine: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawLineSel: { diffuseColor: '#FACC15', lightingModel: 'Constant' },
  drawLive: { diffuseColor: '#FFFFFFAA', blendMode: 'Alpha', lightingModel: 'Constant' },
  drawPoint: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawPointFirst: { diffuseColor: '#FACC15', lightingModel: 'Constant' },
  drawHole: { diffuseColor: '#F97316', lightingModel: 'Constant' },
  drawHoleFill: { diffuseColor: '#F9731633', blendMode: 'Alpha', cullMode: 'None', lightingModel: 'Constant', writesToDepthBuffer: false },
  drawHoleFillSel: { diffuseColor: '#FACC1540', blendMode: 'Alpha', cullMode: 'None', lightingModel: 'Constant', writesToDepthBuffer: false },
  drawHandle: { diffuseColor: '#3B82F6', lightingModel: 'Constant' },
  drawVertex: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawMove: { diffuseColor: '#22C55E', lightingModel: 'Constant' },
  drawReticle: { diffuseColor: '#FFFFFF', lightingModel: 'Constant' },
  drawReticleSnap: { diffuseColor: '#FACC15', lightingModel: 'Constant' },
});

interface Props {
  state: DrawState;
  reticle: Vec3 | null;
  floorY: number;
  dispatch: (a: DrawAction) => void;
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

/**
 * Manijas de edición de UNA figura. Cada arrastre empieza con 'beginEdit' y termina
 * con 'endEdit', así el historial lo guarda como un único paso deshacible.
 */
function EditHandles({ poly, target, floorY, dispatch }: { poly: Vec3[]; target: Target; floorY: number; dispatch: (a: DrawAction) => void }) {
  // Última posición del dedo por manija (para lados y traslación, que trabajan con deltas)
  const last = useRef(new Map<string, Vec3 | null>());
  // Desfase entre el centro de la esfera y donde la agarró el dedo (para vértices, que van a posición absoluta)
  const grab = useRef(new Map<string, Vec3 | null>());
  const plane = { planePoint: [0, floorY, 0] as Vec3, planeNormal: [0, 1, 0] as Vec3, maxDistance: 20 };

  const onState = (key: string) => (st: number) => {
    if (st === ViroClickStateTypes.CLICK_DOWN) {
      last.current.set(key, null); grab.current.set(key, null);
      dispatch({ type: 'beginEdit' });
    } else if (st === ViroClickStateTypes.CLICK_UP) {
      last.current.set(key, null); grab.current.set(key, null);
      dispatch({ type: 'endEdit' });
    }
  };
  const delta = (key: string, to: Vec3): Vec3 => {
    const prev = last.current.get(key) ?? to;
    last.current.set(key, to);
    return [to[0] - prev[0], 0, to[2] - prev[2]];
  };

  const n = poly.length;
  const c = centroidXZ(poly);
  return (
    <>
      {/* Vértices */}
      {poly.map((p, i) => {
        const key = `v-${i}`;
        return (
          <ViroSphere key={key} position={[p[0], floorY + 0.02, p[2]]} radius={0.04}
            materials={['drawVertex']} dragType="FixedToPlane" dragPlane={plane}
            onClickState={onState(key)}
            onDrag={(to: Vec3) => {
              let off = grab.current.get(key);
              if (!off) { off = [p[0] - to[0], 0, p[2] - to[2]]; grab.current.set(key, off); }
              dispatch({ type: 'dragVertex', target, index: i, to: [to[0] + off[0], floorY, to[2] + off[2]] });
            }}
          />
        );
      })}

      {/* Lados */}
      {poly.map((p, i) => {
        const q = poly[(i + 1) % n];
        if (distXZ(p, q) < MIN_EDGE_FOR_HANDLE) return null;
        const key = `e-${i}`;
        const nrm = outwardNormal(poly, i);
        return (
          <ViroSphere key={key} position={[(p[0] + q[0]) / 2, floorY + 0.02, (p[2] + q[2]) / 2]} radius={0.035}
            materials={['drawHandle']} dragType="FixedToPlane" dragPlane={plane}
            onClickState={onState(key)}
            onDrag={(to: Vec3) => {
              const d = delta(key, to);
              const amount = d[0] * nrm[0] + d[2] * nrm[1];
              if (Math.abs(amount) > 0.002) dispatch({ type: 'dragEdge', target, edge: i, amount });
            }}
          />
        );
      })}

      {/* Mover toda la figura */}
      <ViroSphere key="move" position={[c[0], floorY + 0.03, c[2]]} radius={0.05}
        materials={['drawMove']} dragType="FixedToPlane" dragPlane={plane}
        onClickState={onState('move')}
        onDrag={(to: Vec3) => {
          const d = delta('move', to);
          if (Math.hypot(d[0], d[2]) > 0.002) dispatch({ type: 'translate', target, delta: d });
        }}
      />
    </>
  );
}

export default function ManualFloorDrawer({ state, reticle, floorY, dispatch }: Props) {
  const { point: aim, snapped } = snapReticle(state, reticle);
  const drawingHole = state.phase === 'hole';
  const editing = state.phase === 'floorDone';
  const cur = state.current;
  const last = cur[cur.length - 1];
  const sel = state.selected;
  const selPoly = sel === null ? null : sel === 'floor' ? state.floor : state.holes[sel] ?? null;

  return (
    <ViroNode position={[0, 0, 0]}>
      {/* PISO CERRADO: textura a escala + huecos donde el humano marcó objetos */}
      {state.floor && (
        <>
          <ViroPolygon
            position={[0, floorY + LIFT, 0]} rotation={[-90, 0, 0]}
            vertices={toXZ(state.floor)} holes={state.holes.map(toXZ)}
            materials={['drawFill']} uvCoordinates={uvFor(state.floor)}
            onClick={editing ? () => dispatch({ type: 'select', target: 'floor' }) : undefined} />
          <ViroPolyline position={[0, 0, 0]} points={[...state.floor, state.floor[0]].map(p => lift(p, 2 * LIFT))}
            thickness={sel === 'floor' && editing ? 0.012 : 0.008} materials={[sel === 'floor' && editing ? 'drawLineSel' : 'drawLine']} />
          <SideLabels poly={state.floor} closed y={floorY} />
        </>
      )}

      {/* OBJETOS marcados: relleno tocable, contorno y área */}
      {state.holes.map((h, k) => {
        const c = centroidXZ(h);
        const isSel = editing && sel === k;
        return (
          <React.Fragment key={`hole-${k}`}>
            <ViroPolygon position={[0, floorY + 1.5 * LIFT, 0]} rotation={[-90, 0, 0]}
              vertices={toXZ(h)} holes={[]} materials={[isSel ? 'drawHoleFillSel' : 'drawHoleFill']}
              onClick={editing ? () => dispatch({ type: 'select', target: k }) : undefined} />
            <ViroPolyline position={[0, 0, 0]} points={[...h, h[0]].map(p => lift(p, 3 * LIFT))}
              thickness={isSel ? 0.012 : 0.01} materials={[isSel ? 'drawLineSel' : 'drawHole']} />
            <ViroText text={`Objeto ${k + 1} · ${areaXZ(h).toFixed(2)} m²`} position={[c[0], floorY + 0.2, c[2]]}
              scale={[0.12, 0.12, 0.12]} style={labelStyle} transformBehaviors={['billboard']} />
            {isSel && <SideLabels poly={h} closed y={floorY} />}
          </React.Fragment>
        );
      })}

      {/* MANIJAS de la figura seleccionada (no mientras se marca un objeto) */}
      {editing && selPoly && sel !== null && (
        <EditHandles key={`edit-${sel}`} poly={selPoly} target={sel} floorY={floorY} dispatch={dispatch} />
      )}

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
      {aim && !editing && (
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