import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { LynxableEditor } from '../lynx-editor';

@Injectable()
export abstract class EditorReadyService {
  abstract listenEditorReadyState(editor: LynxableEditor): Observable<boolean>;
}
