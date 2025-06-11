import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { UntypedFormControl, UntypedFormGroup } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { isSafari } from 'xforge-common/utils';
import { SelectableProject } from '../core/paratext.service';
import { CustomValidatorState, SFValidators } from '../shared/sfvalidators';
import { ProjectSelectComponent } from './project-select.component';

describe('ProjectSelectComponent', () => {
  it('should list projects and resources', fakeAsync(() => {
    const env = new TestEnvironment(['p02']);
    env.clickInput();
    // Expect two projects and two resources (one of the projects should be hidden)
    expect(env.groupLabels.length).toBe(2);
    expect(env.groupLabels[0]).toBe('Projects');
    expect(env.groupLabels[1]).toBe('Resources');
    if (isSafari()) {
      // Angular inserts the group name at the end in a hidden span for the Safari screen reader
      expect(env.optionsText(0)).toEqual(['P1 - Project 1(Projects)', 'P3 - Project 3(Projects)']);
      expect(env.optionsText(1)).toEqual(['R1 - Resource 1(Resources)', 'R2 - Resource 2(Resources)']);
    } else {
      expect(env.optionsText(0)).toEqual(['P1 - Project 1', 'P3 - Project 3']);
      expect(env.optionsText(1)).toEqual(['R1 - Resource 1', 'R2 - Resource 2']);
    }
  }));

  it('it only lists groups with menu items', fakeAsync(() => {
    const env = new TestEnvironment(undefined, undefined, []);
    env.clickInput();
    expect(env.groupLabels.length).toBe(1);
  }));

  it('functions as a form control', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickInput();
    expect(env.component.sourceParatextId.value).toBeNull();
    env.clickOption(0, 0);
    expect(env.component.sourceParatextId.value).toBe('p01');
    env.clickInput();
    env.clickOption(1, 1);
    expect(env.component.sourceParatextId.value).toBe('r02');
  }));

  it('does not open autocomplete when disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.autoCompleteShowing).toBe(false);
    env.component.isDisabled = true;
    tick();
    env.fixture.detectChanges();
    env.clickInput();
    expect(env.autoCompleteShowing).toBe(false);
    env.component.isDisabled = false;
    tick();
    env.fixture.detectChanges();
    env.clickInput();
    expect(env.autoCompleteShowing).toBe(true);
  }));

  it("doesn't list hidden projects", fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickInput();
    expect(env.component.sourceParatextId.value).toBeNull();
    env.clickOption(0, 0);
    expect(env.component.sourceParatextId.value).toBe('p01');
    env.clickInput();
    env.clickOption(1, 1);
    expect(env.component.sourceParatextId.value).toBe('r02');
  }));

  it("doesn't list multiple hidden projects", fakeAsync(() => {
    const env = new TestEnvironment(['p01', 'p03', 'r02']);
    env.clickInput();
    if (isSafari()) {
      // Angular inserts the group name at the end in a hidden span for the Safari screen reader
      expect(env.optionsText(0)).toEqual(['P2 - Project 2(Projects)']);
      expect(env.optionsText(1)).toEqual(['R1 - Resource 1(Resources)']);
    } else {
      expect(env.optionsText(0)).toEqual(['P2 - Project 2']);
      expect(env.optionsText(1)).toEqual(['R1 - Resource 1']);
    }
  }));

  it('adds list items as the user scrolls the list', fakeAsync(() => {
    const resources = [...Array(100).keys()].map(key => ({
      paratextId: 'r' + key,
      name: 'Resource ' + (key + 1),
      shortName: 'R' + key
    }));
    const env = new TestEnvironment(['p03'], undefined, resources);
    env.clickInput();
    expect(env.optGroups.length).toBe(2);
    if (isSafari()) {
      // Angular inserts the group name at the end in a hidden span for the Safari screen reader
      expect(env.optionsText(0)).toEqual(['P1 - Project 1(Projects)', 'P2 - Project 2(Projects)']);
    } else {
      expect(env.optionsText(0)).toEqual(['P1 - Project 1', 'P2 - Project 2']);
    }
    expect(env.options(1).length).toBe(25);
    env.scrollMenu(2500);
    expect(env.options(1).length).toBe(50);
  }));

  it('opens the panel when input is clicked after already selecting a project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickInput();
    expect(env.component.sourceParatextId.value).toBeNull();
    env.clickOption(0, 0);
    expect(env.component.sourceParatextId.value).toBe('p01');
    env.clickInput();
    env.clickOption(1, 1);
    expect(env.component.sourceParatextId.value).toBe('r02');
  }));

  it('informs user that a selection is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickInput();
    env.inputText('does not exist');
    expect(env.selectionInvalidMessage).not.toBeNull();
    env.inputText('p');
    env.clickInput();
    env.clickOption(0, 0);
    expect(env.selectionInvalidMessage).toBeNull();
  }));

  it('allows marking the selection invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.selectionInvalidMessage).toBeNull();
    env.component.projectSelect.customValidate(SFValidators.customValidator(CustomValidatorState.InvalidProject));
    tick();
    env.fixture.detectChanges();
    expect(env.selectionInvalidMessage).not.toBeNull();
  }));

  it('allows using a custom error state matcher', fakeAsync(() => {
    const env = new TestEnvironment();
    const invalidMessageMapper = {
      invalidProject: 'Please select a valid project',
      bookNotFound: 'Genesis on the selected project',
      noWritePermissions: 'You do not have permission'
    };
    env.component.projectSelect.invalidMessageMapper = invalidMessageMapper;
    expect(env.selectionInvalidMessage).toBeNull();
    env.component.projectSelect.customValidate(SFValidators.customValidator(CustomValidatorState.InvalidProject));
    tick();
    env.fixture.detectChanges();
    expect(env.selectionInvalidMessage!.textContent).toContain('Please select a valid project');

    env.component.projectSelect.customValidate(SFValidators.customValidator(CustomValidatorState.BookNotFound));
    tick();
    env.fixture.detectChanges();
    expect(env.selectionInvalidMessage!.textContent).toContain('Genesis on the selected project');

    env.component.projectSelect.customValidate(SFValidators.customValidator(CustomValidatorState.NoWritePermissions));
    tick();
    env.fixture.detectChanges();
    expect(env.selectionInvalidMessage!.textContent).toContain('You do not have permission');
  }));

  it('updates the filtered list when the resources update', fakeAsync(() => {
    const initialProjects = [
      { name: 'Project 1', paratextId: 'p01', shortName: 'P1' },
      { name: 'Project 2', paratextId: 'p02', shortName: 'P2' }
    ];
    const initialResources = [];
    const env = new TestEnvironment([], initialProjects, initialResources);
    env.clickInput();

    expect(env.groupLabels.length).toBe(1);
    expect(env.groupLabels[0]).toBe('Projects');
    expect(env.optionsText(0)).toEqual(['P1 - Project 1', 'P2 - Project 2']);

    env.inputText('R1');
    expect(env.groupLabels.length).toBe(0);

    // Update the resources
    const updatedResources = [
      { name: 'Resource 1', paratextId: 'r01', shortName: 'R1' },
      { name: 'Resource 2', paratextId: 'r02', shortName: 'R2' }
    ];
    env.component.resources = updatedResources;
    env.fixture.detectChanges();
    tick();
    expect(env.groupLabels.length).toBe(1);
    expect(env.groupLabels[0]).toBe('Resources');
    expect(env.optionsText(0)).toEqual(['R1 - Resource 1']);
  }));
});

@Component({
  selector: 'app-host',
  template: `<form [formGroup]="connectProjectForm">
    <app-project-select
      formControlName="sourceParatextId"
      placeholder="Based on"
      [projects]="projects"
      [resources]="resources"
      [hiddenParatextIds]="hiddenParatextIds"
      [nonSelectableProjects]="nonSelectableProjects"
      [isDisabled]="isDisabled"
    ></app-project-select>
  </form>`
})
class HostComponent {
  readonly sourceParatextId = new UntypedFormControl(undefined);
  readonly connectProjectForm = new UntypedFormGroup({ sourceParatextId: this.sourceParatextId });

  @ViewChild(ProjectSelectComponent) projectSelect!: ProjectSelectComponent;
  isDisabled: boolean = false;

  projects: SelectableProject[] = [
    { name: 'Project 1', paratextId: 'p01', shortName: 'P1' },
    { name: 'Project 2', paratextId: 'p02', shortName: 'P2' },
    { name: 'Project 3', paratextId: 'p03', shortName: 'P3' }
  ];
  resources: SelectableProject[] = [
    { name: 'Resource 1', paratextId: 'r01', shortName: 'R1' },
    { name: 'Resource 2', paratextId: 'r02', shortName: 'R2' }
  ];
  nonSelectableProjects: SelectableProject[] = [{ name: 'Project 1', paratextId: 'p01', shortName: 'P1' }];
  hiddenParatextIds: string[] = [];
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;
  component: HostComponent;

  constructor(
    hiddenParatextIds?: string[],
    projects?: SelectableProject[],
    resources?: SelectableProject[],
    nonSelectableProjects?: SelectableProject[]
  ) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, ProjectSelectComponent],
      imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule]
    });

    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;

    this.component.projects = projects || this.component.projects;
    this.component.resources = resources || this.component.resources;
    this.component.nonSelectableProjects = nonSelectableProjects || this.component.nonSelectableProjects;
    this.component.hiddenParatextIds = hiddenParatextIds || this.component.hiddenParatextIds;

    this.fixture.detectChanges();
    tick();
  }

  get selectionInvalidMessage(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('#invalidSelection');
  }

  get textInputElement(): HTMLInputElement {
    return this.fixture.nativeElement.querySelector('mat-form-field input');
  }

  clickInput(): void {
    (this.fixture.nativeElement as HTMLElement).querySelector('input')!.click();
    this.fixture.detectChanges();
    tick();
  }

  options(group: number): Element[] {
    return Array.from(this.optGroups[group].querySelectorAll('mat-option'));
  }

  optionsText(group: number): string[] {
    return this.options(group).map(option => option.textContent || '');
  }

  clickOption(group: number, item: number): void {
    (this.options(group)[item] as HTMLElement).click();
    this.fixture.detectChanges();
    tick();
  }

  inputText(text: string): void {
    this.textInputElement.value = text;
    this.textInputElement.dispatchEvent(new Event('input'));
    tick();
    this.fixture.detectChanges();
    tick();
  }

  scrollMenu(top: number): void {
    this.panel.scrollTop = top;
    // Just scrolling the element doesn't cause the event to be fired
    this.panel.dispatchEvent(new Event('scroll'));
    this.fixture.detectChanges();
    tick();
  }

  get panel(): HTMLElement {
    return this.component.projectSelect.autocomplete.panel.nativeElement as HTMLElement;
  }

  get optGroups(): Element[] {
    return Array.from(this.panel.querySelectorAll('mat-optgroup'));
  }

  get groupLabels(): string[] {
    return Array.from(this.panel.querySelectorAll('.mat-mdc-optgroup-label')).map(e => e.textContent?.trim() || '');
  }

  get autoCompleteShowing(): boolean {
    return this.component.projectSelect.autocompleteTrigger.panelOpen;
  }
}
