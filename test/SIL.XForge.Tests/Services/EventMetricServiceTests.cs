using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using Newtonsoft.Json;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

[TestFixture]
public class EventMetricServiceTests
{
    private const EventScope EventScope01 = EventScope.Settings;
    private const string EventType01 = "myFunctionName";
    private const string Project01 = "project01";
    private const string User01 = "user01";

    [Test]
    public void CreateEventMetricsIndexes_Success()
    {
        var env = new TestEnvironment();

        // SUT
        DataAccessServiceCollectionExtensions.CreateEventMetricsIndexes(env.EventMetricIndexManager);
        env.EventMetricIndexManager.ReceivedWithAnyArgs().CreateMany(models: []);
    }

    [Test]
    public void GetEventMetrics_DoNotGetNullProjectIds()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        IEnumerable<EventMetric> actual = env.Service.GetEventMetrics(projectId: null, pageIndex: 0, pageSize: 10);

        // Do not retrieve any projects, even the metric with no project identifier
        Assert.IsEmpty(actual);
    }

    [Test]
    public void GetEventMetrics_GetAllForProject()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        IEnumerable<EventMetric> actual = env.Service.GetEventMetrics(Project01, pageIndex: 0, pageSize: 10);

        // Skip the one event metric without a project identifier
        Assert.AreEqual(3, actual.Count());
    }

    [Test]
    public void GetEventMetrics_SupportsPagination()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        IEnumerable<EventMetric> actual = env.Service.GetEventMetrics(Project01, pageIndex: 1, pageSize: 2);

        // The first page has 2 event metric, the second page just 1 event metric
        Assert.AreEqual(1, actual.Count());
    }

    [Test]
    public async Task SaveEventMetricAsync_NoArguments()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.SaveEventMetricAsync(
            projectId: null,
            userId: null,
            EventType01,
            EventScope01,
            argumentsWithNames: []
        );

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.IsNull(eventMetric.ProjectId);
        Assert.IsNull(eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsEmpty(eventMetric.Payload);
    }

    [Test]
    public async Task SaveEventMetricAsync_ProjectIdAndUserId()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "projectId", BsonValue.Create(Project01) },
            { "userId", BsonValue.Create(User01) },
        };

        // SUT
        await env.Service.SaveEventMetricAsync(Project01, User01, EventType01, EventScope01, argumentsWithNames);

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
    }

    [Test]
    public async Task SaveEventMetricAsync_ComplexObject()
    {
        var env = new TestEnvironment();
        var complexObject = new TestComplexObject
        {
            Boolean = true,
            DateAndTime = DateTime.UtcNow,
            DecimalNumber = 12.34M,
            DoubleFloat = 56.78,
            Integer = 1234,
            LongInteger = 5678L,
            ProjectId = Project01,
            SingleFloat = 90.12F,
            UserId = User01,
        };
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "complexObject", complexObject },
        };
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            {
                "complexObject",
                BsonValue.Create(
                    JsonConvert.DeserializeObject<Dictionary<string, object>>(
                        JsonConvert.SerializeObject(complexObject)
                    )
                )
            },
        };

        // SUT
        await env.Service.SaveEventMetricAsync(Project01, User01, EventType01, EventScope01, argumentsWithNames);

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
    }

    [Test]
    public async Task SaveEventMetricAsync_ComplexArguments()
    {
        var env = new TestEnvironment();
        const bool boolean = true;
        DateTime dateAndTime = DateTime.UtcNow;
        const decimal decimalNumber = 12.34M;
        const double doubleFloat = 56.78;
        const int integer = 1234;
        const long longInteger = 5678L;
        const float singleFloat = 90.12F;
        string[] stringArray = ["string1", "string2"];
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
            { "boolean", boolean },
            { "dateAndTime", dateAndTime },
            { "decimalNumber", decimalNumber },
            { "doubleFloat", doubleFloat },
            { "integer", integer },
            { "longInteger", longInteger },
            { "singleFloat", singleFloat },
            { "stringArray", stringArray },
            { "nullValue", null },
        };
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "projectId", BsonValue.Create(Project01) },
            { "userId", BsonValue.Create(User01) },
            { "boolean", BsonBoolean.Create(boolean) },
            { "dateAndTime", BsonDateTime.Create(dateAndTime) },
            { "decimalNumber", BsonString.Create(decimalNumber.ToString(CultureInfo.InvariantCulture)) }, // Decimals are stored as strings in JSON
            { "doubleFloat", BsonDouble.Create(doubleFloat) },
            { "integer", BsonInt64.Create(integer) }, // 32-bit integers are stored as 64-bit integers in JSON
            { "longInteger", BsonInt64.Create(longInteger) },
            { "singleFloat", BsonDouble.Create(singleFloat) },
            { "stringArray", BsonArray.Create(stringArray) },
            { "nullValue", BsonNull.Value },
        };

        // SUT
        await env.Service.SaveEventMetricAsync(Project01, User01, EventType01, EventScope01, argumentsWithNames);

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            EventMetrics = new MemoryRepository<EventMetric>(
                [
                    new EventMetric
                    {
                        Id = "id01",
                        EventType = "firstEvent",
                        Payload = [],
                        ProjectId = Project01,
                        Scope = EventScope01,
                        TimeStamp = DateTime.UtcNow.AddHours(-4),
                        UserId = User01,
                    },
                    new EventMetric
                    {
                        Id = "id02",
                        EventType = "secondEvent",
                        Payload = [],
                        ProjectId = Project01,
                        Scope = EventScope01,
                        TimeStamp = DateTime.UtcNow.AddHours(-3),
                        UserId = User01,
                    },
                    new EventMetric
                    {
                        Id = "id03",
                        EventType = "thirdEvent",
                        Payload = [],
                        Scope = EventScope01,
                        TimeStamp = DateTime.UtcNow.AddHours(-2),
                    },
                    new EventMetric
                    {
                        Id = "id04",
                        EventType = "fourthEvent",
                        Payload = [],
                        ProjectId = Project01,
                        Scope = EventScope01,
                        TimeStamp = DateTime.UtcNow.AddHours(-1),
                    },
                ]
            );
            Service = new EventMetricService(EventMetrics);
        }

        public IEqualityComparer<Dictionary<string, BsonValue>> PayloadEqualityComparer { get; } =
            new DictionaryComparer<string, BsonValue>();
        public IMongoIndexManager<EventMetric> EventMetricIndexManager { get; } =
            Substitute.For<IMongoIndexManager<EventMetric>>();
        public IRepository<EventMetric> EventMetrics { get; }
        public IEventMetricService Service { get; }
    }
}
