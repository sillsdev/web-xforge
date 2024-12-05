using System;
using System.Linq;
using System.Threading.Tasks;
using Castle.DynamicProxy;
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
///     [LogEventMetric(Scope.Settings)]
///     void ThisMethodWillBeLogged();
///     void ThisMethodWillNot();
/// }
/// </code>
/// </example>
public class EventMetricLogger(IRepository<EventMetric> eventMetrics) : IInterceptor
{
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
            Task.Run(async () =>
            {
                try
                {
                    // TODO: Convert the arguments to a JSON object
                    // TODO: Normalize the arguments and remove any PID
                    await eventMetrics.InsertAsync(
                        new EventMetric
                        {
                            EventType = invocation.Method.Name,
                            Payload = invocation.Arguments,
                            Scope = logEventMetricAttribute.Scope,
                        }
                    );
                }
                catch (Exception)
                {
                    // Ignore any errors
                }
            });
        }

        // Invoke the method
        invocation.Proceed();
    }
}
