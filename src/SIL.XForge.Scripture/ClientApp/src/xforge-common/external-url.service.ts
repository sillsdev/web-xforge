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
    return this.helps + '/community-checking#1ed2e353d94847a3861ad3a69d531aac';
  }

  get csvImportHelpPage(): string {
    return this.helps + '/community-checking#42107c9def434bf396442d0004577710';
  }

  get chapterAudioHelpPage(): string {
    return this.helps + '/community-checking#fd31ef9b6d74417099996e7dadb5068e';
  }

  get sharingSettingsHelpPage(): string {
    return this.helps + '/community-checking#5aa7e3d8451f40cfa6b33c5dd39a3c6f';
  }

  get graphite(): string {
    return 'https://graphite.sil.org/';
  }
}
