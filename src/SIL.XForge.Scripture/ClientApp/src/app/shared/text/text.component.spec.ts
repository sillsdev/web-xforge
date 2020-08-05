import { ComponentFixture, fakeAsync, TestBed, tick, flush } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { anything, mock, when, instance, anyString } from 'ts-mockito';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { TextComponent } from './text.component';
import { TranslocoService, translate, TranslocoModule } from '@ngneat/transloco';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { ROUTES } from '@angular/router';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { CommonModule } from '@angular/common';
import { QuillEditorComponent, QuillModule } from 'ngx-quill';
import { PwaService } from 'xforge-common/pwa.service';
import { BehaviorSubject } from 'rxjs';
import Quill from 'quill';
import { TextViewModel } from './text-view-model';

const mockedTranslocoService = mock(TranslocoService);
const mockedPwaService = mock(PwaService);
const mockedTextViewModel = mock(TextViewModel);

when(mockedTranslocoService.translate<string>(anything())).thenCall(
  (translationStringKey: string) => translationStringKey
);

describe('TextComponent', () => {
  configureTestingModule(() => ({
    // Declared in SharedModule
    declarations: [],
    imports: [
      AvatarTestingModule,
      CommonModule,
      HttpClientTestingModule,
      UICommonModule,
      SharedModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('display Loading message when offline and text not available', fakeAsync(() => {
    // TODO I wrote the test and made modifications to text.component.ts that seemed good. The test passed. I found
    // that when running SF, my change had resulted in it saying book_does_not_exist when I didn't want it to. I
    // modified the code so when running SF it displays the offline message at the right time, both for community
    // checkers as well as for project admins when adding a question. Next steps: Revise the test so it checks for how
    // I understand the program needs to behave to show the right messages. Note that showing 'Loading...' was not
    // looked for very closely when testing the app. Clean up possibly unnecessarily extra calls to flush and
    // detectChanges. Revisit changes in text.component.ts - clean up; make sensible.
    const env: TestEnvironment = new TestEnvironment();
    console.log('time for things');
    // (Write to private field, and with type checking.)
    env.component['viewModel'] = instance(mockedTextViewModel);
    when(mockedTextViewModel.isLoaded).thenReturn(true);
    when(mockedTextViewModel.isEmpty).thenReturn(false);

    const mockedQuill = new MockQuill('quill-editor');
    env.fixture.detectChanges();
    env.component.onEditorCreated(mockedQuill);
    expect(env.component.placeholder).toEqual('text.loading');
    env.onlineStatus = false;
    flush();
    env.fixture.detectChanges();
    expect(env.component.placeholder).toEqual('text.not_avail_offline');
    env.onlineStatus = true;
    flush();
    env.fixture.detectChanges();
    expect(env.component.placeholder).toEqual('text.loading');
  }));
});

class MockQuill extends Quill {}

class TestEnvironment {
  readonly component: TextComponent;
  readonly fixture: ComponentFixture<TextComponent>;
  private _onlineStatus = new BehaviorSubject<boolean>(true);

  constructor() {
    when(mockedPwaService.onlineStatus).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenCall(() => this._onlineStatus.getValue());

    this.fixture = TestBed.createComponent(TextComponent);
    this.component = this.fixture.componentInstance;
  }

  set onlineStatus(value: boolean) {
    this._onlineStatus.next(value);
    flush();
    this.fixture.detectChanges();
    this.fixture.detectChanges();
  }
}
