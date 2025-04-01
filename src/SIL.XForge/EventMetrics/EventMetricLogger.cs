using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Threading.Tasks;
using Castle.DynamicProxy;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using SIL.XForge.Services;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// The event metric logger interceptor. This utilizes the Aspect-Oriented Programming pattern.
/// </summary>
/// <param name="eventMetricService">The event metric service.</param>
/// <param name="logger">The application log (to log errors).</param>
/// <remarks>
/// <para>
/// This interceptor can be added to interfaces or classes via <c>[Intercept(typeof(EventMetricLogger))]</c>.
/// </para>
/// <para>
/// Any methods you want logged must have the <c>[LogEventMetric]</c> attribute.
/// After doing that, you need to register the interceptor:
/// </para>
/// <code>containerBuilder.RegisterEventMetrics&lt;IMyService, MyService&gt;();</code>
/// <para>Or if your class does not have an interface:</para>
/// <code>containerBuilder.RegisterEventMetrics&lt;MyService&gt;();</code>
/// <para>
/// See https://github.com/sillsdev/web-xforge/wiki/Event-Metric-Logging for examples on how to use this class.
/// </para>
/// <para>
/// See https://autofac.readthedocs.io/en/latest/advanced/interceptors.html for information on interceptors.
/// </para>
/// </remarks>
public class EventMetricLogger(IEventMetricService eventMetricService, ILogger<EventMetric> logger) : IInterceptor
{
    /// <summary>
    /// A task was started by the Interceptor.
    /// </summary>
    /// <remarks>
    /// This is for use in unit tests to wait for the intercept task to complete.
    /// </remarks>
    internal event Action<Task>? TaskStarted;

    /// <summary>
    /// Intercept the member execution.
    /// </summary>
    /// <param name="invocation">The method invocation.</param>
    public void Intercept(IInvocation invocation)
    {
        // We only log event metrics for methods with the LogEventMetric attribute
        if (
            invocation.Method.GetCustomAttributes(typeof(LogEventMetricAttribute), inherit: true).FirstOrDefault()
            is LogEventMetricAttribute logEventMetricAttribute
        )
        {
            // Invoke the method, then record its event metrics
            Task task;
            try
            {
                invocation.Proceed();
                if (invocation.ReturnValue is Task methodTask)
                {
                    // Save the event metric after the task has run
                    task = methodTask.ContinueWith(t => SaveEventMetricAsync(t.Exception));
                }
                else
                {
                    // Save the event metric in another thread after the method has executed
                    task = Task.Run(() => SaveEventMetricAsync());
                }
            }
            catch (Exception e)
            {
                // Save the error in the event metric, as the Proceed() will have faulted
                task = Task.Run(() => SaveEventMetricAsync(e));

                // Notify observers of the task of immediate completion
                TaskStarted?.Invoke(task);

                // Rethrow the exception
                throw;
            }

            // Notify observers of the task
            TaskStarted?.Invoke(task);
            return;

            // Run as a separate task so we do not slow down the method execution
            // Unless we want the return value, in which case we will not write the metric until the method returns
            async Task SaveEventMetricAsync(Exception? exception = null)
            {
                string methodName = invocation.Method.Name;
                try
                {
                    // Get parameter names
                    List<string> parameterNames = [.. invocation.Method.GetParameters().Select(p => p.Name)];

                    // Combine names with values
                    Dictionary<string, object> argumentsWithNames = parameterNames
                        .Zip(invocation.Arguments, (name, value) => new KeyValuePair<string, object>(name, value))
                        .ToDictionary();

                    // Get the user identifier
                    string? userId = null;
                    if (
                        argumentsWithNames.TryGetValue(logEventMetricAttribute.UserId, out object userIdValue)
                        && userIdValue is string userIdString
                    )
                    {
                        // Method parameter is a simple string
                        userId = userIdString;
                    }
                    else if (
                        argumentsWithNames.TryGetValue(logEventMetricAttribute.UserId.Split('.')[0], out object value)
                    )
                    {
                        // Method parameter is a property in an object
                        userId = GetProperty(value, logEventMetricAttribute.UserId);
                    }

                    // Get the project identifier
                    string? projectId = null;
                    if (
                        argumentsWithNames.TryGetValue(logEventMetricAttribute.ProjectId, out object projectIdValue)
                        && projectIdValue is string projectIdString
                    )
                    {
                        // Method parameter is a simple string
                        projectId = projectIdString;
                    }
                    else if (
                        argumentsWithNames.TryGetValue(
                            logEventMetricAttribute.ProjectId.Split('.')[0],
                            out object value
                        )
                    )
                    {
                        // Method parameter is a property in an object
                        projectId = GetProperty(value, logEventMetricAttribute.ProjectId);
                    }

                    // Capture the return value, if we are required to
                    object result = null;
                    if (logEventMetricAttribute.CaptureReturnValue)
                    {
                        if (invocation.ReturnValue is Task returnTask)
                        {
                            // Method is asynchronous
                            var taskType = returnTask.GetType();
                            if (taskType.IsGenericType)
                            {
                                // The only async Tasks to return a value we want are generics
                                try
                                {
                                    result = taskType.GetProperty("Result")!.GetValue(returnTask);
                                }
                                catch (TargetInvocationException)
                                {
                                    // This exception will have been captured
                                }
                            }
                        }
                        else
                        {
                            // Method is synchronous
                            result = invocation.ReturnValue;
                        }
                    }

                    // Save the event metric
                    await eventMetricService.SaveEventMetricAsync(
                        projectId,
                        userId,
                        eventType: methodName,
                        logEventMetricAttribute.Scope,
                        argumentsWithNames,
                        result,
                        exception
                    );
                }
                catch (Exception e)
                {
                    // Just log any errors rather than throwing
                    logger.LogError(e, "Error logging event metric for {methodName}", methodName);
                }
            }
        }

        // Notify observers of the task of immediate completion
        TaskStarted?.Invoke(Task.CompletedTask);

        // Invoke the method in the intercept
        invocation.Proceed();
    }

    /// <summary>
    /// Gets a property from an object by converting that object to JSON.
    /// </summary>
    /// <param name="value">The object to get the property from.</param>
    /// <param name="property">The name of the property in "subObject.subSubObject.propertyName" format.</param>
    /// <returns>The value of the property.</returns>
    private static string? GetProperty(object value, string property)
    {
        string[] userIdParts = property.Split('.', StringSplitOptions.RemoveEmptyEntries);
        JToken? token = JObject.FromObject(value);
        foreach (string propertyName in userIdParts[1..])
        {
            if (token is null)
            {
                break;
            }

            token = token[propertyName];
        }

        return token?.Value<string>();
    }
}
