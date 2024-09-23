import { TestBed } from '@angular/core/testing';

import { EditorReadyService } from './editor-ready.service';

describe('EditorReadyService', () => {
  let service: EditorReadyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorReadyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
