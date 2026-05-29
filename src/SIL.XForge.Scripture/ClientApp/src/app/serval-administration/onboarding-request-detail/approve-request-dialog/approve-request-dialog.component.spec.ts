import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  ApproveRequestDialogComponent,
  ApproveRequestDialogData,
  ApproveRequestDialogResult
} from './approve-request-dialog.component';

const TEST_DATA: ApproveRequestDialogData = {
  projectInfo: new Map([
    ['ptid-draft', { name: 'English Drafting Project', shortName: 'DRAFT', languageCode: 'eng' }],
    ['ptid-A', { name: 'English Source Alpha', shortName: 'ALPHA', languageCode: 'eng' }],
    ['ptid-B', { name: 'English Source Beta', shortName: 'BETA', languageCode: 'eng' }],
    ['ptid-bt', { name: 'English Back Translation', shortName: 'BT', languageCode: 'eng' }]
  ]),
  projectName: 'MYPROJ - My Project',
  draftingSourceOptions: ['ptid-draft', 'ptid-A', 'ptid-B'],
  trainingSourceOptions: ['ptid-draft', 'ptid-A', 'ptid-B', 'ptid-bt'],
  defaultDraftingSource: 'ptid-draft',
  defaultTrainingSources: ['ptid-A']
};

describe('ApproveRequestDialogComponent', () => {
  let fixture: ComponentFixture<ApproveRequestDialogComponent>;
  let component: ApproveRequestDialogComponent;
  let closeSpy: jasmine.Spy;

  function setup(data: ApproveRequestDialogData = TEST_DATA): void {
    closeSpy = jasmine.createSpy('close');
    TestBed.configureTestingModule({
      imports: [ApproveRequestDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: closeSpy } }
      ]
    });
    fixture = TestBed.createComponent(ApproveRequestDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('pre-fills defaults', () => {
    setup();
    expect(component.draftingSource.value).toBe('ptid-draft');
    expect(component.trainingSources.value).toEqual(['ptid-A']);
  });

  it('form is valid with default selections', () => {
    setup();
    expect(component.form.valid).toBeTrue();
  });

  it('form is invalid when no training source is selected', () => {
    setup();
    component.trainingSources.setValue([]);
    expect(component.form.invalid).toBeTrue();
  });

  it('form is invalid when 3 training sources are selected', () => {
    setup();
    component.trainingSources.setValue(['ptid-draft', 'ptid-A', 'ptid-B']);
    expect(component.form.invalid).toBeTrue();
  });

  it('form is invalid when source projects have different language codes', () => {
    const mixedData: ApproveRequestDialogData = {
      ...TEST_DATA,
      projectInfo: new Map([
        ...TEST_DATA.projectInfo,
        ['ptid-draft', { name: 'French Drafting Project', shortName: 'DRAFT', languageCode: 'fra' }]
      ])
    };
    setup(mixedData);
    // Default: draftingSource=ptid-draft (fra), trainingSources=['ptid-A'] (eng) → differ
    expect(component.form.hasError('languageCodesDiffer')).toBeTrue();
  });

  it('form is valid with 2 training sources selected', () => {
    setup();
    component.trainingSources.setValue(['ptid-A', 'ptid-B']);
    expect(component.form.valid).toBeTrue();
  });

  it('approve() closes with correct result', () => {
    setup();
    component.draftingSource.setValue('ptid-A');
    component.trainingSources.setValue(['ptid-B', 'ptid-bt']);
    component.approve();
    expect(closeSpy).toHaveBeenCalledOnceWith({
      draftingSourceParatextId: 'ptid-A',
      trainingSourceParatextIds: ['ptid-B', 'ptid-bt']
    } satisfies ApproveRequestDialogResult);
  });

  it('approve() does not close when form is invalid', () => {
    setup();
    component.trainingSources.setValue([]);
    component.approve();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('toggleTrainingSource adds and removes entries', () => {
    setup();
    component.toggleTrainingSource('ptid-B', true);
    expect(component.trainingSources.value).toContain('ptid-B');
    component.toggleTrainingSource('ptid-A', false);
    expect(component.trainingSources.value).not.toContain('ptid-A');
  });

  it('trainingSourceOrder returns null when fewer than 2 sources selected', () => {
    setup();
    expect(component.trainingSourceOrder('ptid-A')).toBeNull();
  });

  it('trainingSourceOrder labels first-selected as Primary, second as Secondary', () => {
    setup();
    component.trainingSources.setValue(['ptid-A', 'ptid-B']);
    expect(component.trainingSourceOrder('ptid-A')).toBe('Primary');
    expect(component.trainingSourceOrder('ptid-B')).toBe('Secondary');
  });

  it('trainingSourceOrder updates when order changes via toggle', () => {
    setup();
    component.toggleTrainingSource('ptid-B', true); // A then B → A=primary
    expect(component.trainingSourceOrder('ptid-A')).toBe('Primary');
    expect(component.trainingSourceOrder('ptid-B')).toBe('Secondary');

    component.toggleTrainingSource('ptid-A', false); // deselect A → only B
    component.toggleTrainingSource('ptid-A', true); // re-select A → B=primary, A=secondary
    expect(component.trainingSourceOrder('ptid-B')).toBe('Primary');
    expect(component.trainingSourceOrder('ptid-A')).toBe('Secondary');
  });

  it('approve() emits training sources in primary-first order', () => {
    setup();
    component.trainingSources.setValue(['ptid-B', 'ptid-A']);
    component.approve();
    const result: ApproveRequestDialogResult = closeSpy.calls.mostRecent().args[0];
    expect(result.trainingSourceParatextIds).toEqual(['ptid-B', 'ptid-A']);
  });

  it('approve button is disabled when form invalid', () => {
    setup();
    component.trainingSources.setValue([]);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('#approve-button');
    expect(btn.disabled).toBeTrue();
  });

  it('approve button is enabled when form valid', () => {
    setup();
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('#approve-button');
    expect(btn.disabled).toBeFalse();
  });
});
