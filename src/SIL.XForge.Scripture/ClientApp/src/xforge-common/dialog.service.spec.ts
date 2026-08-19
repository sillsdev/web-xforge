import { Component } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { anything, capture, instance, mock, when } from 'ts-mockito';
import { DialogService } from './dialog.service';
import { I18nService } from './i18n.service';

@Component({ template: '' })
class TestDialogComponent {}

describe('DialogService', () => {
  it('uses the disableClose from the config', () => {
    const env = new TestEnvironment();
    env.service.openMatDialog(TestDialogComponent, { disableClose: true });
    expect(env.lastConfig.disableClose).toBe(true);
  });

  it('defaults disableClose to false when the config does not specify it', () => {
    const env = new TestEnvironment();
    env.service.openMatDialog(TestDialogComponent, { width: '600px' });
    expect(env.lastConfig.disableClose).toBe(false);
  });

  it('lets a component default config set disableClose', () => {
    const env = new TestEnvironment();
    (TestDialogComponent as any).defaultMatDialogConfig = { disableClose: true };
    env.service.openMatDialog(TestDialogComponent, { width: '600px' });
    expect(env.lastConfig.disableClose).toBe(true);
    delete (TestDialogComponent as any).defaultMatDialogConfig;
  });

  it('openGenericDialog uses disableClose from its dialogOptions', () => {
    const env = new TestEnvironment();
    env.service.openGenericDialog({ options: [] }, { disableClose: true });
    expect(env.lastConfig.disableClose).toBe(true);
  });

  it('confirm passes disableClose through to the underlying dialog', () => {
    const env = new TestEnvironment();
    void env.service.confirm('dialog.cancel', 'dialog.cancel', undefined, { disableClose: true });
    expect(env.lastConfig.disableClose).toBe(true);
  });

  it('message passes disableClose through to the underlying dialog', () => {
    const env = new TestEnvironment();
    void env.service.message('dialog.cancel', undefined, { disableClose: true });
    expect(env.lastConfig.disableClose).toBe(true);
  });
});

class TestEnvironment {
  readonly mockedMatDialog = mock(MatDialog);
  readonly mockedI18nService = mock(I18nService);
  readonly service: DialogService;

  constructor() {
    when(this.mockedI18nService.direction).thenReturn('ltr');
    when(this.mockedI18nService.translate(anything(), anything())).thenReturn(of(''));
    when(this.mockedMatDialog.open(anything(), anything())).thenReturn({
      afterClosed: () => of(undefined)
    } as MatDialogRef<any>);
    this.service = new DialogService(instance(this.mockedI18nService), instance(this.mockedMatDialog));
  }

  get lastConfig(): MatDialogConfig {
    const [, config] = capture<any, MatDialogConfig>(this.mockedMatDialog.open).last();
    return config;
  }
}
