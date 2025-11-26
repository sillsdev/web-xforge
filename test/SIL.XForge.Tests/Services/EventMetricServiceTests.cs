using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using MongoDB.Bson;
using MongoDB.Driver;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NSubstitute;
using NUnit.Framework;
using SIL.Linq;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

[TestFixture]
public class EventMetricServiceTests
{
    private const EventScope EventScope01 = EventScope.Settings;
    private const EventScope EventScope02 = EventScope.Drafting;
    private const string EventType01 = "myFunctionName";
    private const string Project01 = "project01";
    private const string User01 = "user01";

    [Test]
    public void CreateEventMetricsIndexes_Success()
    {
        var env = new TestEnvironment();

        // SUT
        DataAccessServiceCollectionExtensions.CreateEventMetricsIndexes(env.EventMetricIndexManager);
        env.EventMetricIndexManager.ReceivedWithAnyArgs()
            .CreateMany(Arg.Any<IEnumerable<CreateIndexModel<EventMetric>>>());
    }

    [Test]
    public async Task GetEventMetricsAsync_DoNotGetNullProjectIds()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        QueryResults<EventMetric> actual = await env.Service.GetEventMetricsAsync(
            projectId: null,
            scopes: null,
            eventTypes: null,
            pageIndex: 0,
            pageSize: 10
        );

        // When no project is specified, only return events that have a project ID (excludes null project IDs)
        Assert.AreEqual(3, actual.Results.Count());
        Assert.AreEqual(3, actual.UnpagedCount);
    }

    [Test]
    public async Task GetEventMetricsAsync_FilterByEventType()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        QueryResults<EventMetric> actual = await env.Service.GetEventMetricsAsync(
            Project01,
            scopes: null,
            eventTypes: [EventType01],
            pageIndex: 0,
            pageSize: 10
        );

        // Skip the one event metric without a project identifier
        Assert.AreEqual(2, actual.Results.Count());
        Assert.AreEqual(2, actual.UnpagedCount);
    }

    [Test]
    public async Task GetEventMetricsAsync_FilterByScope()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        QueryResults<EventMetric> actual = await env.Service.GetEventMetricsAsync(
            Project01,
            scopes: [EventScope01],
            eventTypes: null,
            pageIndex: 0,
            pageSize: 10
        );

        // Skip the one event metric without a project identifier
        Assert.AreEqual(2, actual.Results.Count());
        Assert.AreEqual(2, actual.UnpagedCount);
    }

    [Test]
    public async Task GetEventMetricsAsync_FilterByScopeAndEventType()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        QueryResults<EventMetric> actual = await env.Service.GetEventMetricsAsync(
            Project01,
            scopes: [EventScope01],
            eventTypes: [EventType01],
            pageIndex: 0,
            pageSize: 10
        );

        // Skip the one event metric without a project identifier
        Assert.AreEqual(1, actual.Results.Count());
        Assert.AreEqual(1, actual.UnpagedCount);
    }

    [Test]
    public async Task GetEventMetricsAsync_GetAllForProject()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        QueryResults<EventMetric> actual = await env.Service.GetEventMetricsAsync(
            Project01,
            scopes: null,
            eventTypes: null
        );

        // Skip the one event metric without a project identifier
        Assert.AreEqual(3, actual.Results.Count());
        Assert.AreEqual(3, actual.UnpagedCount);
    }

    [Test]
    public async Task GetEventMetricsAsync_SupportsPagination()
    {
        var env = new TestEnvironment();
        Assert.AreEqual(4, env.EventMetrics.Query().Count());

        // SUT
        QueryResults<EventMetric> actual = await env.Service.GetEventMetricsAsync(
            Project01,
            scopes: null,
            eventTypes: null,
            pageIndex: 1,
            pageSize: 2
        );

        // The first page has 2 event metrics, the second page just 1 event metric
        Assert.AreEqual(1, actual.Results.Count());
        Assert.AreEqual(3, actual.UnpagedCount);
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
        Assert.AreEqual(BsonNull.Value, eventMetric.Result);
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
        const string result = "buildId";
        BsonString expectedResult = BsonString.Create(result);

        // SUT
        await env.Service.SaveEventMetricAsync(
            Project01,
            User01,
            EventType01,
            EventScope01,
            argumentsWithNames,
            result
        );

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.AreEqual(expectedResult, eventMetric.Result);
    }

    [Test]
    public async Task SaveEventMetricAsync_ComplexObjectAndThrowsException()
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
        BsonValue complexObjectBson = BsonValue.Create(
            JsonConvert.DeserializeObject<Dictionary<string, object>>(JsonConvert.SerializeObject(complexObject))
        );
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "complexObject", complexObject },
        };
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "complexObject", complexObjectBson },
        };
        TimeSpan expectedExecutionTime = new TimeSpan(0, 0, 0, 1, 2, 3);
        var exception = new InvalidOperationException("A test error occurred");
        string expectedException = exception.ToString();

        // SUT
        await env.Service.SaveEventMetricAsync(
            Project01,
            User01,
            EventType01,
            EventScope01,
            argumentsWithNames,
            complexObject,
            expectedExecutionTime,
            exception
        );

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.AreEqual(complexObjectBson, eventMetric.Result);
        Assert.AreEqual(expectedException, eventMetric.Exception);
        Assert.AreEqual(expectedExecutionTime, eventMetric.ExecutionTime);
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
        Uri uri = new Uri("https://example.com", UriKind.Absolute);
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
            { "uri", uri },
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
            { "uri", BsonValue.Create(uri.ToString()) },
            { "nullValue", BsonNull.Value },
        };
        const bool result = true;
        BsonBoolean expectedResult = BsonBoolean.Create(result);

        // SUT
        await env.Service.SaveEventMetricAsync(
            Project01,
            User01,
            EventType01,
            EventScope01,
            argumentsWithNames,
            result
        );

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.AreEqual(EventScope01, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(EventType01, eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.AreEqual(expectedResult, eventMetric.Result);
    }

    [Test]
    public async Task SaveEventMetricAsync_DoNotSaveCancellationToken()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "sfProjectId", Project01 },
            { "curUserId", User01 },
            { "token", CancellationToken.None },
        };
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "sfProjectId", BsonValue.Create(Project01) },
            { "curUserId", BsonValue.Create(User01) },
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
        Assert.AreEqual(BsonNull.Value, eventMetric.Result);
    }

    [Test]
    public async Task SaveEventMetricAsync_ArraysOfObjects()
    {
        var env = new TestEnvironment();
        var objectValue = new TestClass { Records = [new TestRecord { ProjectId = Project01, UserId = User01 }] };
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object> { { "myObject", objectValue } };
        string expectedJson = JsonConvert.SerializeObject(objectValue);
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "myObject", BsonDocument.Parse(expectedJson) },
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
        string actualJson = eventMetric.Payload["myObject"].ToJson().Replace(" ", string.Empty);
        Assert.AreEqual(expectedJson, actualJson);
        Assert.AreEqual(BsonNull.Value, eventMetric.Result);
    }

    [Test]
    public async Task SaveEventMetricAsync_ActivityTags()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };

        // Set up Activity tags
        using var activity = new Activity("test");
        activity.AddTag(TestEnvironment.SomeActivityTagKey, "abc-123-def-456");
        activity.AddTag("someOtherThing", "xyz-789");
        activity.AddTag("someNumber", 42);
        activity.Start();

        // SUT
        await env.Service.SaveEventMetricAsync(Project01, User01, EventType01, EventScope01, argumentsWithNames);

        activity.Stop();

        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.IsNotNull(eventMetric.Tags);
        Assert.AreEqual(3, eventMetric.Tags.Count);
        Assert.AreEqual("abc-123-def-456", eventMetric.Tags[TestEnvironment.SomeActivityTagKey]?.AsString);
        Assert.AreEqual("xyz-789", eventMetric.Tags["someOtherThing"]?.AsString);
        Assert.AreEqual(42, eventMetric.Tags["someNumber"]?.AsInt64);
    }

    [Test]
    public async Task SaveEventMetricAsync_ActivityTags_FromParentActivity()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object> { { "projectId", Project01 } };

        // Set up parent activity with tags
        using var parentActivity = new Activity("parent");
        parentActivity.AddTag(TestEnvironment.SomeActivityTagKey, "parent-123");
        parentActivity.AddTag("parentTag", "parent-value");
        parentActivity.AddTag("someNumber", 42);
        parentActivity.Start();

        // Create child activity (simulating what EventMetricLogger does)
        using var childActivity = new Activity("child");
        childActivity.AddTag("childTag", "child-value");
        childActivity.AddTag(TestEnvironment.SomeActivityTagKey, "child-override-456"); // Override parent
        childActivity.AddTag("someNumber", 99); // Different than parent value.
        childActivity.Start();

        // SUT - should collect tags from both parent and child
        await env.Service.SaveEventMetricAsync(Project01, User01, EventType01, EventScope01, argumentsWithNames);

        childActivity.Stop();
        parentActivity.Stop();

        // Verify the saved event metric
        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.IsNotNull(eventMetric.Tags);
        Assert.AreEqual(4, eventMetric.Tags.Count);

        // Child tag should be present
        Assert.AreEqual("child-value", eventMetric.Tags["childTag"]?.AsString);

        // Parent tag should be present
        Assert.AreEqual("parent-value", eventMetric.Tags["parentTag"]?.AsString);

        // Child should override parent for same key
        Assert.AreEqual("child-override-456", eventMetric.Tags[TestEnvironment.SomeActivityTagKey]?.AsString);
        Assert.AreEqual(99, eventMetric.Tags["someNumber"]?.AsInt64);
    }

    [Test]
    public async Task SaveEventMetricAsync_ActivityTags_VariousTypes()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object> { { "projectId", Project01 } };

        // Suppose various types of object are added as tags. They should be stored and converted as expected.

        const bool boolean = true;
        DateTime dateAndTime = DateTime.UtcNow;
        const decimal decimalNumber = 12.34M;
        const double doubleFloat = 56.78;
        const int integer = 1234;
        const long longInteger = 5678L;
        const float singleFloat = 90.12F;
        string[] stringArray = ["string1", "string2"];
        Uri uri = new Uri("https://example.com", UriKind.Absolute);

        TestClass someObject = new() { Records = [new TestRecord { ProjectId = Project01, UserId = User01 }] };
        string someObjectAsJson = JsonConvert.SerializeObject(someObject);

        JObject someJObject = JObject.FromObject(someObject);
        string someJObjectAsJson = JsonConvert.SerializeObject(someJObject);

        string serializedJsonInput = someObjectAsJson.ToString();
        string serializedJsonOutput = serializedJsonInput.ToString();

        Dictionary<string, object> items = new Dictionary<string, object>
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
            { "uri", uri },
            { "nullValue", null },
            { "someObject", someObject },
            { "someJObject", someJObject },
            { "someJsonString", serializedJsonInput },
        };
        Dictionary<string, BsonValue> expectBsonItems = new Dictionary<string, BsonValue>
        {
            { "projectId", BsonValue.Create(Project01) },
            { "userId", BsonValue.Create(User01) },
            { "boolean", BsonBoolean.Create(boolean) },
            { "dateAndTime", BsonDateTime.Create(dateAndTime) },
            { "decimalNumber", BsonString.Create(decimalNumber.ToString(CultureInfo.InvariantCulture)) }, // Decimals are stored as strings in JSON
            { "doubleFloat", BsonDouble.Create(doubleFloat) },
            { "integer", BsonInt64.Create(integer) }, // Note it is marked as 64-bit
            { "longInteger", BsonInt64.Create(longInteger) },
            { "singleFloat", BsonDouble.Create(singleFloat) },
            { "stringArray", BsonArray.Create(stringArray) },
            { "uri", BsonValue.Create(uri.ToString()) },
            { "nullValue", BsonNull.Value },
            { "someObject", BsonDocument.Parse(someObjectAsJson) },
            { "someJObject", BsonDocument.Parse(someJObjectAsJson) },
            { "someJsonString", BsonString.Create(serializedJsonOutput) },
        };

        using var parentActivity = new Activity("parent");
        items.ForEach(kvp => parentActivity.AddTag(kvp.Key, kvp.Value));
        parentActivity.Start();
        using var childActivity = new Activity("child");
        childActivity.Start();

        // SUT - Should store tag objects, to be later fetched
        await env.Service.SaveEventMetricAsync(Project01, User01, EventType01, EventScope01, argumentsWithNames);
        childActivity.Stop();
        parentActivity.Stop();

        EventMetric eventMetric = env.EventMetrics.Query().OrderByDescending(e => e.TimeStamp).First();
        Assert.IsNotNull(eventMetric.Tags);
        Assert.AreEqual(expectBsonItems.Count, eventMetric.Tags.Count);
        expectBsonItems.ForEach(kvp => Assert.AreEqual(kvp.Value, eventMetric.Tags[kvp.Key]));
    }

    private class TestEnvironment
    {
        /// <summary>Example name of an activity tag key.</summary>
        public static readonly string SomeActivityTagKey = "someImportantIdKey";

        public TestEnvironment()
        {
            EventMetrics = new MemoryRepository<EventMetric>(
                [
                    new EventMetric
                    {
                        Id = "id01",
                        EventType = EventType01,
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
                        EventType = EventType01,
                        Payload = [],
                        ProjectId = Project01,
                        Scope = EventScope02,
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

    public class TestClass
    {
        public HashSet<TestRecord> Records = [];
    }

    public record TestRecord
    {
        public string ProjectId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
    }
}
