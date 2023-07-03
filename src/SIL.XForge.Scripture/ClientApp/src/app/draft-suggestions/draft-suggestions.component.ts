import { ChangeDetectorRef, Component, OnInit } from '@angular/core';

interface EdgeWindow {
  chrome: any;
}

declare let window: Window & EdgeWindow;

@Component({
  selector: 'app-draft-suggestions',
  templateUrl: './draft-suggestions.component.html',
  styleUrls: ['./draft-suggestions.component.css']
})
export class DraftSuggestionsComponent implements OnInit {
  public messageFromParatext: string = 'No Data Yet';
  constructor(private changeDetectorRef: ChangeDetectorRef) {}

  ngOnInit(): void {
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', (arg: any) => {
        if ('BBBCCCVVV' in arg.data) {
          this.messageFromParatext = JSON.stringify(arg.data);

          // Force an update of the
          this.changeDetectorRef.detectChanges();
        }
      });
    }
  }
}
