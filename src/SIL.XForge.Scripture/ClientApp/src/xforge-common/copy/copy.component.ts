import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard';
import { Component, DestroyRef, Input } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { I18nService } from 'xforge-common/i18n.service';

/**
 * CopyComponent shows a small copy control and copies a provided value to the clipboard with brief success feedback.
 */
@Component({
  selector: 'app-copy',
  standalone: true,
  imports: [ClipboardModule, MatIconButton, MatIcon, MatTooltip],
  templateUrl: './copy.component.html',
  styleUrls: ['./copy.component.scss']
})
export class CopyComponent {
  /** Value to be copied to the clipboard. */
  @Input() value: string | undefined;
  @Input() tooltip: string = '';
  @Input() iconName: string = 'content_copy';
  @Input() copiedIconName: string = 'done';
  @Input() copiedDurationMs: number = 1000;

  isCopied: boolean = false;
  private copyTimeoutId: number | undefined;

  constructor(
    private readonly clipboard: Clipboard,
    private readonly destroyRef: DestroyRef,
    private readonly i18n: I18nService
  ) {
    this.tooltip = this.i18n.translateStatic('copy_component.copy_to_clipboard');
    this.destroyRef.onDestroy(() => {
      if (this.copyTimeoutId != null) {
        clearTimeout(this.copyTimeoutId);
      }
    });
  }

  onCopyClick(): void {
    if (this.value == null) return;
    const copied: boolean = this.clipboard.copy(this.value);
    if (!copied) return;
    this.showCopiedState();
  }

  private showCopiedState(): void {
    if (this.copyTimeoutId != null) {
      clearTimeout(this.copyTimeoutId);
    }

    this.isCopied = true;

    if (this.copiedDurationMs <= 0) {
      this.copyTimeoutId = undefined;
      this.isCopied = false;
      return;
    }

    this.copyTimeoutId = window.setTimeout(() => {
      this.isCopied = false;
      this.copyTimeoutId = undefined;
    }, this.copiedDurationMs);
  }
}
