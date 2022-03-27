import { TestBed } from '@angular/core/testing';

import { SaveStatusService } from './doc-save-notification.service';

describe('DocSaveNotificationService', () => {
  let service: SaveStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SaveStatusService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
