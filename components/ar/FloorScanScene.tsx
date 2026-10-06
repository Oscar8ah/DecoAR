import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  ViroARScene,
  ViroARPlane,
  ViroQuad,
  ViroText,
  ViroAmbientLight,
  ViroMaterials,
  ViroTrackingStateConstants,
} from '@reactvision/react-viro';

// Materiales translúcidos para resaltar las superficies detectadas.
// Ajusta los colores/opacidad a tu gusto (formato RRGGBBAA).
ViroMaterials.createMaterials({
  floorHighlight: {
    diffuseColor: '#22C55E66', // verde translúcido
  },
  wallHighlight: {
    diffuseColor: '#3B82F666', // azul translúcido
  },
});

type AnchorSize = { width: number; height: number };

export default function FloorScanScene() {
  const [floor, setFloor] = useState<AnchorSize | null>(null);
  const [wall, setWall] = useState<AnchorSize | null>(null);

  const onTrackingUpdated = useCallback((state: number) => {
    if (state === ViroTrackingStateConstants.TRACKING_NORMAL) {
      console.log('[AR] Tracking normal — listo para detectar superficies');
    } else if (state === ViroTrackingStateConstants.TRACKING_UNAVAILABLE) {
      console.log('[AR] Tracking perdido, mueve el teléfono más despacio');
    }
  }, []);

  return (
    <ViroARScene onTrackingUpdated={onTrackingUpdated}>
      <ViroAmbientLight color="#ffffff" intensity={250} />

      {!floor && (
        <ViroText
          text="Apunta al piso y mueve el teléfono despacio..."
          scale={[0.35, 0.35, 0.35]}
          position={[0, 0, -1.3]}
          style={styles.text}
        />
      )}

      {floor && !wall && (
        <ViroText
          text="Piso detectado. Ahora apunta a una pared."
          scale={[0.35, 0.35, 0.35]}
          position={[0, 0.3, -1.3]}
          style={styles.text}
        />
      )}

      {floor && wall && (
        <ViroText
          text="Piso y pared detectados ✔"
          scale={[0.35, 0.35, 0.35]}
          position={[0, 0.3, -1.3]}
          style={styles.text}
        />
      )}

      {/* Plano horizontal hacia arriba = piso */}
      <ViroARPlane
        alignment="HorizontalUpward"
        minWidth={0.3}
        minHeight={0.3}
        onAnchorFound={(anchor: any) =>
          setFloor({ width: anchor.width, height: anchor.height })
        }
        onAnchorUpdated={(anchor: any) =>
          setFloor({ width: anchor.width, height: anchor.height })
        }
      >
        {floor && (
          <ViroQuad
            rotation={[-90, 0, 0]}
            width={floor.width}
            height={floor.height}
            materials={['floorHighlight']}
          />
        )}
      </ViroARPlane>

      {/* Plano vertical = pared */}
      <ViroARPlane
        alignment="Vertical"
        minWidth={0.3}
        minHeight={0.3}
        onAnchorFound={(anchor: any) =>
          setWall({ width: anchor.width, height: anchor.height })
        }
        onAnchorUpdated={(anchor: any) =>
          setWall({ width: anchor.width, height: anchor.height })
        }
      >
        {wall && (
          <ViroQuad
            width={wall.width}
            height={wall.height}
            materials={['wallHighlight']}
          />
        )}
      </ViroARPlane>
    </ViroARScene>
  );
}

const styles = StyleSheet.create({
  text: {
    fontFamily: 'Arial',
    fontSize: 22,
    color: '#ffffff',
    textAlignVertical: 'center',
    textAlign: 'center',
  },
});