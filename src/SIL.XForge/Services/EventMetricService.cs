using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using MongoDB.Bson;
using Newtonsoft.Json;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;

namespace SIL.XForge.Services;

public class EventMetricService(IRepository<EventMetric> eventMetrics) : IEventMetricService
{
    public async Task<QueryResults<EventMetric>> GetEventMetricsAsync(
        string? projectId,
        EventScope[]? scopes,
        string[]? eventTypes,
        int pageIndex = 0,
        int pageSize = int.MaxValue
    )
    {
        // Do not allow querying of event metrics without a project identifier
        if (projectId is null)
        {
            return new QueryResults<EventMetric> { Results = [], UnpagedCount = 0 };
        }

        // Build the filter expression for the query
        Expression<Func<EventMetric, bool>> filter;
        if (scopes is not null && eventTypes is not null)
        {
            filter = m => m.ProjectId == projectId && scopes.Contains(m.Scope) && eventTypes.Contains(m.EventType);
        }
        else if (scopes is not null)
        {
            filter = m => m.ProjectId == projectId && scopes.Contains(m.Scope);
        }
        else if (eventTypes is not null)
        {
            filter = m => m.ProjectId == projectId && eventTypes.Contains(m.EventType);
        }
        else
        {
            filter = m => m.ProjectId == projectId;
        }

        // See if we are paginating the results
        List<EventMetric> results;
        long unpagedCount;
        if (pageIndex == 0 && pageSize == int.MaxValue)
        {
            results = await eventMetrics.Query().Where(filter).OrderByDescending(m => m.TimeStamp).ToListAsync();
            unpagedCount = results.Count;
        }
        else
        {
            results = await eventMetrics
                .Query()
                .Where(filter)
                .OrderByDescending(m => m.TimeStamp)
                .Skip(pageIndex * pageSize)
                .Take(pageSize)
                .ToListAsync();
            unpagedCount = await eventMetrics.CountDocumentsAsync(filter);
        }

        return new QueryResults<EventMetric> { Results = results, UnpagedCount = unpagedCount };
    }

    public async Task SaveEventMetricAsync(
        string? projectId,
        string? userId,
        string eventType,
        EventScope scope,
        Dictionary<string, object> argumentsWithNames,
        object? result,
        Exception? exception
    )
    {
        // Process the arguments into a MongoDB format for the payload
        // We should not save the cancellation token as it is not user data
        var payload = new Dictionary<string, BsonValue>();
        foreach (var kvp in argumentsWithNames.Where(kvp => kvp.Value is not CancellationToken))
        {
            payload[kvp.Key] = GetBsonValue(kvp.Value);
        }

        // Generate the event metric
        var eventMetric = new EventMetric
        {
            Id = ObjectId.GenerateNewId().ToString(),
            EventType = eventType,
            Payload = payload,
            ProjectId = projectId,
            Scope = scope,
            UserId = userId,
        };

        // Do not set Result if it is null, or the document will contain "result: null"
        if (result is not null)
        {
            eventMetric.Result = GetBsonValue(result);
        }

        // Set the exception, if one was thrown
        if (exception is not null)
        {
            eventMetric.Exception = exception.ToString();
        }

        // Write the event metric
        await eventMetrics.InsertAsync(eventMetric);
    }

    private static BsonValue GetBsonValue(object? objectValue) =>
        objectValue switch
        {
            int value => new BsonInt32(value),
            long value => new BsonInt64(value),
            bool value => new BsonBoolean(value),
            Array array => new BsonArray(array),
            double value => new BsonDouble(value),
            float value => new BsonDouble(value),
            string value => new BsonString(value),
            decimal value => new BsonDecimal128(value),
            DateTime value => new BsonDateTime(value),
            Uri value => new BsonString(value.ToString()),
            null => BsonNull.Value,
            _ => BsonDocument.Parse(JsonConvert.SerializeObject(objectValue)),
        };
}
