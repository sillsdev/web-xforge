import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { DraftHistoryEntryComponent } from './draft-history-entry.component';

const mockedI18nService = mock(I18nService);

describe('DraftHistoryEntryComponent', () => {
  let component: DraftHistoryEntryComponent;
  let fixture: ComponentFixture<DraftHistoryEntryComponent>;

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [{ provide: I18nService, useMock: mockedI18nService }]
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DraftHistoryEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
