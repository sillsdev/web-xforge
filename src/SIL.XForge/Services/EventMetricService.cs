using System;
using System.Collections.Generic;
using System.Diagnostics;
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
    public async Task<QueryResults<EventMetric>> GetEventMetricsAsync(
        string? projectId,
        EventScope[]? scopes,
        string[]? eventTypes,
        DateTime? fromDate = null,
        int pageIndex = 0,
        int pageSize = int.MaxValue
    )
    {
        // Build the query incrementally
        var query = eventMetrics.Query();

        if (projectId is not null)
        {
            query = query.Where(m => m.ProjectId == projectId);
        }
        else
        {
            query = query.Where(m => m.ProjectId != null);
        }

        if (scopes is not null)
        {
            query = query.Where(m => scopes.Contains(m.Scope));
        }

        if (eventTypes is not null)
        {
            query = query.Where(m => eventTypes.Contains(m.EventType));
        }

        if (fromDate.HasValue)
        {
            DateTime from = fromDate.Value;
            query = query.Where(m => m.TimeStamp >= from);
        }

        var orderedQuery = query.OrderByDescending(m => m.TimeStamp);

        // See if we are paginating the results
        List<EventMetric> results;
        long unpagedCount;
        if (pageIndex == 0 && pageSize == int.MaxValue)
        {
            results = await orderedQuery.ToListAsync();
            unpagedCount = results.Count;
        }
        else
        {
            // Execute count and paged results
            var countTask = query.CountAsync();
            var resultsTask = orderedQuery.Skip(pageIndex * pageSize).Take(pageSize).ToListAsync();

            await Task.WhenAll(countTask, resultsTask);
            unpagedCount = countTask.Result;
            results = resultsTask.Result;
        }

        return new QueryResults<EventMetric> { Results = results, UnpagedCount = unpagedCount };
    }

    public async Task SaveEventMetricAsync(
        string? projectId,
        string? userId,
        string eventType,
        EventScope scope,
        Dictionary<string, object> argumentsWithNames,
        object? result = null,
        TimeSpan? executionTime = null,
        Exception? exception = null
    )
    {
        // Process the arguments into a MongoDB format for the payload
        // We should not save the cancellation token as it is not user data
        var payload = new Dictionary<string, BsonValue>();
        foreach (var kvp in argumentsWithNames.Where(kvp => kvp.Value is not CancellationToken))
        {
            payload[kvp.Key] = GetBsonValue(kvp.Value);
        }

        // Collect tags from Activity.Current and all parent activities
        // Child activity tags override parent tags with the same key
        Dictionary<string, BsonValue?>? tags = null;
        var collectedTags = new Dictionary<string, string?>();

        // Walk up the activity chain collecting tags (parent first, so child overrides)
        var activity = Activity.Current;
        var activityChain = new Stack<Activity>();
        while (activity is not null)
        {
            activityChain.Push(activity);
            activity = activity.Parent;
        }

        // Apply tags from root to current (so child overrides parent)
        while (activityChain.Count > 0)
        {
            activity = activityChain.Pop();
            foreach (var kvp in activity.Tags)
            {
                collectedTags[kvp.Key] = kvp.Value;
            }
        }

        if (collectedTags.Count > 0)
        {
            tags = collectedTags.ToDictionary(kvp => kvp.Key, kvp => GetBsonValue(kvp.Value));
        }

        // Generate the event metric
        var eventMetric = new EventMetric
        {
            Id = ObjectId.GenerateNewId().ToString(),
            EventType = eventType,
            ExecutionTime = executionTime,
            Payload = payload,
            ProjectId = projectId,
            Scope = scope,
            UserId = userId,
            Tags = tags,
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
