import { Meta, moduleMetadata, StoryObj } from '@storybook/angular';
import { defaultTranslocoMarkupTranspilers } from 'ngx-transloco-markup';
import {
  BuildDto,
  BuildExecutionData,
  ServalBuildDiagnostic,
  ServalDiagnosticCode
} from '../../../machine-api/build-dto';
import { DraftDiagnosticsComponent } from './draft-diagnostics.component';

const meta: Meta<DraftDiagnosticsComponent> = {
  title: 'Draft/Draft Diagnostic Messages',
  component: DraftDiagnosticsComponent,
  decorators: [
    moduleMetadata({
      providers: [defaultTranslocoMarkupTranspilers()]
    })
  ]
};
export default meta;

type Story = StoryObj<DraftDiagnosticsComponent>;

export const LowConfidenceOneBook: Story = {
  args: {
    build: {
      executionData: {
        diagnostics: [
          { code: ServalDiagnosticCode.LowConfidence, data: { bookId: 'MAT' } } as Partial<ServalBuildDiagnostic>
        ]
      } as BuildExecutionData
    } as BuildDto
  }
};

export const LowConfidenceMultipleBooks: Story = {
  args: {
    build: {
      executionData: {
        diagnostics: [
          { code: ServalDiagnosticCode.LowConfidence, data: { bookId: 'MAT' } } as Partial<ServalBuildDiagnostic>,
          { code: ServalDiagnosticCode.LowConfidence, data: { bookId: 'MRK' } }
        ]
      } as BuildExecutionData
    } as BuildDto
  }
};

export const TooFewSegmentsSelectedForTraining: Story = {
  args: {
    build: {
      executionData: {
        diagnostics: [
          {
            code: ServalDiagnosticCode.TooFewSegmentsSelectedForTraining,
            data: { minimumTrainCount: 600, trainCount: 13 }
          } as Partial<ServalBuildDiagnostic>
        ]
      } as BuildExecutionData
    } as BuildDto
  }
};

export const MultipleDiagnostics: Story = {
  args: {
    build: {
      executionData: {
        diagnostics: [
          { code: ServalDiagnosticCode.LowConfidence, data: { bookId: 'MAT' } } as Partial<ServalBuildDiagnostic>,
          { code: ServalDiagnosticCode.LowConfidence, data: { bookId: 'MRK' } },
          {
            code: ServalDiagnosticCode.TooFewSegmentsSelectedForTraining,
            data: { minimumTrainCount: 600, trainCount: 13 }
          },
          { code: 'UNKNOWN', message: 'This should not display' }
        ]
      } as BuildExecutionData
    } as BuildDto
  }
};
