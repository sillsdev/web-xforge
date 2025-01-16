import { Component, EventEmitter, forwardRef, Input, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, UntypedFormControl, ValidatorFn } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { ShowOnDirtyErrorStateMatcher } from '@angular/material/core';
import { translate } from '@ngneat/transloco';
import { BehaviorSubject, combineLatest, fromEvent, Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, startWith, takeUntil, tap } from 'rxjs/operators';
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
  @Output() projectSelect = new EventEmitter<SelectableProject>();

  @Input() placeholder = '';

  @ViewChild(MatAutocomplete) autocomplete!: MatAutocomplete;
  @ViewChild(MatAutocompleteTrigger)
  autocompleteTrigger!: MatAutocompleteTrigger;

  readonly paratextIdControl = new UntypedFormControl('', [SFValidators.selectableProject(true)]);
  @Input() projects?: SelectableProject[];
  @Input() resources?: SelectableProject[];
  /** Projects that can be an already selected value, but not given as an option in the menu */
  @Input() nonSelectableProjects?: SelectableProject[];
  @Input() invalidMessageMapper?: { [key: string]: string };
  readonly matcher = new ShowOnDirtyErrorStateMatcher();

  hiddenParatextIds$ = new BehaviorSubject<string[]>([]);

  resourceCountLimit$ = new BehaviorSubject<number>(25);

  projects$: Observable<SelectableProject[]> = combineLatest([
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.hiddenParatextIds$
  ]).pipe(map(value => this.filterGroup(value[0], this.projects || [])));

  resources$: Observable<SelectableProject[]> = combineLatest([
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.resourceCountLimit$,
    this.hiddenParatextIds$
  ]).pipe(map(value => this.filterGroup(value[0], this.resources || [], value[1])));

  projectLabel = projectLabel;

  constructor() {
    super();
    this.subscribe(this.paratextIdControl.valueChanges.pipe(distinctUntilChanged()), (value: SelectableProject) => {
      this.valueChange.next(value.paratextId);

      if (value instanceof Object) {
        this.projectSelect.emit(value);
      }
    });

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
    if (this.paratextIdControl?.value.paratextId !== id) {
      const project =
        this.projects?.find(p => p.paratextId === id) ||
        this.resources?.find(r => r.paratextId === id) ||
        this.nonSelectableProjects?.find(p => p.paratextId === id);
      if (project != null) {
        this.paratextIdControl.setValue(project);
      }
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

  @Input() set hiddenParatextIds(value: string[]) {
    if (value == null) {
      return;
    }
    if (value.includes(this.paratextIdControl.value?.paratextId)) {
      this.paratextIdControl.setValue('');
    }
    this.hiddenParatextIds$.next(value);
  }

  get hiddenParatextIds(): string[] {
    return this.hiddenParatextIds$.getValue();
  }

  get invalidMessage(): string {
    if (this.invalidMessageMapper != null && this.paratextIdControl.errors != null) {
      const error: string = Object.keys(this.paratextIdControl.errors)[0];
      return this.invalidMessageMapper[error];
    }
    return translate('project_select.please_select_valid_project_or_resource');
  }

  customValidate(customValidator: ValidatorFn): void {
    this.paratextIdControl.clearValidators();
    this.paratextIdControl.setValidators([SFValidators.selectableProject(true), customValidator]);
    this.paratextIdControl.markAsDirty();
    this.paratextIdControl.updateValueAndValidity();
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

  autocompleteOpened(): void {
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

  inputClicked(): void {
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
      .filter(p => !this.hiddenParatextIds.includes(p.paratextId) && this.projectIndexOf(p, valueLower) < Infinity)
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
