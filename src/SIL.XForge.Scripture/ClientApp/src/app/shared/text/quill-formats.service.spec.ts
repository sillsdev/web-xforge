import { TestBed } from '@angular/core/testing';

import { QuillFormatsService } from './quill-formats.service';

describe('QuillFormatsService', () => {
  let service: QuillFormatsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(QuillFormatsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
