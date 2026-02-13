import { Injectable } from '@angular/core';
import { LocationService } from 'xforge-common/location.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class BrandingService {
  constructor(private readonly locationService: LocationService) {}

  get useScriptureForgeBranding(): boolean {
    return this.locationService.host === new URL(environment.masterUrl).host;
  }
}
