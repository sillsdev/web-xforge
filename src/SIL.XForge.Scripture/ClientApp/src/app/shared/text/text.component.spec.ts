import { CommonModule } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import Quill from 'quill';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { TextData } from 'realtime-server/lib/scriptureforge/models/text-data';
import * as RichText from 'rich-text';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { getSFProject, getTextDoc } from '../test-utils';
import { TextComponent } from './text.component';

const mockedTranslocoService = mock(TranslocoService);
const mockedPwaService = mock(PwaService);
const mockedProjectService = mock(SFProjectService);

describe('TextComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent],
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

  it('display placeholder messages', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment();
    const mockedQuill = new MockQuill('quill-editor');
    env.fixture.detectChanges();
    env.component.onEditorCreated(mockedQuill);
    expect(env.component.placeholder).toEqual('initial placeholder text');
    env.id = new TextDocId('project01', 40, 1);
    expect(env.component.placeholder).toEqual('text.loading');
    env.onlineStatus = false;
    env.fixture.detectChanges();
    expect(env.component.placeholder).toEqual('text.not_available_offline');
    env.onlineStatus = true;
    expect(env.component.placeholder).toEqual('text.loading');
  }));

  it('does not apply right to left for placeholder message', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    env.hostComponent.isTextRightToLeft = true;
    env.fixture.detectChanges();
    expect(env.component.placeholder).toEqual('initial placeholder text');
    expect(env.component.isRtl).toBe(false);
    expect(env.fixture.nativeElement.querySelector('quill-editor[dir="auto"]')).not.toBeNull();
  }));
});

class MockQuill extends Quill {}

@Component({
  selector: 'app-host',
  template: `<app-text [placeholder]="initialPlaceHolder" [id]="id" [isRightToLeft]="isTextRightToLeft"></app-text>`
})
class HostComponent {
  @ViewChild(TextComponent) textComponent!: TextComponent;

  initialPlaceHolder = 'initial placeholder text';
  isTextRightToLeft: boolean = false;
  id?: TextDocId;
}

class TestEnvironment {
  readonly component: TextComponent;
  readonly hostComponent: HostComponent;
  readonly fixture: ComponentFixture<HostComponent>;
  realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private _onlineStatus = new BehaviorSubject<boolean>(true);
  private isOnline: boolean = true;

  constructor() {
    when(mockedPwaService.onlineStatus).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenReturn(this.isOnline);
    when(mockedTranslocoService.translate<string>(anything())).thenCall(
      (translationStringKey: string) => translationStringKey
    );

    const textDocId = new TextDocId('project01', 40, 1);
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: getSFProject('project01')
    });
    this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
      id: textDocId.toString(),
      data: getTextDoc(textDocId),
      type: RichText.type.name
    });

    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedProjectService.get(anything())).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );

    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
    this.component = this.fixture.componentInstance.textComponent;
    this.hostComponent = this.fixture.componentInstance;
    tick();
    this.fixture.detectChanges();
  }

  set id(value: TextDocId) {
    this.hostComponent.id = value;
    tick();
    this.fixture.detectChanges();
  }

  set onlineStatus(value: boolean) {
    this.isOnline = value;
    tick();
    this._onlineStatus.next(value);
    tick();
    this.fixture.detectChanges();
  }
}
