using System.Collections.Generic;
using System.Linq;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;

namespace SIL.XForge.Services;

public class EventMetricService(IRepository<EventMetric> eventMetrics) : IEventMetricService
{
    public IEnumerable<EventMetric> GetEventMetrics(string projectId, int pageIndex, int pageSize) =>
        eventMetrics.Query().Skip(pageIndex * pageSize).Where(m => m.ProjectId == projectId).Take(pageSize);
}
