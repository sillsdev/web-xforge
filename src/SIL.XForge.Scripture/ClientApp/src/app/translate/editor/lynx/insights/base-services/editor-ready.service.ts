import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable()
export abstract class EditorReadyService {
  abstract getEditorReadyState(editor: any): Observable<boolean>;
}
