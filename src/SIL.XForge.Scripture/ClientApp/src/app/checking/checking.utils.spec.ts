import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { CheckingUtils } from './checking.utils';

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

function getAudioTimingFromHearThis(): AudioTiming[] {
  return [
    { textRef: 'c', from: 0.0, to: 0.5 },
    { textRef: 'ms1', from: 0.5, to: 1.0 },
    { textRef: 's1', from: 1.0, to: 1.5 },
    { textRef: '1', from: 1.5, to: 2.0 },
    { textRef: 's2', from: 2.0, to: 2.5 },
    { textRef: '2', from: 2.5, to: 3.0 },
    { textRef: '3', from: 3.0, to: 3.5 }
  ];
}

describe('CheckingUtils', () => {
  const audioTimingBasic: AudioTiming[] = getAudioTimings();
  const audioTimingHeadings: AudioTiming[] = getAudioTimingWithHeadings();
  const audioTimingHearThis: AudioTiming[] = getAudioTimingFromHearThis();

  it('can parse audio text ref', () => {
    expect(CheckingUtils.parseAudioRef(audioTimingBasic, 0.9)).toEqual({ verseStr: '1' });
    expect(CheckingUtils.parseAudioRef(audioTimingBasic, 1.9)).toEqual({ verseStr: '2' });
    expect(CheckingUtils.parseAudioRef(audioTimingBasic, 2.9)).toEqual({ verseStr: '3-4' });
  });

  it('can parse audio description ref', () => {
    // audio timing files should only ever have 1 chapter
    expect(CheckingUtils.parseAudioHeadingRef(audioTimingHearThis, 0.0)).toEqual({
      label: 'c',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(audioTimingHearThis, 0.5)).toEqual({
      label: 'ms',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(audioTimingHearThis, 1.0)).toEqual({
      label: 's',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(audioTimingHearThis, 2.0)).toEqual({
      label: 's',
      iteration: 2
    });
  });

  it('can parse audio description ref no iteration values', () => {
    expect(CheckingUtils.parseAudioHeadingRef(audioTimingHeadings, 0.75)).toEqual({
      label: 's',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(audioTimingHeadings, 2.25)).toEqual({
      label: 's',
      iteration: 2
    });
  });
});
