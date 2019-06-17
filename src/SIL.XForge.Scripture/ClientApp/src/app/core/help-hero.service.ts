import { Injectable } from '@angular/core';
import initHelpHero from 'helphero';
import { HelpHero, HEventKind, HEvent, HEventInfo } from 'help-hero';

@Injectable({
  providedIn: 'root'
})
export class HelpHeroService {
  helpHeroClient: HelpHero;
  constructor() {
    this.helpHeroClient = initHelpHero('9yZMlWWMsDS');
  }
  setIdentity(id: string): void {
    this.helpHeroClient.identify(id);
  }
  anonymous() {
    this.helpHeroClient.anonymous();
  }
  setProperty(jObj: any): void {
    this.helpHeroClient.update(jObj);
  }
  startTour(tourId: string, options?: any) {
    this.helpHeroClient.startTour(tourId, options);
  }
  on(eventName: HEventKind, listenerFn: (event: HEvent, info: HEventInfo) => void) {
    this.helpHeroClient.on(eventName, listenerFn);
  }
}
