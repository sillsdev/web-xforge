import { TestBed } from '@angular/core/testing';

import { EditorInsightFilterService } from './editor-insight-filter.service';

describe('EditorInsightFilterService', () => {
  let service: EditorInsightFilterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightFilterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
