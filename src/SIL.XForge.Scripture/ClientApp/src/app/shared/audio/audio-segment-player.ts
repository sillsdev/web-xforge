import { PwaService } from 'xforge-common/pwa.service';
import { AudioPlayer } from './audio-player';

export class AudioSegmentPlayer extends AudioPlayer {
  constructor(source: string, private readonly _start: number, private readonly _end: number, pwaService: PwaService) {
    super(source, pwaService);

    this.audio.addEventListener('timeupdate', () => {
      if (this.currentTime >= this.duration) {
        this.pause();
      }
    });
  }

  override get duration(): number {
    return this.audio.duration === Infinity ? 0 : this._end - this._start;
  }

  override get currentTime(): number {
    return isNaN(this.audio.currentTime) || this.audio.currentTime === AudioPlayer.ARBITRARILY_LARGE_NUMBER
      ? 0
      : this.audio.currentTime - this._start;
  }

  override set currentTime(time: number) {
    this.audio.currentTime = time + this._start;
  }
}
