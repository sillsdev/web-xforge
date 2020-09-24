using System.Collections.Generic;
using Microsoft.Extensions.Logging;
using System;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Mock for ILogger since it's difficult to mock with NSubstitute.
    /// </summary>
    public class MockLogger<T> : ILogger<T>
    {
        /// <summary>
        /// Stores logged messages.
        /// </summary>
        public readonly List<string> Messages = new List<string>();

        public MockLogger()
        {

        }

        public IDisposable BeginScope<TState>(TState state)
        {
            throw new NotImplementedException();
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            throw new NotImplementedException();
        }

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception,
            Func<TState, Exception, string> formatter)
        {
            Messages.Add(((object)state).ToString());
        }
    }
}
