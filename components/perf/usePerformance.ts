import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  DeviceInfo, DeviceProfile, GOVERNOR, Tier, GovEvent, GovState,
  classifyDevice, createGovernor, resumeGovernor, stepGovernor,
} from './perfModel';
import { runJsBenchmark, startLagSampler, startLoadSimulator } from './perfRuntime';

/**
 * Lee el modelo y la RAM con expo-device. Si el módulo nativo todavía no está en la
 * compilación instalada en el teléfono (hay que recompilar tras instalarlo), no truena:
 * devuelve "sin datos" y el vigilante sigue protegiendo igual.
 */
export function readDeviceInfo(): DeviceInfo {
  const os: DeviceInfo['os'] = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other';
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Device = require('expo-device');
    return {
      os,
      modelId: Device.modelId ?? null,
      modelName: Device.modelName ?? null,
      brand: Device.brand ?? null,
      totalMemoryBytes: typeof Device.totalMemory === 'number' ? Device.totalMemory : null,
      source: 'expo-device',
    };
  } catch {
    return { os, modelId: null, modelName: null, brand: null, totalMemoryBytes: null, source: 'none' };
  }
}

export function useDeviceProfile(): { info: DeviceInfo; profile: DeviceProfile; benchmarkMs: number | null } {
  const [base] = useState(() => {
    const info = readDeviceInfo();
    return { info, profile: classifyDevice(info) };
  });
  const [benchmarkMs, setBenchmarkMs] = useState<number | null>(null);
  useEffect(() => {
    // Un instante después de pintar la pantalla, para que no se vea congelada.
    const id = setTimeout(() => setBenchmarkMs(runJsBenchmark()), 400);
    return () => clearTimeout(id);
  }, []);
  return { ...base, benchmarkMs };
}

export interface Countdown { secondsLeft: number; target: Tier | 'exit' }

interface Options {
  tier: Tier;
  active: boolean;          // false mientras se muestra la pantalla de inicio
  simulateLoad: boolean;    // solo pruebas
  onDrop: (from: Tier, to: Tier) => void;
  onUnfit: () => void;
}

/** Vigila la fluidez mientras `active` sea true. Devuelve la cuenta regresiva si hay una en curso. */
export function usePerformanceGovernor({ tier, active, simulateLoad, onDrop, onUnfit }: Options): Countdown | null {
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const cb = useRef({ onDrop, onUnfit });
  cb.current = { onDrop, onUnfit };

  useEffect(() => {
    if (!active) { setCountdown(null); return; }
    let gov: GovState = createGovernor(tier, Date.now());
    let appActive = AppState.currentState === 'active';

    const stopSampler = startLagSampler((lag, at) => {
      if (!appActive) return;
      const step = stepGovernor(gov, at, lag);
      gov = step.state;
      const target = gov.countdown?.target ?? null;
      setCountdown(prev => {
        if (step.secondsLeft === null || target === null) return prev === null ? prev : null;
        return prev && prev.secondsLeft === step.secondsLeft && prev.target === target ? prev : { secondsLeft: step.secondsLeft, target };
      });
      for (const e of step.events as GovEvent[]) {
        if (e.type === 'drop') cb.current.onDrop(e.from, e.to);
        else if (e.type === 'unfit') cb.current.onUnfit();
      }
    }, GOVERNOR.sampleMs);

    const sub = AppState.addEventListener('change', s => {
      appActive = s === 'active';
      if (appActive) { gov = resumeGovernor(gov, Date.now()); setCountdown(null); }
    });
    const stopLoad = simulateLoad ? startLoadSimulator() : () => {};

    return () => { stopSampler(); stopLoad(); sub.remove(); setCountdown(null); };
  }, [tier, active, simulateLoad]);

  return countdown;
}