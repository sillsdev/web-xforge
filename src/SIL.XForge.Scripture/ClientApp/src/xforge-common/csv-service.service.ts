import { Injectable } from '@angular/core';
import Papa from 'papaparse';

@Injectable({
  providedIn: 'root'
})
export class CsvService {
  parse(file: File): Promise<string[][]> {
    // Papa Parse can auto-detect delimiters, but only for files with 10+ lines, and will fall back to comma if it can't
    // auto detect the delimiter. We can work around this by specifying the delimiter when the file extension is TSV.
    const delimiter = /.tsv$/i.test(file.name) ? '\t' : undefined;

    return new Promise(resolve =>
      Papa.parse(file, { delimiter, complete: result => resolve(result.data as string[][]) })
    );
  }
}
