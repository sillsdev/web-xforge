using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MongoDB.Bson;
using Newtonsoft.Json;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;

namespace SIL.XForge.Services;

public class EventMetricService(IRepository<EventMetric> eventMetrics) : IEventMetricService
{
    public IEnumerable<EventMetric> GetEventMetrics(string? projectId, int pageIndex, int pageSize)
    {
        // Do not allow querying of event metrics without a project identifier
        if (projectId is null)
        {
            return [];
        }

        return eventMetrics
            .Query()
            .Where(m => m.ProjectId == projectId)
            .OrderByDescending(m => m.ProjectId)
            .Skip(pageIndex * pageSize)
            .Take(pageSize);
    }

    public async Task SaveEventMetricAsync(
        string? projectId,
        string? userId,
        string eventType,
        EventScope eventScope,
        Dictionary<string, object> argumentsWithNames
    )
    {
        // Process the arguments into a MongoDB format for the payload
        var payload = new Dictionary<string, BsonValue>();
        foreach (var kvp in argumentsWithNames)
        {
            payload[kvp.Key] = kvp.Value switch
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
                _ => BsonValue.Create(
                    JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(kvp.Value))
                ),
            };
        }

        // Write the event metric
        await eventMetrics.InsertAsync(
            new EventMetric
            {
                Id = ObjectId.GenerateNewId().ToString(),
                EventType = eventType,
                Payload = payload,
                ProjectId = projectId,
                Scope = eventScope,
                UserId = userId,
            }
        );
    }
}
