using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Autofac;
using Autofac.Extensions.DependencyInjection;
using Autofac.Extras.DynamicProxy;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.EventMetrics;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

[TestFixture]
public class EventMetricLoggerTests
{
    private const string Project01 = "project01";
    private const string User01 = "user01";

    [Test]
    public async Task EventMetrics_ErrorsAreLogged()
    {
        var env = new TestEnvironment();
        var ex = new ArgumentException();
        env.EventMetrics.SaveEventMetricAsync(
                projectId: null,
                userId: null,
                eventType: nameof(TestClass.NoArguments),
                EventScope.None,
                Arg.Any<Dictionary<string, object>>(),
                result: Arg.Any<object>()
            )
            .ThrowsAsync(ex);

        // SUT
        bool actual = env.TestClass.NoArguments();
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the log
        env.MockLogger.AssertEventCount(e => e.LogLevel == LogLevel.Error && e.Exception == ex, 1);
    }

    [Test]
    public void EventMetrics_NoTaskStartedEventHandler()
    {
        var env = new TestEnvironment(new TestEnvironmentOptions { UseTaskCompletionSource = false });

        // SUT 1
        bool actual = env.TestClass.NoArguments();
        Assert.IsTrue(actual);

        // SUT 2
        actual = env.TestClass.NoLogEventMetric();
        Assert.IsTrue(actual);
    }

    [Test]
    public async Task NoArguments_Success()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.TestClass.NoArguments();
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric service and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                projectId: null,
                userId: null,
                eventType: nameof(TestClass.NoArguments),
                eventScope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a => a.Count == 0),
                result: Arg.Any<object>()
            );
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

        // Verify the event metric service and log
        await env
            .EventMetrics.DidNotReceiveWithAnyArgs()
            .SaveEventMetricAsync(
                projectId: null,
                userId: null,
                eventType: nameof(TestClass.NoArguments),
                eventScope: EventScope.None,
                argumentsWithNames: Arg.Any<Dictionary<string, object>>(),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ProjectIdAndUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };

        // SUT
        bool actual = env.TestClass.ProjectIdAndUserId(Project01, User01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ProjectIdAndUserId),
                eventScope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ProjectIdAndNonStandardUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "curUserId", User01 },
        };

        // SUT
        bool actual = env.TestClass.ProjectIdAndNonStandardUserId(User01, Project01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ProjectIdAndNonStandardUserId),
                eventScope: EventScope.Sync,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task NonStandardProjectIdAndUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "targetProjectId", Project01 },
            { "userId", User01 },
        };

        // SUT
        bool actual = env.TestClass.NonStandardProjectIdAndUserId(User01, Project01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.NonStandardProjectIdAndUserId),
                eventScope: EventScope.Drafting,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task NonStandardProjectIdAndNonStandardUserId_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "targetProjectId", Project01 },
            { "curUserId", User01 },
        };

        // SUT
        bool actual = env.TestClass.NonStandardProjectIdAndNonStandardUserId(User01, Project01);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.NonStandardProjectIdAndNonStandardUserId),
                eventScope: EventScope.Checking,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ObjectAsArgument_Success()
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

        // SUT
        bool actual = env.TestClass.ObjectAsArgument(complexObject);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ObjectAsArgument),
                eventScope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
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
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ComplexArguments),
                eventScope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task MisconfiguredProperty_Success()
    {
        var env = new TestEnvironment();
        var simpleObject = new TestSimpleObject { ProjectId = Project01, UserId = User01 };
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "simpleObject", simpleObject },
        };

        // SUT
        bool actual = env.TestClass.MisconfiguredProperty(simpleObject);
        Assert.IsTrue(actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                projectId: null,
                userId: null,
                eventType: nameof(TestClass.MisconfiguredProperty),
                eventScope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ReturnString_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };
        const string expected = Project01 + User01;

        // SUT
        string actual = env.TestClass.ReturnString(Project01, User01);
        Assert.AreEqual(expected, actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ReturnString),
                eventScope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: expected
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ReturnTaskAsync_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };

        // SUT
        await env.TestClass.ReturnTaskAsync(Project01, User01);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ReturnTaskAsync),
                eventScope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ReturnTaskGenericAsync_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };
        const string expected = Project01 + User01;

        // SUT
        string actual = await env.TestClass.ReturnTaskGenericAsync(Project01, User01);
        Assert.AreEqual(expected, actual);
        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ReturnTaskGenericAsync),
                eventScope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: expected
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    private class TestEnvironmentOptions
    {
        public bool UseTaskCompletionSource { get; init; } = true;
    }

    private class TestEnvironment
    {
        public TestEnvironment(TestEnvironmentOptions? options = null)
        {
            options ??= new TestEnvironmentOptions();
            var services = new ServiceCollection();
            services.AddSingleton<TestClass>();
            services.AddSingleton<EventMetricLogger>();
            var containerBuilder = new ContainerBuilder();
            containerBuilder.Populate(services);
            containerBuilder.RegisterEventMetrics();
            containerBuilder.RegisterEventMetrics<TestClass>();
            containerBuilder.RegisterInstance(EventMetrics);
            containerBuilder.RegisterInstance<ILogger<EventMetric>>(MockLogger);
            var container = containerBuilder.Build();
            var eventMetricLogger = container.Resolve<EventMetricLogger>();
            if (options.UseTaskCompletionSource)
            {
                eventMetricLogger.TaskStarted += task =>
                    task.ContinueWith(t =>
                    {
                        if (t.IsFaulted)
                            TaskCompletionSource.SetException(t.Exception!);
                        else
                            TaskCompletionSource.SetResult();
                    });
            }

            TestClass = container.Resolve<TestClass>();
        }

        public IEqualityComparer<Dictionary<string, object>> PayloadEqualityComparer { get; } =
            new DictionaryComparer<string, object>();
        public IEventMetricService EventMetrics { get; } = Substitute.For<IEventMetricService>();
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
        public virtual bool ObjectAsArgument(TestComplexObject complexObject) =>
            !string.IsNullOrWhiteSpace(complexObject.ProjectId) && !string.IsNullOrWhiteSpace(complexObject.UserId);

        [LogEventMetric(EventScope.None)]
        public virtual bool ComplexArguments(
            string projectId,
            string userId,
            bool boolean,
            DateTime dateAndTime,
            decimal decimalNumber,
            double? doubleFloat,
            int integer,
            long longInteger,
            float? singleFloat,
            string[] stringArray,
            string? nullValue
        ) =>
            !string.IsNullOrWhiteSpace(projectId)
            && !string.IsNullOrWhiteSpace(userId)
            && boolean
            && dateAndTime != DateTime.MinValue
            && decimalNumber != 0M
            && doubleFloat is not null
            && integer != 0
            && longInteger != 0L
            && singleFloat is not null
            && stringArray.Length > 0
            && nullValue is null;

        [LogEventMetric(EventScope.None, userId: "simpleObject.User.Id", projectId: "simpleObject.Project.Id")]
        public virtual bool MisconfiguredProperty(TestSimpleObject simpleObject) =>
            !string.IsNullOrWhiteSpace(simpleObject.ProjectId) && !string.IsNullOrWhiteSpace(simpleObject.UserId);

        [LogEventMetric(EventScope.Settings, captureReturnValue: true)]
        public virtual string ReturnString(string projectId, string userId) => projectId + userId;

        [LogEventMetric(EventScope.Settings, captureReturnValue: true)]
        public virtual Task ReturnTaskAsync(string projectId, string userId) =>
            Task.FromResult(!string.IsNullOrWhiteSpace(projectId) && !string.IsNullOrWhiteSpace(userId));

        [LogEventMetric(EventScope.Settings, captureReturnValue: true)]
        public virtual Task<string> ReturnTaskGenericAsync(string projectId, string userId) =>
            Task.FromResult(projectId + userId);
    }
}
