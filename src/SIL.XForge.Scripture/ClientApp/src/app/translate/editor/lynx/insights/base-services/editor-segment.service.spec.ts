import { TestBed } from '@angular/core/testing';

import { EditorSegmentService } from './editor-segment.service';

describe('EditorSegmentService', () => {
  let service: EditorSegmentService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorSegmentService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
