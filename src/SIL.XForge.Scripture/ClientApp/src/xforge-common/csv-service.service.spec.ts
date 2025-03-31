import { HttpClient, HttpResponse } from '@angular/common/http';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { CsvService } from './csv-service.service';
import { configureTestingModule } from './test-utils';

const mockedHttpClient = mock(HttpClient);

describe('FileService', () => {
  configureTestingModule(() => ({
    providers: [{ provide: HttpClient, useMock: mockedHttpClient }]
  }));

  it('should convert a spreadsheet to a CSV file', async () => {
    const env = new TestEnvironment();
    const excelFile = new File(['EXCEL DATA GOES HERE'], 'test.xls', { type: 'application/vnd.ms-excel' });
    const expectedOutput = [
      ['col1', 'col2'],
      ['val1', 'val2']
    ];
    when(mockedHttpClient.post<HttpResponse<string>>(anything(), anything(), anything())).thenReturn(
      of({ ok: true, status: 200, body: 'col1,col2\nval1,val2' } as any)
    );

    // SUT
    const result = await env.service.convert(excelFile);
    expect(result).toEqual(expectedOutput);
  });

  it('should fail when no body returned', fakeAsync(() => {
    const env = new TestEnvironment();
    const excelFile = new File(['EXCEL DATA GOES HERE'], 'test.xls', { type: 'application/vnd.ms-excel' });
    when(mockedHttpClient.post<HttpResponse<string>>(anything(), anything(), anything())).thenReturn(
      of({ ok: true, status: 200 } as any)
    );

    // SUT
    expect(() => {
      env.service.convert(excelFile);
      tick();
    }).toThrowError();
  }));

  it('should fail when the API call fails', fakeAsync(() => {
    const env = new TestEnvironment();
    const excelFile = new File(['EXCEL DATA GOES HERE'], 'test.xls', { type: 'application/vnd.ms-excel' });
    when(mockedHttpClient.post<HttpResponse<string>>(anything(), anything(), anything())).thenReturn(
      of({ ok: false, status: 400 } as any)
    );

    // SUT
    expect(() => {
      env.service.convert(excelFile);
      tick();
    }).toThrowError();
  }));

  it('should parse a CSV file correctly', async () => {
    const env = new TestEnvironment();
    const csvFile = new File(['col1,col2\nval1,val2'], 'test.csv', { type: 'text/csv' });
    const expectedOutput = [
      ['col1', 'col2'],
      ['val1', 'val2']
    ];

    // SUT
    const result = await env.service.parse(csvFile);
    expect(result).toEqual(expectedOutput);
  });

  it('should parse a TSV file correctly with tab delimiter', async () => {
    const env = new TestEnvironment();
    const tsvFile = new File(['col1\tcol2\nval1\tval2'], 'test.tsv', { type: 'text/tab-separated-values' });
    const expectedOutput = [
      ['col1', 'col2'],
      ['val1', 'val2']
    ];

    // SUT
    const result = await env.service.parse(tsvFile);
    expect(result).toEqual(expectedOutput);
  });
});

class TestEnvironment {
  readonly service = TestBed.inject(CsvService);
}
