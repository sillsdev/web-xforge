import { Component, Inject } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { I18nService } from 'xforge-common/i18n.service';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SFValidators } from '../../shared/sfvalidators';

export interface BiblicalTermDialogData {
  biblicalTermDoc: BiblicalTermDoc;
  projectDoc?: SFProjectProfileDoc;
  projectUserConfigDoc?: SFProjectUserConfigDoc;
}

@Component({
  templateUrl: './biblical-term-dialog.component.html',
  styleUrls: ['./biblical-term-dialog.component.scss']
})
export class BiblicalTermDialogComponent {
  definition: string = '';

  renderings = new FormControl('', { nonNullable: true, validators: [SFValidators.balancedParentheses] });
  description = new FormControl('', { nonNullable: true });
  form = new FormGroup({
    renderings: this.renderings,
    description: this.description
  });

  private readonly biblicalTermDoc?: BiblicalTermDoc;
  private readonly projectDoc?: SFProjectProfileDoc;
  private readonly projectUserConfigDoc?: SFProjectUserConfigDoc;

  constructor(
    private dialogRef: MatDialogRef<BiblicalTermDialogComponent>,
    private readonly i18n: I18nService,
    @Inject(MAT_DIALOG_DATA) data: BiblicalTermDialogData
  ) {
    this.biblicalTermDoc = data.biblicalTermDoc;
    this.projectDoc = data.projectDoc;
    this.projectUserConfigDoc = data.projectUserConfigDoc;
    this.definition = this.getTermDefinition();
    this.renderings.setValue(this.biblicalTermDoc.data?.renderings.join('\n') ?? '');
    this.description.setValue(this.biblicalTermDoc.data?.description ?? '');
  }

  canEdit(): boolean {
    const project = this.projectDoc?.data;
    const userId = this.projectUserConfigDoc?.data?.ownerRef;
    return project != null && userId != null
      ? SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.BiblicalTerms, Operation.Edit)
      : false;
  }

  submit(): void {
    if (!this.form.valid) return;
    const renderings: string[] = (this.renderings.value ?? '')
      .split(/\r?\n/)
      .map((rendering: string) => rendering.trim())
      .filter((rendering: string) => rendering !== '');
    const renderingsChanged: boolean = renderings.join('\n') !== this.biblicalTermDoc?.data?.renderings.join('\n');
    const description: string = this.description.value;
    this.biblicalTermDoc?.submitJson0Op(op => {
      op.set<string>(b => b.description, description);
      if (renderingsChanged) {
        op.set<string[]>(b => b.renderings, renderings);
      }
    });
    this.dialogRef.close();
  }

  private getTermDefinition(): string {
    const term: string = this.projectUserConfigDoc?.data?.transliterateBiblicalTerms
      ? (this.biblicalTermDoc?.data?.transliteration ?? '')
      : (this.biblicalTermDoc?.data?.termId ?? '');
    let gloss: string;
    let notes: string;
    if (this.biblicalTermDoc?.data?.definitions.hasOwnProperty(this.i18n.localeCode)) {
      gloss = this.biblicalTermDoc?.data.definitions[this.i18n.localeCode].gloss;
      notes = this.biblicalTermDoc?.data.definitions[this.i18n.localeCode].notes;

      // If the locale does not have the gloss or notes, get these from the default language, if we can
      if (this.biblicalTermDoc?.data?.definitions.hasOwnProperty(I18nService.defaultLocale.canonicalTag)) {
        if (gloss === '') {
          gloss = this.biblicalTermDoc?.data.definitions[I18nService.defaultLocale.canonicalTag].gloss;
        }
        if (notes === '') {
          notes = this.biblicalTermDoc?.data.definitions[I18nService.defaultLocale.canonicalTag].notes;
        }
      }
    } else if (this.biblicalTermDoc?.data?.definitions.hasOwnProperty(I18nService.defaultLocale.canonicalTag)) {
      gloss = this.biblicalTermDoc?.data.definitions[I18nService.defaultLocale.canonicalTag].gloss;
      notes = this.biblicalTermDoc?.data.definitions[I18nService.defaultLocale.canonicalTag].notes;
    } else {
      return term;
    }

    return `${term} --- ${gloss} --- ${notes}`;
  }
}
