import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { RealtimeService } from 'xforge-common/realtime.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
// import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
// import { startWith, delay, of } from 'rxjs';

export interface DiagnosticDialogData {
  bookNum: number;
  chapterNum: number;
  projectId: string;
  isRightToLeft?: boolean;
  selectedText?: string;
}

@Component({
  selector: 'app-diagnostic-overlay',
  templateUrl: './diagnostic-overlay.component.html',
  styleUrl: './diagnostic-overlay.component.scss'
})
export class DiagnosticDialogComponent extends SubscriptionDisposable implements OnInit {
  @Output() toggleOverlay = new EventEmitter<boolean>();
  isExpanded: boolean = true;
  totalDocsCount: number = 0;
  docsCount: number = 0;
  docs: { [key: string]: number } = {};
  //docsMap: Map<string, number> = new Map<string, number>();

  constructor(private readonly realtimeService: RealtimeService) {
    super();
    // this.subscribe(this.realtimeService.docCount$, subscribeDocs => {
    //   this.docs = subscribeDocs;
    //   this.totalDocsCount = subscribeDocs.size;
    // });
  }

  // get showDocs(): Map<string, number> {
  //   const docsMap: Map<string, number> = new Map<string, number>();
  //   this.docs = this.realtimeService.allDocs;
  //   this.totalDocsCount = this.docs.size;
  //   this.docs.forEach((value, key) => {
  //     const collection = key.split(':')[0];
  //     if(docsMap.has(collection)) {
  //       docsMap.set(collection, docsMap.get(collection)! + 1);
  //     } else {
  //       docsMap.set(collection, 1)
  //     }
  //   });
  //   return docsMap;
  // }

  ngOnInit(): void {
    this.docs = this.realtimeService.docCollection;
    this.totalDocsCount = this.realtimeService.totalDocCount;
    // for(const [key] of this.docs) {
    //   const collection = key.split(':')[0];
    //   if(this.docsMap.has(collection)) {
    //     this.docsMap.set(collection, this.docsMap.get(collection)! + 1);
    //   } else {
    //     this.docsMap.set(collection, 1)
    //   }
    // }
  }

  onToggle(): void {
    this.isExpanded = !this.isExpanded;
    this.toggleOverlay.emit(this.isExpanded);
  }
}
