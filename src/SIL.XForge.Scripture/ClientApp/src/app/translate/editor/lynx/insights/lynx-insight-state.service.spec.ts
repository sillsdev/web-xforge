import { TestBed } from '@angular/core/testing';

import { EditorInsightStateService } from './editor-insight-state.service';

describe('EditorInsightStateService', () => {
  let service: EditorInsightStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
