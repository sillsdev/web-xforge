namespace SIL.XForge.Scripture.Services
{
    using System.IO;
    using System.Linq;
    using System.Xml.Linq;
    using Paratext.Data;
    using Paratext.Data.ProjectSettingsAccess;
    using SIL.XForge.Scripture.Models;
    using SIL.XForge.Services;

    /// <summary>
    /// A scripture text collection that loads from the previously used "source" directory.
    /// </summary>
    /// <seealso cref="SIL.XForge.Scripture.Services.IScrTextCollection" />
    public class SourceScrTextCollection : IScrTextCollection
    {
        /// <summary>
        /// Gets or sets the path of directory containing the projects.
        /// </summary>
        /// <value>
        /// The settings directory.
        /// </value>
        public string SettingsDirectory { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the file system service.
        /// </summary>
        /// <value>
        /// The file system service.
        /// </value>
        internal IFileSystemService FileSystemService { get; set; } = new FileSystemService();

        /// <summary>
        /// Set the directory to the folder containing Paratext projects.
        /// </summary>
        /// <param name="projectsPath">The projects path.</param>
        public void Initialize(string projectsPath)
        {
            SettingsDirectory = projectsPath;
            // Initialize so that Paratext.Data can find settings files
            ScrTextCollection.Implementation = new SFScrTextCollection();
            ScrTextCollection.Initialize(projectsPath);
        }

        /// <summary>
        /// Get a scripture text for a given user for a Paratext project with the target project ID and type.
        /// </summary>
        /// <param name="ptUsername">The username of the user retrieving the ScrText.</param>
        /// <param name="projectId">The ID of the target project.</param>
        /// <returns>
        /// The scripture text.
        /// </returns>
        public ScrText? FindById(string ptUsername, string projectId)
        {
            if (projectId == null)
            {
                return null;
            }

            string baseProjectPath = Path.Combine(SettingsDirectory, projectId);
            if (!FileSystemService.DirectoryExists(baseProjectPath))
            {
                return null;
            }

            string fullProjectPath = Path.Combine(baseProjectPath, "source");
            string settingsFile = Path.Combine(fullProjectPath, ProjectSettings.fileName);
            if (!FileSystemService.FileExists(settingsFile))
            {
                // If this is an older project (most likely a resource), there will be an SSF file
                settingsFile = FileSystemService.EnumerateFiles(fullProjectPath, "*.ssf").FirstOrDefault();

                // We couldn't find the xml or ssf file
                if (settingsFile == null)
                {
                    return null;
                }
            }

            string? name = GetNameFromSettings(settingsFile);
            if (name != null)
            {
                ScrText scrText = CreateScrText(ptUsername, new ProjectName()
                {
                    ProjectPath = fullProjectPath,
                    ShortName = name
                });

                // Return the object
                return scrText;
            }

            return null;
        }

        /// <summary>
        /// Creates the scripture text object.
        /// </summary>
        /// <param name="ptUsername">The paratext username.</param>
        /// <param name="projectName">Name of the project.</param>
        /// <returns>The scripture text object</returns>
        protected virtual ScrText CreateScrText(string ptUsername, ProjectName projectName)
        {
            var associatedUser = new SFParatextUser(ptUsername);
            return new ScrText(projectName, associatedUser);
        }

        /// <summary>
        /// Gets the name from settings.
        /// </summary>
        /// <param name="settingsFilePath">The settings file path.</param>
        /// <returns>
        /// The name.
        /// </returns>
        private string? GetNameFromSettings(string settingsFilePath)
        {
            string contents = FileSystemService.FileReadText(settingsFilePath);
            XElement root = XElement.Parse(contents);
            XElement nameElem = root.Element("Name");
            return nameElem == null || nameElem.Value == string.Empty ? null : nameElem.Value;
        }
    }
}
