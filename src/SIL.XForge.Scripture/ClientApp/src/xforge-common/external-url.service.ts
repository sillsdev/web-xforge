import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { ExternalUrls } from './external-url-class';
import { I18nService } from './i18n.service';

/**
 * This service class extends the ExternalUrls class to make it injectable.
 */
@Injectable({ providedIn: 'root' })
export class ExternalUrlService extends ExternalUrls {
  constructor(i18n: I18nService) {
    super(i18n, { helpUrl: environment.helps, defaultLocaleHelpString: I18nService.defaultLocale.helps! });
  }
}
