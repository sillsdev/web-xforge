import { booleanValue, stringValue } from '../../../common/gateway/decoder';
import { Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { SFEditRuleContext } from './policy-helpers';
import { objectIdValue } from './sf-edit-rule-helpers';

/** The longest display name accepted. */
const MAX_DISPLAY_NAME_LENGTH = 1_000;

/**
 * The edits a user may make to their own `users` doc (UsersPolicy allows edits to no other): their display name and
 * the project they last opened. These are all the edits the client makes; system administrators make no others either.
 */
export const USER_EDIT_RULES: readonly Json0EditRule<SFEditRuleContext>[] = [
  {
    path: ['displayName'],
    actions: ['set'],
    // The client requires some text other than white space.
    value: stringValue({ minLength: 1, maxLength: MAX_DISPLAY_NAME_LENGTH, pattern: /^[\s\S]*\S[\s\S]*$/ }),
    allowed: (): boolean => true
  },
  {
    path: ['isDisplayNameConfirmed'],
    actions: ['set'],
    value: booleanValue,
    allowed: (): boolean => true
  },
  {
    // The client's site id is always 'sf'.
    path: ['sites', 'sf', 'currentProjectId'],
    actions: ['set', 'unset'],
    value: objectIdValue,
    allowed: (): boolean => true
  }
];
