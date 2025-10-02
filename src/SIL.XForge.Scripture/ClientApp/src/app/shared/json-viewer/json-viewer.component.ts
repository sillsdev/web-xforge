import { Component, Input } from '@angular/core';

/**
 * Represents a token in the JSON structure for rendering.
 */
export interface JsonToken {
  type:
    | 'indent'
    | 'key'
    | 'colon'
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'brace-open'
    | 'brace-close'
    | 'bracket-open'
    | 'bracket-close'
    | 'comma'
    | 'newline';
  value: string;
  indent: number;
}

/**
 * A component that displays JSON data in a formatted, pretty-printed way.
 * It provides a consistent, non-interactive view for JSON objects throughout the application.
 */

@Component({
  selector: 'app-json-viewer',
  templateUrl: './json-viewer.component.html',
  styleUrls: ['./json-viewer.component.scss'],
  standalone: true
})
export class JsonViewerComponent {
  private _data: any = {};
  tokens: JsonToken[] = [];

  @Input()
  set data(value: any) {
    this._data = value;
    this.tokens = value == null ? [] : this.tokenizeValue(value, 0);
  }

  get data(): any {
    return this._data;
  }

  /**
   * Creates an indent token with actual space characters.
   */
  private createIndentToken(indentLevel: number): JsonToken {
    return { type: 'indent', value: '  '.repeat(indentLevel), indent: indentLevel };
  }

  /**
   * Recursively tokenizes a JSON value into a flat array of tokens.
   */
  private tokenizeValue(value: any, indentLevel: number): JsonToken[] {
    const tokens: JsonToken[] = [];

    if (value === null) {
      tokens.push({ type: 'null', value: 'null', indent: indentLevel });
    } else if (typeof value === 'boolean') {
      tokens.push({ type: 'boolean', value: value.toString(), indent: indentLevel });
    } else if (typeof value === 'number') {
      tokens.push({ type: 'number', value: value.toString(), indent: indentLevel });
    } else if (typeof value === 'string') {
      tokens.push({ type: 'string', value: `"${this.escapeString(value)}"`, indent: indentLevel });
    } else if (Array.isArray(value)) {
      tokens.push(...this.tokenizeArray(value, indentLevel));
    } else if (typeof value === 'object') {
      tokens.push(...this.tokenizeObject(value, indentLevel));
    }

    return tokens;
  }

  /**
   * Tokenizes an array into a structured token representation.
   */
  private tokenizeArray(arr: any[], indentLevel: number): JsonToken[] {
    const tokens: JsonToken[] = [];

    tokens.push({ type: 'bracket-open', value: '[', indent: indentLevel });

    if (arr.length === 0) {
      tokens.push({ type: 'bracket-close', value: ']', indent: indentLevel });
      return tokens;
    }

    tokens.push({ type: 'newline', value: '', indent: indentLevel });

    for (let i = 0; i < arr.length; i++) {
      tokens.push(this.createIndentToken(indentLevel + 1));
      tokens.push(...this.tokenizeValue(arr[i], indentLevel + 1));

      if (i < arr.length - 1) {
        tokens.push({ type: 'comma', value: ',', indent: indentLevel + 1 });
        tokens.push({ type: 'newline', value: '', indent: indentLevel + 1 });
      } else {
        tokens.push({ type: 'newline', value: '', indent: indentLevel + 1 });
      }
    }

    tokens.push(this.createIndentToken(indentLevel));
    tokens.push({ type: 'bracket-close', value: ']', indent: indentLevel });

    return tokens;
  }

  /**
   * Tokenizes an object into a structured token representation.
   */
  private tokenizeObject(obj: any, indentLevel: number): JsonToken[] {
    const tokens: JsonToken[] = [];
    const keys = Object.keys(obj);

    tokens.push({ type: 'brace-open', value: '{', indent: indentLevel });

    if (keys.length === 0) {
      tokens.push({ type: 'brace-close', value: '}', indent: indentLevel });
      return tokens;
    }

    tokens.push({ type: 'newline', value: '', indent: indentLevel });

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const value = obj[key];

      tokens.push(this.createIndentToken(indentLevel + 1));
      tokens.push({ type: 'key', value: `"${this.escapeString(key)}"`, indent: indentLevel + 1 });
      tokens.push({ type: 'colon', value: ':', indent: indentLevel + 1 });

      tokens.push(...this.tokenizeValue(value, indentLevel + 1));

      if (i < keys.length - 1) {
        tokens.push({ type: 'comma', value: ',', indent: indentLevel + 1 });
        tokens.push({ type: 'newline', value: '', indent: indentLevel + 1 });
      } else {
        tokens.push({ type: 'newline', value: '', indent: indentLevel + 1 });
      }
    }

    tokens.push(this.createIndentToken(indentLevel));
    tokens.push({ type: 'brace-close', value: '}', indent: indentLevel });

    return tokens;
  }

  /**
   * Escapes special characters in strings for JSON display.
   */
  private escapeString(str: string): string {
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
}
