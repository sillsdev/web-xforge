import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';
import { MatAutocomplete } from '@angular/material/autocomplete';
import { MatFormField } from '@angular/material/form-field';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SelectableProject } from '../core/paratext.service';
import { ProjectSelectComponent } from './project-select.component';

describe('ProjectSelectComponent', () => {
  it('should list projects and resources', fakeAsync(() => {
    const env = new TestEnvironment('p02');
    // Expect two projects and two resources (one of the projects should be hidden)
    expect(env.groupLabels.length).toBe(2);
    expect(env.groupLabels[0]).toBe('Projects');
    expect(env.groupLabels[1]).toBe('Resources');
    expect(env.optionsText(0)).toEqual(['Project 1', 'Project 3']);
    expect(env.optionsText(1)).toEqual(['Resource 1', 'Resource 2']);
  }));

  it('it only lists groups with menu items', fakeAsync(() => {
    const env = new TestEnvironment(undefined, undefined, []);
    expect(env.groupLabels.length).toBe(1);
  }));

  it('functions as a form control', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.sourceParatextId.value).toBeNull();
    env.clickOption(0, 0);
    expect(env.component.sourceParatextId.value).toBe('p01');
    env.clickInput();
    env.clickOption(1, 1);
    expect(env.component.sourceParatextId.value).toBe('r02');
  }));

  it("doesn't list hidden projects", fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.sourceParatextId.value).toBeNull();
    env.clickOption(0, 0);
    expect(env.component.sourceParatextId.value).toBe('p01');
    env.clickInput();
    env.clickOption(1, 1);
    expect(env.component.sourceParatextId.value).toBe('r02');
  }));

  it('adds list items as the user scrolls the list', fakeAsync(() => {
    const resources = [...Array(100).keys()].map(key => ({ paratextId: 'r' + key, name: 'Resource ' + (key + 1) }));
    const env = new TestEnvironment('p03', undefined, resources);
    expect(env.optGroups.length).toBe(2);
    expect(env.optionsText(0)).toEqual(['Project 1', 'Project 2']);
    expect(env.options(1).length).toBe(25);
    env.scrollMenu(2500);
    expect(env.options(1).length).toBe(50);
  }));

  it('opens the panel when input is clicked after already selecting a project', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.sourceParatextId.value).toBeNull();
    env.clickOption(0, 0);
    expect(env.component.sourceParatextId.value).toBe('p01');
    env.clickInput();
    env.clickOption(1, 1);
    expect(env.component.sourceParatextId.value).toBe('r02');
  }));

  it('informs user that a selection is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.inputText('does not exist');
    expect(env.selectionInvalidMessage).not.toBeNull();
    env.inputText('p');
    env.clickInput();
    env.clickOption(0, 0);
    expect(env.selectionInvalidMessage).toBeNull();
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
      [hideProjectId]="hideProjectId"
      [nonSelectableProjects]="nonSelectableProjects"
    ></app-project-select>
  </form>`
})
class HostComponent {
  readonly sourceParatextId = new FormControl(undefined);
  readonly connectProjectForm = new FormGroup({ sourceParatextId: this.sourceParatextId });

  @ViewChild(ProjectSelectComponent) projectSelect!: ProjectSelectComponent;

  projects: SelectableProject[] = [
    { name: 'Project 1', paratextId: 'p01' },
    { name: 'Project 2', paratextId: 'p02' },
    { name: 'Project 3', paratextId: 'p03' }
  ];
  resources: SelectableProject[] = [
    { name: 'Resource 1', paratextId: 'r01' },
    { name: 'Resource 2', paratextId: 'r02' }
  ];
  nonSelectableProjects: SelectableProject[] = [{ name: 'Project 1', paratextId: 'p01' }];
  hideProjectId: string = '';
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;
  component: HostComponent;

  constructor(
    hideProjectId?: string,
    projects?: SelectableProject[],
    resources?: SelectableProject[],
    nonSelectableProjects?: SelectableProject[]
  ) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, ProjectSelectComponent, MatFormField, MatAutocomplete],
      imports: [UICommonModule, TestTranslocoModule, NoopAnimationsModule]
    });

    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;

    this.component.projects = projects || this.component.projects;
    this.component.resources = resources || this.component.resources;
    this.component.nonSelectableProjects = nonSelectableProjects || this.component.nonSelectableProjects;
    this.component.hideProjectId = hideProjectId || this.component.hideProjectId;

    this.fixture.detectChanges();
    tick();
    this.clickInput();
  }

  get selectionInvalidMessage(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('#invalidSelection');
  }

  get textInputElement(): HTMLInputElement {
    return this.fixture.nativeElement.querySelector('mat-form-field input');
  }

  clickInput() {
    (this.fixture.nativeElement as HTMLElement).querySelector('input')!.click();
    this.fixture.detectChanges();
    tick();
  }

  options(group: number) {
    return Array.from(this.optGroups[group].querySelectorAll('mat-option'));
  }

  optionsText(group: number): string[] {
    return this.options(group).map(option => option.textContent || '');
  }

  clickOption(group: number, item: number) {
    (this.options(group)[item] as HTMLElement).click();
    this.fixture.detectChanges();
    tick();
  }

  inputText(text: string): void {
    this.textInputElement.value = text;
    this.textInputElement.dispatchEvent(new Event('input'));
    tick();
    this.fixture.detectChanges();
  }

  scrollMenu(top: number) {
    this.panel.scrollTop = top;
    // Just scrolling the element doesn't cause the event to be fired
    this.panel.dispatchEvent(new Event('scroll'));
    this.fixture.detectChanges();
    tick();
  }

  get panel(): HTMLElement {
    return this.component.projectSelect.autocomplete.panel.nativeElement as HTMLElement;
  }

  get optGroups() {
    return Array.from(this.panel.querySelectorAll('mat-optgroup'));
  }

  get groupLabels(): string[] {
    return Array.from(this.panel.querySelectorAll('mat-optgroup label')).map(e => e.textContent?.trim() || '');
  }
}
