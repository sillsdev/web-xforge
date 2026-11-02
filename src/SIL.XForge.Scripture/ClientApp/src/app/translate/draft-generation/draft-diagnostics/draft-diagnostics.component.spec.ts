import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { mock, when } from 'ts-mockito';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import {
  BuildDto,
  BuildExecutionData,
  ServalBuildDiagnostic,
  ServalDiagnosticCode,
  ServalDiagnosticSeverity
} from '../../../machine-api/build-dto';
import { DraftDiagnosticsComponent } from './draft-diagnostics.component';

const mockedI18nService = mock(I18nService);
const mockedUrlService = mock(ExternalUrlService);

describe('DraftDiagnosticsComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: ExternalUrlService, useMock: mockedUrlService }
    ]
  }));

  describe('low confidence', () => {
    it('should not show the low confidence warning if there are no books with low confidence', fakeAsync(() => {
      const env = new TestEnvironment();
      const build = { executionData: {} } as BuildDto;

      // SUT
      env.component.build = build;
      tick();
      env.fixture.detectChanges();

      expect(env.component.booksWithLowConfidence).toBe(0);
      expect(env.component.lowConfidenceBookName).toBeUndefined();
      expect(env.component.showLowConfidenceDiagnostic).toBeFalse();
    }));

    it('should show the single book low confidence warning if one book has low confidence', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedI18nService.localizeBook('GEN')).thenReturn('Genesis');
      const build = {
        executionData: {
          diagnostics: [
            {
              code: ServalDiagnosticCode.LowConfidence,
              data: { bookId: 'GEN' },
              severity: ServalDiagnosticSeverity.Warn
            } as Partial<ServalBuildDiagnostic>
          ]
        }
      } as BuildDto;

      // SUT
      env.component.build = build;
      tick();
      env.fixture.detectChanges();

      expect(env.component.booksWithLowConfidence).toBe(1);
      expect(env.component.lowConfidenceBookName).toBe('Genesis');
      expect(env.component.showLowConfidenceDiagnostic).toBeTrue();
    }));

    it('should show the multiple book low confidence warning if more than one book has low confidence', fakeAsync(() => {
      const env = new TestEnvironment();
      const build = {
        executionData: {
          diagnostics: [
            {
              code: ServalDiagnosticCode.LowConfidence,
              data: { bookId: 'GEN' },
              severity: ServalDiagnosticSeverity.Warn
            } as Partial<ServalBuildDiagnostic>,
            {
              code: ServalDiagnosticCode.LowConfidence,
              data: { bookId: 'EXO' },
              severity: ServalDiagnosticSeverity.Warn
            }
          ]
        } as BuildExecutionData
      } as BuildDto;

      // SUT
      env.component.build = build;
      tick();
      env.fixture.detectChanges();

      expect(env.component.booksWithLowConfidence).toBe(2);
      expect(env.component.showLowConfidenceDiagnostic).toBeTrue();
    }));
  });

  describe('too few segments selected for training', () => {
    it('should not show the low confidence warning if there are no books with low confidence', fakeAsync(() => {
      const env = new TestEnvironment();
      const build = {
        executionData: {
          diagnostics: [
            {
              code: ServalDiagnosticCode.TooFewSegmentsSelectedForTraining,
              data: { minimumTrainCount: 600, trainCount: 13 },
              severity: ServalDiagnosticSeverity.Warn
            } as Partial<ServalBuildDiagnostic>
          ]
        }
      } as BuildDto;

      // SUT
      env.component.build = build;
      tick();
      env.fixture.detectChanges();

      expect(
        env.fixture.nativeElement.querySelector('app-notice[data-test-id="too-few-segments-selected-for-training"]')
      ).not.toBeNull();
      expect(env.component.showLowConfidenceDiagnostic).toBeFalse();
    }));
  });
  it('should not show notices for unknown diagnostics', fakeAsync(() => {
    const env = new TestEnvironment();
    const build = {
      executionData: {
        diagnostics: [
          {
            code: 'UNKNOWN',
            message: 'This should not display'
          } as Partial<ServalBuildDiagnostic>
        ]
      }
    } as BuildDto;

    // SUT
    env.component.build = build;
    tick();
    env.fixture.detectChanges();

    expect(env.fixture.nativeElement.querySelector('app-notice')).toBeNull();
    expect(env.component.showLowConfidenceDiagnostic).toBeFalse();
  }));

  /** Provides helpers for constructing test data for DraftDiagnosticsComponent tests. */
  class TestEnvironment {
    readonly component: DraftDiagnosticsComponent;
    readonly fixture: ComponentFixture<DraftDiagnosticsComponent>;

    constructor() {
      this.fixture = TestBed.createComponent(DraftDiagnosticsComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }
  }
});
