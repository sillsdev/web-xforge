import { Injectable } from '@angular/core';
import Quill from 'quill';
import { RegisteredFormatNames } from '../../../../../shared/text/quill-scripture';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightBlotService {
  constructor() {}

  registerBlots(formats: { blotName: string }[]): RegisteredFormatNames {
    const formatNames: string[] = [];

    for (const format of formats) {
      Quill.register(`blots/${format.blotName}`, format);
      formatNames.push(format.blotName);
    }

    return {
      formatNames,
      excludeFromDataModelFormatNames: [...formatNames]
    };
  }
}
