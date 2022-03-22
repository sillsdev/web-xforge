import { Injectable } from '@angular/core';
import Papa from 'papaparse';

@Injectable({
  providedIn: 'root'
})
export class CsvService {
  parse(file: File): Promise<string[][]> {
    return new Promise(resolve => Papa.parse(file, { complete: result => resolve(result.data as string[][]) }));
  }
}
