import { Injectable } from '@angular/core';
import Quill from 'quill';
import { Observable, distinctUntilChanged, filter, fromEvent, of, shareReplay, startWith, switchMap } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';

@Injectable({
  providedIn: 'root'
})
export class QuillEditorReadyService implements EditorReadyService {
  // Arbitrary event to ensure 'ready' is checked in case editor changes have already fired
  private readonly initialEvent = 'initial';

  listenEditorReadyState(editor: Quill): Observable<boolean> {
    return fromEvent(editor, 'editor-change').pipe(
      startWith([this.initialEvent]),
      filter(([event]: any) => event === 'text-change' || event === this.initialEvent),
      switchMap(() => of(editor.getLength() > 1)),
      distinctUntilChanged(),
      shareReplay(1)
    );
  }
}
