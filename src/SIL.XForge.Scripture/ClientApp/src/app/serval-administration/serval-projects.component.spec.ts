import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { escapeRegExp, merge } from 'lodash-es';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { getTranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-source-test-data';
import { combineLatest, from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { anything, mock, when } from 'ts-mockito';
import { FileType } from 'xforge-common/models/file-offline-data';
import { ProjectDoc } from 'xforge-common/models/project-doc';
import { QueryFilter, QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { TypeRegistry } from 'xforge-common/type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { ServalAdministrationService } from './serval-administration.service';
import { ServalProjectsComponent } from './serval-projects.component';

const mockedServalAdministrationService = mock(ServalAdministrationService);
const mockedProjectService = mock(SFProjectService);

describe('ServalProjectsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      RouterModule.forRoot([]),
      TestTranslocoModule,
      TestRealtimeModule.forRoot(new TypeRegistry([TestProjectDoc], [FileType.Audio], []))
    ],
    providers: [
      { provide: ServalAdministrationService, useMock: mockedServalAdministrationService },
      { provide: SFProjectService, useMock: mockedProjectService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
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

    // First row - pre-translate enabled, projects as sources
    expect(env.cell(0, 0).query(By.css('a')).nativeElement.text.trim()).toEqual('P1 - Project 01');
    expect(env.cell(0, 1).nativeElement.textContent).toEqual('Enabled');
    expect(env.cell(0, 2).query(By.css('a')).nativeElement.text.trim()).toEqual('P2 - Project 02');
    expect(env.cell(0, 3).query(By.css('a')).nativeElement.text.trim()).toEqual('P3 - Project 03');
    expect(env.cell(0, 4).query(By.css('a')).nativeElement.text.trim()).toEqual('P4 - Project 04');

    // Second row - pre-translate undefined, no sources
    expect(env.cell(1, 0).query(By.css('a')).nativeElement.text.trim()).toEqual('P2 - Project 02');
    expect(env.cell(1, 1).nativeElement.textContent).toEqual('Disabled');
    expect(env.cell(1, 2).nativeElement.textContent).toEqual('None');
    expect(env.cell(1, 3).nativeElement.textContent).toEqual('None');
    expect(env.cell(1, 4).nativeElement.textContent).toEqual('None');

    // Third row - pre-translate disabled, resources as sources
    expect(env.cell(2, 0).query(By.css('a')).nativeElement.text.trim()).toEqual('P3 - Project 03');
    expect(env.cell(2, 1).nativeElement.textContent).toEqual('Disabled');
    expect(env.cell(2, 2).nativeElement.textContent).toEqual('R1 - Resource 01');
    expect(env.cell(2, 3).nativeElement.textContent).toEqual('R2 - Resource 02');
    expect(env.cell(2, 4).nativeElement.textContent).toEqual('R3 - Resource 03');
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
  readonly PROJECT01ID = 'project01';
  readonly PROJECT02ID = 'project02';
  readonly PROJECT03ID = 'project03';

  readonly source2: TranslateSource = getTranslateSource('2', false);
  readonly source3: TranslateSource = getTranslateSource('3', false);
  readonly source4: TranslateSource = getTranslateSource('4', false);
  readonly resource1: TranslateSource = getTranslateSource('1', true);
  readonly resource2: TranslateSource = getTranslateSource('2', true);
  readonly resource3: TranslateSource = getTranslateSource('3', true);

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
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
    when(mockedProjectService.onlineGetDraftSources(this.PROJECT01ID)).thenResolve({
      draftingSources: [this.source3],
      trainingSources: [this.source4],
      trainingTargets: []
    });
    when(mockedProjectService.onlineGetDraftSources(this.PROJECT02ID)).thenResolve({
      draftingSources: [],
      trainingSources: [],
      trainingTargets: []
    });
    when(mockedProjectService.onlineGetDraftSources(this.PROJECT03ID)).thenResolve({
      draftingSources: [this.resource2],
      trainingSources: [this.resource3],
      trainingTargets: []
    });

    this.fixture = TestBed.createComponent(ServalProjectsComponent);
    this.component = this.fixture.componentInstance;
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#projects-table'));
  }

  get rows(): DebugElement[] {
    return Array.from(this.table.nativeElement.querySelectorAll('tbody tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get filterInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-filter'));
  }

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get nextButton(): DebugElement {
    return this.paginator.query(By.css('.mat-mdc-paginator-navigation-next'));
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
        id: this.PROJECT01ID,
        data: createTestProject({
          name: 'Project 01',
          translateConfig: {
            draftConfig: {
              alternateSourceEnabled: true,
              alternateSource: this.source3,
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: this.source4
            },
            preTranslate: true,
            source: this.source2
          },
          userRoles: { user01: 'pt_administrator' },
          userPermissions: {}
        })
      },
      {
        id: this.PROJECT02ID,
        data: createTestProject({
          name: 'Project 02',
          shortName: 'P2',
          userRoles: {},
          userPermissions: {},
          syncDisabled: true
        })
      },
      {
        id: this.PROJECT03ID,
        data: createTestProject({
          name: 'Project 03',
          shortName: 'P3',
          translateConfig: {
            draftConfig: {
              alternateSourceEnabled: true,
              alternateSource: this.resource2,
              alternateTrainingSourceEnabled: true,
              alternateTrainingSource: this.resource3
            },
            preTranslate: false,
            source: this.resource1
          },
          userRoles: { user01: 'pt_translator' },
          userPermissions: {}
        })
      }
    ]);
  }
}
