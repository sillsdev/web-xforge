import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { getAudioTimings, getAudioTimingWithHeadings } from './checking-test.utils';
import { CheckingUtils } from './checking.utils';

describe('CheckingUtils', () => {
  let env: TestEnvironment;
  beforeAll(() => {
    env = new TestEnvironment();
  });

  it('can parse audio text ref', () => {
    expect(CheckingUtils.parseAudioRef(env.audioTimingBasic, 0.9)).toEqual({ verseStr: '1' });
    expect(CheckingUtils.parseAudioRef(env.audioTimingBasic, 1.9)).toEqual({ verseStr: '2' });
    expect(CheckingUtils.parseAudioRef(env.audioTimingBasic, 2.9)).toEqual({ verseStr: '3-4' });
  });

  it('can parse audio heading ref', () => {
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHearThis, 0.0)).toBeUndefined();
    // audio timing files should only ever have 1 chapter
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHearThis, 0.1)).toEqual({
      label: 'c',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHearThis, 0.5)).toEqual({
      label: 'ms',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHearThis, 1.0)).toEqual({
      label: 's',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHearThis, 2.0)).toEqual({
      label: 's',
      iteration: 2
    });
  });

  it('can parse audio heading ref no iteration values', () => {
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHeadings, 0.75)).toEqual({
      label: 's',
      iteration: 1
    });
    expect(CheckingUtils.parseAudioHeadingRef(env.audioTimingHeadings, 2.25)).toEqual({
      label: 's',
      iteration: 2
    });
  });
});

class TestEnvironment {
  audioTimingBasic: AudioTiming[] = getAudioTimings();
  audioTimingHeadings: AudioTiming[] = getAudioTimingWithHeadings();
  audioTimingHearThis: AudioTiming[] = [
    { textRef: 'c', from: 0.1, to: 0.5 },
    { textRef: 'ms1', from: 0.5, to: 1.0 },
    { textRef: 's1', from: 1.0, to: 1.5 },
    { textRef: '1', from: 1.5, to: 2.0 },
    { textRef: 's2', from: 2.0, to: 2.5 },
    { textRef: '2', from: 2.5, to: 3.0 },
    { textRef: '3', from: 3.0, to: 3.5 }
  ];

  constructor() {}
}
