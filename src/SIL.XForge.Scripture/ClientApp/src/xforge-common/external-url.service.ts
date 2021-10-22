import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ExternalUrlService {
  paratext = 'https://paratext.org/';
  transcelerator = 'https://software.sil.org/transcelerator/';
  communitySupport = 'https://community.scripture.software.sil.org/c/scripture-forge/19';
  communityAnnouncementPages = 'https://community.scripture.software.sil.org/t/scripture-forge-announcements/1776';

  helpPages = {
    mainPage: environment.helps,
    transceleratorImport:
      environment.helps + '/en/index.htm?#t=Tasks%2FAdministrator_tasks%2FImport_questions_from_Transcelerator.htm',
    csvImport: environment.helps // TODO implement
  };
}
