import { RealtimeDocLifecycleMonitorService } from './realtime-doc-lifecycle-monitor';

describe('RealtimeDocLifecycleMonitorService', () => {
  let service: RealtimeDocLifecycleMonitorService;

  beforeEach(() => {
    service = new RealtimeDocLifecycleMonitorService();
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('should not record events when monitoring is disabled', () => {
    service.setMonitoringEnabled(false);
    service.docCreated('doc1', 'userA');
    service.docDestroyed('doc1');
    expect(service.createdTimestamps['doc1']).toBeUndefined();
    expect(service.destroyedTimestamps['doc1']).toBeUndefined();
  });

  it('should record created and destroyed timestamps when monitoring is enabled', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docCreated('doc1', 'userA');
    jasmine.clock().mockDate(new Date(2000));
    service.docDestroyed('doc1');
    expect(service.createdTimestamps['doc1'][0].timestamp).toBe(1000);
    expect(service.createdTimestamps['doc1'][0].creatorName).toBe('userA');
    expect(service.destroyedTimestamps['doc1'][0]).toBe(2000);
  });

  it('should match created and destroyed events in recreates', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docCreated('doc1', 'userA');
    jasmine.clock().mockDate(new Date(2000));
    service.docDestroyed('doc1');
    jasmine.clock().mockDate(new Date(3000));
    service.docCreated('doc1', 'userB');
    jasmine.clock().mockDate(new Date(4000));
    service.docDestroyed('doc1');
    jasmine.clock().mockDate(new Date(5000));
    service.docCreated('doc1', 'userC');
    const recreates = service.getDocumentRecreates('doc1');
    expect(recreates.length).toBe(2);
    expect(recreates[0]).toEqual({ destroyed: 2000, created: 3000, creatorName: 'userB' });
    expect(recreates[1]).toEqual({ destroyed: 4000, created: 5000, creatorName: 'userC' });
  });

  it('should detect thrashing documents', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docCreated('doc1', 'userA');
    jasmine.clock().mockDate(new Date(2000));
    service.docDestroyed('doc1');
    jasmine.clock().mockDate(new Date(2100));
    service.docCreated('doc1', 'userB');
    jasmine.clock().mockDate(new Date(2200));
    service.docDestroyed('doc1');
    jasmine.clock().mockDate(new Date(2250));
    service.docCreated('doc1', 'userC');
    jasmine.clock().mockDate(new Date(2300));
    service.docDestroyed('doc1');
    // Thrashing threshold: 200ms, must thrash at least twice
    const thrashing = service.getThrashingDocuments(200, 2);
    expect(thrashing['doc1'].length).toBeGreaterThanOrEqual(2);
    expect(thrashing['doc1'][0].creatorName).toBe('userB');
    expect(thrashing['doc1'][1].creatorName).toBe('userC');
    expect(thrashing['doc1'][0].recreateDuration).toBe(100);
    expect(thrashing['doc1'][1].recreateDuration).toBe(50);
  });

  it('should not detect thrashing if recreate durations exceed threshold', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docCreated('doc2', 'userA');
    jasmine.clock().mockDate(new Date(2000));
    service.docDestroyed('doc2');
    jasmine.clock().mockDate(new Date(3000));
    service.docCreated('doc2', 'userB');
    jasmine.clock().mockDate(new Date(4000));
    service.docDestroyed('doc2');
    const thrashing = service.getThrashingDocuments(500, 2);
    expect(thrashing['doc2']).toBeUndefined();
  });

  it('should handle destroyed events without matching created events', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docDestroyed('doc3');
    jasmine.clock().mockDate(new Date(2000));
    service.docCreated('doc3', 'userA');
    const recreates = service.getDocumentRecreates('doc3');
    expect(recreates.length).toBe(1);
    expect(recreates[0].destroyed).toBe(1000);
    expect(recreates[0].created).toBe(2000);
    expect(recreates[0].creatorName).toBe('userA');
  });

  it('should return all recreates for all documents', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docCreated('docA', 'userA');
    jasmine.clock().mockDate(new Date(2000));
    service.docDestroyed('docA');
    jasmine.clock().mockDate(new Date(3000));
    service.docCreated('docB', 'userB');
    jasmine.clock().mockDate(new Date(4000));
    service.docDestroyed('docB');
    jasmine.clock().mockDate(new Date(5000));
    service.docCreated('docA', 'userC');
    const all = service.getAllDocumentRecreates();
    expect(Object.keys(all)).toContain('docA');
    expect(Object.keys(all).length).toBe(2);
    expect(all['docA'][0].creatorName).toBe('userC');
    expect(all['docB'].length).toBe(0);
  });

  it('should not match destroyed events after created events', () => {
    service.setMonitoringEnabled(true);
    jasmine.clock().mockDate(new Date(1000));
    service.docCreated('docX', 'userA');
    jasmine.clock().mockDate(new Date(2000));
    service.docCreated('docX', 'userB');
    jasmine.clock().mockDate(new Date(3000));
    service.docDestroyed('docX');
    const recreates = service.getDocumentRecreates('docX');
    expect(recreates.length).toBe(0);
  });
});
