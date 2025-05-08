import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { EditorReadyService } from '../base-services/editor-ready.service';
import { QuillEditorReadyService } from '../quill-services/quill-editor-ready.service';

class MockQuillEditor {
  private eventHandlers: Record<string, Function[]> = {};
  private contentLength = 0;

  emitEditorChange(eventName: string): void {
    if (this.eventHandlers['editor-change']) {
      this.eventHandlers['editor-change'].forEach(handler => handler(eventName, {}));
    }
  }

  // Compatible with rxjs 'fromEvent' (EventTarget-like)
  addEventListener(eventName: string, callback: Function): void {
    if (!this.eventHandlers[eventName]) {
      this.eventHandlers[eventName] = [];
    }
    this.eventHandlers[eventName].push(callback);
  }

  removeEventListener(eventName: string, callback: Function): void {
    if (this.eventHandlers[eventName]) {
      this.eventHandlers[eventName] = this.eventHandlers[eventName].filter(h => h !== callback);
    }
  }

  setContentLength(length: number): void {
    this.contentLength = length;
  }

  getLength(): number {
    return this.contentLength;
  }
}

describe('QuillEditorReadyService', () => {
  let service: EditorReadyService;
  let mockEditor: MockQuillEditor;

  beforeEach(() => {
    mockEditor = new MockQuillEditor();

    TestBed.configureTestingModule({
      providers: [{ provide: EditorReadyService, useClass: QuillEditorReadyService }]
    });

    service = TestBed.inject(EditorReadyService);
  });

  it('should emit true when editor has content', async () => {
    mockEditor.setContentLength(2);

    const readyState: boolean = await firstValueFrom(service.listenEditorReadyState(mockEditor as any));
    expect(readyState).toBeTrue();
  });

  it('should emit false when editor has no content', async () => {
    mockEditor.setContentLength(1);

    const readyState: boolean = await firstValueFrom(service.listenEditorReadyState(mockEditor as any));
    expect(readyState).toBeFalse();
  });

  it('should reflect editor ready state changes', async () => {
    const emittedValues: boolean[] = [];
    const subscription = service
      .listenEditorReadyState(mockEditor as any)
      .subscribe(isReady => emittedValues.push(isReady));

    // Initial state (not ready)
    mockEditor.setContentLength(1);
    expect(emittedValues[0]).toBeFalse();

    // Change to ready state
    mockEditor.setContentLength(2);
    mockEditor.emitEditorChange('text-change');
    expect(emittedValues[1]).toBeTrue();

    // Change back to not ready state
    mockEditor.setContentLength(1);
    mockEditor.emitEditorChange('text-change');
    expect(emittedValues[2]).toBeFalse();

    subscription.unsubscribe();
  });
});
