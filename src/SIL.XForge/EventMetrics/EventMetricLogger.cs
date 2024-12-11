using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Castle.DynamicProxy;
using Microsoft.Extensions.Logging;
using MongoDB.Bson;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using SIL.XForge.DataAccess;

namespace SIL.XForge.EventMetrics;

/// <summary>
/// The event metric logger interceptor. This utilizes the Aspect-Oriented Programming pattern.
/// </summary>
/// <param name="eventMetrics">The event metrics repository.</param>
/// <remarks>
/// <para>
/// This interceptor can be added to interfaces or classes via <c>[Intercept(typeof(EventMetricLogger))]</c>.
/// </para>
/// <para>
/// Any methods you want logged must have the <c>[LogEventMetric]</c> attribute. After doing that, you need to register the interceptor:
/// </para>
/// <code>containerBuilder.RegisterEventMetrics&lt;IMyService, MyService&gt;();</code>
/// <para>Or if your class does not have an interface:</para>
/// <code>containerBuilder.RegisterEventMetrics&lt;MyService&gt;();</code>
/// <para>See https://autofac.readthedocs.io/en/latest/advanced/interceptors.html for information on interceptors.</para>
/// </remarks>
/// <example>
/// <code>
/// [Intercept(typeof(EventMetricLogger))]
/// public interface IMyService
/// {
///     [LogEventMetric(EventScope.Settings)]
///     void ThisMethodWillBeLogged();
///
///     void ThisMethodWillNot();
///
///     [LogEventMetric(EventScope.Settings)]
///     void ThisMethodUsesDefaultParameterNames(string userId, string projectId);
///
///     [LogEventMetric(EventScope.Settings, nameof(curUserId), nameof(targetProjectId))]
///     void ThisMethodUsesDifferentParameterNames(string curUserId, string targetProjectId);
///
///     [LogEventMetric(EventScope.Sync, userId: "syncConfig.UserId", projectId: "syncConfig.ProjectId")]
///     void ThisMethodUsesAnObject(SyncConfig syncConfiguration);
/// }
/// </code>
/// </example>
public class EventMetricLogger(IRepository<EventMetric> eventMetrics, ILogger<EventMetric> logger) : IInterceptor
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
            // Run as a separate task so we do not slow down the method execution
            var task = Task.Run(async () =>
            {
                string methodName = invocation.Method.Name;
                try
                {
                    // Get parameter names
                    List<string> parameterNames = invocation.Method.GetParameters().Select(p => p.Name).ToList();

                    // Combine names with values
                    Dictionary<string, object> argumentsWithNames = parameterNames
                        .Zip(invocation.Arguments, (name, value) => new KeyValuePair<string, object>(name, value))
                        .ToDictionary();

                    // Process these for the payload
                    var payload = new Dictionary<string, BsonValue>();
                    foreach (var kvp in argumentsWithNames)
                    {
                        payload[kvp.Key] = kvp.Value switch
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
                            null => BsonNull.Value,
                            _
                                => BsonValue.Create(
                                    JsonConvert.DeserializeObject<Dictionary<string, object>>(
                                        JsonConvert.SerializeObject(kvp.Value)
                                    )
                                ),
                        };
                    }

                    // Get the user identifier
                    string? userId = null;
                    if (
                        payload.TryGetValue(logEventMetricAttribute.UserId, out BsonValue userBsonValue)
                        && userBsonValue is BsonString userBsonString
                    )
                    {
                        // Method parameter is a simple string
                        userId = userBsonString.Value;
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
                        payload.TryGetValue(logEventMetricAttribute.ProjectId, out BsonValue projectBsonValue)
                        && projectBsonValue is BsonString projectBsonString
                    )
                    {
                        // Method parameter is a simple string
                        projectId = projectBsonString.Value;
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

                    // Write the event metric
                    await eventMetrics.InsertAsync(
                        new EventMetric
                        {
                            Id = ObjectId.GenerateNewId().ToString(),
                            EventType = methodName,
                            Payload = payload,
                            ProjectId = projectId,
                            Scope = logEventMetricAttribute.Scope,
                            UserId = userId,
                        }
                    );
                }
                catch (Exception e)
                {
                    // Just log any errors
                    logger.LogError(e, "Error logging event metric for {methodName}", methodName);
                }
            });

            // Notify observers of the task
            TaskStarted?.Invoke(task);
        }
        else
        {
            // Notify observers of the task of immediate completion
            TaskStarted?.Invoke(Task.CompletedTask);
        }

        // Invoke the method
        invocation.Proceed();
    }

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
