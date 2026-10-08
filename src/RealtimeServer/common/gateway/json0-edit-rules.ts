import ShareDB from 'sharedb';
import { hasFunctionProp, isObj } from '../utils/type-utils';
import { Decoder, ROOT_PATH } from './decoder';
import { Json0Component, Json0Path } from './inbound-messages';
import { JsonValue } from './json';
import { encodeJson0Component } from './op-content-decoders';
import { JSON0_TYPE_URI } from './protocol-config';

/**
 * Allowlists for json0 edits. A collection lists the paths a client may change, how, with which values, and who may.
 * An op is allowed only if every one of its components matches a rule that allows it; anything not listed is refused.
 * Components are checked in order, each against the doc as the components before it left it, because json0 applies
 * them in order and a list index in a later component refers to the list after the earlier ones.
 *
 * Checking an op costs about as much as applying it: each component is checked and applied once, and what rules ask
 * about whole lists (such as whether an id is already in one, see ComponentCheck.countInList) is counted once per op
 * and kept up to date, rather than worked out again for every component.
 */

/** Matches any list index in a rule's path. */
export const ANY_INDEX: unique symbol = Symbol('any list index');
/** Matches any object key in a rule's path. */
export const ANY_KEY: unique symbol = Symbol('any object key');

export type RulePathSegment = string | typeof ANY_INDEX | typeof ANY_KEY;

/**
 * What a component does at its path, named after the client's Json0OpBuilder methods:
 * - `set`: `oi`, with or without `od` (setting a field, whether or not it had a value);
 * - `unset`: `od` alone (removing a field);
 * - `insert`: `li` (inserting a list item);
 * - `remove`: `ld` (removing a list item);
 * - `replace-item`: `li` with `ld`. The client never sends one, but ShareDB can turn a client's component into one
 *   when it transforms it against a concurrent op.
 */
export type ComponentAction = 'set' | 'unset' | 'insert' | 'remove' | 'replace-item';

/** What a rule's `allowed` check is given. `C` is the collection's own context, such as the session and project. */
export interface ComponentCheck<C> {
  readonly context: C;
  /** The component's path. */
  readonly path: Json0Path;
  readonly action: ComponentAction;
  /**
   * The doc before this component, after the op's earlier components. It is a working copy that later components
   * change, so a rule must read it only while it is being checked, and must not change it.
   */
  readonly doc: unknown;
  /**
   * The value the component inserts (`oi` or `li`), already accepted by the rule's `value` decoder, or undefined for
   * `unset` and `remove`. Rules read it to check what a decoder cannot, such as that an inserted entity's owner is the
   * session user, or that a set leaves the value as it is.
   */
  readonly inserted: JsonValue | undefined;
  /**
   * The value in `doc` at the first `depth` elements of the path, or undefined if there is none. `valueAt(2)` for a
   * component at `['answers', 3, 'text']` is answer 3; for a `remove` at `['answers', 3]`, `valueAt(2)` is the answer
   * being removed, as it is in the doc (not as the op's `ld` claims it is).
   */
  valueAt(depth: number): unknown;
  /**
   * How many items of the list at the first `depth` elements of the path, in `doc`, have the string `value` as their
   * own `field`; 0 when there is no list there. The counts are made once per op and kept up to date as its components
   * are applied, so a rule can ask this for every component without scanning the list each time.
   */
  countInList(depth: number, field: string, value: string): number;
}

/** One kind of change clients may make. */
export interface Json0EditRule<C> {
  readonly path: readonly RulePathSegment[];
  readonly actions: readonly ComponentAction[];
  /**
   * The values that may be inserted (`oi` or `li`). Required unless the rule allows only `unset` and `remove`. Values
   * removed (`od`, `ld`) are not checked against it: they are what the client believed was there.
   */
  readonly value?: Decoder<unknown>;
  /** Whether the change is allowed for this session and doc. */
  allowed(check: ComponentCheck<C>): boolean;
}

/** The outcome of checking an op against a list of rules. */
export type Json0EditDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/**
 * Checks every component of a json0 op against the rules. `doc` is the doc data the op applies to; it is not
 * modified. The op is refused if any component matches no rule that allows it, or if json0 cannot apply it to the doc.
 */
export function checkJson0Edit<C>(
  rules: readonly Json0EditRule<C>[],
  doc: unknown,
  components: readonly Json0Component[],
  context: C
): Json0EditDecision {
  const json0: Json0Type | undefined = json0Type();
  if (json0 == null) {
    return refuse('the json0 type is not registered');
  }
  // json0 applies ops in place, so the components are applied to a copy, one at a time, after each is checked.
  let current: unknown;
  try {
    current = jsonCopy(doc);
  } catch {
    return refuse('the doc cannot be copied');
  }
  const listCounts = new ListFieldCounts();
  for (const component of components) {
    const action: ComponentAction = actionOf(component);
    const docBefore: unknown = current;
    const inserted: JsonValue | undefined = insertedValue(component);
    const check: ComponentCheck<C> = {
      context: context,
      path: component.path,
      action: action,
      doc: docBefore,
      inserted: inserted,
      valueAt: (depth: number): unknown => valueAtPath(docBefore, component.path.slice(0, depth)),
      countInList: (depth: number, field: string, value: string): number => {
        const list: unknown = valueAtPath(docBefore, component.path.slice(0, depth));
        return Array.isArray(list) ? listCounts.count(list, field, value) : 0;
      }
    };
    const matching: Json0EditRule<C>[] = rules.filter(
      (rule: Json0EditRule<C>) => pathMatches(rule.path, component.path) && rule.actions.includes(action)
    );
    if (matching.length === 0) {
      return refuse(`${action} at ${describePath(component.path)} is not an edit clients may make`);
    }
    const allowed: boolean = matching.some((rule: Json0EditRule<C>) => {
      if (inserted !== undefined) {
        if (rule.value == null || !rule.value(inserted, ROOT_PATH).ok) {
          return false;
        }
      }
      return rule.allowed(check);
    });
    if (!allowed) {
      return refuse(`${action} at ${describePath(component.path)} is not allowed`);
    }
    try {
      const updateCounts: () => void = listCounts.beforeApplying(current, component.path, action);
      // The component's values are copied too, so that the doc copy never shares objects with the op.
      current = json0.apply(current, [jsonCopy(encodeJson0Component(component))]);
      updateCounts();
    } catch {
      return refuse(`${action} at ${describePath(component.path)} does not apply to the doc`);
    }
  }
  return { allowed: true };
}

/**
 * For checking one op: how many items of a list have each value of a field (see ComponentCheck.countInList). A list is
 * counted the first time a rule asks about it, and the counts are then kept up to date as components change the list.
 * Lists are known by identity: json0 changes a list in place, and a list that a component replaces along with its
 * parent is no longer in the doc, so its counts are never asked for again.
 */
class ListFieldCounts {
  /** For each list counted, for each field counted, how many items have each value. */
  private readonly counts = new Map<readonly unknown[], Map<string, Map<string, number>>>();

  count(list: readonly unknown[], field: string, value: string): number {
    let byField: Map<string, Map<string, number>> | undefined = this.counts.get(list);
    if (byField == null) {
      byField = new Map();
      this.counts.set(list, byField);
    }
    let byValue: Map<string, number> | undefined = byField.get(field);
    if (byValue == null) {
      byValue = new Map();
      for (const item of list) {
        addCount(byValue, stringField(item, field), 1);
      }
      byField.set(field, byValue);
    }
    return byValue.get(value) ?? 0;
  }

  /**
   * Notes what a component is about to change in the counted lists on its path, in `doc` before it is applied, and
   * returns the function that brings the counts up to date once it has been applied.
   */
  beforeApplying(doc: unknown, path: Json0Path, action: ComponentAction): () => void {
    const updates: (() => void)[] = [];
    let value: unknown = doc;
    for (let depth = 0; depth < path.length; depth++) {
      const key: string | number = path[depth];
      if (Array.isArray(value)) {
        const list: unknown[] = value;
        const byField: Map<string, Map<string, number>> | undefined = this.counts.get(list);
        if (byField != null && typeof key === 'number') {
          updates.push(this.itemChange(list, byField, key, depth === path.length - 1 ? action : 'inside-item'));
        }
      }
      value = valueAtPath(value, [key]);
      if (value === undefined) {
        break;
      }
    }
    return () => updates.forEach((update: () => void) => update());
  }

  /**
   * The update for a change to the item at `index` of a counted list: inserting, removing or replacing the item itself,
   * or a change inside it. Reads the item as it is now, and returns the function to call after the change.
   */
  private itemChange(
    list: readonly unknown[],
    byField: Map<string, Map<string, number>>,
    index: number,
    change: ComponentAction | 'inside-item'
  ): () => void {
    const removesItem: boolean = change === 'remove' || change === 'replace-item';
    const changesInside: boolean = change === 'inside-item';
    const before: unknown = removesItem || changesInside ? list[index] : undefined;
    const valuesBefore: Map<string, string | undefined> = fieldValues(before, byField.keys());
    return () => {
      const insertsItem: boolean = change === 'insert' || change === 'replace-item';
      const after: unknown = insertsItem || changesInside ? list[index] : undefined;
      for (const [field, byValue] of byField) {
        addCount(byValue, valuesBefore.get(field), -1);
        addCount(byValue, stringField(after, field), 1);
      }
    };
  }
}

/** The values of `fields` in an item, where they are strings. */
function fieldValues(item: unknown, fields: Iterable<string>): Map<string, string | undefined> {
  const values = new Map<string, string | undefined>();
  for (const field of fields) {
    values.set(field, stringField(item, field));
  }
  return values;
}

/** An item's own field, if it is a string. */
function stringField(item: unknown, field: string): string | undefined {
  const value: unknown = isObj(item) && !Array.isArray(item) ? valueAtPath(item, [field]) : undefined;
  return typeof value === 'string' ? value : undefined;
}

function addCount(counts: Map<string, number>, value: string | undefined, delta: number): void {
  if (value === undefined) {
    return;
  }
  const count: number = (counts.get(value) ?? 0) + delta;
  if (count > 0) {
    counts.set(value, count);
  } else {
    counts.delete(value);
  }
}

/** The value at a path in a doc, read through own properties and list indexes only; undefined when there is none. */
export function valueAtPath(doc: unknown, path: Json0Path): unknown {
  let value: unknown = doc;
  for (const key of path) {
    if (typeof key === 'number') {
      if (!Array.isArray(value) || key >= value.length) {
        return undefined;
      }
      value = value[key];
    } else {
      if (!isObj(value) || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, key)) {
        return undefined;
      }
      const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(value, key);
      value = descriptor?.value;
    }
  }
  return value;
}

function refuse(reason: string): Json0EditDecision {
  return { allowed: false, reason: reason };
}

function actionOf(component: Json0Component): ComponentAction {
  switch (component.kind) {
    case 'object-insert':
    case 'object-replace':
      return 'set';
    case 'object-delete':
      return 'unset';
    case 'list-insert':
      return 'insert';
    case 'list-delete':
      return 'remove';
    case 'list-replace':
      return 'replace-item';
  }
}

function insertedValue(component: Json0Component): JsonValue | undefined {
  switch (component.kind) {
    case 'object-insert':
    case 'object-replace':
    case 'list-insert':
    case 'list-replace':
      return component.inserted;
    case 'object-delete':
    case 'list-delete':
      return undefined;
  }
}

function pathMatches(pattern: readonly RulePathSegment[], path: Json0Path): boolean {
  if (pattern.length !== path.length) {
    return false;
  }
  return pattern.every((segment: RulePathSegment, index: number): boolean => {
    const element: string | number = path[index];
    if (segment === ANY_INDEX) {
      return typeof element === 'number';
    }
    if (segment === ANY_KEY) {
      return typeof element === 'string';
    }
    return element === segment;
  });
}

/**
 * A deep copy of JSON data, made with JSON so that the copy's objects are plain objects of this realm, as the
 * decoders require (structuredClone can make objects of another realm, for example under jest).
 */
function jsonCopy(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/** The json0 OT type's apply function, as ShareDB registered it. */
interface Json0Type {
  apply(snapshot: unknown, op: readonly unknown[]): unknown;
}

function json0Type(): Json0Type | undefined {
  const type: unknown = ShareDB.types.map[JSON0_TYPE_URI];
  if (!isObj(type) || !hasFunctionProp(type, 'apply')) {
    return undefined;
  }
  return { apply: (snapshot: unknown, op: readonly unknown[]): unknown => type.apply.call(type, snapshot, op) };
}

/** A path for messages, such as `answers.3.text`. Keys come from the client, so the result is cut short. */
function describePath(path: Json0Path): string {
  return path
    .map((key: string | number) => String(key))
    .join('.')
    .slice(0, 200);
}
