import { Component, DebugElement, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { JsonViewerComponent } from './json-viewer.component';

describe('JsonViewerComponent', () => {
  it('should handle null data', () => {
    const env = new TestEnvironment(null);

    expect(env.component.tokens).toEqual([]);
    expect(env.getDisplayText()).toBe('');
  });

  it('should handle undefined data', () => {
    const env = new TestEnvironment(undefined);

    expect(env.component.tokens).toEqual([]);
    expect(env.getDisplayText()).toBe('');
  });

  it('should display null value', () => {
    const env = new TestEnvironment({ value: null });

    expect(env.nullSpans.length).toBe(1);
    expect(env.nullSpans[0].nativeElement.textContent).toBe('null');
  });

  it('should display boolean values', () => {
    const env = new TestEnvironment({ isTrue: true, isFalse: false });

    expect(env.booleanSpans.length).toBe(2);

    const booleanValues = env.booleanSpans.map(span => span.nativeElement.textContent);
    expect(booleanValues).toContain('true');
    expect(booleanValues).toContain('false');
  });

  it('should display number values', () => {
    const env = new TestEnvironment({ integer: 42, float: 3.14, negative: -5 });

    expect(env.numberSpans.length).toBe(3);

    const numberValues = env.numberSpans.map(span => span.nativeElement.textContent);
    expect(numberValues).toContain('42');
    expect(numberValues).toContain('3.14');
    expect(numberValues).toContain('-5');
  });

  it('should display string values with proper escaping', () => {
    const env = new TestEnvironment({
      simple: 'hello',
      withQuotes: 'say "hello"',
      withNewline: 'line1\nline2',
      withTab: 'before\tafter',
      withBackslash: 'path\\to\\file'
    });

    expect(env.stringSpans.length).toBe(5);

    const stringValues = env.stringSpans.map(span => span.nativeElement.textContent);
    expect(stringValues).toContain('"hello"');
    expect(stringValues).toContain('"say \\"hello\\""');
    expect(stringValues).toContain('"line1\\nline2"');
    expect(stringValues).toContain('"before\\tafter"');
    expect(stringValues).toContain('"path\\\\to\\\\file"');
  });

  it('should display empty array', () => {
    const env = new TestEnvironment({ items: [] });

    expect(env.bracketSpans.length).toBe(2);
    expect(env.bracketSpans[0].nativeElement.textContent).toBe('[');
    expect(env.bracketSpans[1].nativeElement.textContent).toBe(']');
  });

  it('should display array with values', () => {
    const env = new TestEnvironment({ numbers: [1, 2, 3] });

    expect(env.bracketSpans.length).toBe(2);
    expect(env.numberSpans.length).toBe(3);
    expect(env.commaSpans.length).toBe(2); // 2 commas for 3 items
  });

  it('should display empty object', () => {
    const env = new TestEnvironment({});

    expect(env.braceSpans.length).toBe(2);
    expect(env.braceSpans[0].nativeElement.textContent).toBe('{');
    expect(env.braceSpans[1].nativeElement.textContent).toBe('}');
  });

  it('should display object with key-value pairs', () => {
    const env = new TestEnvironment({ name: 'John', age: 30 });

    expect(env.keySpans.length).toBe(2);

    const keyValues = env.keySpans.map(span => span.nativeElement.textContent);
    expect(keyValues).toContain('"name"');
    expect(keyValues).toContain('"age"');

    expect(env.colonSpans.length).toBe(2);
    expect(env.commaSpans.length).toBe(1); // 1 comma for 2 properties
  });

  it('should display nested objects correctly', () => {
    const env = new TestEnvironment({
      user: {
        name: 'John',
        details: {
          age: 30,
          active: true
        }
      }
    });

    expect(env.braceSpans.length).toBe(6); // 3 objects * 2 braces each
    expect(env.keySpans.length).toBe(5); // user, name, details, age, active
    expect(env.stringSpans.length).toBe(1); // "John"
    expect(env.numberSpans.length).toBe(1); // 30
    expect(env.booleanSpans.length).toBe(1); // true
  });

  it('should display nested arrays correctly', () => {
    const env = new TestEnvironment({
      matrix: [
        [1, 2],
        [3, 4]
      ]
    });

    expect(env.bracketSpans.length).toBe(6); // 3 arrays * 2 brackets each
    expect(env.numberSpans.length).toBe(4); // 1, 2, 3, 4
  });

  it('should handle mixed data types in array', () => {
    const env = new TestEnvironment({
      mixed: [1, 'hello', true, null, { key: 'value' }]
    });

    expect(env.numberSpans.length).toBe(1);
    expect(env.stringSpans.length).toBe(2); // "hello" and "value"
    expect(env.booleanSpans.length).toBe(1);
    expect(env.nullSpans.length).toBe(1);
    expect(env.keySpans.length).toBe(2); // "mixed" and "key"
  });

  it('should handle complex nested structure', () => {
    const env = new TestEnvironment({
      users: [
        {
          id: 1,
          name: 'John',
          active: true,
          metadata: null
        },
        {
          id: 2,
          name: 'Jane',
          active: false,
          metadata: {
            lastLogin: '2023-10-01',
            permissions: ['read', 'write']
          }
        }
      ]
    });

    // Verify the structure is rendered
    expect(env.keySpans.length).toBeGreaterThan(0);
    expect(env.numberSpans.length).toBe(2); // id values
    expect(env.stringSpans.length).toBeGreaterThan(0);
    expect(env.booleanSpans.length).toBe(2); // active values
    expect(env.nullSpans.length).toBe(1); // metadata: null
  });

  it('should include proper indentation tokens', () => {
    const env = new TestEnvironment({ nested: { value: 42 } });

    expect(env.indentSpans.length).toBeGreaterThan(0);

    // Check that different indentation levels exist
    const indentValues = env.indentSpans.map(span => span.nativeElement.textContent);
    const uniqueIndents = [...new Set(indentValues)];
    expect(uniqueIndents.length).toBeGreaterThan(1);
  });

  it('should include newline breaks', () => {
    const env = new TestEnvironment({ key1: 'value1', key2: 'value2' });

    expect(env.breakElements.length).toBeGreaterThan(0);
  });

  it('should update tokens when data changes', () => {
    const env = new TestEnvironment({ initial: 'data' });
    const initialTokenCount = env.component.tokens.length;

    env.component.data = { updated: 'data', with: 'more', properties: true };
    const updatedTokenCount = env.component.tokens.length;

    expect(updatedTokenCount).toBeGreaterThan(initialTokenCount);
  });

  describe('token generation', () => {
    it('should generate correct token types for different values', () => {
      const env = new TestEnvironment({
        str: 'text',
        num: 42,
        bool: true,
        nullVal: null,
        arr: [1, 2],
        obj: { nested: 'value' }
      });

      const tokens = env.component.tokens;
      const tokenTypes = tokens.map(t => t.type);

      expect(tokenTypes).toContain('brace-open');
      expect(tokenTypes).toContain('brace-close');
      expect(tokenTypes).toContain('bracket-open');
      expect(tokenTypes).toContain('bracket-close');
      expect(tokenTypes).toContain('key');
      expect(tokenTypes).toContain('colon');
      expect(tokenTypes).toContain('string');
      expect(tokenTypes).toContain('number');
      expect(tokenTypes).toContain('boolean');
      expect(tokenTypes).toContain('null');
      expect(tokenTypes).toContain('comma');
      expect(tokenTypes).toContain('newline');
      expect(tokenTypes).toContain('indent');
    });

    it('should generate tokens with correct indent levels', () => {
      const env = new TestEnvironment({
        level1: {
          level2: {
            level3: 'deep'
          }
        }
      });

      expect(env.indentSpans.length).toBeGreaterThan(0);
    });
  });
});

@Component({
  selector: 'app-host',
  template: '<app-json-viewer></app-json-viewer>'
})
class HostComponent {
  @ViewChild(JsonViewerComponent, { static: true }) component!: JsonViewerComponent;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;

  constructor(data: any) {
    TestBed.configureTestingModule({
      declarations: [HostComponent],
      imports: [JsonViewerComponent]
    });

    this.fixture = TestBed.createComponent(HostComponent);
    this.component.data = data;
    this.fixture.detectChanges();
  }

  get component(): JsonViewerComponent {
    return this.fixture.componentInstance.component;
  }

  get nullSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-null'));
  }

  get booleanSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-boolean'));
  }

  get numberSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-number'));
  }

  get stringSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-string'));
  }

  get bracketSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-bracket'));
  }

  get braceSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-brace'));
  }

  get keySpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-key'));
  }

  get colonSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-colon'));
  }

  get commaSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-comma'));
  }

  get indentSpans(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.json-indent'));
  }

  get breakElements(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('br'));
  }

  getDisplayText(): string {
    const textElements = this.fixture.debugElement.queryAll(By.css('span'));
    return textElements.map(el => el.nativeElement.textContent).join('');
  }
}
