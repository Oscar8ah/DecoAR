import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ViroARSceneNavigator } from '@reactvision/react-viro';
import FloorScanScene from './components/ar/FloorScanScene';

export default function App() {
  return (
    <View style={styles.container}>
      <ViroARSceneNavigator
        initialScene={{ scene: FloorScanScene }}
        style={styles.arView}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  arView: {
    flex: 1,
  },
});