import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { LocationService } from 'xforge-common/location.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SFProjectService } from '../../core/sf-project.service';
import { CreateSourcesLinkComponent } from './create-sources-link.component';

describe('CreateSourcesLinkComponent', () => {
  let component: CreateSourcesLinkComponent;
  let fixture: ComponentFixture<CreateSourcesLinkComponent>;
  let mockActivatedProjectService: ActivatedProjectService;
  let mockLocationService: LocationService;
  let mockSFProjectService: SFProjectService;

  configureTestingModule(() => ({
    imports: [CreateSourcesLinkComponent, ReactiveFormsModule, MatSnackBarModule, NoopAnimationsModule],
    providers: [
      {
        provide: ActivatedProjectService,
        useFactory: () => {
          mockActivatedProjectService = mock(ActivatedProjectService);
          when(mockActivatedProjectService.projectId).thenReturn('test-project');
          return mockActivatedProjectService;
        }
      },
      {
        provide: LocationService,
        useFactory: () => {
          mockLocationService = mock(LocationService);
          when(mockLocationService.origin).thenReturn('http://localhost:4200');
          return mockLocationService;
        }
      },
      {
        provide: SFProjectService,
        useFactory: () => {
          mockSFProjectService = mock(SFProjectService);
          return mockSFProjectService;
        }
      }
    ]
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CreateSourcesLinkComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should generate link with training sources', () => {
    component.sourcesForm.patchValue({ trainingSources: 'project1,project2' });
    component.generateLink();

    expect(component.generatedLink).toContain('trainingSources=project1%2Cproject2');
  });

  it('should generate link with drafting sources', () => {
    component.sourcesForm.patchValue({ draftingSources: 'draft1' });
    component.generateLink();

    expect(component.generatedLink).toContain('draftingSources=draft1');
  });

  it('should generate link with both training and drafting sources', () => {
    component.sourcesForm.patchValue({
      trainingSources: 'train1',
      draftingSources: 'draft1'
    });
    component.generateLink();

    expect(component.generatedLink).toContain('trainingSources=train1');
    expect(component.generatedLink).toContain('draftingSources=draft1');
    expect(component.generatedLink).toContain('http://localhost:4200/projects/test-project/draft-generation/sources');
  });

  it('should use activated project service and location service for URL construction', () => {
    component.sourcesForm.patchValue({ trainingSources: 'test' });
    component.generateLink();

    expect(component.generatedLink).toBe(
      'http://localhost:4200/projects/test-project/draft-generation/sources?trainingSources=test'
    );
  });

  it('should clear generated link when both fields are empty', () => {
    component.sourcesForm.patchValue({ trainingSources: '', draftingSources: '' });
    component.generateLink();

    expect(component.generatedLink).toBe('');
  });
});
