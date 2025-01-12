using System;
using System.Collections.Generic;
using System.Linq;
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
    public async Task<QueryResults<EventMetric>> GetEventMetricsAsync(string? projectId, int pageIndex, int pageSize)
    {
        // Do not allow querying of event metrics without a project identifier
        if (projectId is null)
        {
            return new QueryResults<EventMetric> { Results = [], UnpagedCount = 0 };
        }

        return new QueryResults<EventMetric>
        {
            Results = eventMetrics
                .Query()
                .Where(m => m.ProjectId == projectId)
                .OrderByDescending(m => m.TimeStamp)
                .Skip(pageIndex * pageSize)
                .Take(pageSize),
            UnpagedCount = await eventMetrics.CountDocumentsAsync(m => m.ProjectId == projectId),
        };
    }

    public async Task SaveEventMetricAsync(
        string? projectId,
        string? userId,
        string eventType,
        EventScope eventScope,
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
            Scope = eventScope,
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
            null => BsonNull.Value,
            _ => BsonDocument.Parse(JsonConvert.SerializeObject(objectValue)),
        };
}
