import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { DraftHistoryEntryComponent } from './draft-history-entry.component';

const mockedI18nService = mock(I18nService);
const mockedUserService = mock(UserService);

describe('DraftHistoryEntryComponent', () => {
  let component: DraftHistoryEntryComponent;
  let fixture: ComponentFixture<DraftHistoryEntryComponent>;

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  beforeEach(() => {
    const user: UserProfile = createTestUserProfile();
    const userDoc = { id: 'sf-user-id', data: user } as UserProfileDoc;
    when(mockedUserService.getProfile(anything())).thenResolve(userDoc);

    fixture = TestBed.createComponent(DraftHistoryEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
