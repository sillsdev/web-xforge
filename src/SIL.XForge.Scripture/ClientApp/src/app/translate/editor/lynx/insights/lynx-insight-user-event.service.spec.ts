import { TestBed } from '@angular/core/testing';

import { EditorInsightUserEventService } from './editor-insight-user-event.service';

describe('EditorInsightUserEventService', () => {
  let service: EditorInsightUserEventService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightUserEventService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
