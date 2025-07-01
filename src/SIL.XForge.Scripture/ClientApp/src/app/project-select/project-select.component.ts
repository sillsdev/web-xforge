import { Component, DestroyRef, EventEmitter, forwardRef, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR, ValidatorFn } from '@angular/forms';
import { MatAutocomplete, MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { ShowOnDirtyErrorStateMatcher } from '@angular/material/core';
import { translate } from '@ngneat/transloco';
import { BehaviorSubject, combineLatest, fromEvent, Observable } from 'rxjs';
import { distinctUntilChanged, map, shareReplay, startWith, takeUntil, tap } from 'rxjs/operators';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { hasPropWithValue } from '../../type-utils';
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
export class ProjectSelectComponent implements ControlValueAccessor, OnDestroy {
  @Output() valueChange: EventEmitter<string | undefined> = new EventEmitter<string | undefined>(true);
  @Output() projectSelect = new EventEmitter<SelectableProject>();

  @Input() placeholder = '';

  @ViewChild(MatAutocomplete) autocomplete!: MatAutocomplete;
  @ViewChild(MatAutocompleteTrigger)
  autocompleteTrigger!: MatAutocompleteTrigger;

  readonly paratextIdControl = new FormControl<string | SelectableProject>('', [SFValidators.selectableProject(true)]);
  private allProjects$ = new BehaviorSubject<SelectableProject[] | undefined>(undefined);
  private allResources$ = new BehaviorSubject<SelectableProject[] | undefined>(undefined);

  @Input()
  set projects(value: SelectableProject[] | undefined) {
    this.allProjects$.next(value);
  }
  get projects(): SelectableProject[] | undefined {
    return this.allProjects$.getValue();
  }

  @Input()
  set resources(value: SelectableProject[] | undefined) {
    this.allResources$.next(value);
  }
  get resources(): SelectableProject[] | undefined {
    return this.allResources$.getValue();
  }

  /** Projects that can be an already selected value, but not necessarily given as an option in the menu */
  @Input() nonSelectableProjects?: SelectableProject[];
  @Input() invalidMessageMapper?: { [key: string]: string };
  readonly matcher = new ShowOnDirtyErrorStateMatcher();

  hiddenParatextIds$ = new BehaviorSubject<string[]>([]);

  /**
   * The maximum number of resources to display at once. This is to prevent rendering thousands of resources in the
   * list. This value is increased as the user scrolls down the list, and resets when the autocomplete panel is closed.
   */
  resourceCountLimit$ = new BehaviorSubject<number>(25);

  filteredProjects$: Observable<SelectableProject[]> = combineLatest([
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.hiddenParatextIds$,
    this.allProjects$.pipe(startWith([]))
  ]).pipe(
    map(([inputValue, _hiddenIds, projects]) => this.filterGroup(inputValue ?? '', projects ?? [])),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  filteredResources$: Observable<SelectableProject[]> = combineLatest([
    this.paratextIdControl.valueChanges.pipe(startWith('')),
    this.resourceCountLimit$,
    this.hiddenParatextIds$,
    this.allResources$.pipe(startWith([]))
  ]).pipe(
    map(([inputValue, limit, _hiddenIds, resources]) => this.filterGroup(inputValue ?? '', resources || [], limit)),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  projectLabel = projectLabel;

  constructor(private destroyRef: DestroyRef) {
    this.paratextIdControl.valueChanges
      .pipe(distinctUntilChanged(), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        // When the user clears the input box, or is typing the name of a project, `value` comes in as a string. When
        // the user selects a project from the list, `value` comes in as a SelectableProject.
        if (typeof value === 'string' || value == null) {
          this.valueChange.next(undefined);
          return;
        }

        this.valueChange.next(value.paratextId);
        this.projectSelect.emit(value);
      });
  }

  @Input() set value(id: string | undefined) {
    if (hasPropWithValue(this.paratextIdControl?.value, 'paratextId', id)) return;
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

  @Input() set hiddenParatextIds(value: string[]) {
    value ??= [];
    if (value.some(id => hasPropWithValue(this.paratextIdControl?.value, 'paratextId', id))) {
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

  destroyed = false;
  ngOnDestroy(): void {
    this.destroyed = true;
  }

  registerOnChange(fn: any): void {
    // Angular calls registerOnChange during tear-down to "remove" the callback. Make this a noop to prevent NG0911
    // https://angular.dev/api/forms/ControlValueAccessor#registerOnChange
    if (!this.destroyed) this.valueChange.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(fn);
  }

  registerOnTouched(fn: any): void {
    // Angular calls registerOnTouched during tear-down to "remove" the callback. Make this a noop to prevent NG0911
    // https://angular.dev/api/forms/ControlValueAccessor#registerOnTouched
    if (!this.destroyed) this.valueChange.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(fn);
  }

  autocompleteOpened(): void {
    setTimeout(() => {
      if (this.autocomplete?.panel != null && this.autocompleteTrigger != null) {
        fromEvent<Event>(this.autocomplete.panel.nativeElement, 'scroll')
          .pipe(
            takeUntil(this.autocompleteTrigger.panelClosingActions.pipe(tap(() => this.resourceCountLimit$.next(25))))
          )
          .subscribe(event => {
            const panel = event.target as HTMLElement | null;
            if (panel == null) return;
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
