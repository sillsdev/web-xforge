import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { I18nService } from './i18n.service';

@Injectable({
  providedIn: 'root'
})
export class ExternalUrlService {
  paratext = 'https://paratext.org/';
  transcelerator = 'https://software.sil.org/transcelerator/';
  communitySupport = 'https://community.scripture.software.sil.org/c/scripture-forge/19';
  communityAnnouncementPage = 'https://community.scripture.software.sil.org/t/scripture-forge-announcements/1776';

  constructor(private readonly i18n: I18nService) {}

  get helps(): string {
    const localeUrlPortion = this.i18n.locale.helps || I18nService.defaultLocale.helps!;
    return localeUrlPortion === '' ? environment.helps : `${environment.helps}/${localeUrlPortion}`;
  }

  get manual(): string {
    return this.helps + '/manual';
  }

  get autoDrafts(): string {
    return this.helps + '/generating-drafts';
  }

  get rolesHelpPage(): string {
    return this.manual + '/#t=concepts%2Froles.htm';
  }

  get transceleratorImportHelpPage(): string {
    return this.helps + '/community-checking#1ed2e353d94847a3861ad3a69d531aac';
  }

  get csvImportHelpPage(): string {
    return this.helps + '/community-checking#42107c9def434bf396442d0004577710';
  }
}
