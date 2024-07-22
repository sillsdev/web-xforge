import { Injectable } from '@angular/core';
import { Attributor, Formattable } from 'parchment';
import Quill from 'quill';
import { isAttributor } from './quill-formats/quill-attributors';

export interface FormattableBlotClass {
  new (...args: any[]): Formattable;
  blotName: string;
}

@Injectable({
  providedIn: 'root'
})
export class QuillFormatRegistryService {
  private readonly registeredFormats = new Set<string>();
  private readonly registeredFormatClasses = new Set<FormattableBlotClass | Attributor>();

  registerFormats(formats: (FormattableBlotClass | Attributor)[]): string[] {
    const formatNames: string[] = [];

    for (const format of formats) {
      if (this.registeredFormatClasses.has(format)) {
        continue;
      }

      const isAttr = isAttributor(format);
      const prefix = isAttr ? 'formats' : 'blots';
      const name = isAttr ? format.attrName : format.blotName;

      Quill.register(`${prefix}/${name}`, format);
      this.registeredFormats.add(name);
      this.registeredFormatClasses.add(format);
      formatNames.push(name);
    }

    return formatNames;
  }

  getRegisteredFormats(): string[] {
    return Array.from(this.registeredFormats);
  }
}
