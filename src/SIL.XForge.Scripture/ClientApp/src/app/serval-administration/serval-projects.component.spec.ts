import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { escapeRegExp, merge } from 'lodash-es';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { combineLatest, from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { anything, mock, when } from 'ts-mockito';
import { FileType } from 'xforge-common/models/file-offline-data';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { QueryFilter, QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { TypeRegistry } from 'xforge-common/type-registry';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { ServalAdministrationService } from './serval-administration.service';
import { ServalProjectsComponent } from './serval-projects.component';

const mockedNoticeService = mock(NoticeService);
const mockedServalAdministrationService = mock(ServalAdministrationService);
const mockedUserService = mock(UserService);

describe('ServalProjectsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      ServalProjectsComponent,
      NoopAnimationsModule,
      RouterTestingModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(new TypeRegistry([TestProjectDoc], [FileType.Audio], [])),
      HttpClientTestingModule
    ],
    providers: [
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ServalAdministrationService, useMock: mockedServalAdministrationService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('should display projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    expect(env.rows.length).toEqual(3);
    expect(env.cell(0, 0).query(By.css('a')).nativeElement.text.trim()).toEqual('P1 - Project 01');
    expect(env.cell(0, 1).nativeElement.textContent).toEqual('Enabled');
    expect(env.cell(1, 0).query(By.css('a')).nativeElement.text.trim()).toEqual('P2 - Project 02');
    expect(env.cell(1, 1).nativeElement.textContent).toEqual('Disabled');
  }));

  it('should display message when there are no projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.fixture.debugElement.query(By.css('.no-projects-label'))).not.toBeNull();
  }));

  it('should filter projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.setInputValue(env.filterInput, '02');

    expect(env.rows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickButton(env.nextButton);

    expect(env.rows.length).toEqual(1);
  }));
});

class TestProjectDoc extends ProjectDoc {
  static readonly COLLECTION = 'projects';
  static readonly INDEX_PATHS = [];

  readonly taskNames: string[] = ['Task1', 'Task2'];
}

class TestEnvironment {
  readonly component: ServalProjectsComponent;
  readonly fixture: ComponentFixture<ServalProjectsComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedServalAdministrationService.onlineQuery(anything(), anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<QueryParameters>) =>
        combineLatest([term$, parameters$]).pipe(
          switchMap(([term, queryParameters]) => {
            const filters: QueryFilter = {
              [obj<Project>().pathStr(p => p.name)]: { $regex: `.*${escapeRegExp(term)}.*`, $options: 'i' }
            };
            return from(
              this.realtimeService.onlineQuery<TestProjectDoc>(
                TestProjectDoc.COLLECTION,
                merge(filters, queryParameters)
              )
            );
          })
        )
    );

    this.fixture = TestBed.createComponent(ServalProjectsComponent);
    this.component = this.fixture.componentInstance;
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#projects-table'));
  }

  get rows(): DebugElement[] {
    // querying the debug table element doesn't seem to work, so we query the native element instead and convert back
    // to debug elements
    return Array.from(this.table.nativeElement.querySelectorAll('tbody tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get filterInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-filter'));
  }

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get nextButton(): DebugElement {
    return this.paginator.query(By.css('.mat-paginator-navigation-next'));
  }

  cell(row: number, column: number): DebugElement {
    return this.rows[row].children[column];
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  setInputValue(input: DebugElement, value: string): void {
    const inputElem = input.nativeElement as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('keyup'));
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  setupProjectData(): void {
    this.realtimeService.addSnapshots<SFProject>(TestProjectDoc.COLLECTION, [
      {
        id: 'project01',
        data: createTestProject({
          name: 'Project 01',
          translateConfig: {
            preTranslate: true
          },
          userRoles: { user01: 'pt_administrator' },
          userPermissions: {}
        })
      },
      {
        id: 'project02',
        data: createTestProject({
          name: 'Project 02',
          shortName: 'P2',
          userRoles: {},
          userPermissions: {},
          syncDisabled: true
        })
      },
      {
        id: 'project03',
        data: createTestProject({
          name: 'Project 03',
          shortName: 'P3',
          userRoles: { user01: 'pt_translator' },
          userPermissions: {}
        })
      }
    ]);
  }
}
