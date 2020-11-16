using System.Text;
using SIL.XForge.Scripture.Services;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>
    /// A Paratext Resource.
    /// </summary>
    /// <seealso cref="SIL.XForge.Scripture.Models.ParatextProject" />
    public class ParatextResource : ParatextProject
    {
        /// <summary>
        /// Gets or sets the latest available revision.
        /// </summary>
        /// <value>
        /// The latest available revision.
        /// </value>
        public int AvailableRevision { get; set; }

        /// <summary>
        /// Gets or sets the installed revision.
        /// </summary>
        /// <value>
        /// The installed revision.
        /// </value>
        /// <remarks>
        /// This is used to determine if we need to update our local copy of the resource.
        /// </remarks>
        public int InstalledRevision { get; set; }

        /// <summary>
        /// Gets or sets a value indicating whether this resource is installed.
        /// </summary>
        /// <value>
        ///   <c>true</c> if this resource is installed locally; otherwise, <c>false</c>.
        /// </value>
        /// <remarks>
        /// This is used to determine if we need to install a local copy of the resource.
        /// </remarks>
        public bool IsInstalled { get; set; }

        /// <summary>
        /// Gets or sets the installable resource.
        /// </summary>
        /// <value>
        /// The installable resource.
        /// </value>
        /// <remarks>
        /// This is used solely for synchronization, and can be null if not appropriate.
        /// </remarks>
        internal SFInstallableDblResource InstallableResource { get; set; }

        /// <inheritdoc/>
        public override string ToString()
        {
            StringBuilder message = new StringBuilder();
            foreach (string item in new string[] { ParatextId, Name, ShortName, LanguageTag, ProjectId,
                IsConnectable.ToString(), IsConnected.ToString(), IsInstalled.ToString(),
                AvailableRevision.ToString(), InstalledRevision.ToString() })
            {
                message.Append(item);
                message.Append(',');
            }

            return message.ToString();
        }
    }
}
