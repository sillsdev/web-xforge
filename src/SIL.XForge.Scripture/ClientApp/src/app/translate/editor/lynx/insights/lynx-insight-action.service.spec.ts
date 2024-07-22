import { TestBed } from '@angular/core/testing';

import { EditorInsightActionService } from './editor-insight-action.service';

describe('EditorInsightActionService', () => {
  let service: EditorInsightActionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightActionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
