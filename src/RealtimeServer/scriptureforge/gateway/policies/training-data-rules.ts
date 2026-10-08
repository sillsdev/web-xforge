import { GatewaySession } from '../../../common/gateway/authorization';
import {
  DecodeResult,
  exactFields,
  Fields,
  literal,
  oneOf,
  ROOT_PATH,
  stringValue
} from '../../../common/gateway/decoder';
import { JsonObject } from '../../../common/gateway/json';
import { Operation } from '../../../common/models/project-rights';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { ProjectAccess } from '../project-access';
import { denied, PolicyDecision } from '../sf-collection-policy';
import { ProjectDataId } from '../sf-doc-ids';
import { hasRightsInAll } from './policy-helpers';
import { objectIdValue, shortString } from './sf-edit-rule-helpers';

type TrainingDataFields = Fields<
  'ownerRef' | 'projectRef' | 'dataId' | 'fileUrl' | 'mimeType' | 'skipRows' | 'title' | 'deleted',
  never
>;

/**
 * Whether the session may create this training data doc. The draft sources page creates one after uploading a CSV file,
 * with exactly these fields: the uploader as owner, the file's URL as the upload returned it, `text/csv`, whether to
 * skip a header row, the file's name, and not deleted. It needs the training data create right.
 */
export function checkTrainingDataCreate(
  id: ProjectDataId,
  project: ProjectAccess | null,
  data: JsonObject,
  session: GatewaySession
): PolicyDecision {
  const fields: DecodeResult<TrainingDataFields> = exactFields(data, ROOT_PATH, [
    'ownerRef',
    'projectRef',
    'dataId',
    'fileUrl',
    'mimeType',
    'skipRows',
    'title',
    'deleted'
  ]);
  if (!fields.ok) {
    return denied(`not a training data doc: ${fields.message}`);
  }
  const f: TrainingDataFields = fields.value;
  if (f.required('ownerRef') !== session.userId) {
    return denied('the training data must be owned by the user');
  }
  const dataId: DecodeResult<string> = objectIdValue(f.required('dataId'), f.path('dataId'));
  if (!dataId.ok || dataId.value !== id.dataId) {
    return denied('the data id must be a new id equal to the id of the doc');
  }
  // The URL the upload returned, without its `/assets/training-data` prefix. `t` is the time of the upload.
  // The ids are compared as strings rather than put into a regular expression, so no id needs escaping.
  const fileUrlPrefix: string = `/${id.projectId}/${session.userId}_${id.dataId}.csv?t=`;
  const fileUrl: DecodeResult<string> = stringValue({ maxLength: 200 })(f.required('fileUrl'), f.path('fileUrl'));
  if (
    !fileUrl.ok ||
    !fileUrl.value.startsWith(fileUrlPrefix) ||
    !/^\d{1,20}$/.test(fileUrl.value.slice(fileUrlPrefix.length))
  ) {
    return denied('the file URL must be where the user uploaded the training data file');
  }
  const others: DecodeResult<unknown>[] = [
    literal('text/csv')(f.required('mimeType'), f.path('mimeType')),
    oneOf([0, 1])(f.required('skipRows'), f.path('skipRows')),
    shortString(f.required('title'), f.path('title')),
    literal(false)(f.required('deleted'), f.path('deleted'))
  ];
  for (const result of others) {
    if (!result.ok) {
      return denied(`not a training data doc: ${result.path}: ${result.message}`);
    }
  }
  return hasRightsInAll(project, session.userId, [SFProjectDomain.TrainingData], Operation.Create, session.userId);
}
