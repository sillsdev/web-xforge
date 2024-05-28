import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MatMenuHarness, MatMenuItemHarness } from '@angular/material/menu/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { FontSizeComponent } from './font-size.component';

describe('FontSizeComponent', () => {
  let component: FontSizeComponent;
  let fixture: ComponentFixture<FontSizeComponent>;
  let loader: HarnessLoader;

  const getMenuTrigger = function (): Promise<MatButtonHarness> {
    return loader.getHarness(MatButtonHarness.with({ selector: '.font-size-menu-trigger' }));
  };

  const getMenu = function (): Promise<MatMenuHarness> {
    return loader.getHarness(MatMenuHarness.with({ selector: '.font-size-menu-trigger' }));
  };

  const getDecreaseButton = function (menu: MatMenuHarness): Promise<MatButtonHarness> {
    return menu.getHarness(MatButtonHarness.with({ selector: '.button-group button:nth-of-type(1)' }));
  };

  const getIncreaseButton = function (menu: MatMenuHarness): Promise<MatButtonHarness> {
    return menu.getHarness(MatButtonHarness.with({ selector: '.button-group button:nth-of-type(2)' }));
  };

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [UICommonModule, NoopAnimationsModule, TestTranslocoModule],
      declarations: [FontSizeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FontSizeComponent);
    component = fixture.componentInstance;
    loader = TestbedHarnessEnvironment.loader(fixture);
  }));

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should open the mat-menu when the button is clicked', async () => {
    const button: MatButtonHarness = await getMenuTrigger();
    expect(button).toBeTruthy();
    await button.click();

    const menu: MatMenuHarness = await loader.getHarness(MatMenuHarness);
    expect(menu).toBeTruthy();

    const isOpen: boolean = await menu.isOpen();
    expect(isOpen).toBe(true);

    const items: MatMenuItemHarness[] = await menu.getItems();
    expect(items.length).toBeGreaterThan(0);
  });

  it('can decrease font', async () => {
    component.initial = component.max;
    component.ngOnInit();
    const initialFontSize = component.fontSize;

    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const decreaseFontButton: MatButtonHarness = await getDecreaseButton(menu);
    expect(decreaseFontButton).toBeTruthy();

    await decreaseFontButton.click();

    const newFontSize: number = component.fontSize;
    expect(newFontSize).toBeLessThan(initialFontSize);
  });

  it('can increase font', async () => {
    component.initial = component.min;
    component.ngOnInit();
    const initialFontSize = component.fontSize;

    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const increaseFontButton: MatButtonHarness = await getIncreaseButton(menu);

    expect(increaseFontButton).toBeTruthy();

    await increaseFontButton.click();
    const newFontSize: number = component.fontSize;
    expect(newFontSize).toBeGreaterThan(initialFontSize);
  });

  it('can set disabled states', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const decreaseFontButton: MatButtonHarness = await getDecreaseButton(menu);
    const increaseFontButton: MatButtonHarness = await getIncreaseButton(menu);

    component.initial = component.min;
    component.ngOnInit();
    expect(await decreaseFontButton.isDisabled()).toBeTrue();

    await increaseFontButton.click();
    expect(await decreaseFontButton.isDisabled()).toBeFalse();

    await decreaseFontButton.click();
    expect(component.fontSize).toEqual(component.min);
    expect(await decreaseFontButton.isDisabled()).toBeTrue();

    component.initial = component.max;
    component.ngOnInit();
    expect(await increaseFontButton.isDisabled()).toBeTrue();

    await decreaseFontButton.click();
    expect(await increaseFontButton.isDisabled()).toBeFalse();

    await increaseFontButton.click();
    expect(component.fontSize).toEqual(component.max);
    expect(await increaseFontButton.isDisabled()).toBeTrue();
  });

  it('can set [min] attribute > default min', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const decreaseFontButton: MatButtonHarness = await getDecreaseButton(menu);

    const min: number = 2;
    component.min = min;
    component.ngOnInit();
    expect(component.fontSize).toEqual(min);
    expect(await decreaseFontButton.isDisabled()).toBeTrue();
  });

  it('can set [min] attribute < default min', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const decreaseFontButton: MatButtonHarness = await getDecreaseButton(menu);

    const min: number = 0.5;
    component.min = min;
    component.ngOnInit();
    expect(component.fontSize).toEqual(component.initial);
    expect(component.fontSize).toBeGreaterThan(min);
    expect(await decreaseFontButton.isDisabled()).toBeFalse();
  });

  it('can set [max] attribute > initial < default max', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const increaseFontButton: MatButtonHarness = await getIncreaseButton(menu);

    const max: number = 2;
    component.max = max;
    component.initial = 1;
    component.ngOnInit();
    expect(await increaseFontButton.isDisabled()).toBeFalse();
    for (let i = component.initial; i < max; i += component.step) {
      await increaseFontButton.click();
    }
    expect(component.fontSize).toEqual(component.max);
    expect(await increaseFontButton.isDisabled()).toBeTrue();
  });

  it('can set [max] attribute > initial > default max', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const increaseFontButton: MatButtonHarness = await getIncreaseButton(menu);

    const max: number = 5;
    component.max = max;
    component.initial = 1;
    component.ngOnInit();
    expect(await increaseFontButton.isDisabled()).toBeFalse();
    for (let i = component.initial; i < max; i += component.step) {
      await increaseFontButton.click();
    }
    expect(component.fontSize).toEqual(component.max);
    expect(await increaseFontButton.isDisabled()).toBeTrue();
  });

  it('can handle [max] attribute < initial', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const increaseFontButton: MatButtonHarness = await getIncreaseButton(menu);

    component.min = 1;
    component.max = 1.5;
    component.initial = 2;
    component.ngOnInit();
    expect(await increaseFontButton.isDisabled()).toBeTrue();
    expect(component.fontSize).toEqual(component.max);
  });

  it('can handle [min] attribute > initial', async () => {
    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const decreaseFontButton: MatButtonHarness = await getDecreaseButton(menu);

    component.min = 2;
    component.max = 3;
    component.initial = 1;
    component.ngOnInit();
    expect(await decreaseFontButton.isDisabled()).toBeTrue();
    expect(component.fontSize).toEqual(component.min);
  });

  it('handles invalid min max range', async () => {
    component.min = component.max + 1;
    expect(() => {
      component.ngOnInit();
    }).toThrow(new RangeError(`min (${component.min}) can not be larger than max (${component.max})`));
  });

  it('should emit "apply" when font size is changed', async () => {
    component.min = 1;
    component.max = 3;
    component.initial = 1;
    component.ngOnInit();

    const spy = jasmine.createSpy('apply');
    component.apply.subscribe(spy);

    const menu: MatMenuHarness = await getMenu();
    await menu.open();

    const increaseFontButton: MatButtonHarness = await getIncreaseButton(menu);
    await increaseFontButton.click();

    expect(component.fontSize).toBeGreaterThan(component.initial);
    expect(spy).toHaveBeenCalledWith(`${component.fontSize}rem`);
  });
});
