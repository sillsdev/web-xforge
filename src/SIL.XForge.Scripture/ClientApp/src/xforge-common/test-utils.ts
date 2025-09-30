import { Component, Directive, Input, NgModule, TemplateRef, ViewChild, ViewContainerRef } from '@angular/core';
import { TestBed, TestModuleMetadata } from '@angular/core/testing';
import { HAMMER_LOADER } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@ngneat/transloco';
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
export const configureTestingModule = (createModuleDef: () => TestModuleMetadata): void => {
  const mocks: any[] = [];

  let moduleDef: TestModuleMetadata;

  beforeEach(() => {
    if (moduleDef == null) {
      moduleDef = createModuleDef();
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
    }

    TestBed.configureTestingModule(moduleDef);
  });

  afterEach(() => {
    for (const mock of mocks) {
      reset(mock);
    }
    const overlay: Element | null = document.body.querySelector('.cdk-overlay-container');
    if (overlay?.hasChildNodes()) {
      overlay.remove();
      // Subsequent tests can have trouble with content left in the overlay container.
      // (Don't try to fix the problem here because not all tests use configureTestingModule, and it's not its job)
      throw new Error('Test did not clean up its overlay container content.');
    }
  });
};

export const TestTranslocoModule = TranslocoTestingModule.forRoot({
  langs: { en },
  translocoConfig: {
    availableLangs: ['en'],
    reRenderOnLangChange: true,
    fallbackLang: 'en',
    defaultLang: 'en'
  }
});

// used to prevent Angular from complaining that HammerJS isn't available
export const emptyHammerLoader = {
  provide: HAMMER_LOADER,
  useValue: () => new Promise(() => {})
};

// Just closing the material dialog can leave residue of the overlay backdrop so wait for it to finish closing
export const matDialogCloseDelay = 701;

export function getAudioBlob(): Blob {
  const base64 =
    'SUQzAwAAAAADJVRGTFQAAAAPAAAB//5NAFAARwAvADMAAABDT01NAAAAggAAAGVuZ2lUdW5TTVBCACAwMDAwMDAwMCAwMDAwMDAw' +
    'MCAwMDAwMDAwMCAwMDAwMDAwMDAwMDBmM2JlIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAw' +
    'MDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+7RAAAAE4ABLgAAACAAACXAA' +
    'AAEAAAEuAAAAIAAAJcAAAAT/////////////////////////////////////////////////////////////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '///////////////////////////////+3JdlZRJSTbj/8VBhw8UFo9hGRl5GRkZPJmRkZGZGRk6PNIrUtBOM3NzcdqRSUtAeQJnt' +
    'm5uaiikiHDDxhMw4ikpaCaCa1JKWgmYWRJDRwYeMCyEX//3okikNDjAsAA4GcitSaCaCkkVqTQJmHERyloJoJ3n//aZpFak0EwgC' +
    '3/NGv///0GjT/pMmf7cl2VlElJNuP/xUGHDxQWj2EZGXkZGRk8mZGRkZkZGTo80itS0E4zc3Nx2pFJS0B5Ame2bm5qKKSIcMPGEz' +
    'DiKSloJoJrUkpaCZhZEkNHBh4wLIRf//eiSKQ0OMCwADgZyK1JoJoKSRWpNAmYcRHKWgmgnef/9pmkVqTQTCALf80a////QaNP+k' +
    'yZqputySVjVQBHU3cT51OmE22TbdNlMzyQUxKaZwN8L8ALACwDMWAnBBCEKjKnELFzE0BsALAGQHIOBDFY8hKxOFsFsE0HoIQqFI' +
    'QQTQXAegnA9A9B0OdICcLYPQPQTg0DrZ39k4dCGGghD/+7RAwAAEWl4S+KMzYItLwl8UZmwStMETTL3rQlaYImmXvWjOxq+PAeHI' +
    'TgnAasXMuZbzrswGghDOr1ezx+QEbxA7//4P1g+9+o4T/6gQDFVN1uSSsaqAI6m7ifOp0wm2ybbpspmeSCmJTTOBvhfgBYAWAZiw' +
    'E4IIQhUZU4hYuYmgNgBYAyA5BwIYrHkJWJwtgtgmg9BCFQpCCCaC4D0E4HoHoOhzpAThbB6B6CcGgdbO/snDoQw0EIZ2NXx4Dw5C' +
    'cE4DVi5lzLeddmA0EIZ1er2ePyAjeIHf//B+sH3v1HCf/UCAYIV6vTbbVucgNUdI3CcQVlOHgkWwWIfEzAaRmzxMJgSkBRoaJky0' +
    '0nvLExaLJiTRxKWrMKxYotqUSEwQ9NBkItiWcyEjhFtlDHDOHadNsx6i3GTK4qfB4PNX+pr6Ai89KdAhT1HrKR2OXfWGHo//////' +
    '/////////////////////////////////////////////////////////////////////////////////////////////4V6vTbb' +
    'VucgNUdI3CcQVlOHgkWwWIfEzAaRmzxMJgSkBRoaJky00nvLExaLJiTRxKWrMKxYotqUSEwQ9NBkItiWcyEjhFtlDHDOHadNsx6i' +
    '3GTK4qfB4PNX+pr6Ai89KdAhT1HrKR2OXfWGHoISKbbjkkjtxAz/AZ203VSWEnCNWDnUaQjHShdI4uwLS6Am0qVa5lpsxcyrJM4Z' +
    'UYncYh6U4sL/+7RArQAFuC7J0elK2GyF2To9KVsNJLspp6UrYaSXZTT0pWwucuKGE4IloawgkS6p61Uwoti5pCTyVRpY3LqgYUFA' +
    'ga+6sqfRyG5a+KsTZc1tLls9T1kJFNtxySR24gZ/gM7abqpLCThGrBzqNIRjpQukcXYFpdATaVKtcy02YuZVkmcMqMTuMQ9KcWEX' +
    'OXFDCcES0NYQSJdU9aqYUWxc0hJ5Ko0sbl1QMKCgQNfdWVPo5DctfFWJsua2ly2ep6wkpJJuOSOO3FSbwIcVZlmUerA+WGhYEBOs' +
    'zILrxaMkzPFCZYluDSslmTMyU4tbZV8ly6z1kXQdack11pHTyBGTzNmpqpJOTrG02RWjOFrEjCpdyzba8gwDjrfXUompyDkmnjnB' +
    '0T3l0MiVDWpo2kShlf//////////////////////////////////////////////////////////////////////////////////' +
    '/////////////////////////////////////////////////////////////5JSSTcckcduKk3gQ4qzLMo9WB8sNCwICdZmQXXi' +
    '0ZJmeKEyxLcGlZLMmZkpxa2yr5Ll1nrIug605JrrSOnkCMnmbNTVSScnWNpsitGcLWJGFS7lm215BgHHW+upRNTkHJNPHODonvLo' +
    'ZEqGtTRtIlDK4EWqSTSUlLqXEB0DoWNK8lOVhSrBlU0mRFmA0Njk0J0Ul3taogcWfKU50H3KNGMRbr3/+7RAwAAG6TBKaelK2HEm' +
    'CU09KVsM3LslR6UrYZuXZKj0pWyfNSnpM+1WySRCWhyYQF4veo4oYvsG5xlPab2GmgiMLB4z/ewWJNZsJULQhFApiOWcrYG6TECL' +
    'VJJpKSl1LiA6B0LGleSnKwpVgyqaTIizAaGxyaE6KS72tUQOLPlKc6D7lGjGIt17PmpT0mfarZJIhLQ5MIC8XvUcUMX2Dc4yntN7' +
    'DTQRGFg8Z/vYLEms2EqFoQigUxHLOVsDdJhW1q0221biYFvLiAht1x8JpUZSrCLtmebKafKNQTNzvIMh66pOGKFzS+pEESQjXUXm' +
    'XVpCxPy6kmz6wIDxK86hbKoYQYQolKdc2ETiNBKuvBwDGO/XapJAjOa0HqKFqJMH2JLtazFHhQWQn///////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '//////////////////VtatNttW4mBby4gIbdcfCaVGUqwi7ZnmymnyjUEzc7yDIeuqThihc0vqRBEkI11F5l1aQsT8upJs+sCA8S' +
    'vOoWyqGEGEKJSnXNhE4jQSrrwcAxjv12qSQIzmtB6ihaiTB9iS7WsxR4UFkJpKSSTacjaG4syXCgF8hqguKBXlWrybjgoWHaUdW4' +
    'HqbMoy+9pQYye/0+1NI+Q1XIg0E6QtdF8Rx2KBTsbIpGtLj/+7RAwAAGpC9J0elK2GqF6To9KVsN0MMtp5nrYboYZbTzPWy6IRHV' +
    '8A6MJ9Ht6FtLxkiRbxK5uyXvBxHrHkiQ9xCZ9f//87/evQtUkbrTcUF6Skkk2nI2huLMlwoBfIaoLigV5Vq8m44KFh2lHVuB6mzK' +
    'MvvaUGMnv9PtTSPkNVyINBOkLXRfEcdigU7GyKRrS4uiER1fAOjCfR7ehbS8ZIkW8Subsl7wcR6x5IkPcQmfX///O/3r0LVJG603' +
    'FBdHVakkSTb4ZZgailV+2E66n+wMZQBK5V4QQIhe5pIx4NHnmADK17Wu8yy+OT8ss24tL5DhS4VLl3PPr6O8nIiwKCabAFTKU9mJ' +
    'Bhh2/iIhKAyAiE7XmSbf5y1i1LW1hh5pd9K23ttLLAjB6pI1SOR/////////////////////////////////////////////////' +
    '////////////////////////////////////////////////////////////o6rUkiSbfDLMDUUqv2wnXU/2BjKAJXKvCCBEL3NJ' +
    'GPBo88wAZWva13mWXxyfllm3FpfIcKXCpcu559fR3k5EWBQTTYAqZSnsxIMMO38REJQGQEQna8yTb/OWsWpa2sMPNLvpW29tpZYE' +
    'YPVJGqRyNqJQKJRIGJmaieNUzj8hJxRuTjttrnVNQqZzvf+83vAmhoedYwDZTHizAYOio4jlQs7kWD6M4gR02Jw0wBdFLOPu1+1G' +
    'JyPvPUgdaReRAxP/+7RAwAAGCShKUebC2G8lCUo82FsOuLE5R78rUdcWJyj35Wp9AG86RhjCA491lyMkpIxzeeG+6w5XAgOBELDQ' +
    'uH/////9HzsTaNqJQKJRIGJmaieNUzj8hJxRuTjttrnVNQqZzvf+83vAmhoedYwDZTHizAYOio4jlQs7kWD6M4gR02Jw0wBdFLOP' +
    'u1+1GJyPvPUgdaReRAxN9AG86RhjCA491lyMkpIxzeeG+6w5XAgOBELDQuH/////9HzsTaCJFFIEgAEkDCyj9GGZRcTmVTcpj+gw' +
    '/P72ghndrfvpFTVNcajMQIi3KMV06SUuSujdjVKiJzOsKo4oz1EHGeanhwYMGM9QxHDuCfFxLyeSfdHXdkhwtOrbz/nEnlVs0KwB' +
    'FBb/////PIYiK0G1I///////////////////////////////////////////////////////////////////////////////////' +
    '///////////////////////////////////////////////////iRRSBIABJAwso/RhmUXE5lU3KY/oMPz+9oIZ3a376RU1TXGoz' +
    'ECItyjFdOklLkro3Y1SoiczrCqOKM9RBxnmp4cGDBjPUMRw7gnxcS8nkn3R13ZIcLTq28/5xJ5VbNCsARQW/////zyGIitBtSImU' +
    'kiSSSUgMXQXIKprWyXWXCxhuqcWhKkeU46eRXPhpprPU9Qongtwrhf8ahKZxOJuJGL9zM8ygcwhYkB/G4/j/+7RAwAAGki/Oaex6' +
    '1G3F+c09j1qNvMk5p5nrUbeZJzTzPWoacKMahVTYhy0ntPVqLWtG7DfXGPeV5JOtvlK6eZg2xI87/////NKbW9zAIboVEykkSSSS' +
    'kBi6C5BVNa2S6y4WMN1Ti0JUjynHTyK58NNNZ6nqFE8FuFcL/jUJTOJxNxIxfuZnmUDmELEgP43H8DThRjUKqbEOWk9p6tRa1o3Y' +
    'b64x7yvJJ1t8pXTzMG2JHnf////5pTa3uYBDdCjaWZSACUBkUN4sCmLJGuaJdNbJd05WxqmfTGYsOE8eMDiubJ4rE4I/hqnci+n5' +
    'utqtu2IrzkP5HmmWiCJGkXBkiwaWhK1cp5yQhWtLxdpa9I0KLiE8zDtq7PGjz49MXlBc07////+Xc5aHiqVLaLGP////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '////////////////////2lmUgAlAZFDeLApiyRrmiXTWyXdOVsapn0xmLDhPHjA4rmyeKxOCP4ap3Ivp+brarbtiK85D+R5plogi' +
    'RpFwZIsGloStXKeckIVrS8XaWvSNCi4hPMw7auzxo8+PTF5QXNO/////l3OWh4qlS2ixirlWSSUkBuSg1xumU4Kw/W2EgIlJ3o5n' +
    'sXWYffcAuVG0d0pQZHsgTGIWVjgYlWu0BiYEuTEmBpm8TuYOosT/+7RAwAAGmDFN0e961G+GKbo971qNlL85R7HrUbKX5yj2PWra' +
    'vt25/1Y/P8pUo6PND3FiWKxXCMplJlTOV6RZ9OEkd7pyC5mdZ/////4rcs4vAdXKskkpIDclBrjdMpwVh+tsJARKTvRzPYusw++4' +
    'BcqNo7pSgyPZAmMQsrHAxKtdoDEwJcmJMDTN4ncwdRYm1fbtz/qx+f5SpR0eaHuLEsViuEZTKTKmcr0iz6cJI73TkFzM6z/////x' +
    'W5ZxeAzZSBASSiBTvLcJvRiQKtUCy3OMcrB95f1Rhh7DtBEIGptuC7ANBU8LRdgkIHI3Gn7Gcpbm4L+wu2utoCQDC1LoQ1+VSfOW' +
    '3O0cqbvEYtHt8nqX7NqVTczSU2Fqm+nlmVTO3UBYiR/////4eX36f///////////////////////////////////////////////' +
    '///////////////////////////////////////////////////////////////////////////////////////2UgQEkogU7y3C' +
    'b0YkCrVAstzjHKwfeX9UYYew7QRCBqbbguwDQVPC0XYJCByNxp+xnKW5uC/sLtrraAkAwtS6ENflUnzltztHKm7xGLR7fJ6l+zal' +
    'U3M0lNhapvp5ZlUzt1AWIkf////+Hl9+nXqVSSUkNlKLoJq7dxifztakb4y2CD/3pz1hwWC0pD4kl8TmyGwRQaxSlVVKonKdqVfX' +
    'wsTOU5GXjaTMtzYZQRj/+7RAwAAGki9M0enC1G1F6Zo9OFqNxKU5R7MLUbiUpyj2YWqapu8z5Q33XrU8opbdHGtcsW6TG/mdPBYB' +
    'hJZu3///eEkrVNgZTXFt9w3AmcDevUqkkpIbKUXQTV27jE/na1I3xlsEH/vTnrDgsFpSHxJL4nNkNgig1ilKqqVROU7Uq+vhYmcp' +
    'yMvG0mZbmwygjE1Td5nyhvuvWp5RS26ONa5Yt0mN/M6eCwDCSzdv//+8JJWqbAymuLb7huBM4GzEtlpEkkpMfkxLECNSXsm0LeqZ' +
    'yourCSbc2SIgPBhHgoOmQ4iaGRADIgWEKU6EH5NNG23LOWV0r1CdsQ50NIYu4sBbvfW5HNbZIc0dyiwb7tFpqFUmETQDc8CBx3//' +
    '6ZRKUlxRwcSfFZCGkvayZMvjP///////////////////////////////////////////////////////////////////////////' +
    '////////////////////////////////////////////////////8S2WkSSSkx+TEsQI1JeybQt6pnKi6sJJtzZIiA8GEeCg6ZDi' +
    'JoZEAMiBYQpToQfk00bbcs5ZXSvUJ2xDnQ0hi7iwFu99bkc1tkhzR3KLBvu0WmoVSYRNANzwIHHf//plEpSXFHBxJ8VkIaS9rJky' +
    '+M7+lUkpIDcoBzFhQKSJb1DdXMUr0TdOjozJKCkpwEQkhSI1IrE86HI/SJ4KkWAIgy4OLzzZlbmuMdh1DvCWsQP/+7RAwAAGginP' +
    'ael61HBFOe09L1qNuKU7R7HrUbcUp2j2PWpBXNhytssfL9dp+MxyN9YEKs/nix5ASHCQwxH///9JdHZQXhc6aFWDQm8kKJSB+/pV' +
    'JKSA3KAcxYUCkiW9Q3VzFK9E3To6MySgpKcBEJIUiNSKxPOhyP0ieCpFgCIMuDi882ZW5rjHYdQ7wlrEDQVzYcrbLHy/XafjMcjf' +
    'WBCrP54seQEhwkMMR////SXR2UF4XOmhVg0JvJCiUgeaVAASSQLTCSxJybEmL4plMuHGDAo83jN77xBVw4lLBe0hJFmZW5XK5kYD' +
    'NHqAmjjL8/bJTkUbIfrtPoZDTAM8phxsTs5HssO8FtUKO7xbiQ23Osv2WMMFxE4UN////FW2HsXvm6l9S3LSQ///////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '//////////////////////////5pUABJJAtMJLEnJsSYvimUy4cYMCjzeM3vvEFXDiUsF7SEkWZlblcrmRgM0eoCaOMvz9slORRs' +
    'h+u0+hkNMAzymHGxOzkeyw7wW1Qo7vFuJDbc6y/ZYwwXEThQ3///8VbYexe+bqX1LctJDWXVSSSkNjfMAbicQDejkk4xsPJn9I/c' +
    'PLFO5FivocaD3CeT0aNqJCQ880PCWl9LEVzvOXJQNqwdqwqTmcgwCuT/+7RAwAAGpihM0e961GrFCZo971qNxLE1R73rUbiWJqj3' +
    'vWpBj+HrEkmMXal9azfcLdP5s4z7+1o4GLNBdP///IVS7DLqRcRiqthxgsPaKtC2suqkklIbG+YA3E4gG9HJJxjYeTP6R+4eWKdy' +
    'LFfQ40HuE8no0bUSEh55oeEtL6WIrnecuSgbVg7VhUnM5BgFciDH8PWJJMYu1L61m+4W6fzZxn39rRwMWaC6f//+Qql2GXUi4jFV' +
    'bDjBYe0VaFiCRAAQCkLSNmykS81iHopFK8hvWbLhi9o9fYn43CTTt0SMs0vIxLpdkMCGhCQAgvySRrlh7pkncU4ymae6+OyNvEa3' +
    '+oVo8NPrp5ps3H38xM4gZ1elb6tNsq883//+4quE3XypjKk6iqS1C12q////////////////////////////////////////////' +
    '//////////////////////////////////////////////////////////////////////////////////////////////gkQAEA' +
    'pC0jZspEvNYh6KRSvIb1my4YvaPX2J+Nwk07dEjLNLyMS6XZDAhoQkAIL8kka5Ye6ZJ3FOMpmnuvjsjbxGt/qFaPDT66eabNx9/M' +
    'TOIGdXpW+rTbKvPN///uKrhN18qYypOoqktQtdqkpYABJKYtYSflGSQcR+pxFK9XYdstZ/NWF3U4qS8Hau1fFs5a9e1rh+IPT3QE' +
    'CqIBpaPfey1psON2lDuxRWT/+7RAwAAGpC5L0e961G0FyXo971qNqKkvR78LUbUVJej34Wpa0M01B38f/DOZ+Uzt/HDLD8vwxqXL' +
    'mQnEoifKBT///IDaKVxYW8qtqCL1BIAtpSlgAEkpi1hJ+UZJBxH6nEUr1dh2y1n81YXdTipLwdq7V8Wzlr17WuH4g9PdAQKogGlo' +
    '997LWmw43aUO7FFZFrQzTUHfx/8M5n5TO38cMsPy/DGpcuZCcSiJ8oFP//8gNopXFhbyq2oIvUEgC2mEVUSSSQN4BMzJCMos0G9D' +
    'XBmQ6d/eFvTBWNAehXArBmOlg7GNYZH0Gr16L0vwtoAZlRB4LcaG4pWIhsVdJ1PMwtpStKoXXzXyT6s8npiFma+c+TTdGjEhxaXJ' +
    'u///62setFW8+B14uSa0gbxqP///////////////////////////////////////////////////////////////////////////' +
    '//////////////////////////////////////////////////////////////4RVRJJJA3gEzMkIyizQb0NcGZDp394W9MFY0B6' +
    'FcCsGY6WDsY1hkfQavXovS/C2gBmVEHgtxobilYiGxV0nU8zC2lK0qhdfNfJPqzyemIWZr5z5NN0aMSHFpcm7///rax60Vbz4HXi' +
    '5JrSBvGot+SUk7a1k5F2VpjsiFJpUzKdUwNOMfVo0dEIoFQFa0nBHly93jEJTRnJILYkQCcQOG5QceTU2a4Yj2PUmir/+7RAwAAG' +
    'pipK0e962G1FSVo971sNoJ0s573pUbQTpZz3vSrWYMHFM11u0GH7ahfxsGoUUUDPAzP9QCOrDlqzpxl4mF2DWEElTSLiIbcpb8zN' +
    'FLfklJO2tZORdlaY7IhSaVMynVMDTjH1aNHRCKBUBWtJwR5cvd4xCU0ZySC2JEAnEDhuUHHk1NmuGI9j1Joq1mDBxTNdbtBh+2oX' +
    '8bBqFFFAzwMz/UAjqw5as6cZeJhdg1hBJU0i4iG3KW/MzRSZ73m3G592McoykqSiEhaoesbDOrPeY93+KRcAmKD8oL+e9anz9WPW' +
    'ZEAxyIH0n9zz3esqtriE5PYri9tiC22tmJ9wbNeLy0rukW40DmTYhB80o2H1NT904UOvXfEDNuwsdY+pdqT17U2Ea///////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '///////////////////////////////////////////////5nvebcbn3YxyjKSpKISFqh6xsM6s95j3f4pFwCYoPygv571qfP1Y9' +
    'ZkQDHIgfSf3PPd6yq2uITk9iuL22ILba2Yn3Bs14vLSu6RbjQOZNiEHzSjYfU1P3ThQ69d8QM27Cx1j6l2pPXtTYRr11q9NttW4w' +
    'x0kLC1mUzIUyKmkBYivWWHHYMVU5OT5CtVrx7XLfnMl5Xl6pEYe0Lqul3WL/+7RAwAAHDChLUex62GsFCWo9j1sM+KkpR72LYZ8V' +
    'JSj3sWw47L6uOWes5XqX+Ca5DAdPS7PLfYVtr/Vg0KrARE9WSb/FFhZXzjyKN0whZwxvUvtWfW16NdavTbbVuMMdJCwtZlMyFMip' +
    'pAWIr1lhx2DFVOTk+QrVa8e1y35zJeV5eqRGHtC6rpd1iOOy+rjlnrOV6l/gmuQwHT0uzy32Fba/1YNCqwERPVkm/xRYWV848ijd' +
    'MIWcMb1L7Vn1teikpEpNqNtoTDdL4EJCNNbEqSaNysioQO8T11g/vIZBAiUSS+YXZPDnrq+YaNTFeuM0AJR8QmaO2ev2a691JrMF' +
    'MbWO+vTs0j92Cp65EgPq9ZXnrNDIuNEhA/Z//9CR8V7E7jLK1wUe8XvV////////////////////////////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '//////////////SUiUm1G20Jhul8CEhGmtiVJNG5WRUIHeJ66wf3kMggRKJJfMLsnhz11fMNGpivXGaAEo+ITNHbPX7Nde6k1mCm' +
    'NrHfXp2aR+7BU9ciQH1esrz1mhkXGiQgfs//+hI+K9idxlla4KPeL3qVVq9NttS5IECLmK6QdRKNV0RMNVD8qNESNa4e0Fl17iEw' +
    'vo1/uYxhqJIKImsROpNTSpbulab/+7RAwAAHAy1J6exi2GnlqT09jFsNHMMnR7DLYaOYZOj2GWxUycwtAB6a5EjKaZgug5HkD0Rc' +
    'WYUUg+tUOjpl//NEUxWY0EYdUsuykcHkdaIuLNIPWQQqrV6bbalyQIEXMV0g6iUaroiYaqH5UaIka1w9oLLr3EJhfRr/cxjDUSQU' +
    'RNYidSamlS3dK0ypk5haAD01yJGU0zBdByPIHoi4swopB9aodHTL/+aIpisxoIw6pZdlI4PI60RcWaQesgiogpNtuSOPXEaN0ZSQ' +
    'PJL0PFKQkerhswNm4rzRkY9Up0/id9GGJLrDAuzh6Sk5NM2jxUwXLojEimokQk5WEz1Zo0qnkHLZIGoIDSC6hsBg8aQ7+6QKkizl' +
    'pP1FEiqkPt0udtVRSp8p////////////////////////////////////////////////////////////////////////////////' +
    '/////////////////////////////////////////////////////////////////////////////////////////////////1EF' +
    'JttyRx64jRujKSB5Jeh4pSEj1cNmBs3FeaMjHqlOn8TvowxJdYYF2cPSUnJpm0eKmC5dEYkU1EiEnKwmerNGlU8g5bJA1BAaQXUN' +
    'gMHjSHf3SBUkWctJ+ookVUh9ulztqqKVPlIaavTbbVmeBYoiIla9kNSOINQd2mjwmMoqRdxKuMUsRsEaJZ/TUizJijcmupH/+7RA' +
    'wAAHXy7Kaeky2Gbl2U09JlsMkLknTCUrYZIXJOmEpWxpCggxpiDD+owzKc9YJUKi7iYSGMTRmW4wXQJpl3bNGgfjc1Sf/Iy99Pax' +
    '3a8CgO1lrTwiUKjKYaavTbbVmeBYoiIla9kNSOINQd2mjwmMoqRdxKuMUsRsEaJZ/TUizJijcmupFpCggxpiDD+owzKc9YJUKi7i' +
    'YSGMTRmW4wXQJpl3bNGgfjc1Sf/Iy99Pax3a8CgO1lrTwiUKjKRFa723G1bnY+A33JtISq0jHVrJEHFQuGBqS0h4fmbrb7xi1ZyJ' +
    'TRhhYi6/XSkgmkYnREpPF2l4InbNPXtxk1sWVU7vFhiJpqXi9+o0naoTAM5/8UFelHdddaBX3PckelzAuJ+XT///////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '////////////////////////////////////////////////////orXe242rc7HwG+5NpCVWkY6tZIg4qFwwNSWkPD8zdbfeMWrO' +
    'RKaMMLEXX66UkE0jE6IlJ4u0vBE7Zp69uMmtiyqnd4sMRNNS8Xv1Gk7VCYBnP/igr0o7rrrQK+57kj0uYFxPy6YSSknI3JG7fAqm' +
    'SH48qOxbB05PMssmxObjKA4ZRKzIwZFSixpy0YFKO/UM36kwzbSUthJ8kmmc1Cr/+7RAwAAHES3KUexK2GSluUo9iVsNULMprCUr' +
    'YaoWZTWEpWx6tREcRroxhGI5PKHXxJjfgyopSbdhpYBNkyC/1oSVW1NGoYyFUP/aVHyZ5xsUvFTiISSknI3JG7fAqmSH48qOxbB0' +
    '5PMssmxObjKA4ZRKzIwZFSixpy0YFKO/UM36kwzbSUthJ8kmmc1Cp6tREcRroxhGI5PKHXxJjfgyopSbdhpYBNkyC/1oSVW1NGoY' +
    'yFUP/aVHyZ5xsUvFTiDRRq0221LiiHwAUizmVRwORySBDNggsbd9ZWiyKK3tuwqIWu1iC75Yi0DIIEtSVBy7b6W0oJUdbGrOscQd' +
    'aCwALDojLJzoZqbTprVh8Tod+rehE52OEFFsK31Hnm2INazCnMin////////////////////////////////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '///////////////////////////////////////////////////oo1abbalxRD4AKRZzKo4HI5JAhmwQWNu+srRZFFb23YVELXax' +
    'Bd8sRaBkECWpKg5dt9LaUEqOtjVnWOIOtBYAFh0Rlk50M1Np01qw+J0O/VvQic7HCCi2Fb6jzzbEGtZhTmRSECa0k0jJSYFqSBTH' +
    'KUyYmYDmGa0oxATFbsRWgNqzgeM4xCb/+7RAwAAHyS9J0ewy2GOl6To9hlsL8L0lR6TLYX4XpKj0mWxdg0vSJo1oMF4oc6AiGS87' +
    'JpJJ9EBWmEtjyhJ9I0dMYOKOpdWYU0Wdoopf8rRuFOXl8c2tDvU5Z29eNbohAmtJNIyUmBakgUxylMmJmA5hmtKMQExW7EVoDas4' +
    'HjOMQmXYNL0iaNaDBeKHOgIhkvOyaSSfRAVphLY8oSfSNHTGDijqXVmFNFnaKKX/K0bhTl5fHNrQ71OWdvXjW6BkElNyNySPXPg+' +
    'I4pERrmEUdq4ypsMaXD5Phw0iN4iJZW0tFmJNraNOG6o0YhqfUUUaZktD0gV7q1nxiigYXmvrap1AjRkaeIDIvZo/TBjsTBdzg57' +
    'dCQaFmZdp6naWU59dxpK/K01Kin/////////////////////////////////////////////////////////////////////////' +
    '///////////////////////////////////////////////////////////////////////////+yCSm5G5JHrnwfEcUiI1zCKO1' +
    'cZU2GNLh8nw4aRG8REsraWizEm1tGnDdUaMQ1PqKKNMyWh6QK91az4xRQMLzX1tU6gRoyNPEBkXs0fpgx2Jgu5wc9uhINCzMu09T' +
    'tLKc+u40lflaalRQkoltyNuNvXW2KMWDiwS5ztQLGHCd6uvpoDFoEDXIC5JJKbN0tTYDiAUHxAqnNEulJTJtFprolGpLI46jQRf/' +
    '+7RAwAAGxy7KawlK2Gjl2U1hKVsNoLsprCUrYbQXZTWEpWxFNim6SItjhhebSrNtrpPWufzXmAIKV/jC5kg5wxZFAqeYTUXsTeul' +
    'guxVis3aSJKJbcjbjb11tijFg4sEuc7UCxhwnerr6aAxaBA1yAuSSSmzdLU2A4gFB8QKpzRLpSUybRaa6JRqSyOOo0EXRTYpukiL' +
    'Y4YXm0qzba6T1rn815gCClf4wuZIOcMWRQKnmE1F7E3rpYLsVYrN2kjVqr6qmuSshGXzUDPNnBb+NOHlxcg02ehK+fZJzAihSbCN' +
    'ci5COsFzBae6hc0wUWgpKS9986l9hVonYjETyKZxNGq02WnJMlfN7lZNHU0a6eToS/opbS9xS8Ud+w7ep64Y7FFdqP//////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '//////////////////////////////////////////////////////////////////1aq+qprkrIRl81AzzZwW/jTh5cXINNnoSv' +
    'n2ScwIoUmwjXIuQjrBcwWnuoXNMFFoKSkvffOpfYVaJ2IxE8imcTRqtNlpyTJXze5WTR1NGunk6Ev6KW0vcUvFHfsO3qeuGOxRXa' +
    'hOW723G1rlyLGcgvSdp9hO05mQX0JBA+0T1J6M4Joqzo4zLGWW1p6nXr2cafLV4Qxx//+7RAwAAHTDBMSwlK3GUGCYlhKVuM1LMp' +
    'R6UrYZqWZSj0pWxBTbSyAkJI0zF4lTFE6bPNem/iiJJ5hiNOBAPk3ijXfn6HJk0nh+OpbGihVmi4WKkDzt6kyKct3tuNrXLkWM5B' +
    'ek7T7CdpzMgvoSCB9onqT0ZwTRVnRxmWMstrT1OvXs40+Wrwhjj6Cm2lkBISRpmLxKmKJ02ea9N/FESTzDEacCAfJvFGu/P0OTJp' +
    'PD8dS2NFCrNFwsVIHnb1JkSIlFEptttoDQxDCHkJPgfjUh6eb1fFnMtfUxjF205EMqDw8WwWFARCeoCHHQDMAEKYKrMqga1OyQgZ' +
    'N0EEFIWl22vtPghvgoAXFNM8sIA6gwUQ4IDEKHKQRvZssI4kGs7pn/yiEpWHf5xIDfudgd/L1SxK4vYaxFWJx6MRihl0CRj91wIA' +
    '4WAf////5baVR1f///xEoolNtttAaGIYQ8hJ8D8akPTzer4s5lr6mMYu2nIhlQeHi2CwoCIT1AQ46AZgAhTBVZlUDWp2SEDJuggg' +
    'pC0u219p8EN8FAC4ppnlhAHUGCiHBAYhQ5SCN7NlhHEg1ndM/+UQlKw7/OJAb9zsDv5eqWJXF7DWIqxOPRiMUMugSMfuuBAHCwD/' +
    '////LbSqOrMAEAAAAEgDoaENRQuEUC+rjo/Z/MzO3kDjCssEyOhDPVpwbNjElEoFU+Tk4mlQs+99sblaaB1ISyl2Ogp1ISS5prba' +
    '5F8R5fzKBSCkA+ALBhjjICLXEU7O/YE4MAL/+7RAwAAElS9OafnK1I+l6c0/OVqPmMdHp7HrUfMY6PT2PWpsI4JgSglh7oWT8AVm' +
    'quDoVkWPAeaCI9/////79XbozABAAAABIA6GhDUULhFAvq46P2fzMzt5A4wrLBMjoQz1acGzYxJRKBVPk5OJpULPvfbG5WmgdSEs' +
    'pdjoKdSEkuaa22uRfEeX8ygUgpAPgCwYY4yAi1xFOzv2BODACbCOCYEoJYe6Fk/AFZqrg6FZFjwHmgiPf////+/V26DQAEEAAAAA' +
    'Do8OZHm0kzaEejzSNN5mZuuiLoCAyPWYU6GIpmoMDaNOgPHQ8E8UxpRp8QYcB841Mg/z8LCTAGOQtAQj9V7Yq1EnidHAMoWMRhD1' +
    'AzJxVK1/MdQ6hxEiOMOLIcqEsB0nUaLA0tqliPswY2cPo//////fV/Ff////////////////////////////////0ABBAAAAAA6P' +
    'DmR5tJM2hHo80jTeZmbroi6AgMj1mFOhiKZqDA2jToDx0PBPFMaUafEGHAfONTIP8/CwkwBjkLQEI/Ve2KtRJ4nRwDKFjEYQ9QMy' +
    'cVStfzHUOocRIjjDiyHKhLAdJ1GiwNLapYj7MGNnD6P/////31fxX4AAAAA8Ed4galYyCFyVLLCct//6sWryqzYyg1m7LYPVTirK' +
    'lC4ei9FBEhlz73UAyRTC2ZYbl0flEFyziWz1K3mAIgKMADDlpmbx2grRCcgd3mavE0JNFcLLou8bky2XV5JadllNFSziuYoy5ynv' +
    'noz/+7RAwAAEoDTSaex61HuGmk09j1qQyMdA5+MLUhkY6Bz8YWrLalrG/lTDDRp/////3vBQPaVIabcn4AAAAA8Ed4galYyCFyVL' +
    'LCct//6sWryqzYyg1m7LYPVTirKlC4ei9FBEhlz73UAyRTC2ZYbl0flEFyziWz1K3mAIgKMADDlpmbx2grRCcgd3mavE0JNFcLLo' +
    'u8bky2XV5JadllNFSziuYoy5ynvnozLalrG/lTDDRp/////3vBQPaVIabclZalSkkmB+LBsgQFg149FmMtfvfD+VO/kPgghXPmAe' +
    'SsZEWQsq1GeiuP+PI8zKmi3jdSFTliq+Cp1OxssazmV4IoXhOD0c7Njc4OSoZYKBUiqUygL6rGZVN2NtjnPGmXMGMrt/e9Rt+E+u' +
    'E3J/////7P4fMf////////////////////////////////////////////////////////////////////////////////6y1KlJ' +
    'JMD8WDZAgLBrx6LMZa/e+H8qd/IfBBCufMA8lYyIshZVqM9Fcf8eR5mVNFvG6kKnLFV8FTqdjZY1nMrwRQvCcHo52bG5wclQywUC' +
    'pFUplAX1WMyqbsbbHOeNMuYMZXb+96jb8J9cJuT/////2fw+YAa1VVUDyXiPMAgk7VCqmdHSABIKB41IZdZqxCIQ+yB5y0JlQWUX' +
    'qyRNxOsEGk0A0leRS6K1ob8wIMHysZ8OZ5l9O8VDENRgHCdopzYr50IV6rYHqHp064TihI7/+7RAwAAFhzFTUy961HPmKmpl71qP' +
    'dLlPLOHrce6XKeWcPW7h2Qi8KF9JWSNBipfcFbpJDcpIY4HA4Kirv//////gIYA1qqqoHkvEeYBBJ2qFVM6OkACQUDxqQy6zViEQ' +
    'h9kDzloTKgsovVkibidYINJoBpK8il0VrQ35gQYPlYz4czzL6d4qGIajAOE7RTmxXzoQr1WwPUPTp1wnFCR3DshF4UL6SskaDFS+' +
    '4K3SSG5SQxwOBwVFXf//////AQwEbgSikiK9s8XTLj+Y0qi1xMEnmbtEmKtu7G5A+k3JEBqQksnYHXQmYEFchiDTV3diEgtwpuaq' +
    'dqDaebk/V+YyON5P5CJMHXBUFZAQB7gXoAZCiKAHAURwBq0QXGPG2LMJsgQskXKPg3IeaEwPRDBuFwzIqgmkkWUVn1rbpsr/////' +
    '/39//9O3///mP//////////////////+CNwJRSRFe2eLplx/MaVRa4mCTzN2iTFW3djcgfSbkiA1ISWTsDroTMCCuQxBpq7uxCQW' +
    '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' +
    'VbAZmhSPEKP0YRoo4ka5URdShCvCmAqF0PErixkoKQOUcan/+7RAs4AEuzNWae/C3Hzmas09+FuO7NFVR7HrUd2aKqj2PWrbMOxh' +
    'Rw7y3Go7RJxm++UCulUU1nyVV8dD48eBQLI//////5VUgEgkkkoD1GkHQuQGFeIMeVs71MNa5RK7JWn5Wuio5W3o4zrbmxuEJDWa' +
    'FBeK1IrKtgMzQpHiFH6MI0UcSNcqIupQhXhTAVC6HiVxYyUFIHKONTtmHYwo4d5bjUdok4zffKBXSqKaz5Kq+Oh8ePAoFkf/////' +
    '8qqAPAAAACB5lW9msgEYsrkKyvQz3jF+fYYMRyeVTbLbWTFm3KJPRY48xt1+VJND2TOHTWjDrZ3BlkdiEffVRd3iEAs5gFYGoFAL' +
    'ndBfc3A8YxgFmTirAtNWgiq7jaK2JzxPGIwc7l9t3VjcWt1Pwpa2jn//////LC3/////////////////////////////////////' +
    '//////////////////////////////AHgAAABA8yrezWQCMWVyFZXoZ7xi/PsMGI5PKptltrJizblEnosceY26/Kkmh7JnDprRh1' +
    's7gyyOxCPvqou7xCAWcwCsDUCgFzugvubgeMYwCzJxVgWmrQRVdxtFbE54njEYOdy+27qxuLW6n4UtbRz//////lhZkAiIkkkEkD' +
    'tpEDHfAbaphykm/si1Z8NXF3Tagk223ve60DNelnYzN1u9sxDL30f5xX2VvZUv+TSFVGXvM12IvhAcChhgEZ0gMA0KbEWzb1AxrC' +
    'x4jJHcLUJVJxPw//+7RAwAAFUzVT0wbC1Hfmqnpg2FqPnNFRp6cLUfOaKjT04WrlCTFT1ZyqVQCKNIUDmJfI5qnxfaW7iWgVf///' +
    '///0MgEREkkgkgdtIgY74DbVMOUk39kWrPhq4u6bUEm22973WgZr0s7GZut3tmIZe+j/OK+yt7Kl/yaQqoy95muxF8IDgUMMAjOk' +
    'BgGhTYi2beoGNYWPEZI7hahKpOJ+H8oSYqerOVSqARRpCgcxL5HNU+L7S3cS0Cr//////+iIACEAAgAADuk6CwjchkkiiWVa9/0O' +
    '8bYpPGlzHvjF9x6V/kivYcZvZltyf3dtjErFUiC4k7HOCCC4wHAZYOMDHg/cQRKoyghQGwgXiIwEHDvFpBsFl4T4HpBZsZIck2IC' +
    'LePgFaGqROQYrC+QoMbYYvFpI9MaxHDsIoQ44XCio4tGn/////////////z8QAEIABAAAHdJ0FhG5DJJFEsq17/od42xSeNLmPfG' +
    'L7j0r/JFew4zezLbk/u7bGJWKpEFxJ2OcEEFxgOAywcYGPB+4giVRlBCgNhAvERgIOHeLSDYLLwnwPSCzYyQ5JsQEW8fAK0NUicg' +
    'xWF8hQY2wxeLSR6Y1iOHYRQhxwuFFRxaNP/////////////n6BtAAAAAHlGEWF2DDi2nX3rvIMSHRBw4fAhaqVAQwkGsAVFVd40u' +
    '8dZR/VBRvi/ywqlcEumLFEJUYxApcSmLUhQSwcwGlC8EHAga6x7xKAgSzhdSo1zv64kWRLgpkwiQ3VnTbl//+7RAwAAEbV5S6w+L' +
    'ZI2ryl1h8WyQKNVJR48LUgUaqSjx4Wom0a2tpnUuUJXXDsgkEHOrCJHdiH29f////9P5SgbQAAAAB5RhFhdgw4tp1967yDEh0QcO' +
    'HwIWqlQEMJBrAFRVXeNLvHWUf1QUb4v8sKpXBLpixRCVGMQKXEpi1IUEsHMBpQvBBwIGuse8SgIEs4XUqNc7+uJFkS4KZMIkN1Z0' +
    '25fJtGtraZ1LlCV1w7IJBBzqwiR3Yh9vX/////T+UMCsAAAAAHiialisIwm3kZEwnnertNbDR5Z6ml7DUEciB6MoTTfal6XVKLlS' +
    'V4TK51F021+qbBZ5FcACIgF9Fak1CVCtjSWBL4L1AcR0EvAtCzZOIMQirGVcQSwFNVnyHND4fIkGjUDwAYhbppgOa3eXl/H9cWPu' +
    '7LpiH4VqV3Qga/////UVen1rXgVgAAAAA8UTUsVhGE28jImE871dprYaPLPU0vYagjkQPRlCab7UvS6pRcqSvCZXOoum2v1TYLPI' +
    'rgAREAvorUmoSoVsaSwJfBeoDiOgl4FoWbJxBiEVYyriCWApqs+Q5ofD5Eg0ageADELdNMBzW7y8v4/rix93ZdMQ/CtSu6EDX///' +
    '/6ir0+ta6AEoQAAAAAOpgqjaqLdCrtfjONjz1OaiZQLHRv4k3SV9oVPdlEWtUtLrs1agt435bCZRppL9bE0BFNQJZqYLaKqI+MGG' +
    'SGYx+sBUkEgsckCytYi3B57kUz8pks0QrUtJuMReZTxpOGIQTNr/+7RAvwAETTRRUenC1Immiio9OFqQvNVHp5sLUheaqPTzYWos' +
    'RhhfcoC2R9WTyiD1dXbtezlOkv////+p3qVQAlCAAAAAB1MFUbVRboVdr8ZxseepzUTKBY6N/Em6SvtCp7soi1qlpddmrUFvG/LY' +
    'TKNNJfrYmgIpqBLNTBbRVRHxgwyQzGP1gKkgkFjkgWVrEW4PPcimflMlmiFalpNxiLzKeNJwxCCZtFiMML7lAWyPqyeUQerq7dr2' +
    'cp0l/////1O9SrRGCrcSK0WAU5VFe9LrMpmn+ziQFq+Jl5ILU+2VfOY9AoqzXHfRFZO2PVvDVEqnxbSSLsnYHVRAxEUYrI4FQngF' +
    '8vwORICYkuJ2hJPzlEuaTjAdktISSwlIJYJ1HA0A4wQgzRbC8n0XRhOgmxupxTsTdKrJgj//////////////////////////////' +
    '/////////////////////////////////////////////////////////////////////tEYKtxIrRYBTlUV70usymaf7OJAWr4m' +
    'XkgtT7ZV85j0CirNcd9EVk7Y9W8NUSqfFtJIuydgdVEDERRisjgVCeAXy/A5EgJiS4naEk/OUS5pOMB2S0hJLCUglgnUcDQDjBCD' +
    'NFsLyfRdGE6CbG6nFOxN0qsmCKZVB7UiKlWAqVI9MAtsdIT/xY4hI/sXb5e++yXd3f40S2LQodIzm1VVzBFLciC4BbORCh3AXifH' +
    '+LjQQ0giUMALgfwXAh7/+7RAvYAF/jTUceZ60nVGmo48z1pOINVTx5nrQcQaqnjzPWhDziBbkwPA/pGo0C9GEP4N4t5MwpVWDpDM' +
    'BAj+SZPV2rlCQusWMpmZrdT6plUHtSIqVYCpUj0wC2x0hP/FjiEj+xdvl777Jd3d/jRLYtCh0jObVVXMEUtyILgFs5EKHcBeJ8f4' +
    'uNBDSCJQwAuB/BcCHkPOIFuTA8D+kajQL0YQ/g3i3kzClVYOkMwECP5Jk9XauUJC6xYymZmt1PrphgzEISpVgFIMIdiMMoxkVP+/' +
    'hD7X+atBt+fzOs7zEZvm6tjHKrj+FaQxWNv+t1n7c26phr/ShQm6eKJxl/FaREFTdC1MqQzCwiKL0vTG8XJZc898ADTvbG0+lVSa' +
    '2oPTal8Jcqah/B1ovLL0ZlPGv///////////////////////////////////////////////////////////////////////////' +
    '////////////////////////////////////////////////////+mGDMQhKlWAUgwh2IwyjGRU/7+EPtf5q0G35/M6zvMRm+bq2' +
    'McquP4VpDFY2/63WftzbqmGv9KFCbp4onGX8VpEQVN0LUypDMLCIovS9Mbxcllzz3wANO9sbT6VVJrag9NqXwlypqH8HWi8svRmU' +
    '8ayIgIxiQWQUBdD5J2gSTK9JX/buHCh9hbkzlS6p/1lTEV7eFEz5Znkq0py5r6jOU4kyo0ILkhhbXqNWFaJqeZb/+7RAwAAGgjTU' +
    '8ebC0nBGmp482FpNtNNRx43rSbaaajjxvWmCxmCWA5ZTbT0J+4tKGATx+BJhng+wMg4AjQJ0JpFIUH+MBeXCMYT4Q55qA5zNZEQE' +
    'YxILIKAuh8k7QJJlekr/t3DhQ+wtyZypdU/6ypiK9vCiZ8szyVaU5c19RnKcSZUaEFyQwtr1GrCtE1PMtBYzBLAcsptp6E/cWlDA' +
    'J4/AkwzwfYGQcARoE6E0ikKD/GAvLhGMJ8Ic81Ac5mipttoEAAAADl3GkXkkhOcojb9mb9gFXYK8a+ubNMquIvYZUt3nd1e2qJ6X' +
    'abM5zD0GUbla2BQUgqwCGnlo0BRb4FSKHtIFhIJVYFBh4D2rOh6druC+rzCAbJ0Ul+JeXNvojW/63ncf1w4BZK1mUvrbmKlrEX//' +
    '///1su9f/////////////////////////////////////////////////////////////////U220CAAAABy7jSLySQnOURt+zN+' +
    'wCrsFeNfXNmmVXEXsMqW7zu6vbVE9LtNmc5h6DKNytbAoKQVYBDTy0aAot8CpFD2kCwkEqsCgw8B7VnQ9O13BfV5hANk6KS/EvLm' +
    '30Rrf9bzuP64cAslazKX1tzFS1iL/////62XeuqNJskkgAEDoEfQq0NE2UahY3d1qzC7iSNN27aYXRGWY3NJajNz6FpmZoWrRTtR' +
    'BOkGjcH6UqoVZtq4YrJAXAhQ8hZQkJ0BhC1HwdCeVmWTnqjThH0c8M7/+7RAwAAFZTTRaePC1Hummi08eFqPPNE/p5nrUeeaJ/Tz' +
    'PWqAYRelapTdMaGcrAgkJUx3INPLt7C2Cp3////7kKreMKKMVRpNkkkAAgdAj6FWhomyjULG7utWYXcSRpu3bTC6IyzG5pLUZufQ' +
    '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' +
    'bJfQxjtUhjoy8Ger/TFOZZcXoVzVozkcqorc8ZcNRhFEXdxUy9tDUa4uCmzGWokZT/WIz/////0vdio8lFRsJ///////////////' +
    '////////////////////////////8yqKkAEoDMY8i5HAd5uLWl5nOrM9pIp3vQGBTCFFyiPWd8zMOka5WbItasSYPVO1EPNVSEjC' +
    'NMxinQLEQs2S+hjHapDHRl4M9X+mKcyy4vQrmrRnI5VRW54y4ajCKIu7ipl7aGo1xcFNmMtRIyn+sRn/////pe7FR5KKjYT65QEg' +
    'EpAYSFHjEFhTKLQtnXlaeOGiG1SpEt7IScnpoMT6WZJ0yrmlsjvIx+HSdzmEAEVLDDiJ6CTEpVMewWlSLJMlWqTpHU4MKzChwrqi' +
    'y6QvSHnCZiWT0GHCZHxJhgpRMmReZYH/+7RAwAAE6zPN0e961Hzmebo971qQHNE1R73rUgOaJqj3vWpLTjt4xmNiej5kx58TGv//' +
    '//1FRYXJGGMdSkj1ygJAJSAwkKPGILCmUWhbOvK08cNENqlSJb2Qk5PTQYn0syTplXNLZHeRj8Ok7nMIAIqWGHET0EmJSqY9gtKk' +
    'WSZKtUnSOpwYVmFDhXVFl0hekPOEzEsnoMOEyPiTDBSiZMi8ywKWnHbxjMbE9HzJjz4mNf////qKiwuSMMY6lJGVBBSASkBFYPkl' +
    'R4DtFgWTmTh/k2kjM/NYjBGXu+2r/rVvN9M3IdW/D65XJy5G3nZIXh8ojCCDSTHUHShx+wDmHYdo4CAkyPU0AbRukJbFWwOB4vyB' +
    'NZxdDD9QprakJlZ14ilEPE9SrJKZypRo0TNNRCUBMP1KXhqZipquIV/////8KUC9xY+yV/////////////////////5UEFIBKQEV' +
    'g+SVHgO0WBZOZOH+TaSMz81iMEZe77av+tW830zch1b8PrlcnLkbedkheHyiMIINJMdQdKHH7AOYdh2jgICTI9TQBtG6QlsVbA4H' +
    'i/IE1nF0MP1CmtqQmVnXiKUQ8T1KskpnKlGjRM01EJQEw/UpeGpmKmq4hX/////wpQL3Fj7JVASWiAQSBoQVhbC/l5UrWnVldu9s' +
    'j+I4QU8RgE8V6HQt5u1YQxytFnuduodoBuunEf8JNwzOV6cUZ4qBYHpLCdLJIyZThbyYmSbiOZCyWBbiRmMki6r9mZWsEBnUp+L/' +
    '+7RAwAAExjTKUfh61IjGmUo/D1qPqM8pR73rYfUZ5Sj3vWyInzFlVKpDy5oUpE7Mq1e0ruzPCiiL////9r01q84tASWiAQSBoQVh' +
    'bC/l5UrWnVldu9sj+I4QU8RgE8V6HQt5u1YQxytFnuduodoBuunEf8JNwzOV6cUZ4qBYHpLCdLJIyZThbyYmSbiOZCyWBbiRmMki' +
    '6r9mZWsEBnUp+KInzFlVKpDy5oUpE7Mq1e0ruzPCiiL////9r01q84tmWu0SSSB28kwmhzGOmku9VTqAzRo7IqZ3w/DuDKV089nS' +
    'GLDC4vWXbt6usqxiZXRpqAjKSN5Ok6Mg9AhxQkGIwhMTT1X3NG0cnYXoEqFrB8NIkBbTiR5+F7eJ4v21pgZWw/IT5vJw/Tp0J9cP' +
    'HbktbvHw4mg5////9RAGwnIg2WHm2r////////////////////////////////////////////////////////ZlrtEkkgdvJMJo' +
    'cxjppLvVU6gM0aOyKmd8Pw7gyldPPZ0hiwwuL1l27errKsYmV0aagIykjeTpOjIPQIcUJBiMITE09V9zRtHJ2F6BKhawfDSJAW04' +
    'kefhe3ieL9taYGVsPyE+bycP06dCfXDx25LW7x8OJoOf////UQBsJyINlh5tq6Smok2kUUhubodQYTQc54rK8r521uMrzVBkDQlQ' +
    'giZaUOH0lF5VVGKIKsDtK7Z00m4SYL05MLMmj0RJc35+pxzHim4bI8gJFLmmswT+jKH/+7RAwAAFbDNK0e962IOGaVo971sOrM8v' +
    'p6XrYdWZ5fT0vWx89rRnad1ZHqkePYanen1WI+fw9SK6E9tXE5r///S/Yi8xL/I78bSU1Em0iikNzdDqDCaDnPFZXlfO2txleaoM' +
    'gaEqEETLShw+kovKqoxRBVgdpXbOmk3CTBenJhZk0eiJLm/P1OOY8U3DZHkBIpc01mCf0ZQvntaM7TurI9Ujx7DU70+qxHz+HqRX' +
    'Qntq4nNf//6X7EXmJf5HfjREEluSNNJob1F3EwEqg4heENTvmdw1a1qqtBbXyeiMD9yur2VmZ3r9tg5iZgLz5DmlvQgYBeAQiSVQ' +
    'f7SrTdZJFPdOHmSyK7o4m2CsNAcbIEbLVZkORZjtLarGJSPKQ11tctzC3SyIQ3KGPiHh6HxV3//1KfdQ+Iij2JLIcR53X///////' +
    '////////////////////////////////////////////////////////ogktyRppNDeou4mAlUHELwhqd8zuGrWtVVoLa+T0Rgfu' +
    'V1eyszO9ftsHMTMBefIc0t6EDALwCESSqD/aVabrJIp7pw8yWRXdHE2wVhoDjZAjZarMhyLMdpbVYxKR5SGutrluYW6WRCG5Qx8Q' +
    '8PQ+Ku//+pT7qHxEUexJZDiPO69R6vSKKI3XQ4GEBViFArUUnzoetw0iVLonoGdLlEYlUYZkhtGyenLEfJ/PV+Ku2oYZiNln8ZJQ' +
    '14+1pwRUd6iCDPE+ehN0IJsehK0kp0jHiwv/+7RAwAAFeTJLae962H+mSW0971sO0MkrR6XrYdoZJWj0vWwtcSM2eJLjUN7XNGFv' +
    'Vzb2ZviWPf//qWpsUCJd7/boLpDTbEC6tR6vSKKI3XQ4GEBViFArUUnzoetw0iVLonoGdLlEYlUYZkhtGyenLEfJ/PV+Ku2oYZiN' +
    'ln8ZJQ14+1pwRUd6iCDPE+ehN0IJsehK0kp0jHiwstcSM2eJLjUN7XNGFvVzb2ZviWPf//qWpsUCJd7/boLpDTbEC6jXqr0kkiL5' +
    'SEkLKExGM/0PT8OIqyZgoekUmFJHHqNNYlzFDZB9+d/PPlqUyzJ2sVPQLpdLarrfmlnq2F59bkrp2wNPDnsxlCFrdW8jsVl0s1Up' +
    'r/da5z6n2cKan3nhWsUYQDV///9jszNDTPHI2zSUVf//////////////////////////////////////////////////////////' +
    '///////////////////////////////69VekkkRfKQkhZQmIxn+h6fhxFWTMFD0ikwpI49RprEuYobIPvzv558tSmWZO1ip6BdLp' +
    'bVdb80s9WwvPrcldO2Bp4c9mMoQtbq3kdisulmqlNf7rXOfU+zhTU+88K1ijCAav///sdmZoaZ45G2aSipktttySRuMbzizhjj9J' +
    'KuUKXLWxPC/GHCsNg1FBp5BQMxmVnGAgNKsRRuqS21LEgsYz2YPshpjh/E+IhTP04qIrKrol0xABGhMTpDUFKSk8B1RmNpjwIkF8' +
    'vq7/+7RAwAAFozDK0ebC2HDmGVo82FsPaMktp6XrYe0ZJbT0vWx4z3UMKC1N1ncRnpitYugK7///a+MKpFZuwWQItLm7UKZLbbck' +
    'kbjG84s4Y4/SSrlCly1sTwvxhwrDYNRQaeQUDMZlZxgIDSrEUbqkttSxILGM9mD7IaY4fxPiIUz9OKiKyq6JdMQARoTE6Q1BSkpP' +
    'AdUZjaY8CJBfL6ueM91DCgtTdZ3EZ6YrWLoCu///2vjCqRWbsFkCLS5u1ChklJNxttpvbPRPwO4e0NM08C7MC5OyQimeI0Y1cmwF' +
    'YAwO8lgpIjYWk8eo+iO9WYI9WswCFh3OLIh6hePGx7JNCfI5WPV9KBpLoMssRYgbtGdQVxh5quX1mG7hSPEvS9qVi4PE0fpakwdY' +
    'icPUmXN1rFHMcxX3RHWhhn//////////////////////////////////////////////////////////////////////////////' +
    '/////////////////9klJNxttpvbPRPwO4e0NM08C7MC5OyQimeI0Y1cmwFYAwO8lgpIjYWk8eo+iO9WYI9WswCFh3OLIh6hePGx' +
    '7JNCfI5WPV9KBpLoMssRYgbtGdQVxh5quX1mG7hSPEvS9qVi4PE0fpakwdYicPUmXN1rFHMcxX3RHWhhkkkttuONprfwCAkIAjJY' +
    '00AZ7cq2ZlJHEDDooFn0ydSKNiBuM6g0tUkLcO1sObxxXM6tQzo04j7cocucxs1UyHDvEXH/+7RAwAAGEjFK6el62HpGKV09L1sN' +
    '9Lktp6XrYb6XJbT0vWw8BjKkcUjIrXO9/aC4XnvfNpZd1e1KGgx/oS9hX0vjo1o2GqHw7R1EqUrFCBJJbbccbTW/gEBIQBGSxpoA' +
    'z25VszKSOIGHRQLPpk6kUbEDcZ1BpapIW4drYc3jiuZ1ahnRpxH25Q5c5jZqpkOHeIuJ4DGVI4pGRWud7+0FwvPe+bSy7q9qUNBj' +
    '/Ql7CvpfHRrRsNUPh2jqJUpWKEDEWq00kjbzeISSM3Xw/DUJ8+ULkzgSJh8SAkvJlAZSchRnHLG2JapH4lu1Wri89p4iMWrUUW4t' +
    'Hr3cRc4hp9lVoI2LKCvE/cQ0k0qPH3XGG2sGWntM+gWp96in3f1Ia9bRdC1aOxKiSWKrhMy1q7hei4d/////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '/////iLVaaSRt5vEJJGbr4fhqE+fKFyZwJEw+JASXkygMpOQozjljbEtUj8S3arVxee08RGLVqKLcWj17uIucQ0+yq0EbFlBXifu' +
    'IaSaVHj7rjDbWDLT2mfQLU+9RT7v6kNetouhatHYlRJLFVwmZa1dwvRcOZRKbbjjab35RkvFNHqSZfkNSuVlaw2gH8N2sjJjklcY' +
    '+ONty0zHK7gP8R7Xljt0HKexeAorxt6xWsOKtnX/+7RAwAAGhTBKUel62HImCUo9L1sNlLEtp6XrYbKWJbT0vWwJ8D0LGhZBoqqc' +
    'pIWtSyXnk396lyCAuChc+FP6HL6qVtdW8US5pZhYKsjPQ5VSgkyiU23HG03vyjJeKaPUky/IalcrK1htAP4btZGTHJK4x8cbblpm' +
    'OV3Af4j2vLHboOU9i8BRXjb1itYcVbOoT4HoWNCyDRVU5SQtalkvPJv71LkEBcFC58Kf0OX1Ura6t4olzSzCwVZGehyqlBLFVr02' +
    'kjb1aJqD7SZK8I+MzmEtqgRmcJhXNvMwMrtLSReLWkpE1US0zhPjxNRoUFgtjTfNvH1S94XRRqknJKXsaxokLXLC4te7xrVpbUfG' +
    'pxCaDJgGh6P94rsvJKimoyLoU6XoQo01Tk4d2hf/////////////////////////////////////////////////////////////' +
    '/////////////////////////////////////////////////////////////////////FVr02kjb1aJqD7SZK8I+MzmEtqgRmcJ' +
    'hXNvMwMrtLSReLWkpE1US0zhPjxNRoUFgtjTfNvH1S94XRRqknJKXsaxokLXLC4te7xrVpbUfGpxCaDJgGh6P94rsvJKimoyLoU6' +
    'XoQo01Tk4d2heEpJNuNyNrbyEKAcQ9KJ1AR7C5Ql/pkAKhhtmRZdKksEhAQqojlRTSvH/pDfYbvK8YS4R547xvvl9aDLZjq0kHVI' +
    'Dizixi7/+7RAwAAGbCvKUel62GwFeUo9L1sOKL0rp6XrYcUXpXT0vWxK6RXv/ArRseatuDrFsVYL3nscz9TRcWY5CrQOgm7SFwOi' +
    'KNIp1PlaGMWiEpJNuNyNrbyEKAcQ9KJ1AR7C5Ql/pkAKhhtmRZdKksEhAQqojlRTSvH/pDfYbvK8YS4R547xvvl9aDLZjq0kHVID' +
    'izixi5K6RXv/ArRseatuDrFsVYL3nscz9TRcWY5CrQOgm7SFwOiKNIp1PlaGMWiMklJNpxpLXPBXhJFWLxFJFTpk0S33IFGiiJsP' +
    'RC66x9ddkUSWIZp3LHlr+O8jR3DMQxEJQ5UTNmt5nneUnaouHFWgC0pAjx/KJxgz+3b7vLST2KLCAgUmFU/2pUYOxZRFyNyGXJTp' +
    'uREf0KWWV///////////////////////////////////////////////////////////////////////////////////////////' +
    '///////////////////////////////////////////8ZJKSbTjSWueCvCSKsXiKSKnTJolvuQKNFETYeiF11j667IoksQzTuWPL' +
    'X8d5GjuGYhiIShyombNbzPO8pO1RcOKtAFpSBHj+UTjBn9u33eWknsUWEBApMKp/tSowdiyiLkbkMuSnTciI/oUssomElJtuSNrb' +
    'yEgEnRigKdzTCMYl6AaDyyQyRstlTblXzLqRzabr29iUw/hxXt3yljQH6i3DlxNS97RIr1lTicL/+7RAwAAGlSpKael62G2lSU09' +
    'L1sNuLUrp6XrYbcWpXT0vWxmC4ThOj8Vb7F9Zrj7w2YtNJZ9kCUD/9NqrUj75g+lF7Sr5oXPC+SjQCLIXkGLJhJSbbkja28hIBJ0' +
    'YoCnc0wjGJegGg8skMkbLZU25V8y6kc2m69vYlMP4cV7d8pY0B+otw5cTUve0SK9ZU4nCZguE4To/FW+xfWa4+8NmLTSWfZAlA//' +
    'Taq1I++YPpRe0q+aFzwvko0AiyF5BiyksmNuNuNrXxxbzWAaV56fbClKLmG+ZSIWEZDkWlIaDjC67axPbNNwq+fVLUiWmvK3bzlk' +
    'dx3C0VrjzWblRObgNs4itP1ufwqQN23BiwJ7RaU3WlIBZIDV/Wo89CCaLx3SM2RiHDGEFOHzhyxMXX//////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////SWTG3G3G1r44t5rA' +
    'NK89PthSlFzDfMpELCMhyLSkNBxhddtYntmm4VfPqlqRLTXlbt5yyO47haK1x5rNyonNwG2cRWn63P4VIG7bgxYE9otKbrSkAskB' +
    'q/rUeehBNF47pGbIxDhjCCnD5w5YmLrxRabbjkkju9RkhEl/HIa7JnirQ4rVPCZAjRAU2ZQthy9mam0FE2aRzPW8kgxNbgSeG9V6' +
    't23xYku4sHU9sxIs7UVYZBOkecKBFGvssSk8RqtuAyX/+7RAwAAF7y5K6el62G5lyV09L1sO/MErrCXrYd+YJXWEvWwjRI8+LONr' +
    'Vjco0ch37KGxe4UbGJVOvYLtF0IpEgBNHSK+KJXii023HJJHd6jJCJL+OQ12TPFWhxWqeEyBGiApsyhbDl7M1NoKJs0jmet5JBia' +
    '3Ak8N6r1btvixJdxYOp7ZiRZ2oqwyCdI84UCKNfZYlJ4jVbcBkpGiR58WcbWrG5Ro5Dv2UNi9wo2MSqdewXaLoRSJACaOkV8UStk' +
    'tJtySSSMbVVDkVCJMsgqMw1IZXIHiDgoJWVjJKlCcSF67jr4IkQ+qRG48WPJAvTNttLjFl09fSX7uzVDtfcNTmaGgXw/nB4hD+Bq' +
    'DWNJAdp67i3xn67e63fcstogVMK///jgzaHPa+rspoO3GP//////////////////////////9ktJtySSSMbVVDkVCJMsgqMw1IZX' +
    'IHiDgoJWVjJKlCcSF67jr4IkQ+qRG48WPJAvTNttLjFl09fSX7uzVDtfcNTmaGgXw/nB4hD+BqDWNJAdp67i3xn67e63fcstogVM' +
    'K///jgzaHPa+rspoO3GIVWqSaTYGqOkfSAiF0DgI4uZMCSE4XZEUvwMtRIwAN6zOFS+H6itgIEaFAKiScP5w21+TyzCo/jNisQxD' +
    'EMVgmgAnAIwVYm4t4m49Zpx280zTUbPH3rwImV3D3R44P38N/HgE4C8BuBqwkYKcBbANwB2AAwAWAdgHADoEgE0FwLghDBExR4CA' +
    'IO////+pr6j/+7RAwAAEFDDK6wl62G4GGV1hL1sStM01R+HrUlaZpqj8PWpUNnUgNMlCq1STSbA1R0j6QEQugcBHFzJgSQnC7Iil' +
    '+BlqJGABvWZwqXw/UVsBAjQoBUSTh/OG2vyeWYVH8ZsViGIYhisE0AE4BGCrE3FvE3HrNOO3mmaajZ4+9eBEyu4e6PHB+/hv48An' +
    'AXgNwNWEjBTgLYBuAOwAGACwDsA4AdAkAmguBcEIYImKPAQBB3////1NfUKhs6kBpkhxAAAAEopIDpAyC/FuZxyGWS1U4nhEkdSa' +
    'OQHj5o+Jy46MidGVTJd9UxK//qUt27zCwDAGFQJCIEh4VCkUujH/xlcestvjJZERBYNAkAwWKkoZCoVBEhTjLYxjFCqhWakDR7//' +
    '//6RJYSPPV7F////////////////////////////////////////////////////////////////////////////////////////' +
    '/////////////////////////////////////7iAAAAJRSQHSBkF+LczjkMslqpxPCJI6k0cgPHzR8Tlx0ZE6MqmS76piV//Upbt' +
    '3mFgGAMKgSEQJDwqFIpdGP/jK49ZbfGSyIiCwaBIBgsVJQyFQqCJCnGWxjGKFVCs1IGj3////0iSwkeer2LqWqpJIoiU9CSBAZV9' +
    'FEpUJt4VMogCIuGYCXIIzVcrSpePURZ5YwV3Y5vS343j5MXHFq3POsVT6p8dHRbnpnO59yddrWj7KYn/+7RAwAAGWTNP6exK1G0m' +
    'af09iVqOOMU9R7GLcccYp6j2MW4GKZSeq0I+OSCLSQarEiJVG7UPmAa//+HCYGPPOoP7D8KKDFig4tKx1papaqkkiiJT0JIEBlX0' +
    'USlQm3hUyiAIi4ZgJcgjNVytKl49RFnljBXdjm9LfjePkxccWrc86xVPqnx0dFuemc7n3J12taPspiQYplJ6rQj45IItJBqsSIlU' +
    'btQ+YBr//4cJgY886g/sPwooMWKDi0rHWlhYFVkkk0LjOWT1LccRJj/U51VVDoeg6A826lqRXFj51AYD0QyU7sbUczFyatPIkixI' +
    'Pg4cKDx4zrBLN1Mb93OVeqzd3UkMmkBcqekuQkx4GSM+KhEgZ3WJCZ7v//iluNan60DRAZsJLg6wd///////////////////////' +
    '////////////////////////////////////////////////////////////////////////////////////////////////////' +
    '//////////////////////////+sCqySSaFxnLJ6luOIkx/qc6qqh0PQdAebdS1Irix86gMB6IZKd2NqOZi5NWnkSRYkHwcOFB48' +
    'Z1glm6mN+7nKvVZu7qSGTSAuVPSXISY8DJGfFQiQM7rEhM93//xS3GtT9aBogM2ElwdYOVBq9tttD9MGyGsX4hDgdaSF7JnbRcPU' +
    'gsLpNPwpquK6khbRRuS7tbsqU5mcjZw0FBsWSVFLjA+ZD8w=';
  const byteCharacters = window.atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: 'audio/wav' });
}

export function getShortAudioBlob(): Blob {
  const base64 =
    'UklGRrAnAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YeglAAD7/wwADAADAPv/7f/5/wMAHwAoADgAIgAXAAAA7P/X' +
    '/9r/9f/w/+n/9//7/+//7v/l/9//5v/t//T/+f/3/wMABgAEAAoACwASABMAGwAYAAsABAABAAAABgAWACIAIQAaAAgA9P/z/9b/' +
    'w//D/8v/7f/7/xMA/v/y/+H/2P/X/9n/+v8cAEwAaABKAEgAKgAoACoAKwA/AEcAPwAjAAAA7//c/8//3f/o/////f/3/+T/zv+6' +
    '/7H/wP/V//D//v8RAPz/7P/h/+T/8P8KABkAHgAkACwAMAA8ADwARgBPAEwAUwBKADQAKQD8/93/0P/G/8X/wf+5/5j/lP+B/47/' +
    'pP/B/+H/BQATABkAJAAeAB4AHAAjACIALgBJAFQAUQBCAC0AFQABAO7/5P/j/9z/wv+8/6H/nv+V/6L/tf/D/9P/4//0//L/+v/z' +
    '/woAGwAkACUARABRAF8AXwA7AEMAOAAwAEIANwA6ACMAHQAlAB4ACQDq/9//zv/P/9H/z//S/9T/vP/I/8r/1P/9//v/FwAyADAA' +
    'QABZACkAQAAeACcAMgAjABIABwDo/+P/7//6////BwAFAAMA6v/R/8f/vf+//9T/6v/2//P/2//C/67/o/+w/8D/3/8BACsANQBR' +
    'AEkASwBEADcAPgBRAGAAUgA6AA8AAADc/97/4P/5//H/7//q/8H/qv+h/5X/nv+o/83/7//7//r/5v/t//f/9/8OADQAVwBpAHEA' +
    'bwB0AGYATQA8ACcAJAArABoACwD3/93/tv+q/6f/vP/C/8j/rv+w/6D/m/+l/8D/3P/v/w8AEwANAAcACQAUADgARwBhAH8AfwBy' +
    'AFYAOQAaABAACQAHAAwAEAAAANf/rf+m/63/xf/X/+3/DAAGAPz/7f/b/9b/1f/q/xsAPQBCAEYAJQAXAPX/1//j//b/CwAQACAA' +
    'JQAdAAEA7v/c/+b/8//7/wwAHwAuABkACgD5//H/4f/v//v/AgD9//b/4v/S/9j/x/+//8D/zv/U/9j/1P/Y/9L/3f/3/wQAHwA7' +
    'ADoALwANAAYACAABABcAKQA/ADYAJgAMAAYABwALAA0ABQD///L/9//w/+//+v8QACIAHgAfABkAAQD1/+j/8v/5/x8AIgApAC4A' +
    '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' +
    'cf4KAFEBOAF/ACX/LwAh/3kCz/+n/nP+IAH0/7cANf6r/4n+SwJy/zUAPv6A/xACwP+tAFL+LQDq/ysB8v/g/wH+vAA9AKwCt/3h' +
    '/+D//gEsAWD+gACl/rgBMADb/p//v//R//cAJ/9WAC3/BwFB/6oA1wCl//r+7v9YAfv/X//m/pn/cAAPAef/3v1x/yICrwBY/1v/' +
    'qv9TAEgBlADe/m/+JwHa//YAiP6E/wT/lADAAUj/7P9V//EAbgHm/zn/af+7/5YBLP8nAPL+UwCLALEA9P8u/ykBSgBeAH3/nQA7' +
    'AMD/8P+y/zwAIgA5/8j/HgAlACQA4v4rAB4APgGY/3D+2QBWAGkAXP9L/33/swDIAGD/Uf9IAIkAvwCN/z8AYP8LAO4Aov8JAMr+' +
    '1f/yAEn/UABS/tT/WQGL/7kA9v05AXIACAB7/wcAowCGAHr/RgDr/yUAegCN/0MA/f8JAqL/TQA9/88AhwAvABH/V//m/5AB7P7P' +
    '/9H+3//iANL+MgHd/c8Bav/uAGj/uf+b/5T/lAB7/0IAYv83AA8A6wDR/87/9v9aAKgAuABr/9z/I/89AXr/8/+H/zr/yQA7/54A' +
    'aP7f/zEAKAAHAJ7/GQBEAKcAFv/O/wgADQF8AC//6QCG/3AB3f/G/1sAKf/yAAgA7gDM/6P/OwBAAEcAMv/G/4//WAAAAW3/2f8U' +
    '/4gACgA4ALX/Qv+9AFMABQEW//L/xv+vAIwA4P5QANX/hwDb/yj/aQABABoASv+T/2wAWAD7/+7+fACP/8MAkv95/9YACf+vAYj+' +
    'GQCOAFj/9ADD/qsANgDV//v/8v58AJ7/FgBTADL/gABS/2oAwv9m/2IAVv8TAQEADwDB/0n/NAFkADMAbP+O/y8BXADYABb/ZP+/' +
    'AA4AogDg/kUA3v/p/7YAc/86AH7/zP9cAAsAnACX/8D/9v/D/60Abv/k/7z/CAB/APT/VgCB/+v/nAByAFAAAgDk/+z/9f81AExJ' +
    'U1SCAAAASU5GT0lDTVR2AAAAIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwMDAwMGYzYmUgMDAwMDAwMDAgMDAw' +
    'MDAwMDAgMDAwMDAwMDAgMDAwMDAwMDAgMDAwMDAwMDAgMDAwMDAwMDAgMDAwMDAwMDAgMDAwMDAwMDAAAGlkMyASAQAASUQzAwAA' +
    'AAACB0NPTU0AAAB5AAAAAAAAACAwMDAwMDAwMCAwMDAwMDAwMCAwMDAwMDAwMCAwMDAwMDAwMDAwMDBmM2JlIDAwMDAwMDAwIDAw' +
    'MDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwVFhYWAAAAHoAAABDT01N' +
    'ACAwMDAwMDAwMCAwMDAwMDAwMCAwMDAwMDAwMCAwMDAwMDAwMDAwMDBmM2JlIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAw' +
    'MDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwIDAwMDAwMDAwAA==';
  const byteCharacters = window.atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: 'audio/wav' });
}

@Directive({
  // es lint complains that a directive should be used as an attribute
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'viewContainerDirective',
  standalone: false
})
export class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<viewContainerDirective></viewContainerDirective>',
  standalone: false
})
export class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  declarations: [ChildViewContainerComponent, ViewContainerDirective],
  exports: [ViewContainerDirective]
})
export class ChildViewContainerModule {}

export function arrayOfIntsFromZero(size: number): number[] {
  return Array.from({ length: size }, (_, i) => i);
}

export function arrayOfIntsFromOne(size: number): number[] {
  return Array.from({ length: size }, (_, i) => i + 1);
}

/**
 * Ignore the transloco directive and any usage of the {{ t('key') }} function.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[transloco]',
  standalone: false
})
export class MockTranslocoDirective {
  @Input() translocoRead?: string;

  constructor(
    private templateRef: TemplateRef<any>,
    private viewContainer: ViewContainerRef
  ) {
    this.viewContainer.createEmbeddedView(this.templateRef, {
      $implicit: (s: string) => s
    });
  }
}
