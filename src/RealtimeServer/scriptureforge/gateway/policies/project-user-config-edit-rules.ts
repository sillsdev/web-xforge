import {
  arrayOf,
  booleanValue,
  DecodeResult,
  Decoder,
  exactFields,
  Fields,
  integerValue,
  nullable,
  oneOf,
  stringValue,
  success
} from '../../../common/gateway/decoder';
import { ANY_INDEX, Json0EditRule } from '../../../common/gateway/json0-edit-rules';
import { editorTabGroupTypes, editorTabTypes } from '../../models/editor-tab';
import { LynxInsightFilterScopes, LynxInsightSortOrders, LynxInsightTypes } from '../../models/lynx-insight';
import { SFEditRuleContext } from './policy-helpers';
import {
  dataIdValue,
  insertsWithinList,
  MAX_SHORT_STRING_LENGTH,
  numberInRange,
  objectIdValue,
  optionalField
} from './sf-edit-rule-helpers';

/** The most tabs the editor keeps open. */
const MAX_EDITOR_TABS = 100;

/** The question doc id the checking tool stores as the last question opened: `${projectId}:${dataId}`. */
const questionDocIdValue: Decoder<string> = stringValue({
  maxLength: 2 * 64 + 1,
  pattern: /^[0-9a-f]{1,64}:[0-9A-Za-z_-]{1,64}$/
});

/** A segment ref of the editor, such as `verse_1_2`, `s_1` or `p_3`. */
const segmentRefValue: Decoder<string> = stringValue({ minLength: 1, maxLength: MAX_SHORT_STRING_LENGTH });

/** A segment's checksum: a crc32, which the client may give as a negative 32-bit integer. */
const segmentChecksumValue: Decoder<number> = integerValue({ min: -0x80000000, max: 0xffffffff });

/** A Paratext project id, as the draft import wizard stores it. */
const paratextIdValue: Decoder<string> = stringValue({ minLength: 1, maxLength: 64, pattern: /^[0-9A-Za-z_-]+$/ });

/** The lynx insight panel's filter: the insight types shown (any subset, in any order), the scope, and dismissed. */
const lynxInsightFilterValue: Decoder<unknown> = (input: unknown, path: string): DecodeResult<unknown> => {
  const fields: DecodeResult<Fields<'types' | 'scope', 'includeDismissed'>> = exactFields(
    input,
    path,
    ['types', 'scope'],
    ['includeDismissed']
  );
  if (!fields.ok) return fields;
  const types: DecodeResult<unknown> = arrayOf(oneOf(LynxInsightTypes), { maxLength: 10 })(
    fields.value.required('types'),
    fields.value.path('types')
  );
  if (!types.ok) return types;
  const scope: DecodeResult<unknown> = oneOf(LynxInsightFilterScopes)(
    fields.value.required('scope'),
    fields.value.path('scope')
  );
  if (!scope.ok) return scope;
  const includeDismissed: DecodeResult<boolean | undefined> = optionalField(
    fields.value,
    'includeDismissed',
    booleanValue
  );
  if (!includeDismissed.ok) return includeDismissed;
  return success(input);
};

/** The lynx insight panel's state: `{ isOpen, filter, sortOrder }`. */
const lynxPanelDataValue: Decoder<unknown> = (input: unknown, path: string): DecodeResult<unknown> => {
  const fields: DecodeResult<Fields<'isOpen' | 'filter' | 'sortOrder', never>> = exactFields(input, path, [
    'isOpen',
    'filter',
    'sortOrder'
  ]);
  if (!fields.ok) return fields;
  const isOpen: DecodeResult<boolean> = booleanValue(fields.value.required('isOpen'), fields.value.path('isOpen'));
  if (!isOpen.ok) return isOpen;
  const filter: DecodeResult<unknown> = lynxInsightFilterValue(
    fields.value.required('filter'),
    fields.value.path('filter')
  );
  if (!filter.ok) return filter;
  const sortOrder: DecodeResult<unknown> = oneOf(LynxInsightSortOrders)(
    fields.value.required('sortOrder'),
    fields.value.path('sortOrder')
  );
  if (!sortOrder.ok) return sortOrder;
  return success(input);
};

/**
 * The whole `lynxInsightState`: `{}` when the client first creates it, or, from clients before 2026-08-05, the whole
 * object with its panel data and switches.
 */
const lynxInsightStateValue: Decoder<unknown> = (input: unknown, path: string): DecodeResult<unknown> => {
  const fields: DecodeResult<Fields<never, 'autoCorrectionsEnabled' | 'assessmentsEnabled' | 'panelData'>> =
    exactFields(input, path, [], ['autoCorrectionsEnabled', 'assessmentsEnabled', 'panelData']);
  if (!fields.ok) return fields;
  const autoCorrections: DecodeResult<boolean | undefined> = optionalField(
    fields.value,
    'autoCorrectionsEnabled',
    booleanValue
  );
  if (!autoCorrections.ok) return autoCorrections;
  const assessments: DecodeResult<boolean | undefined> = optionalField(
    fields.value,
    'assessmentsEnabled',
    booleanValue
  );
  if (!assessments.ok) return assessments;
  const panelData: DecodeResult<unknown> = optionalField(fields.value, 'panelData', lynxPanelDataValue);
  if (!panelData.ok) return panelData;
  return success(input);
};

/**
 * One open editor tab: `{ tabType, groupId, isSelected?, projectId? }`. `projectId` is the SF id of a resource tab's
 * project (it may also be on a history tab restored from older data).
 */
const editorTabValue: Decoder<unknown> = (input: unknown, path: string): DecodeResult<unknown> => {
  const fields: DecodeResult<Fields<'tabType' | 'groupId', 'isSelected' | 'projectId'>> = exactFields(
    input,
    path,
    ['tabType', 'groupId'],
    ['isSelected', 'projectId']
  );
  if (!fields.ok) return fields;
  const tabType: DecodeResult<unknown> = oneOf(editorTabTypes)(
    fields.value.required('tabType'),
    fields.value.path('tabType')
  );
  if (!tabType.ok) return tabType;
  const groupId: DecodeResult<unknown> = oneOf(editorTabGroupTypes)(
    fields.value.required('groupId'),
    fields.value.path('groupId')
  );
  if (!groupId.ok) return groupId;
  const isSelected: DecodeResult<boolean | undefined> = optionalField(fields.value, 'isSelected', booleanValue);
  if (!isSelected.ok) return isSelected;
  const projectId: DecodeResult<string | undefined> = optionalField(fields.value, 'projectId', objectIdValue);
  if (!projectId.ok) return projectId;
  return success(input);
};

/** A field the user sets to a value `value` accepts, and possibly unsets. */
function configField(
  path: readonly string[],
  value: Decoder<unknown>,
  actions: readonly ('set' | 'unset')[] = ['set']
): Json0EditRule<SFEditRuleContext> {
  return { path: path, actions: actions, value: value, allowed: (): boolean => true };
}

/** A list of the data ids of entities the user has read. The client only ever adds to these lists. */
function readRefsList(field: string): Json0EditRule<SFEditRuleContext> {
  return { path: [field, ANY_INDEX], actions: ['insert'], value: dataIdValue, allowed: insertsWithinList };
}

/**
 * The edits a user may make to their own project user config (ProjectUserConfigsPolicy allows edits to no other).
 * These are every field the client writes, and also what older clients still write: `confidenceThreshold`,
 * `numSuggestions` and `translationSuggestionsEnabled` (clients built before 2026-09-08), unsets of `selectedTask` and
 * `selectedQuestionRef` (before 2026-05-15), and the whole `lynxInsightState` object (before 2026-08-05). Every role
 * may make all of these edits in its own config. Clients never edit `projectRef`, `ownerRef` or the whole doc.
 */
export const PROJECT_USER_CONFIG_EDIT_RULES: readonly Json0EditRule<SFEditRuleContext>[] = [
  configField(['selectedTask'], oneOf(['checking', 'translate']), ['set', 'unset']),
  configField(['selectedQuestionRef'], questionDocIdValue, ['set', 'unset']),
  configField(['selectedBookNum'], integerValue({ min: 1, max: 999 })),
  // The chapter is parsed from the URL. One that is not a number is NaN, which JSON sends as null.
  configField(
    ['selectedChapterNum'],
    nullable(integerValue({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }))
  ),
  configField(['selectedSegment'], segmentRefValue, ['set', 'unset']),
  configField(['selectedSegmentChecksum'], segmentChecksumValue, ['set', 'unset']),
  configField(['isTargetTextRight'], booleanValue),
  // The client only removes this old setting.
  { path: ['biblicalTermsEnabled'], actions: ['unset'], allowed: (): boolean => true },
  configField(['selectedBiblicalTermsCategory'], stringValue({ minLength: 1, maxLength: MAX_SHORT_STRING_LENGTH }), [
    'set',
    'unset'
  ]),
  configField(['selectedBiblicalTermsFilter'], oneOf(['current_chapter', 'current_book']), ['set', 'unset']),
  configField(['transliterateBiblicalTerms'], booleanValue),
  configField(['showEditorTabsInSinglePane'], booleanValue),
  configField(['selectedDraftTargetParatextId'], paratextIdValue, ['set', 'unset']),
  configField(['editorTabsOpen'], arrayOf(editorTabValue, { maxLength: MAX_EDITOR_TABS })),
  configField(['lynxInsightState'], lynxInsightStateValue),
  configField(['lynxInsightState', 'assessmentsEnabled'], booleanValue),
  configField(['lynxInsightState', 'autoCorrectionsEnabled'], booleanValue),
  configField(['lynxInsightState', 'panelData'], lynxPanelDataValue),
  configField(['confidenceThreshold'], numberInRange(0, 1)),
  configField(['numSuggestions'], integerValue({ min: 1, max: 10 })),
  configField(['translationSuggestionsEnabled'], booleanValue),
  readRefsList('questionRefsRead'),
  readRefsList('answerRefsRead'),
  readRefsList('commentRefsRead'),
  readRefsList('noteRefsRead')
];
