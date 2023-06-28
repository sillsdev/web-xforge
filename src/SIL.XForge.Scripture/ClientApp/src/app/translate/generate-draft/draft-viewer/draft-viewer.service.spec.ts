import { TestBed } from '@angular/core/testing';

import { DraftViewerService } from './draft-viewer.service';

describe('DraftViewerService', () => {
  let service: DraftViewerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DraftViewerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
