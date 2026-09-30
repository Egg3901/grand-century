"""Reproduce the web oscillator palette as tiny offline PCM assets for native playback."""
import math
import struct
import wave
from pathlib import Path
out = Path(__file__).resolve().parents[1] / 'apps/mobile/assets/audio'
out.mkdir(parents=True, exist_ok=True)
rate = 22050
for name, frequency in [('ambient', 82), ('war', 180), ('peace', 320), ('bankruptcy', 140), ('rebellion', 170), ('election', 260), ('event', 220)]:
    duration = 2 if name == 'ambient' else .17
    samples = []
    for i in range(round(rate * duration)):
        time = i / rate
        if name == 'ambient':
            sample = 2 / math.pi * math.asin(math.sin(2 * math.pi * frequency * time)) * .0022
        else:
            envelope = min(1, time / .01) * math.exp(-time * 38)
            sample = math.sin(2 * math.pi * frequency * time) * .03 * envelope
        samples.append(struct.pack('<h', round(sample * 32767)))
    with wave.open(str(out / f'{name}.wav'), 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b''.join(samples))
