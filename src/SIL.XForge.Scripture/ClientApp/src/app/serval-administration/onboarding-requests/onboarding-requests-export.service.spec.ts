import { TestBed } from '@angular/core/testing';
import { anything, instance, mock, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import {
  ONBOARDING_REQUEST_RESOLUTION_OPTIONS,
  OnboardingRequest,
  OnboardingRequestResolutionKey,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { ServalAdministrationService } from '../serval-administration.service';
import {
  ONBOARDING_REQUESTS_EXPORT_HEADERS,
  OnboardingRequestsExportService
} from './onboarding-requests-export.service';

const mockedOnboardingRequestService = mock(OnboardingRequestService);
const mockedUserService = mock(UserService);
const mockedServalAdministrationService = mock(ServalAdministrationService);

const REQUEST_ID = 'req1';
const PROJECT_ID = 'sfproj1';
const PROJECT_SHORT_NAME = 'SHORT1';
const UNKNOWN_PROJECT_ID = 'sfproj-unknown';
const ASSIGNEE_ID = 'user2';
const ASSIGNEE_NAME = 'Alice Assignee';
const REQUEST_DATE_UTC = '2026-06-15T18:23:59.137';

describe('OnboardingRequestsExportService', () => {
  it('produces a header row with the requested columns in order', async () => {
    const env = new TestEnvironment();

    const tsv = await env.service.createTsv([]);

    expect(env.lines(tsv)[0]).toEqual(ONBOARDING_REQUESTS_EXPORT_HEADERS.join('\t'));
    expect(ONBOARDING_REQUESTS_EXPORT_HEADERS[0]).toEqual('request_date_utc');
  });

  it('maps a request to a tab-separated row in the correct column order', async () => {
    const env = new TestEnvironment();

    const tsv = await env.service.createTsv([env.createRequest()]);

    expect(env.lines(tsv)[1]).toEqual(
      [
        REQUEST_DATE_UTC,
        'Approved',
        'Bob Requester',
        'eo',
        PROJECT_SHORT_NAME,
        'Esperanto',
        ASSIGNEE_NAME,
        REQUEST_ID,
        PROJECT_ID
      ].join('\t')
    );
  });

  it('leaves the request date empty when the timestamp is missing or invalid', async () => {
    const env = new TestEnvironment();
    const request = env.createRequest();
    (request.submission as { timestamp: string }).timestamp = '';

    const tsv = await env.service.createTsv([request]);

    const cells = env.lines(tsv)[1].split('\t');
    const index = ONBOARDING_REQUESTS_EXPORT_HEADERS.indexOf('request_date_utc');
    expect(cells[index]).toEqual('');
  });

  it('falls back to the project ID when the project document is unavailable', async () => {
    const env = new TestEnvironment();
    const request = env.createRequest();
    request.submission.projectId = UNKNOWN_PROJECT_ID;

    const tsv = await env.service.createTsv([request]);

    const cells = env.lines(tsv)[1].split('\t');
    const index = ONBOARDING_REQUESTS_EXPORT_HEADERS.indexOf('project_shortname');
    expect(cells[index]).toEqual(UNKNOWN_PROJECT_ID);
  });

  it('leaves the assignee column empty when there is no assignee', async () => {
    const env = new TestEnvironment();

    const tsv = await env.service.createTsv([env.createRequest({ assigneeId: '' })]);

    const cells = env.lines(tsv)[1].split('\t');
    const index = ONBOARDING_REQUESTS_EXPORT_HEADERS.indexOf('assignee');
    expect(cells[index]).toEqual('');
  });

  it('produces comma-separated values for CSV', async () => {
    const env = new TestEnvironment();

    const csv = await env.service.createCsv([env.createRequest()]);

    expect(env.lines(csv)[0]).toEqual(ONBOARDING_REQUESTS_EXPORT_HEADERS.join(','));
    expect(env.lines(csv)[1].split(',')[ONBOARDING_REQUESTS_EXPORT_HEADERS.indexOf('request_id')]).toEqual(REQUEST_ID);
  });

  it('produces one data row per request', async () => {
    const env = new TestEnvironment();

    const tsv = await env.service.createTsv([env.createRequest({ id: 'req1' }), env.createRequest({ id: 'req2' })]);

    const dataRows = env.lines(tsv).filter(line => line.trim().length > 0);
    expect(dataRows.length).toEqual(3);
  });

  it('builds an export filename containing the UTC date and time with a trailing Z', () => {
    const env = new TestEnvironment();
    const date = new Date('2026-02-28T18:23:59.137Z');

    expect(env.service.exportFilename('tsv', date)).toEqual('onboarding-requests_2026-02-28_182359Z.tsv');
    expect(env.service.exportFilename('csv', date)).toEqual('onboarding-requests_2026-02-28_182359Z.csv');
  });
});

class TestEnvironment {
  readonly service: OnboardingRequestsExportService;

  constructor() {
    when(mockedOnboardingRequestService.getResolution(anything())).thenCall((key: OnboardingRequestResolutionKey) =>
      ONBOARDING_REQUEST_RESOLUTION_OPTIONS.find(option => option.key === key)
    );
    when(mockedServalAdministrationService.get(PROJECT_ID)).thenResolve({
      id: PROJECT_ID,
      data: { shortName: PROJECT_SHORT_NAME }
    } as any);
    when(mockedServalAdministrationService.get(UNKNOWN_PROJECT_ID)).thenResolve(undefined as any);
    when(mockedUserService.get(ASSIGNEE_ID)).thenResolve({
      data: { displayName: ASSIGNEE_NAME }
    } as unknown as UserDoc);

    TestBed.configureTestingModule({
      providers: [
        { provide: OnboardingRequestService, useValue: instance(mockedOnboardingRequestService) },
        { provide: UserService, useValue: instance(mockedUserService) },
        { provide: ServalAdministrationService, useValue: instance(mockedServalAdministrationService) }
      ]
    });
    this.service = TestBed.inject(OnboardingRequestsExportService);
  }

  createRequest(overrides: Partial<OnboardingRequest> = {}): OnboardingRequest {
    return {
      id: REQUEST_ID,
      submittedAt: '2026-06-15T18:23:59.137Z',
      submittedBy: { name: 'Bob Requester', email: 'bob@example.com' },
      submission: {
        projectId: PROJECT_ID,
        userId: 'user1',
        timestamp: '2026-06-15T18:23:59.137Z',
        formData: {
          name: 'Bob Requester',
          email: 'bob@example.com',
          organization: 'Org',
          partnerOrganization: 'none',
          translationLanguageName: 'Esperanto',
          translationLanguageIsoCode: 'eo',
          completedBooks: [],
          nextBooksToDraft: [],
          sourceProjectA: 'src',
          draftingSourceProject: 'src',
          backTranslationStage: 'None',
          backTranslationProject: null
        }
      } as OnboardingRequest['submission'],
      assigneeId: ASSIGNEE_ID,
      status: 'in_progress',
      resolution: 'approved',
      comments: [],
      ...overrides
    } as OnboardingRequest;
  }

  lines(content: string): string[] {
    return content.split('\n').map(line => line.replace(/\r$/, ''));
  }
}
