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
  announcementPage = 'https://software.sil.org/scriptureforge/news/';

  constructor(private readonly i18n: I18nService) {}

  get helps(): string {
    const localeUrlPortion = this.i18n.locale.helps || I18nService.defaultLocale.helps!;
    return localeUrlPortion === '' ? environment.helps : `${environment.helps}/${localeUrlPortion}`;
  }

  get manual(): string {
    return this.helps + '/manual';
  }

  get autoDrafts(): string {
    return this.helps + '/understanding-drafts';
  }

  get rolesHelpPage(): string {
    return this.manual + '/#t=concepts%2Froles.htm';
  }

  get transceleratorImportHelpPage(): string {
    return this.helps + '/adding-questions#1850d745ac9e8003815fc894b8baaeb7';
  }

  get csvImportHelpPage(): string {
    return this.helps + '/adding-questions#1850d745ac9e8085960dd88b648f0c7a';
  }

  get chapterAudioHelpPage(): string {
    return this.helps + '/adding-questions#1850d745ac9e80e795f3d611356e74d5';
  }

  get sharingSettingsHelpPage(): string {
    return this.helps + '/managing-checkers#1850d745ac9e8097ad4efcb063fc2603';
  }

  get graphite(): string {
    return 'https://graphite.sil.org/';
  }
}
