import { Component, OnInit } from '@angular/core';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';

const checkTypes = {
  formalEquivalence: 'Formal Equivalence',
  semanticSimilarity: 'Semantic Similarity',
  lixReadability: 'Lix Readability'
};
type QualityCheck = keyof typeof checkTypes;

@Component({
  selector: 'app-quality-checks',
  templateUrl: './quality-checks.component.html',
  styleUrls: ['./quality-checks.component.scss']
})
export class QualityChecksComponent implements OnInit {
  constructor(private readonly activatedProject: ActivatedProjectService) {}

  ngOnInit(): void {
    console.log('init');
  }

  get qualityChecks(): QualityCheck[] {
    return Object.keys(checkTypes) as QualityCheck[];
  }

  getContentForCheck(check: QualityCheck): string {
    return check + ' ' + this.books.toString();
  }

  get books(): number[] {
    return this.activatedProject.projectDoc?.data?.texts.map(text => text.bookNum).sort((a, b) => a - b) ?? [];
  }

  getChapters(book: number): number[] {
    const text = this.activatedProject.projectDoc?.data?.texts.find(text => text.bookNum === book);
    return text?.chapters.map(chapter => chapter.number).sort() ?? [];
  }

  getColor(check: QualityCheck, book: number, chapter: number): string {
    // random without using Math.random
    const randomSeedMap: Record<QualityCheck, number> = {
      formalEquivalence: 61237846,
      semanticSimilarity: 12341234,
      lixReadability: 12341723
    };
    const random = book * randomSeedMap[check] - chapter * chapter * randomSeedMap[check] + chapter;
    const hue = (random % 20) + 60;

    return `hsl(${hue}, 70%, 50%)`;
  }

  getCheckName(check: QualityCheck): string {
    return checkTypes[check];
  }

  getBookId(book: number): string {
    return Canon.bookNumberToId(book);
  }

  tooltip(book: number, chapter: number): string {
    return `${this.getBookId(book)} ${chapter}`;
  }

  getLink(book: number, _chapter: number): string {
    return '/projects/' + this.activatedProject.projectId + '/translate/' + this.getBookId(book) + '/';
  }
}
