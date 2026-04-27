using System.Threading;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Tracks the number of M2M access token requests made to the Auth0 token endpoint.
/// Useful for verifying that excessive token requests are not occurring, particularly in response to 401 errors from
/// Serval.
/// </summary>
public interface IM2MTokenRequestCounter
{
    int Count { get; }
    void Increment();
}

/// <summary>
/// Thread-safe singleton implementation of <see cref="IM2MTokenRequestCounter" />.
/// </summary>
public class M2MTokenRequestCounter : IM2MTokenRequestCounter
{
    private int _count;

    public int Count => _count;

    public void Increment() => Interlocked.Increment(ref _count);
}
