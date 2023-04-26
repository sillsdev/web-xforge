import party from 'party-js';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class GamificationService {
  confetti(element: HTMLElement): void {
    party.confetti(element, {
      count: 100,
      shapes: ['star'],
      size: 0.75,
      color: () => party.Color.fromHsl(Math.floor(Math.random() * 360), 100, 50),
      modules: [
        new party.ModuleBuilder()
          .drive('rotation')
          .by(t => new party.Vector(0, 0, t * 360))
          .through('lifetime')
          .build()
      ]
    });
  }
}
