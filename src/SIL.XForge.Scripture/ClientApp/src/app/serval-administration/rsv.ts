/*
Function encodeRsv was copied from
https://github.com/Stenway/RSV-Challenge/blob/main/TS-Deno/rsv.ts,
which is provided under the following license.

(MIT No Attribution License, aka MIT-0)

Copyright (c) 2024 Stefan John / Stenway

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/** Transform input into Rows of String Values (RSV).
 * https://github.com/Stenway/RSV-Specification
 * https://github.com/Stenway/RSV-Challenge
 */
export function encodeRsv(rows: (string | null)[][]): Uint8Array {
  const parts: Uint8Array[] = [];
  const valueTerminatorByte = new Uint8Array([0xff]);
  const nullValueByte = new Uint8Array([0xfe]);
  const rowTerminatorByte = new Uint8Array([0xfd]);
  const encoder = new TextEncoder();
  for (const row of rows) {
    for (const value of row) {
      if (value === null) {
        parts.push(nullValueByte);
      } else if (value.length > 0) {
        if (!/\p{Surrogate}/u.test(value) === false) {
          throw new Error(`Invalid string value`);
        }
        parts.push(encoder.encode(value));
      }
      parts.push(valueTerminatorByte);
    }
    parts.push(rowTerminatorByte);
  }
  const result = new Uint8Array(parts.reduce((result, bytes) => result + bytes.length, 0));
  let offset = 0;
  for (const bytes of parts) {
    result.set(bytes, offset);
    offset += bytes.length;
  }
  return result;
}
