import { TestBed } from '@angular/core/testing';

import { EditorInsightCodeService } from './editor-insight-code.service';

describe('EditorInsightCodeService', () => {
  let service: EditorInsightCodeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightCodeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
