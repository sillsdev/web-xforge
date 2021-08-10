import { Component, EventEmitter, forwardRef, Input, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { ShowOnDirtyErrorStateMatcher } from '@angular/material/core';
import { BehaviorSubject, combineLatest, fromEvent, Observable } from 'rxjs';
import { filter, map, startWith, takeUntil, tap } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SelectableProject } from '../core/paratext.service';
import { SFValidators } from '../shared/sfvalidators';
import { projectLabel } from '../shared/utils';

// A value accessor is necessary in order to create a custom form control
export const PROJECT_SELECT_VALUE_ACCESSOR: any = {
  provide: NG_VALUE_ACCESSOR,
  useExisting: forwardRef(() => ProjectSelectComponent),
  multi: true
};

/** This component can be used within a form to list projects and resources from which a user can make a selection. */
@Component({
  selector: 'app-project-select',
  templateUrl: 'project-select.component.html',
  styleUrls: ['project-select.component.scss'],
  providers: [PROJECT_SELECT_VALUE_ACCESSOR]
})
export class ProjectSelectComponent extends SubscriptionDisposable implements ControlValueAccessor {
  @Output() valueChange: EventEmitter<string> = new EventEmitter<string>(true);

  @Input() placeholder = '';

  @ViewChild(MatAutocomplete) autocomplete!: MatAutocomplete;
  @ViewChild(MatAutocompleteTrigger) autocompleteTrigger!: MatAutocompleteTrigger;

  readonly paratextIdControl = new FormControl('', [SFValidators.selectableProject()]);
  @Input() projects?: SelectableProject[];
  @Input() resources?: SelectableProject[];
  /** Projects that can be an already selected value, but not given as an option in the menu */
  @Input() nonSelectableProjects?: SelectableProject[];
  readonly matcher = new ShowOnDirtyErrorStateMatcher();

  hideProjectId$ = new BehaviorSubject<string>('');

  resourceCountLimit$ = new BehaviorSubject<number>(25);

  projects$: Observable<SelectableProject[]> = combineLatest([
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.hideProjectId$
  ]).pipe(map(value => this.filterGroup(value[0], this.projects || [])));

  resources$: Observable<SelectableProject[]> = combineLatest([
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.resourceCountLimit$,
    this.hideProjectId$
  ]).pipe(map(value => this.filterGroup(value[0], this.resources || [], value[1])));

  projectLabel = projectLabel;

  constructor() {
    super();
    this.subscribe(this.paratextIdControl.valueChanges, (value: SelectableProject) =>
      this.valueChange.next(value.paratextId)
    );

    this.subscribe(
      this.projects$.pipe(
        filter(
          p =>
            p.length === 1 &&
            typeof this.paratextIdControl.value === 'string' &&
            p[0].name.toLowerCase() === this.paratextIdControl.value.toLowerCase()
        )
      ),
      projects => this.paratextIdControl.setValue(projects[0])
    );
    this.subscribe(
      this.resources$.pipe(
        filter(
          r =>
            r.length === 1 &&
            typeof this.paratextIdControl.value === 'string' &&
            r[0].name.toLowerCase() === this.paratextIdControl.value.toLowerCase()
        )
      ),
      resources => this.paratextIdControl.setValue(resources[0])
    );
  }

  @Input() set value(id: string) {
    const project =
      this.projects?.find(p => p.paratextId === id) ||
      this.resources?.find(r => r.paratextId === id) ||
      this.nonSelectableProjects?.find(p => p.paratextId === id);
    if (project != null) {
      this.paratextIdControl.setValue(project);
    }
  }

  // To avoid a warning in the console this property was renamed from 'disabled'
  @Input() set isDisabled(value: boolean) {
    if (value) {
      this.paratextIdControl.disable();
    } else if (this.paratextIdControl.disabled) {
      // This check is required otherwise it results in a strange null value error
      this.paratextIdControl.enable();
    }
  }
  get isDisabled(): boolean {
    return this.paratextIdControl.disabled;
  }

  @Input() set hideProjectId(value: string | undefined) {
    if (value == null) {
      return;
    }
    if (this.paratextIdControl.value?.paratextId === value) {
      this.paratextIdControl.setValue('');
    }
    this.hideProjectId$.next(value);
  }
  get hideProjectId(): string | undefined {
    return this.hideProjectId$.getValue();
  }

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: any): void {
    this.subscribe(this.valueChange, fn);
  }

  registerOnTouched(fn: any): void {
    this.subscribe(this.valueChange, fn);
  }

  autocompleteOpened() {
    setTimeout(() => {
      if (this.autocomplete && this.autocomplete.panel && this.autocompleteTrigger) {
        fromEvent(this.autocomplete.panel.nativeElement, 'scroll')
          .pipe(
            map(() => this.autocomplete.panel.nativeElement.scrollTop),
            takeUntil(this.autocompleteTrigger.panelClosingActions.pipe(tap(() => this.resourceCountLimit$.next(25))))
          )
          .subscribe(() => {
            const panel = this.autocomplete.panel.nativeElement;
            // if scrolled to within 100px of bottom, display more resources
            if (this.resources != null && panel.scrollHeight <= panel.scrollTop + panel.clientHeight + 100) {
              this.resourceCountLimit$.next(Math.min(this.resourceCountLimit$.getValue() + 25, this.resources.length));
            }
          });
      }
    });
  }

  inputClicked() {
    this.autocompleteTrigger.openPanel();
  }

  nullableLength(project: SelectableProject[] | null): number {
    if (project == null) {
      return NaN;
    }
    return project.length;
  }

  private filterGroup(
    value: string | SelectableProject,
    collection: SelectableProject[],
    limit?: number
  ): SelectableProject[] {
    const valueLower = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return collection
      .filter(p => p.paratextId !== this.hideProjectId && this.projectIndexOf(p, valueLower) < Infinity)
      .sort((a, b) => this.projectIndexOf(a, valueLower) - this.projectIndexOf(b, valueLower))
      .slice(0, limit);
  }

  /** valueLower is assumed to already be converted to lower case */
  private projectIndexOf(project: SelectableProject, valueLower: string): number {
    const a = project.shortName.toLowerCase().indexOf(valueLower);
    const b = project.name.toLowerCase().indexOf(valueLower);
    const i = a === -1 || b === -1 ? Math.max(a, b) : Math.min(a, b);
    return i === -1 ? Infinity : i;
  }
}
