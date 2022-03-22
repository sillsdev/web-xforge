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
    return environment.helps + '/' + (this.i18n.locale.helps || I18nService.defaultLocale.helps!);
  }

  get transceleratorImportHelpPage(): string {
    return this.helps + '/index.htm?#t=Tasks%2FAdministrator_tasks%2FImport_questions_from_Transcelerator.htm';
  }

  get csvImportHelpPage(): string {
    return this.helps + '/#t=Tasks%2FAdministrator_tasks%2FImport_questions_from_spreadsheet.htm';
  }
}
