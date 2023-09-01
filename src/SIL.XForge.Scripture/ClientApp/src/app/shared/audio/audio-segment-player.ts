import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioPlayer } from './audio-player';

export class AudioSegmentPlayer extends AudioPlayer {
  constructor(
    source: string,
    private readonly _start: number,
    private readonly _end: number,
    onlineStatusService: OnlineStatusService
  ) {
    super(source, onlineStatusService);
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
