import { JsonObject } from '../../../common/gateway/json';
import { OpEdit } from '../../../common/gateway/inbound-messages';
import { USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../../../common/models/user';
import { CollectionPolicy, ALLOWED, denied, PolicyDecision } from '../sf-collection-policy';
import { isServalAdmin, isSystemAdmin, SFAccessContext } from '../sf-access-context';
import { isHexId } from '../sf-doc-ids';
import { checkJson0Rules, noClientCreates, noClientEdits } from './policy-helpers';
import { USER_EDIT_RULES } from './user-edit-rules';

/**
 * `users`: a user reads and edits their own doc. System and Serval administrators read anyone's (the administration
 * pages show other users' docs). Reading depends only on the id and the session, never on the doc.
 */
export class UsersPolicy implements CollectionPolicy {
  readonly name: string = USERS_COLLECTION;
  readonly storedIn: string = USERS_COLLECTION;
  readonly readDependsOn: readonly string[] = [];

  async readById(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    if (docId === context.session.userId || isSystemAdmin(context.session) || isServalAdmin(context.session)) {
      return ALLOWED;
    }
    return denied("only administrators may read other users' docs");
  }

  read(docId: string, _data: unknown, context: SFAccessContext): Promise<PolicyDecision> {
    return this.readById(docId, context);
  }

  async mayEdit(docId: string, context: SFAccessContext): Promise<PolicyDecision> {
    return docId === context.session.userId ? ALLOWED : denied('users edit only their own doc');
  }

  create(_docId: string, _data: JsonObject, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientCreates();
  }

  async edit(docId: string, data: unknown, edit: OpEdit, context: SFAccessContext): Promise<PolicyDecision> {
    const mayEdit: PolicyDecision = await this.mayEdit(docId, context);
    if (!mayEdit.allowed) {
      return mayEdit;
    }
    return checkJson0Rules(USER_EDIT_RULES, data, edit, { session: context.session, docId: docId, project: null });
  }
}

/** `user_profiles`, the display name and avatar of every user: any signed-in user may read any of them. */
export class UserProfilesPolicy implements CollectionPolicy {
  readonly name: string = USER_PROFILES_COLLECTION;
  readonly storedIn: string = USERS_COLLECTION;
  readonly readDependsOn: readonly string[] = [];

  async readById(docId: string, _context: SFAccessContext): Promise<PolicyDecision> {
    // Every profile is readable, so reading one that does not exist reveals nothing more than reading one that does.
    return isHexId(docId) ? ALLOWED : denied('not a user id');
  }

  async read(_docId: string, _data: unknown, _context: SFAccessContext): Promise<PolicyDecision> {
    return ALLOWED;
  }

  mayEdit(_docId: string, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientEdits();
  }

  create(_docId: string, _data: JsonObject, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientCreates();
  }

  edit(_docId: string, _data: unknown, _edit: OpEdit, _context: SFAccessContext): Promise<PolicyDecision> {
    return noClientEdits();
  }
}
