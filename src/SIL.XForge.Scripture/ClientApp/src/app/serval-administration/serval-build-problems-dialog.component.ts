import { Component, Inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { CopyComponent } from 'xforge-common/copy/copy.component';
import { BuildReportProblem } from './serval-build-report';

/** A section in the Serval build problems dialog. */
export interface ServalBuildProblemsDialogSection {
  heading: string;
  problems: BuildReportProblem[];
}

/** Data passed to the Serval build problems dialog. */
export interface ServalBuildProblemsDialogData {
  servalBuildId: string;
  sections: ServalBuildProblemsDialogSection[];
}

/** Displays problems for a Serval build. */
@Component({
  selector: 'app-serval-build-problems-dialog',
  templateUrl: './serval-build-problems-dialog.component.html',
  styleUrls: ['./serval-build-problems-dialog.component.scss'],
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatDialogClose, MatIcon, CopyComponent]
})
export class ServalBuildProblemsDialog {
  constructor(@Inject(MAT_DIALOG_DATA) readonly data: ServalBuildProblemsDialogData) {}

  get nonEmptySections(): ServalBuildProblemsDialogSection[] {
    return this.data.sections.filter((section: ServalBuildProblemsDialogSection) => section.problems.length > 0);
  }

  /** Returns the set of problems in text to be copied to the clipboard. */
  get copyAllValue(): string {
    let text: string = `# Problems with Serval build ID ${this.data.servalBuildId}\n`;

    for (const section of this.nonEmptySections) {
      text += `\n## ${section.heading}\n\n`;
      text += `${this.sectionCopyValue(section)}\n`;
    }

    return text;
  }

  /** Returns the set of problems in a section in text to be copied to the clipboard. */
  sectionCopyValue(section: ServalBuildProblemsDialogSection): string {
    return section.problems.map((problem: BuildReportProblem) => `- ${problem.message}`).join('\n');
  }

  /** Copies all problems to the clipboard. */
  copyAllToClipboard(): void {
    void navigator.clipboard.writeText(this.copyAllValue);
  }
}
