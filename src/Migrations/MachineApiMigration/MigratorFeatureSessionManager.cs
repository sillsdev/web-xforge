using Microsoft.FeatureManagement;
using SIL.XForge.Scripture.Models;

namespace MachineApiMigration;

/// <summary>
/// This feature filter enables the Machine API and disabled the In-Process Machine.
/// </summary>
public class MigratorFeatureSessionManager : ISessionManager
{
    /// <inheritdoc />
    public Task SetAsync(string featureName, bool enabled) => Task.CompletedTask;

    /// <inheritdoc />
    public Task<bool?> GetAsync(string featureName)
    {
        return Task.FromResult<bool?>(
            featureName switch
            {
                FeatureFlags.MachineApi => true,
                FeatureFlags.MachineInProcess => false,
                _ => null,
            }
        );
    }
}
