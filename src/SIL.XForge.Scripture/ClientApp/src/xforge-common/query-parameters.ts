import { Query } from 'mingo';
import { Cursor } from 'mingo/cursor';
import { Snapshot } from './models/snapshot';
import { nameof } from './utils';

export type PrimitiveType = number | string | boolean | null | undefined;

/**
 * A string that doesn't start with '$'
 */
export type PropertyName = Exclude<string, `$${string}`>;

export interface RegexFilter {
  $regex: string;
  $options?: string;
}

export interface InFilter {
  $in: PrimitiveType[];
}

export interface ArrayFilter {
  $elemMatch?: PropertyFilter;
  $size?: number;
}

export interface ComparisonFilter {
  $eq?: any;
  $ne?: any;
  $gt?: PrimitiveType;
  $gte?: PrimitiveType;
  $lt?: PrimitiveType;
  $lte?: PrimitiveType;
}

export type ComparisonOperator = Extract<keyof ComparisonFilter, string>;

export type ObjectFilter = RegexFilter | InFilter | ArrayFilter | ComparisonFilter;

export interface ConjunctionFilter {
  $and?: QueryFilter[];
  $or?: QueryFilter[];
  $nor?: QueryFilter[];
}

export interface PropertyFilter {
  [path: PropertyName]: PrimitiveType | ObjectFilter;
}

export type QueryFilter = PropertyFilter | ConjunctionFilter;

export type SortDirection = 1 | -1;

export interface Sort {
  [path: PropertyName]: SortDirection;
}

export interface PipelineOperators {
  $sort?: Sort;
  $skip?: number;
  $limit?: number;
  $count?: true;
}

/**
 * This type represents the parameters for a real-time query. It includes options for filter, sorting, and paging.
 */
export type QueryParameters = QueryFilter & PipelineOperators;

export interface QueryResults<T> {
  results: T[] | number;
  unpagedCount: number;
}

export function performQuery<T>(parameters: QueryParameters, snapshots: T[]): QueryResults<T> {
  const query = new Query(toMingoCriteria(parameters));
  const cursor = query.find(snapshots);
  if (parameters.$sort != null) {
    cursor.sort(toMingoSort(parameters.$sort));
  }
  let unpagedCursor: Cursor;
  if (parameters.$skip != null || parameters.$limit != null) {
    unpagedCursor = query.find(snapshots);

    if (parameters.$skip != null) {
      cursor.skip(parameters.$skip);
    }
    if (parameters.$limit != null) {
      cursor.limit(parameters.$limit);
    }
  } else {
    unpagedCursor = cursor;
  }

  if (parameters.$count != null) {
    return { results: cursor.count(), unpagedCount: unpagedCursor.count() };
  }
  return { results: cursor.all() as T[], unpagedCount: unpagedCursor.count() };
}

function toMingoCriteria(filters: QueryParameters): any {
  const criteria: any = {};
  for (const key of Object.keys(filters)) {
    switch (key) {
      case '$and':
      case '$or':
      case '$nor':
        const subFiltersArray = filters[key] as PropertyFilter[];
        criteria[key] = subFiltersArray.map(f => toMingoCriteria(f));
        break;

      case '_id':
        criteria['id'] = filters[key];
        break;

      default:
        if (!key.startsWith('$')) {
          criteria[convertPath(key)] = filters[key];
        }
        break;
    }
  }
  return criteria;
}

function toMingoSort(sort: Sort): any {
  const mingoSort: any = {};
  for (const field of Object.keys(sort)) {
    mingoSort[convertPath(field)] = sort[field];
  }
  return mingoSort;
}

function convertPath(path: string): string {
  return `${nameof<Snapshot>('data')}.${path}`;
}
