import { TestBed } from '@angular/core/testing';

import { EditorInsightOverlayService } from './editor-insight-overlay.service';

describe('EditorInsightOverlayService', () => {
  let service: EditorInsightOverlayService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightOverlayService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
