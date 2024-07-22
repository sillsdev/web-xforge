import { TestBed } from '@angular/core/testing';

import { QuillEditorReadyService } from './quill-editor-ready.service';

describe('QuillEditorReadyService', () => {
  let service: QuillEditorReadyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuillEditorReadyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
