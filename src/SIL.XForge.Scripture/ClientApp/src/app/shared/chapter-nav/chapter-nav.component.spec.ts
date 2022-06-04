import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { MatSelectHarness } from '@angular/material/select/testing';
import { ChapterNavComponent } from './chapter-nav.component';

const mockedI18nService = mock(I18nService);
describe('ChapterNavComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule, UICommonModule, NoopAnimationsModule],
    declarations: [ChapterNavComponent, ChapterNavHostComponent],
    providers: [{ provide: I18nService, useMock: mockedI18nService }]
  }));

  it('should open to a book and chapter', fakeAsync(() => {
    const env = new TestEnvironment({ book: 2, chapter: 2 });
    env.wait();
    expect(env.component.chapter).toEqual(2);
    expect(env.component.bookName).toBe('Book 2');
  }));

  it('should change book', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component.chapter).toEqual(1);
    expect(env.component.bookName).toBe('Book 1');
    env.hostComponent.activeBookNum = 2;
    env.wait();
    expect(env.component.chapter).toEqual(1);
    expect(env.component.bookName).toBe('Book 2');
  }));

  it('should change chapter if selected', async () => {
    const env = new TestEnvironment();
    const select = await env.getSelectHarness();
    await select.open();

    expect(env.hostComponent.hasChangeEmitted).toBe(false);
    const options = await select.getOptions();
    await options[1].click();
    expect(await select.getValueText()).toBe('Book 1 2');
    expect(env.component.chapter).toEqual(2);
    expect(env.hostComponent.hasChangeEmitted).toBe(true);
    await select.close();
    env.cleanUp();
  });
});

@Component({
  template: `
    <app-chapter-nav
      [bookNum]="activeBookNum"
      [chapter]="activeChapter"
      [chapters]="allChapters"
      (chapterChange)="hasChangeEmitted = true"
    ></app-chapter-nav>
  `
})
class ChapterNavHostComponent {
  @ViewChild(ChapterNavComponent) chapterNavComponent!: ChapterNavComponent;
  activeBookNum?: number;
  activeChapter?: number;
  allChapters: number[] = [1, 2];
  hasChangeEmitted = false;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChapterNavHostComponent>;
  readonly harnessLoader: HarnessLoader;
  readonly hostComponent: ChapterNavHostComponent;
  readonly component: ChapterNavComponent;

  constructor(start?: { book: number; chapter: number }) {
    when(mockedI18nService.localizeBook(1)).thenReturn('Book 1');
    when(mockedI18nService.localizeBook(2)).thenReturn('Book 2');
    this.fixture = TestBed.createComponent(ChapterNavHostComponent);
    this.harnessLoader = TestbedHarnessEnvironment.loader(this.fixture);
    this.fixture.detectChanges();
    this.hostComponent = this.fixture.componentInstance;
    this.component = this.hostComponent.chapterNavComponent;

    this.hostComponent.activeBookNum = start == null ? 1 : start.book;
    this.hostComponent.activeChapter = start == null ? 1 : start.chapter;
  }

  async getSelectHarness(): Promise<MatSelectHarness> {
    return await this.harnessLoader.getHarness(MatSelectHarness);
  }

  wait(): void {
    tick();
    this.fixture.detectChanges();
    tick();
  }

  cleanUp(): void {
    // Hacky way to clean up the overlay container. Only needs to be called for tests that actually open the menu.
    document.querySelector('.cdk-overlay-container')!.remove();
  }
}
