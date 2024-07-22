import { Inject, Injectable, InjectionToken } from '@angular/core';
import { RegisteredFormatNames } from './quill-scripture';

export const SF_QUILL_FORMAT_NAMES = new InjectionToken<RegisteredFormatNames[]>('SF_QUILL_FORMAT_NAMES');

@Injectable({
  providedIn: 'root'
})
export class QuillFormatsService {
  readonly formatNames: string[];
  readonly excludeFromDataModelFormatNames: string[];

  constructor(@Inject(SF_QUILL_FORMAT_NAMES) registeredFormatNames: RegisteredFormatNames[]) {
    this.formatNames = registeredFormatNames.flatMap(obj => obj.formatNames);
    this.excludeFromDataModelFormatNames = registeredFormatNames.flatMap(obj => obj.excludeFromDataModelFormatNames);
  }
}
