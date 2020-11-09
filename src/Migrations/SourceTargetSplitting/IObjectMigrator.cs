namespace SourceTargetSplitting
{
    using System.Threading.Tasks;

    /// <summary>
    /// The object migrator interface.
    /// </summary>
    public interface IObjectMigrator
    {
        /// <summary>
        /// Creates the project from a source project reference.
        /// </summary>
        /// <param name="sourceId">The source project/resource identifier.</param>
        /// <param name="targetId">The target project identifier.
        /// This is the project that will reference this project/resource a source.</param>
        /// <returns>
        /// The task.
        /// </returns>
        Task CreateProjectFromSourceAsync(string sourceId, string targetId);

        /// <summary>
        /// Migrates the objects.
        /// </summary>
        /// <param name="doWrite">If set to <c>true</c>, do write changes to the database.</param>
        /// <returns>
        /// The task.
        /// </returns>
        Task MigrateObjectsAsync(bool doWrite);

        /// <summary>
        /// Migrates a target project's permissions to the source project.
        /// </summary>
        /// <param name="sourceId">The source project/resource identifier.</param>
        /// <param name="targetId">The target project identifier.
        /// This is the project that will reference this project/resource a source.</param>
        /// <returns>
        /// The task.
        /// </returns>
        Task MigrateTargetPermissionsAsync(string sourceId, string targetId);
    }
}
