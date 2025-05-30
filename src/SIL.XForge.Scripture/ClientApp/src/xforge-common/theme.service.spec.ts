import { TestBed } from '@angular/core/testing';
import { anyString, mock, when } from 'ts-mockito';
import { LocalSettingsService } from './local-settings.service';
import { configureTestingModule } from './test-utils';
import { DOCUMENT } from './browser-globals';
import { Theme, ThemeService } from './theme.service';

const mockedLocalSettingsService = mock(LocalSettingsService);

class MockHTMLElement {
  private classSet = new Set<string>();

  get className(): string {
    return Array.from(this.classSet).join(' ');
  }

  classList = {
    add: (className: string) => {
      this.classSet.add(className);
    },
    remove: (className: string) => {
      this.classSet.delete(className);
    },
    reset: () => {
      this.classSet.clear();
    }
  };
}

describe('ThemeService', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: LocalSettingsService, useMock: mockedLocalSettingsService },
      { provide: DOCUMENT, useValue: { documentElement: new MockHTMLElement() } }
    ]
  }));

  beforeEach(() => {
    (TestBed.inject(DOCUMENT) as any).documentElement.classList.reset();
  });

  it('default theme should be light', () => {
    const env = new TestEnvironment();
    expect(env.theme).toEqual(Theme.Default);
    expect(env.bodyClass).toEqual(Theme.Default);
  });

  it('can change theme to dark', () => {
    const env = new TestEnvironment();
    expect(env.theme).toEqual(Theme.Default);
    env.service.setDarkMode(true);
    expect(env.theme).toEqual(Theme.DefaultDarkMode);
    expect(env.bodyClass).toEqual(Theme.DefaultDarkMode);
  });

  it('sets correct theme based on local storage', () => {
    when(mockedLocalSettingsService.get(anyString())).thenReturn(Theme.DefaultDarkMode);
    const env = new TestEnvironment();
    expect(env.theme).toEqual(Theme.DefaultDarkMode);
    expect(env.bodyClass).toEqual(Theme.DefaultDarkMode);
  });
});

class TestEnvironment {
  readonly service: ThemeService;

  constructor() {
    this.service = TestBed.inject(ThemeService);
  }
  get theme(): string {
    return this.service.theme;
  }

  get bodyClass(): string {
    return (TestBed.inject(DOCUMENT) as any).documentElement.className;
  }
}
