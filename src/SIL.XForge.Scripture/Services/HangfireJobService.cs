using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Hangfire.Storage;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Reads information about background jobs from Hangfire job storage.
/// </summary>
public class HangfireJobService(JobStorage jobStorage) : IHangfireJobService
{
    /// <summary>The key of the job result in the data of a succeeded state.</summary>
    private const string ResultKey = "Result";

    public HangfireJobInfo<TResult>? GetJobInfo<TResult>(string jobId)
        where TResult : class
    {
        using IStorageConnection connection = jobStorage.GetConnection();

        JobData? jobData = connection.GetJobData(jobId);
        if (jobData is null)
            return null;

        BackgroundJobState state = GetState(jobData.State);
        TResult? result = null;
        if (state == BackgroundJobState.Succeeded)
        {
            StateData? stateData = connection.GetStateData(jobId);
            if (stateData?.Data.TryGetValue(ResultKey, out string? serializedResult) == true)
            {
                result = SerializationHelper.Deserialize<TResult>(serializedResult, SerializationOption.User);
            }
        }

        return new HangfireJobInfo<TResult>(state, jobData.Job?.Method.Name, jobData.Job?.Args ?? [], result);
    }

    private static BackgroundJobState GetState(string? stateName)
    {
        if (stateName == SucceededState.StateName)
            return BackgroundJobState.Succeeded;
        if (stateName == FailedState.StateName)
            return BackgroundJobState.Failed;
        if (stateName == DeletedState.StateName)
            return BackgroundJobState.Deleted;
        return BackgroundJobState.Pending;
    }
}
