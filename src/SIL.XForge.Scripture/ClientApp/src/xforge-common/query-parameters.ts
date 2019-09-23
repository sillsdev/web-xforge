import get from 'lodash/get';
import orderBy from 'lodash/orderBy';
import XRegExp from 'xregexp';
import { Snapshot } from './models/snapshot';
import { eq, nameof } from './utils';

export interface RegexFilter {
  $regex: string;
  $options?: string;
}

export interface InFilter {
  $in: any[];
}

export interface Filters {
  [field: string]: any | RegexFilter | InFilter;
  $or?: Filters[];
}

/**
 * This interface represents the parameters for a real-time query. It includes options for filter, sorting, and paging.
 */
export interface QueryParameters extends Filters {
  $sort?: { [field: string]: 1 | -1 };
  $skip?: number;
  $limit?: number;
  $count?: true;
}

export function performQuery(parameters: QueryParameters, snapshots: Snapshot[]): [Snapshot[], number] {
  let results = snapshots.filter(d => matchFilters(parameters, d.data));
  const unpagedCount = results.length;
  results = sort(parameters, results);
  results = page(parameters, results);
  return [results, unpagedCount];
}

function matchFilters(filters: Filters, data: any): boolean {
  for (const key of Object.keys(filters)) {
    if (key === '$or') {
      const orFilter = filters[key] as Filters[];
      if (orFilter.every(f => !this.matchFilters(data, f))) {
        return false;
      }
    } else if (!key.startsWith('$')) {
      const objValue = get(data, key);
      const filter = filters[key];
      if (filter != null && filter.$regex != null) {
        const regexFilter = filter as RegexFilter;
        const regex = XRegExp(regexFilter.$regex, regexFilter.$options);
        if (!regex.test(objValue)) {
          return false;
        }
      } else if (filter != null && filter.$in != null) {
        const inFilter = filter as InFilter;
        if (!inFilter.$in.includes(objValue)) {
          return false;
        }
      } else if (!eq(objValue, filter)) {
        return false;
      }
    }
  }

  return true;
}

function sort(parameters: QueryParameters, results: Snapshot[]): Snapshot[] {
  if (parameters.$sort == null) {
    return results;
  }
  const fields: string[] = [];
  const orders: Array<'asc' | 'desc'> = [];
  for (const field of Object.keys(parameters.$sort)) {
    const order = parameters.$sort[field];
    fields.push(`${nameof<Snapshot>('data')}.${field}`);
    orders.push(order === 1 ? 'asc' : 'desc');
  }
  return orderBy(results, fields, orders);
}

function page(parameters: QueryParameters, results: Snapshot[]): Snapshot[] {
  if (parameters.$skip == null && parameters.$limit == null) {
    return results;
  }
  const start = parameters.$skip != null ? parameters.$skip : 0;
  const end = parameters.$limit != null ? start + parameters.$limit : undefined;
  return results.slice(start, end);
}
