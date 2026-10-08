import { arrayOf, stringValue } from '../../../common/gateway/decoder';
import { Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { Operation } from '../../../common/models/project-rights';
import { SFProjectDomain } from '../../models/sf-project-rights';
import { SFEditRuleContext } from './policy-helpers';
import {
  hasProjectRight,
  MAX_CREATED_ENTITIES,
  MAX_SHORT_STRING_LENGTH,
  SFComponentCheck,
  textValue
} from './sf-edit-rule-helpers';

function mayEditTerms(check: SFComponentCheck): boolean {
  return hasProjectRight(check, SFProjectDomain.BiblicalTerms, Operation.Edit, null);
}

/**
 * The edits clients may make to biblical terms: the Biblical Terms dialog sets a term's description and its renderings
 * (each rendering non-empty), and nothing else. Both need the biblical terms edit right.
 */
export const BIBLICAL_TERM_EDIT_RULES: readonly Json0EditRule<SFEditRuleContext>[] = [
  { path: ['description'], actions: ['set'], value: textValue, allowed: mayEditTerms },
  {
    path: ['renderings'],
    actions: ['set'],
    value: arrayOf(stringValue({ minLength: 1, maxLength: MAX_SHORT_STRING_LENGTH }), {
      maxLength: MAX_CREATED_ENTITIES
    }),
    allowed: mayEditTerms
  }
];
