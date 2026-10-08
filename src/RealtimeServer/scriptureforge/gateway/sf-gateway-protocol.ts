import { USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../../common/models/user';
import { CollectionProtocol, GatewayProtocolConfig } from '../../common/gateway/protocol-config';
import { BIBLICAL_TERM_COLLECTION } from '../models/biblical-term';
import { NOTE_THREAD_COLLECTION } from '../models/note-thread';
import { QUESTIONS_COLLECTION } from '../models/question';
import { SF_PROJECT_PROFILES_COLLECTION, SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../models/sf-project-user-config';
import { TEXT_AUDIO_COLLECTION } from '../models/text-audio';
import { TEXTS_COLLECTION } from '../models/text-data';
import { TRAINING_DATA_COLLECTION } from '../models/training-data';

/** A json0 collection the client reads and edits, but does not create docs in. */
const JSON0_COLLECTION: CollectionProtocol = {
  otType: 'json0',
  clientCreates: false,
  opSources: [],
  snapshotFetchByVersion: false,
  presence: false
};

/** A json0 collection the client also creates docs in. */
const JSON0_CREATED_BY_CLIENT: CollectionProtocol = { ...JSON0_COLLECTION, clientCreates: true };

/**
 * The collections and projections the Scripture Forge client addresses over the websocket, and how it uses each.
 * `text_documents` is left out because the client never uses it.
 */
export const SF_GATEWAY_PROTOCOL: GatewayProtocolConfig = {
  collections: new Map<string, CollectionProtocol>([
    [USERS_COLLECTION, JSON0_COLLECTION],
    [USER_PROFILES_COLLECTION, JSON0_COLLECTION],
    [SF_PROJECTS_COLLECTION, JSON0_COLLECTION],
    [SF_PROJECT_PROFILES_COLLECTION, JSON0_COLLECTION],
    [SF_PROJECT_USER_CONFIGS_COLLECTION, JSON0_COLLECTION],
    [
      TEXTS_COLLECTION,
      {
        otType: 'rich-text',
        clientCreates: false,
        // 'Draft' is only sent by clients from before 2026-09-08, which can still be open in a browser.
        opSources: ['Editor', 'History', 'Draft'],
        snapshotFetchByVersion: false,
        presence: true
      }
    ],
    [QUESTIONS_COLLECTION, JSON0_CREATED_BY_CLIENT],
    // The translate editor fetches a note thread's previous version when undoing the deletion of a note embed.
    [NOTE_THREAD_COLLECTION, { ...JSON0_CREATED_BY_CLIENT, snapshotFetchByVersion: true }],
    [BIBLICAL_TERM_COLLECTION, JSON0_COLLECTION],
    [TEXT_AUDIO_COLLECTION, JSON0_COLLECTION],
    [TRAINING_DATA_COLLECTION, JSON0_CREATED_BY_CLIENT]
  ])
};
