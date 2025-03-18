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
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
        var env = new TestEnvironment(useTaskCompletionSource: false);

        // SUT 1
        bool actual = env.TestClass.NoArguments();
        Assert.IsTrue(actual);

        // SUT 2
        actual = env.TestClass.NoLogEventMetric();
        Assert.IsTrue(actual);

        // SUT 4
        Assert.Throws<ArgumentException>(() => env.TestClass.ThrowNonAsyncException(Project01, User01));
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
                scope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a => a.Count == 0),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.None,
                argumentsWithNames: Arg.Any<Dictionary<string, object>>(),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Sync,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Drafting,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Checking,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.None,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: expected,
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
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
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: expected,
                exception: Arg.Any<Exception>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ThrowNonAsyncException_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };
        const string exceptionParamName = "userId";

        // SUT
        try
        {
            env.TestClass.ThrowNonAsyncException(Project01, User01);
        }
        catch (ArgumentException e)
        {
            Assert.AreEqual(exceptionParamName, e.ParamName);
        }

        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ThrowNonAsyncException),
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Is<ArgumentException>(e => e.ParamName == exceptionParamName)
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ThrowExceptionAsync_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };
        const string exceptionParamName = "userId";

        // SUT
        try
        {
            await env.TestClass.ThrowExceptionAsync(Project01, User01);
        }
        catch (ArgumentException e)
        {
            Assert.AreEqual(exceptionParamName, e.ParamName);
        }

        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ThrowExceptionAsync),
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    [Test]
    public async Task ThrowExceptionWithReturnValueAsync_Success()
    {
        var env = new TestEnvironment();
        Dictionary<string, object> argumentsWithNames = new Dictionary<string, object>
        {
            { "projectId", Project01 },
            { "userId", User01 },
        };
        const string exceptionParamName = "userId";

        // SUT
        try
        {
            await env.TestClass.ThrowExceptionWithReturnValueAsync(Project01, User01);
        }
        catch (ArgumentException e)
        {
            Assert.AreEqual(exceptionParamName, e.ParamName);
        }

        await env.TaskCompletionSource.Task;

        // Verify the event metric and log
        await env
            .EventMetrics.Received()
            .SaveEventMetricAsync(
                Project01,
                User01,
                eventType: nameof(TestClass.ThrowExceptionWithReturnValueAsync),
                scope: EventScope.Settings,
                argumentsWithNames: Arg.Is<Dictionary<string, object>>(a =>
                    env.PayloadEqualityComparer.Equals(a, argumentsWithNames)
                ),
                result: Arg.Any<object>(),
                exception: Arg.Any<Exception>()
            );
        Assert.Zero(env.MockLogger.LogEvents.Count);
    }

    private class TestEnvironment
    {
        public TestEnvironment(bool useTaskCompletionSource = true)
        {
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
            if (useTaskCompletionSource)
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

        [LogEventMetric(EventScope.Settings)]
        public virtual void ThrowNonAsyncException(string projectId, string userId) =>
            throw new ArgumentException(projectId + userId, nameof(userId));

        [LogEventMetric(EventScope.Settings)]
        public virtual Task ThrowExceptionAsync(string projectId, string userId) =>
            Task.FromException(new ArgumentException(projectId + userId, nameof(userId)));

        [LogEventMetric(EventScope.Settings, captureReturnValue: true)]
        public virtual Task<string> ThrowExceptionWithReturnValueAsync(string projectId, string userId) =>
            Task.FromException<string>(new ArgumentException(projectId + userId, nameof(userId)));
    }
}
