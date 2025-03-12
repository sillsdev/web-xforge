import {
  TEXT_DOCUMENT_INDEX_PATHS,
  TEXT_DOCUMENTS_COLLECTION,
  TextDocument
} from 'realtime-server/lib/esm/scriptureforge/models/text-document';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';

export class TextDocumentDoc extends JsonRealtimeDoc<TextDocument> {
  static readonly COLLECTION = TEXT_DOCUMENTS_COLLECTION;
  static readonly INDEX_PATHS = TEXT_DOCUMENT_INDEX_PATHS;
}
