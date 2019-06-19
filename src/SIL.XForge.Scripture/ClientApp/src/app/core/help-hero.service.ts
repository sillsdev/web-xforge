import { Injectable } from '@angular/core';
import initHelpHero from 'helphero';

@Injectable({ providedIn: 'root' })
export class HelpHeroService {
  helpHeroClient = initHelpHero('XXXXX');
  on = this.helpHeroClient.on;
  setIdentity = this.helpHeroClient.identify;
  anonymous = this.helpHeroClient.anonymous;
  setProperty = this.helpHeroClient.update;
  startTour = this.helpHeroClient.startTour;
}
