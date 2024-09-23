import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable()
export abstract class EditorReadyService {
  abstract listenEditorReadyState(editor: any): Observable<boolean>;
}
