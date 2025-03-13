import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';

import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { mock } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { CopyrightBannerComponent } from './copyright-banner.component';

const mockedDialogService = mock(DialogService);
const mockedi18nService = mock(I18nService);
const mockedMatDialog = mock(MatDialog);

describe('CopyrightBannerComponent', () => {
  let component: CopyrightBannerComponent;
  let fixture: ComponentFixture<CopyrightBannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CopyrightBannerComponent, TestTranslocoModule],
      providers: [
        { provide: DialogService, useValue: mockedDialogService },
        { provide: I18nService, useValue: mockedi18nService },
        { provide: MatDialog, useValue: mockedMatDialog }
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CopyrightBannerComponent);
    component = fixture.componentInstance;
    const mockDialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    mockDialogRef.afterClosed.and.returnValue(of(undefined));
  });

  it('should open dialog when clicking on More info', fakeAsync(() => {
    const dialogMessage = spyOn((component as any).dialogService, 'openGenericDialog').and.callThrough();
    fixture.detectChanges();
    const notice = fixture.debugElement.query(By.css('.copyright-banner .copyright-more-info'));
    (notice.nativeElement as HTMLElement).click();
    tick();
    expect(dialogMessage).toHaveBeenCalledTimes(1);
  }));
});
