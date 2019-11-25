import { TestBed, TestModuleMetadata } from '@angular/core/testing';
import { HAMMER_LOADER } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@ngneat/transloco';
import { configureTestSuite } from 'ng-bullet';
import { instance, reset } from 'ts-mockito';
import { en } from './i18n.service';

/**
 * Configures the testing module so that it is setup only once for a test fixture instead of once for each test. Setting
 * up the testing module can be memory and CPU intensive especially if it is importing a lot of modules and components.
 *
 * This function supports special "useMock" providers on the test module metadata, i.e.
 * "{ provide: Class, useMock: mockedClass }". These providers perform the necessary setup to inject a ts-mockito mock.
 * It also ensures that the mocks are reset after each test.
 *
 * @param {() => TestModuleMetadata} createModuleDef A function that creates the test module definition.
 */
export const configureTestingModule = (createModuleDef: () => TestModuleMetadata) => {
  const mocks: any[] = [];

  configureTestSuite(() => {
    const moduleDef = createModuleDef();
    if (moduleDef.providers != null) {
      for (const provider of moduleDef.providers) {
        if (provider.useMock != null) {
          const mock = provider.useMock;
          provider.useFactory = () => instance(mock);
          delete provider.useMock;
          mocks.push(mock);
        }
      }
    }
    TestBed.configureTestingModule(moduleDef);
  });

  afterEach(() => {
    for (const mock of mocks) {
      reset(mock);
    }
  });
};

export const TestTranslocoModule = TranslocoTestingModule.withLangs(
  { en },
  {
    availableLangs: ['en'],
    reRenderOnLangChange: true,
    fallbackLang: 'en',
    defaultLang: 'en'
  }
);

// used to prevent Angular from complaining that HammerJS isn't available
export const emptyHammerLoader = {
  provide: HAMMER_LOADER,
  useValue: () => new Promise(() => {})
};
