import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { DeltaStatic } from 'quill';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import * as RichText from 'rich-text';
import { mock, when } from 'ts-mockito';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { getCombinedVerseTextDoc, getPoetryVerseTextDoc, getTextDoc } from '../shared/test-utils';
import { SF_TYPE_REGISTRY } from './models/sf-type-registry';
import { TextDoc, TextDocId } from './models/text-doc';
import { SFProjectService } from './sf-project.service';
import { TextDocService } from './text-doc.service';

const mockProjectService = mock(SFProjectService);

describe('TextDocService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [{ provide: SFProjectService, useMock: mockProjectService }]
  }));

  it('should overwrite text doc', fakeAsync(() => {
    const env = new TestEnvironment();
    const newDelta: DeltaStatic = getCombinedVerseTextDoc(env.textDocId) as DeltaStatic;

    env.textDocService.overwrite(env.textDocId, newDelta);
    tick();

    expect(env.getTextDoc(env.textDocId).data?.ops).toEqual(newDelta.ops);
  }));

  it('should emit diff', fakeAsync(() => {
    const env = new TestEnvironment();
    const origDelta: DeltaStatic = env.getTextDoc(env.textDocId).data as DeltaStatic;
    const newDelta: DeltaStatic = getPoetryVerseTextDoc(env.textDocId) as DeltaStatic;
    const diff: DeltaStatic = origDelta.diff(newDelta);

    env.textDocService.getLocalSystemChanges$(env.textDocId).subscribe(emittedDiff => {
      expect(emittedDiff.ops).toEqual(diff.ops);
    });

    env.textDocService.overwrite(env.textDocId, newDelta);
    tick();
  }));
});

class TestEnvironment {
  readonly textDocId = new TextDocId('project01', 40, 1);
  readonly textDocService: TextDocService = TestBed.inject(TextDocService);
  private readonly realtimeService: TestRealtimeService = TestBed.inject(TestRealtimeService);

  constructor() {
    this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
      id: this.textDocId.toString(),
      data: getTextDoc(this.textDocId),
      type: RichText.type.name
    });

    when(mockProjectService.getText(this.textDocId)).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
  }

  getTextDoc(textId: TextDocId): TextDoc {
    return this.realtimeService.get<TextDoc>(TextDoc.COLLECTION, textId.toString());
  }
}
