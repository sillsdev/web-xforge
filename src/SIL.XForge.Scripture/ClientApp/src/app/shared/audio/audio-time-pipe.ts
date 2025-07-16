import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'audioTime',
    standalone: false
})
export class AudioTimePipe implements PipeTransform {
  transform(seconds: number, ..._args: any[]): string {
    const minutesString = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const secondsString = seconds >= 10 ? seconds : '0' + seconds;
    return minutesString + ':' + secondsString;
  }
}
