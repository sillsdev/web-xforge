import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { anything, deepEqual, instance, mock, verify } from 'ts-mockito';
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
  it('pre-fills defaults', () => {
    const env = new TestEnvironment();
    expect(env.component.draftingSource.value).toBe('ptid-draft');
    expect(env.component.trainingSources.value).toEqual(['ptid-A']);
  });

  it('form is valid with default selections', () => {
    const env = new TestEnvironment();
    expect(env.component.form.valid).toBeTrue();
  });

  it('form is invalid when no training source is selected', () => {
    const env = new TestEnvironment();
    env.component.trainingSources.setValue([]);
    expect(env.component.form.invalid).toBeTrue();
  });

  it('form is invalid when 3 training sources are selected', () => {
    const env = new TestEnvironment();
    env.component.trainingSources.setValue(['ptid-draft', 'ptid-A', 'ptid-B']);
    expect(env.component.form.invalid).toBeTrue();
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
    const env = new TestEnvironment(mixedData);
    // Default: draftingSource=ptid-draft (fra), trainingSources=['ptid-A'] (eng)
    expect(env.component.form.hasError('languageCodesDiffer')).toBeTrue();
  });

  it('form is valid with 2 training sources selected', () => {
    const env = new TestEnvironment();
    env.component.trainingSources.setValue(['ptid-A', 'ptid-B']);
    expect(env.component.form.valid).toBeTrue();
  });

  it('approve() closes with correct result', () => {
    const env = new TestEnvironment();
    env.component.draftingSource.setValue('ptid-A');
    env.component.trainingSources.setValue(['ptid-B', 'ptid-bt']);
    env.component.approve();
    verify(
      env.mockedDialogRef.close(
        deepEqual({
          draftingSourceParatextId: 'ptid-A',
          trainingSourceParatextIds: ['ptid-B', 'ptid-bt'],
          enableBackTranslationDrafting: false
        } satisfies ApproveRequestDialogResult)
      )
    ).once();
    expect().nothing();
  });

  it('approve() does not close when form is invalid', () => {
    const env = new TestEnvironment();
    env.component.trainingSources.setValue([]);
    env.component.approve();
    verify(env.mockedDialogRef.close(anything())).never();
    expect().nothing();
  });

  it('toggleTrainingSource adds and removes entries', () => {
    const env = new TestEnvironment();
    env.component.toggleTrainingSource('ptid-B', true);
    expect(env.component.trainingSources.value).toContain('ptid-B');
    env.component.toggleTrainingSource('ptid-A', false);
    expect(env.component.trainingSources.value).not.toContain('ptid-A');
  });

  it('trainingSourceOrder returns null when fewer than 2 sources selected', () => {
    const env = new TestEnvironment();
    expect(env.component.trainingSourceOrder('ptid-A')).toBeNull();
  });

  it('trainingSourceOrder labels first-selected as Primary, second as Secondary', () => {
    const env = new TestEnvironment();
    env.component.trainingSources.setValue(['ptid-A', 'ptid-B']);
    expect(env.component.trainingSourceOrder('ptid-A')).toEqual({ name: 'Primary', order: 'first' });
    expect(env.component.trainingSourceOrder('ptid-B')).toEqual({ name: 'Secondary', order: 'second' });
  });

  it('trainingSourceOrder updates when order changes via toggle', () => {
    const env = new TestEnvironment();
    env.component.toggleTrainingSource('ptid-B', true);
    expect(env.component.trainingSourceOrder('ptid-A')).toEqual({ name: 'Primary', order: 'first' });
    expect(env.component.trainingSourceOrder('ptid-B')).toEqual({ name: 'Secondary', order: 'second' });

    env.component.toggleTrainingSource('ptid-A', false);
    env.component.toggleTrainingSource('ptid-A', true);
    expect(env.component.trainingSourceOrder('ptid-B')).toEqual({ name: 'Primary', order: 'first' });
    expect(env.component.trainingSourceOrder('ptid-A')).toEqual({ name: 'Secondary', order: 'second' });
  });

  it('approve() emits training sources in primary-first order', () => {
    const env = new TestEnvironment();
    env.component.trainingSources.setValue(['ptid-B', 'ptid-A']);
    env.component.approve();
    verify(
      env.mockedDialogRef.close(
        deepEqual({
          draftingSourceParatextId: 'ptid-draft',
          trainingSourceParatextIds: ['ptid-B', 'ptid-A'],
          enableBackTranslationDrafting: false
        } satisfies ApproveRequestDialogResult)
      )
    ).once();
    expect().nothing();
  });

  describe('back translation section', () => {
    it('does not render when backTranslationParatextId is absent', () => {
      const env = new TestEnvironment();
      expect(env.backTranslationCheckbox).toBeNull();
    });

    it('renders enabled checked checkbox when drafting not yet enabled', () => {
      const env = new TestEnvironment(BT_NEEDS_ENABLING_DATA);
      expect(env.backTranslationCheckbox).not.toBeNull();
      expect(env.component.enableBackTranslationDrafting.value).toBeTrue();
      expect(env.component.enableBackTranslationDrafting.enabled).toBeTrue();
    });

    it('approve() includes enableBackTranslationDrafting: true by default', () => {
      const env = new TestEnvironment(BT_NEEDS_ENABLING_DATA);
      env.component.approve();
      verify(
        env.mockedDialogRef.close(
          deepEqual({
            draftingSourceParatextId: 'ptid-draft',
            trainingSourceParatextIds: ['ptid-A'],
            enableBackTranslationDrafting: true
          } satisfies ApproveRequestDialogResult)
        )
      ).once();
      expect().nothing();
    });

    it('approve() includes enableBackTranslationDrafting: false when unchecked', () => {
      const env = new TestEnvironment(BT_NEEDS_ENABLING_DATA);
      env.component.enableBackTranslationDrafting.setValue(false);
      env.component.approve();
      verify(
        env.mockedDialogRef.close(
          deepEqual({
            draftingSourceParatextId: 'ptid-draft',
            trainingSourceParatextIds: ['ptid-A'],
            enableBackTranslationDrafting: false
          } satisfies ApproveRequestDialogResult)
        )
      ).once();
      expect().nothing();
    });

    it('renders disabled checked checkbox when drafting already enabled', () => {
      const env = new TestEnvironment(BT_ALREADY_ENABLED_DATA);
      expect(env.backTranslationCheckbox).not.toBeNull();
      expect(env.component.enableBackTranslationDrafting.value).toBeTrue();
      expect(env.component.enableBackTranslationDrafting.disabled).toBeTrue();
    });

    describe('when back translation language matches target project language', () => {
      it('renders disabled unchecked checkbox', () => {
        const env = new TestEnvironment(BT_SAME_LANGUAGE_DATA);
        expect(env.backTranslationCheckbox).not.toBeNull();
        expect(env.component.enableBackTranslationDrafting.value).toBeFalse();
        expect(env.component.enableBackTranslationDrafting.disabled).toBeTrue();
      });

      it('btHasWrongLanguageCode is true', () => {
        const env = new TestEnvironment(BT_SAME_LANGUAGE_DATA);
        expect(env.component.btHasWrongLanguageCode).toBeTrue();
      });
    });
  });
});

class TestEnvironment {
  readonly fixture: ComponentFixture<ApproveRequestDialogComponent>;
  readonly component: ApproveRequestDialogComponent;
  readonly mockedDialogRef = mock(MatDialogRef);

  constructor(data: ApproveRequestDialogData = TEST_DATA) {
    TestBed.configureTestingModule({
      imports: [ApproveRequestDialogComponent],
      providers: [
        provideNoopAnimations(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: instance(this.mockedDialogRef) }
      ]
    });
    this.fixture = TestBed.createComponent(ApproveRequestDialogComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  /** The "enable drafting" checkbox in the back translation section, or null when that section is not rendered. */
  get backTranslationCheckbox(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('[data-test-id="enable-bt-drafting"]');
  }
}
