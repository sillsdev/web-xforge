using Hangfire.Common;
using Hangfire.States;

namespace SIL.XForge.Realtime;

/// <summary>
/// Clear out ping checks for the Realtime Server from the Hangfire jobs list
/// </summary>
public class DeleteOnSuccess : JobFilterAttribute, IElectStateFilter
{
    public void OnStateElection(ElectStateContext context)
    {
        if (context.CandidateState.Name == SucceededState.StateName)
        {
            context.CandidateState = new DeletedState { Reason = "Deleted automatically when succeeded." };
        }
    }
}
