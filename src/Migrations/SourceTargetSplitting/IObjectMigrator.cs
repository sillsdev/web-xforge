namespace SourceTargetSplitting
{
    using System.Threading.Tasks;

    /// <summary>
    /// The object migrator interface.
    /// </summary>
    public interface IObjectMigrator
    {
        /// <summary>
        /// Creates the project from a resource.
        /// </summary>
        /// <param name="resourceId">The source resource identifier.</param>
        /// <param name="targetId">The target project identifier.
        /// This is the project that will reference this resource a source.</param>
        /// <returns>
        /// The task.
        /// </returns>
        Task CreateProjectFromResourceAsync(string resourceId, string targetId);

        /// <summary>
        /// Migrates the objects.
        /// </summary>
        /// <param name="doWrite">If set to <c>true</c>, do write changes to the database.</param>
        /// <returns>
        /// The task.
        /// </returns>
        Task MigrateObjectsAsync(bool doWrite);
    }
}
