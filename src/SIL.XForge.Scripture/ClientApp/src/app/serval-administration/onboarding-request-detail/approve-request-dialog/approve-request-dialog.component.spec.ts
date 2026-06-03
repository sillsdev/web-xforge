import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import {
  ApproveRequestDialogComponent,
  ApproveRequestDialogData,
  ApproveRequestDialogResult
} from './approve-request-dialog.component';

const TEST_DATA: ApproveRequestDialogData = {
  targetProject: { paratextId: 'ptid-main', name: 'MYPROJ - My Project', languageCode: 'eng' },
  draftingSourceOptions: [
    { paratextId: 'ptid-draft', name: 'English Drafting Project', languageCode: 'eng' },
    { paratextId: 'ptid-A', name: 'English Source Alpha', languageCode: 'eng' },
    { paratextId: 'ptid-B', name: 'English Source Beta', languageCode: 'eng' }
  ],
  trainingSourceOptions: [
    { paratextId: 'ptid-draft', name: 'English Drafting Project', languageCode: 'eng' },
    { paratextId: 'ptid-A', name: 'English Source Alpha', languageCode: 'eng' },
    { paratextId: 'ptid-B', name: 'English Source Beta', languageCode: 'eng' },
    { paratextId: 'ptid-bt', name: 'English Back Translation', languageCode: 'eng' }
  ],
  defaultTrainingSource: 'ptid-A'
};

const BT_NEEDS_ENABLING_DATA: ApproveRequestDialogData = {
  ...TEST_DATA,
  backTranslation: {
    paratextId: 'ptid-bt',
    name: 'French Back Translation',
    languageCode: 'fra',
    draftingAlreadyEnabled: false
  }
};

const BT_ALREADY_ENABLED_DATA: ApproveRequestDialogData = {
  ...TEST_DATA,
  backTranslation: {
    paratextId: 'ptid-bt',
    name: 'French Back Translation',
    languageCode: 'fra',
    draftingAlreadyEnabled: true
  }
};

const BT_SAME_LANGUAGE_DATA: ApproveRequestDialogData = {
  ...TEST_DATA,
  backTranslation: {
    paratextId: 'ptid-bt',
    name: 'English Back Translation',
    languageCode: 'eng',
    draftingAlreadyEnabled: false
  }
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
      draftingSourceOptions: [
        { paratextId: 'ptid-draft', name: 'French Drafting Project', languageCode: 'fra' },
        ...TEST_DATA.draftingSourceOptions.slice(1)
      ],
      trainingSourceOptions: [
        { paratextId: 'ptid-draft', name: 'French Drafting Project', languageCode: 'fra' },
        ...TEST_DATA.trainingSourceOptions.slice(1)
      ]
    };
    setup(mixedData);
    // Default: draftingSource=ptid-draft (fra), trainingSources=['ptid-A'] (eng)
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
      trainingSourceParatextIds: ['ptid-B', 'ptid-bt'],
      enableBackTranslationDrafting: false
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
    expect(component.trainingSourceOrder('ptid-A')).toEqual({ name: 'Primary', order: 'first' });
    expect(component.trainingSourceOrder('ptid-B')).toEqual({ name: 'Secondary', order: 'second' });
  });

  it('trainingSourceOrder updates when order changes via toggle', () => {
    setup();
    component.toggleTrainingSource('ptid-B', true);
    expect(component.trainingSourceOrder('ptid-A')).toEqual({ name: 'Primary', order: 'first' });
    expect(component.trainingSourceOrder('ptid-B')).toEqual({ name: 'Secondary', order: 'second' });

    component.toggleTrainingSource('ptid-A', false);
    component.toggleTrainingSource('ptid-A', true);
    expect(component.trainingSourceOrder('ptid-B')).toEqual({ name: 'Primary', order: 'first' });
    expect(component.trainingSourceOrder('ptid-A')).toEqual({ name: 'Secondary', order: 'second' });
  });

  it('approve() emits training sources in primary-first order', () => {
    setup();
    component.trainingSources.setValue(['ptid-B', 'ptid-A']);
    component.approve();
    const result: ApproveRequestDialogResult = closeSpy.calls.mostRecent().args[0];
    expect(result.trainingSourceParatextIds).toEqual(['ptid-B', 'ptid-A']);
  });

  describe('back translation section', () => {
    it('does not render when backTranslationParatextId is absent', () => {
      setup();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('h3 ~ mat-checkbox')).toBeNull();
    });

    it('renders enabled checked checkbox when drafting not yet enabled', () => {
      setup(BT_NEEDS_ENABLING_DATA);
      fixture.detectChanges();
      expect(component.enableBackTranslationDrafting.value).toBeTrue();
      expect(component.enableBackTranslationDrafting.enabled).toBeTrue();
    });

    it('approve() includes enableBackTranslationDrafting: true by default', () => {
      setup(BT_NEEDS_ENABLING_DATA);
      component.approve();
      expect(closeSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ enableBackTranslationDrafting: true }));
    });

    it('approve() includes enableBackTranslationDrafting: false when unchecked', () => {
      setup(BT_NEEDS_ENABLING_DATA);
      component.enableBackTranslationDrafting.setValue(false);
      component.approve();
      expect(closeSpy).toHaveBeenCalledOnceWith(jasmine.objectContaining({ enableBackTranslationDrafting: false }));
    });

    it('renders disabled checked checkbox when drafting already enabled', () => {
      setup(BT_ALREADY_ENABLED_DATA);
      fixture.detectChanges();
      expect(component.enableBackTranslationDrafting.value).toBeTrue();
      expect(component.enableBackTranslationDrafting.disabled).toBeTrue();
    });

    describe('when back translation language matches target project language', () => {
      it('renders disabled unchecked checkbox', () => {
        setup(BT_SAME_LANGUAGE_DATA);
        fixture.detectChanges();
        expect(component.enableBackTranslationDrafting.value).toBeFalse();
        expect(component.enableBackTranslationDrafting.disabled).toBeTrue();
      });

      it('backTranslationLanguageMatchesTarget is true', () => {
        setup(BT_SAME_LANGUAGE_DATA);
        expect(component.backTranslationLanguageMatchesTarget).toBeTrue();
      });
    });
  });
});
