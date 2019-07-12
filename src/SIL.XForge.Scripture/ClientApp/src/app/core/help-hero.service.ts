import { Injectable } from '@angular/core';
import initHelpHero from 'helphero';

@Injectable({ providedIn: 'root' })
export class HelpHeroService {
  readonly helpHeroClient = initHelpHero('9yZMlWWMsDS');

  on(id: string, callback: () => void) {
    this.helpHeroClient.on(id as any, callback);
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
}
