using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading.Tasks;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using Autofac.Extras.DynamicProxy;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using MongoDB.Driver;
using Newtonsoft.Json;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.EventMetrics;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

[TestFixture]
public class EventMetricLoggerTests
{
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
    public async Task EventMetrics_ErrorsAreLogged()
    {
        var env = new TestEnvironment(useMemoryRepository: false);
        var ex = new ArgumentException();
        env.EventMetrics.InsertAsync(Arg.Any<EventMetric>()).ThrowsAsync(ex);

        // SUT
        bool actual = env.TestClass.NoArguments();
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;


        // Verify the event metric and log
        Assert.Zero(env.EventMetrics.Query().Count());
        env.MockLogger.AssertEventCount(e => e.LogLevel == LogLevel.Error && e.Exception == ex, 1);
    }

    [Test]
    public async Task NoArguments_Success()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.TestClass.NoArguments();
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.None, eventMetric.Scope);
        Assert.AreEqual(nameof(TestClass.NoArguments), eventMetric.EventType);
        Assert.IsEmpty(eventMetric.Payload);
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task NoLogEventMetric_Success()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.TestClass.NoLogEventMetric();
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;
        Assert.Zero(env.EventMetrics.Query().Count());
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ProjectIdAndUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "projectId", BsonValue.Create(Project01) },
            { "userId", BsonValue.Create(User01) },
        };

        // SUT
        bool actual = env.TestClass.ProjectIdAndUserId(Project01, User01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.Settings, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(nameof(TestClass.ProjectIdAndUserId), eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ProjectIdAndNonStandardUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "projectId", BsonValue.Create(Project01) },
            { "curUserId", BsonValue.Create(User01) },
        };

        // SUT
        bool actual = env.TestClass.ProjectIdAndNonStandardUserId(User01, Project01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.Sync, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(nameof(TestClass.ProjectIdAndNonStandardUserId), eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task NonStandardProjectIdAndUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "targetProjectId", BsonValue.Create(Project01) },
            { "userId", BsonValue.Create(User01) },
        };

        // SUT
        bool actual = env.TestClass.NonStandardProjectIdAndUserId(User01, Project01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.Drafting, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(nameof(TestClass.NonStandardProjectIdAndUserId), eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task NonStandardProjectIdAndNonStandardUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, BsonValue> expectedPayload = new Dictionary<string, BsonValue>
        {
            { "targetProjectId", BsonValue.Create(Project01) },
            { "curUserId", BsonValue.Create(User01) },
        };

        // SUT
        bool actual = env.TestClass.NonStandardProjectIdAndNonStandardUserId(User01, Project01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.Checking, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(nameof(TestClass.NonStandardProjectIdAndNonStandardUserId), eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ObjectAsArgument_Success()
    {
        var env = new TestEnvironment();
        var complexObject = new ComplexObject
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
        bool actual = env.TestClass.ObjectAsArgument(complexObject);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.None, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(nameof(TestClass.ObjectAsArgument), eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ComplexArguments_Success()
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
        bool actual = env.TestClass.ComplexArguments(
            Project01,
            User01,
            boolean,
            dateAndTime,
            decimalNumber,
            doubleFloat,
            integer,
            longInteger,
            singleFloat,
            stringArray,
            nullValue: null
        );
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        EventMetric eventMetric = env.EventMetrics.Query().Single();
        Assert.AreEqual(EventScope.None, eventMetric.Scope);
        Assert.AreEqual(Project01, eventMetric.ProjectId);
        Assert.AreEqual(User01, eventMetric.UserId);
        Assert.AreEqual(nameof(TestClass.ComplexArguments), eventMetric.EventType);
        Assert.IsTrue(env.PayloadEqualityComparer.Equals(expectedPayload, eventMetric.Payload));
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    private class TestEnvironment
    {
        public TestEnvironment(bool useMemoryRepository = true)
        {
            var services = new ServiceCollection();
            services.AddSingleton<TestClass>();
            services.AddSingleton<EventMetricLogger>();
            var containerBuilder = new ContainerBuilder();
            containerBuilder.Populate(services);
            containerBuilder.RegisterEventMetrics();
            containerBuilder.RegisterEventMetrics<TestClass>();
            EventMetrics = useMemoryRepository
                ? new MemoryRepository<EventMetric>()
                : Substitute.For<IRepository<EventMetric>>();
            containerBuilder.RegisterInstance(EventMetrics);
            containerBuilder.RegisterInstance<ILogger<EventMetric>>(MockLogger);
            var container = containerBuilder.Build();
            var eventMetricLogger = container.Resolve<EventMetricLogger>();
            eventMetricLogger.TaskStarted += task =>
                task.ContinueWith(t =>
                {
                    if (t.IsFaulted)
                        TaskCompletionSource.SetException(t.Exception!);
                    else
                        TaskCompletionSource.SetResult();
                });
            TestClass = container.Resolve<TestClass>();
        }

        public IEqualityComparer<Dictionary<string, BsonValue>> PayloadEqualityComparer { get; } =
            new DictionaryComparer<string, BsonValue>();
        public IMongoIndexManager<EventMetric> EventMetricIndexManager { get; } =
            Substitute.For<IMongoIndexManager<EventMetric>>();
        public IRepository<EventMetric> EventMetrics { get; }
        public MockLogger<EventMetric> MockLogger { get; } = new MockLogger<EventMetric>();
        public TaskCompletionSource TaskCompletionSource { get; } = new TaskCompletionSource();
        public TestClass TestClass { get; }
    }

    /// <summary>
    /// The class that will test the interceptor.
    /// </summary>
    [Intercept(typeof(EventMetricLogger))]
    public class TestClass
    {
        public virtual bool NoLogEventMetric() => true;

        [LogEventMetric(EventScope.None)]
        public virtual bool NoArguments() => true;

        [LogEventMetric(EventScope.Settings)]
        public virtual bool ProjectIdAndUserId(string projectId, string userId) =>
            !string.IsNullOrWhiteSpace(projectId) && !string.IsNullOrWhiteSpace(userId);

        [LogEventMetric(EventScope.Sync, nameof(curUserId))]
        public virtual bool ProjectIdAndNonStandardUserId(string curUserId, string projectId) =>
            !string.IsNullOrWhiteSpace(projectId) && !string.IsNullOrWhiteSpace(curUserId);

        [LogEventMetric(EventScope.Drafting, projectId: nameof(targetProjectId))]
        public virtual bool NonStandardProjectIdAndUserId(string userId, string targetProjectId) =>
            !string.IsNullOrWhiteSpace(targetProjectId) && !string.IsNullOrWhiteSpace(userId);

        [LogEventMetric(EventScope.Checking, nameof(curUserId), nameof(targetProjectId))]
        public virtual bool NonStandardProjectIdAndNonStandardUserId(string curUserId, string targetProjectId) =>
            !string.IsNullOrWhiteSpace(targetProjectId) && !string.IsNullOrWhiteSpace(curUserId);

        [LogEventMetric(EventScope.None, userId: "complexObject.UserId", projectId: "complexObject.ProjectId")]
        public virtual bool ObjectAsArgument(ComplexObject complexObject) =>
            !string.IsNullOrWhiteSpace(complexObject.ProjectId) && !string.IsNullOrWhiteSpace(complexObject.UserId);

        [LogEventMetric(EventScope.None)]
        public virtual bool ComplexArguments(
            string projectId,
            string userId,
            bool boolean,
            DateTime dateAndTime,
            decimal decimalNumber,
            double doubleFloat,
            int integer,
            long longInteger,
            float singleFloat,
            string[] stringArray,
            string? nullValue
        ) =>
            !string.IsNullOrWhiteSpace(projectId)
            && !string.IsNullOrWhiteSpace(userId)
            && boolean
            && dateAndTime != DateTime.MinValue
            && decimalNumber != 0M
            && doubleFloat != 0.0
            && integer != 0
            && longInteger != 0L
            && singleFloat != 0.0F
            && stringArray.Length > 0
            && nullValue is null;
    }

    public class ComplexObject
    {
        // ReSharper disable UnusedAutoPropertyAccessor.Global
        public required bool Boolean { get; init; }
        public required DateTime DateAndTime { get; init; }
        public required decimal DecimalNumber { get; init; }
        public required double DoubleFloat { get; init; }
        public required int Integer { get; init; }
        public required long LongInteger { get; init; }
        public required string ProjectId { get; init; }
        public required float SingleFloat { get; init; }
        public required string UserId { get; init; }
        // ReSharper restore UnusedAutoPropertyAccessor.Global
    }
}
