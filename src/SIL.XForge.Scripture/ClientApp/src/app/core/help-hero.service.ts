import { Injectable } from '@angular/core';
import initHelpHero from 'helphero';
import * as helphero from 'src/typings/help-hero';

@Injectable({
  providedIn: 'root'
})
export class HelpHeroService {
  helpHeroClient: helphero.HelpHero;
  constructor() {
    this.helpHeroClient = initHelpHero('9yZMlWWMsDS');
  }
  setIdentity(id: string): void {
    this.helpHeroClient.identify(id);
  }
  setProperty(jObj: any): void {
    this.helpHeroClient.update(jObj);
  }
  startTour(tourId: string, options?: any) {
    this.helpHeroClient.startTour(tourId, options);
  }
  on(eventName: helphero.HEventKind, listenerFn: (event: helphero.HEvent, info: helphero.HEventInfo) => void) {
    this.helpHeroClient.on(eventName, listenerFn);
  }
}
