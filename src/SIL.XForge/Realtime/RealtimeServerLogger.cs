using System;
using Microsoft.Extensions.Logging;

namespace SIL.XForge.Realtime
{
    /// <summary>
    /// This decorator class is used to fix log messages that are incorrectly treated as errors by NodeServices.
    /// </summary>
    public class RealtimeServerLogger : ILogger
    {
        private readonly ILogger _logger;

        public RealtimeServerLogger(ILogger logger)
        {
            _logger = logger;
        }

        public IDisposable BeginScope<TState>(TState state)
        {
            return _logger.BeginScope(state);
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return _logger.IsEnabled(logLevel);
        }

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception exception,
            Func<TState, Exception, string> formatter
        )
        {
            if (logLevel == LogLevel.Error && exception == null)
            {
                string message = formatter(state, exception);
                if (message == "For help, see: https://nodejs.org/en/docs/inspector") logLevel = LogLevel.Warning;
            }
            _logger.Log (logLevel, eventId, state, exception, formatter);
        }
    }
}
