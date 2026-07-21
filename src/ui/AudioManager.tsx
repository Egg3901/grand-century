import { useEffect, useRef } from 'react';
import { useStore } from '../store';

function createTone(context: AudioContext, frequency: number, duration: number, volume: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.value = volume;
  oscillator.connect(gain).connect(context.destination);
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

export function AudioManager() {
  const alerts = useStore((state) => state.alerts);
  const muteAudio = useStore((state) => state.muteAudio);
  const audioRef = useRef<AudioContext | null>(null);
  const ambientRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);
  const heardCountRef = useRef(0);

  useEffect(() => {
    if (audioRef.current) return;
    const context = new AudioContext();
    audioRef.current = context;
    const resume = () => {
      void context.resume();
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    return () => {
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      if (ambientRef.current) {
        ambientRef.current.osc.stop();
        ambientRef.current.gain.disconnect();
      }
      void context.close();
    };
  }, []);

  useEffect(() => {
    const context = audioRef.current;
    if (!context) return;
    if (muteAudio) {
      if (ambientRef.current) ambientRef.current.gain.gain.value = 0;
      return;
    }
    if (!ambientRef.current) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 82;
      gain.gain.value = 0.0022;
      osc.connect(gain).connect(context.destination);
      osc.start();
      ambientRef.current = { osc, gain };
    } else {
      ambientRef.current.gain.gain.value = 0.0022;
    }
  }, [muteAudio]);

  useEffect(() => {
    const context = audioRef.current;
    if (!context || muteAudio) return;
    if (alerts.length <= heardCountRef.current) return;
    const latest = alerts[alerts.length - 1];
    // Skip routine foreign-election batch tones — keeps mobile calm.
    if (latest.kind === 'election' && /elections this month/i.test(latest.message)) {
      heardCountRef.current = alerts.length;
      return;
    }
    const base = latest.kind === 'war'
      ? 180
      : latest.kind === 'peace'
        ? 320
        : latest.kind === 'bankruptcy'
          ? 140
          : latest.kind === 'rebellion'
            ? 170
            : latest.kind === 'election'
              ? 260
              : 220;
    createTone(context, base, 0.15, 0.03);
    heardCountRef.current = alerts.length;
  }, [alerts, muteAudio]);

  return null;
}

