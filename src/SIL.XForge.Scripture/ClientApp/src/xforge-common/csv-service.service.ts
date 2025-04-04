import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { lastValueFrom } from 'rxjs';
import { COMMAND_API_NAMESPACE, PROJECTS_URL } from './url-constants';

@Injectable({
  providedIn: 'root'
})
export class CsvService {
  constructor(private readonly http: HttpClient) {}

  async convert(file: File): Promise<string[][]> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await lastValueFrom(
      this.http.post(`${COMMAND_API_NAMESPACE}/${PROJECTS_URL}/convert-to-csv`, formData, {
        headers: { Accept: 'text/csv' },
        observe: 'response',
        responseType: 'text'
      })
    );

    if (!response.ok || response.body == null) {
      throw new Error('Your spreadsheet could not be converted');
    }

    return this.parse(new File([response.body], 'converted.csv', { type: 'text/csv' }));
  }

  parse(file: File): Promise<string[][]> {
    // Papa Parse can auto-detect delimiters, but only for files with 10+ lines, and will fall back to comma if it can't
    // auto detect the delimiter. We can work around this by specifying the delimiter when the file extension is TSV.
    const delimiter = /.tsv$/i.test(file.name) ? '\t' : undefined;

    return new Promise(resolve =>
      Papa.parse(file, { delimiter, complete: result => resolve(result.data as string[][]) })
    );
  }
}
