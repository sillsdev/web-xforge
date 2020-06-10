import mingo from 'mingo';
import { Snapshot } from './models/snapshot';
import { nameof } from './utils';

export type PrimitiveType = number | string | boolean;

export interface RegexFilter {
  $regex: string;
  $options?: string;
}

export interface InFilter {
  $in: PrimitiveType[];
}

export interface EqFilter {
  $eq: PrimitiveType;
}

export type Filter = PrimitiveType | RegexFilter | InFilter | EqFilter;

export interface Filters {
  [path: string]: Filter | Filters[] | undefined;
  $and?: Filters[];
  $or?: Filters[];
  $nor?: Filters[];
}

export interface Sort {
  [path: string]: 1 | -1;
}

/**
 * This interface represents the parameters for a real-time query. It includes options for filter, sorting, and paging.
 */
export interface QueryParameters {
  [path: string]: Filter | Sort | undefined;
  $sort?: Sort;
  $skip?: number;
  $limit?: number;
  $count?: true;
}

export interface QueryResults<T> {
  results: T[] | number;
  unpagedCount: number;
}

export function performQuery<T>(parameters: QueryParameters, snapshots: T[]): QueryResults<T> {
  const query = new mingo.Query(toMingoCriteria(parameters));
  const cursor = query.find(snapshots);
  if (parameters.$sort != null) {
    cursor.sort(toMingoSort(parameters.$sort));
  }
  let unpagedCursor: mingo.Cursor<T>;
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
  return { results: cursor.all(), unpagedCount: unpagedCursor.count() };
}

function toMingoCriteria(filters: QueryParameters | Filters): any {
  const criteria: any = {};
  for (const key of Object.keys(filters)) {
    switch (key) {
      case '$and':
      case '$or':
      case '$nor':
        const subFiltersArray = filters[key] as Filters[];
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
