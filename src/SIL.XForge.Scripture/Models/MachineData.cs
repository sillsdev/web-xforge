namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// Machine API Data
    /// </summary>
    public class MachineData
    {
        /// <summary>
        /// Gets or sets the Machine API Translation Engine Id for the project.
        /// </summary>
        /// <value>
        /// The Translation Engine Id.
        /// </value>
        /// <remarks>
        /// The user should not interact with the translation engine directly by ID.
        /// </remarks>
        public string TranslationEngineId { get; set; }
    }
}
