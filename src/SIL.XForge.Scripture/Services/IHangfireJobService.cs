using System.Collections.Generic;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Reads information about background jobs from Hangfire, isolating callers from Hangfire's types.
/// </summary>
public interface IHangfireJobService
{
    /// <summary>
    /// Gets information about a background job.
    /// </summary>
    /// <typeparam name="TResult">The type of result returned by the job when it succeeds.</typeparam>
    /// <param name="jobId">The Hangfire job identifier.</param>
    /// <returns>The job information, or <c>null</c> if the job does not exist.</returns>
    HangfireJobInfo<TResult>? GetJobInfo<TResult>(string jobId)
        where TResult : class;
}

/// <summary>
/// The state of a background job.
/// </summary>
public enum BackgroundJobState
{
    /// <summary>The job has not finished. It is enqueued, scheduled, awaiting a parent job, or running.</summary>
    Pending,

    /// <summary>The job finished successfully.</summary>
    Succeeded,

    /// <summary>The job failed and will not be retried.</summary>
    Failed,

    /// <summary>The job was deleted.</summary>
    Deleted,
}

/// <summary>
/// A snapshot of a background job.
/// </summary>
/// <typeparam name="TResult">The type of result returned by the job when it succeeds.</typeparam>
/// <param name="State">The state of the job.</param>
/// <param name="MethodName">The name of the method the job invokes, or <c>null</c> if unknown.</param>
/// <param name="Arguments">The arguments the job was enqueued with.</param>
/// <param name="Result">The job's result. This is <c>null</c> unless the job succeeded and returned a result.</param>
public record HangfireJobInfo<TResult>(
    BackgroundJobState State,
    string? MethodName,
    IReadOnlyList<object?> Arguments,
    TResult? Result
)
    where TResult : class;
