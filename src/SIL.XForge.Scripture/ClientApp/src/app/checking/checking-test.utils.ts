import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';

export function getAudioTimings(): AudioTiming[] {
  return [
    { textRef: '1', from: 0.0, to: 1.0 },
    { textRef: '2', from: 1.0, to: 2.0 },
    { textRef: '3-4', from: 2.0, to: 3.0 }
  ];
}

export function getAudioTimingWithHeadings(): AudioTiming[] {
  return [
    { textRef: '1', from: 0.0, to: 0.75 },
    { textRef: 's', from: 0.75, to: 1.5 },
    { textRef: '2', from: 1.5, to: 2.25 },
    { textRef: 's', from: 2.25, to: 3.0 },
    { textRef: '3', from: 3.0, to: 4.0 }
  ];
}
