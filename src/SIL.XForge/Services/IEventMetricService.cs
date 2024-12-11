using System.Collections.Generic;
using SIL.XForge.EventMetrics;

namespace SIL.XForge.Services;

public interface IEventMetricService
{
    IEnumerable<EventMetric> GetEventMetrics(string projectId, int pageIndex, int pageSize);
}
