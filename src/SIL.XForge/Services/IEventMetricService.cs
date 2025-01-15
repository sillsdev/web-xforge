using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;

namespace SIL.XForge.Services;

public interface IEventMetricService
{
    Task<QueryResults<EventMetric>> GetEventMetricsAsync(string? projectId, int pageIndex, int pageSize);
    Task SaveEventMetricAsync(
        string? projectId,
        string? userId,
        string eventType,
        EventScope eventScope,
        Dictionary<string, object> argumentsWithNames,
        object? result,
        Exception? exception
    );
}
