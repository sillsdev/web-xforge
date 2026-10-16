import { createFilterPredicate, performQuery } from './query-parameters';

describe('query-parameters', () => {
  describe('createFilterPredicate', () => {
    const docs = [
      { id: 'doc01', data: { name: 'one', items: [{ owner: 'user01', deleted: false }] } },
      { id: 'doc02', data: { name: 'two', items: [{ owner: 'user01', deleted: true }] } },
      { id: 'doc03', data: { name: 'three', items: [] } }
    ];

    it('matches property paths against the doc data', () => {
      const matches = createFilterPredicate({ name: 'two' });
      expect(docs.filter(matches).map(d => d.id)).toEqual(['doc02']);
    });

    it('matches _id against the doc id', () => {
      const matches = createFilterPredicate({ _id: 'doc03' });
      expect(docs.filter(matches).map(d => d.id)).toEqual(['doc03']);
    });

    it('matches the same docs as a query with the same filter', () => {
      const filter = { items: { $not: { $elemMatch: { owner: 'user01', deleted: { $ne: true } } } } };
      const queryResults = performQuery(filter, docs).results;
      expect(docs.filter(createFilterPredicate(filter))).toEqual(queryResults as typeof docs);
      expect(queryResults).toEqual([docs[1], docs[2]]);
    });
  });
});
