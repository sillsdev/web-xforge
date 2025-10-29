using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;

namespace SIL.XForge.Services;

public interface IEventMetricService
{
    Task<QueryResults<EventMetric>> GetEventMetricsAsync(
        string? projectId,
        EventScope[]? scopes,
        string[]? eventTypes,
        /// <summary>Inclusive.</summary>
        DateTime? fromDate = null,
        /// <summary>Inclusive.</summary>
        DateTime? toDate = null,
        int pageIndex = 0,
        int pageSize = int.MaxValue
    );
    Task SaveEventMetricAsync(
        string? projectId,
        string? userId,
        string eventType,
        EventScope scope,
        Dictionary<string, object> argumentsWithNames,
        object? result = null,
        TimeSpan? executionTime = null,
        Exception? exception = null
    );
}
