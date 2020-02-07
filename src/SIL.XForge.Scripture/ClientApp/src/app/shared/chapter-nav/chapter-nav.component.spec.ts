import { MdcSelect } from '@angular-mdc/web';
import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ChapterNavComponent } from './chapter-nav.component';

const mockedI18nService = mock(I18nService);
describe('ChapterNavComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule, UICommonModule],
    declarations: [ChapterNavComponent, ChapterNavHostComponent],
    providers: [{ provide: I18nService, useMock: mockedI18nService }]
  }));

  it('should open to a book and chapter', fakeAsync(() => {
    const env = new TestEnvironment({ book: 2, chapter: 2 });
    expect(env.component.chapter).toEqual(2);
    expect(env.component.bookName).toBe('Book 2');
  }));

  it('should change book', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.chapter).toEqual(1);
    expect(env.component.bookName).toBe('Book 1');
    env.hostComponent.activeBookNum = 2;
    env.wait();
    expect(env.component.chapter).toEqual(1);
    expect(env.component.bookName).toBe('Book 2');
  }));

  it('should change chapter if selected', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.component.chapter).toEqual(1);
    expect(env.hostComponent.hasChangeEmitted).toBe(false);
    env.changeSelectValue(env.chapterSelect, 'Book 1 2');
    expect(env.component.chapterString).toEqual('Book 1 2');
    expect(env.hostComponent.hasChangeEmitted).toBe(true);
  }));
});

@Component({
  template: `
    <app-chapter-nav
      [bookNum]="activeBookNum"
      [(chapter)]="activeChapter"
      (chapters)="(allChapters)"
      (chapterChange)="hasChangeEmitted = true"
    ></app-chapter-nav>
  `
})
class ChapterNavHostComponent {
  @ViewChild(ChapterNavComponent, { static: false }) chapterNavComponent!: ChapterNavComponent;
  activeBookNum?: number;
  activeChapter?: number;
  allChapters: number[] = [1, 2];
  hasChangeEmitted = false;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChapterNavHostComponent>;
  readonly hostComponent: ChapterNavHostComponent;
  readonly component: ChapterNavComponent;

  constructor(start?: { book: number; chapter: number }) {
    when(mockedI18nService.localizeBook(1)).thenReturn('Book 1');
    when(mockedI18nService.localizeBook(2)).thenReturn('Book 2');
    this.fixture = TestBed.createComponent(ChapterNavHostComponent);
    this.fixture.detectChanges();
    this.hostComponent = this.fixture.componentInstance;
    this.component = this.hostComponent.chapterNavComponent;

    this.hostComponent.activeBookNum = start == null ? 1 : start.book;
    this.hostComponent.activeChapter = start == null ? 1 : start.chapter;
    this.wait();
  }

  get chapterSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('.chapter-select'));
  }

  changeSelectValue(element: DebugElement, value: string): void {
    const select: MdcSelect = element.componentInstance;
    select.value = value;
    this.wait();
  }

  wait(): void {
    tick();
    this.fixture.detectChanges();
    tick();
  }
}
