using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.Logging;
using NUnit.Framework;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// An occurrence of something being logged. For use by unit tests.
/// </summary>
public class LogEvent
{
    public LogLevel LogLevel { get; set; }
    public EventId EventId { get; set; }
    public object State { get; set; }
    public Exception Exception { get; set; }
    public string Message => State.ToString();

    public override string ToString()
    {
        string summary = $"LogEvent {EventId} {LogLevel}: {Message}";
        if (Exception != null)
        {
            summary += $" ({Exception})";
        }
        return summary;
    }
}

/// <summary>
/// Mock for ILogger since it's difficult to mock with NSubstitute. To help with unit tests.
/// </summary>
public class MockLogger<T> : ILogger<T>
{
    /// <summary>
    /// Stores logged events.
    /// </summary>
    public readonly List<LogEvent> LogEvents = new List<LogEvent>();

    public MockLogger() { }

    public IDisposable BeginScope<TState>(TState state) => throw new NotImplementedException();

    public bool IsEnabled(LogLevel logLevel) => throw new NotImplementedException();

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception exception,
        Func<TState, Exception, string> formatter
    ) =>
        LogEvents.Add(
            new LogEvent
            {
                LogLevel = logLevel,
                EventId = eventId,
                State = state,
                Exception = exception
            }
        );

    /// <summary>
    /// Assert that at least one event was logged that matches <param name="predicate"/>.
    /// </summary>
    public void AssertHasEvent(Func<LogEvent, bool> predicate, string explanation = null)
    {
        bool has = LogEvents.Any<LogEvent>(predicate);
        if (!has)
        {
            if (LogEvents.Count == 0)
            {
                Console.WriteLine("Event log is empty.");
            }
            else
            {
                Console.WriteLine("Event log contains:");
                LogEvents.ForEach(Console.WriteLine);
            }
        }
        Assert.That(has, Is.True, explanation);
    }

    /// <summary>
    /// Assert that no event was logged that matches <param name="predicate"/>.
    /// </summary>
    public void AssertNoEvent(Func<LogEvent, bool> predicate, string explanation = null) =>
        AssertEventCount(predicate, 0, explanation);

    /// <summary>
    /// Assert that exactly <param name="expectedCount"/> events were logged that match <param name="predicate"/>.
    /// </summary>
    public void AssertEventCount(Func<LogEvent, bool> predicate, int expectedCount, string explanation = null)
    {
        int actualCount = LogEvents.Count<LogEvent>(predicate);
        if (expectedCount != actualCount)
        {
            if (LogEvents.Count == 0)
            {
                Console.WriteLine("Event log is empty.");
            }
            else
            {
                Console.WriteLine("Event log contains:");
                LogEvents.ForEach(Console.WriteLine);
            }
        }
        Assert.That(actualCount, Is.EqualTo(expectedCount), explanation);
    }
}
