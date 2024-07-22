import { TestBed } from '@angular/core/testing';

import { QuillEditorSegmentService } from './quill-editor-segment.service';

describe('QuillEditorSegmentService', () => {
  let service: QuillEditorSegmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuillEditorSegmentService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
