using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    public class LazyScrTextCollection : IScrTextCollection
    {
        /// <summary>
        /// A simple in memory cache that lasts the until the end of the request.
        /// </summary>
        private readonly ConcurrentDictionary<string, ScrText> scrTextCache
            = new ConcurrentDictionary<string, ScrText>();

        public LazyScrTextCollection()
        {
            FileSystemService = new FileSystemService();
        }

        /// <summary> Path of directory containing projects. </summary>
        public string SettingsDirectory { get; set; }
        internal IFileSystemService FileSystemService { get; set; }

        /// <summary> Set the directory to the folder containing Paratext projects. </summary>
        public void Initialize(string projectsPath)
        {
            SettingsDirectory = projectsPath;
            // Initialize so that Paratext.Data can find settings files
            ScrTextCollection.Implementation = new SFScrTextCollection();
            ScrTextCollection.Initialize(projectsPath);
        }

        /// <summary>
        /// Get a ScrText for a given user from the data for a paratext project with the target project ID and type.
        /// </summary>
        /// <param name="ptUsername"> The username of the user retrieving the ScrText. </param>
        /// <param name="projectId"> The ID of the target project. </param>
        /// <param name="textType"> Target or Source. </param>
        public ScrText FindById(string ptUsername, string projectId, Models.TextType textType)
        {
            if (projectId == null)
                return null;
            string baseProjectPath = Path.Combine(SettingsDirectory, projectId);
            if (!FileSystemService.DirectoryExists(baseProjectPath))
                return null;

            // We cache the ScrText object as this method is called repeated during a sync
            // This will only last in memory until the sync is finished
            string cacheKey = $"{ptUsername}-{projectId}-{textType}";
            if (this.scrTextCache.ContainsKey(cacheKey))
            {
                return this.scrTextCache[cacheKey];
            }

            string fullProjectPath = Path.Combine(baseProjectPath, TextTypeUtils.DirectoryName(textType));
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

            string name = GetNameFromSettings(settingsFile);
            if (name != null)
            {
                ScrText scrText = CreateScrText(ptUsername, new ProjectName()
                {
                    ProjectPath = fullProjectPath,
                    ShortName = name
                });

                // We don't mind if this fails - another thread would have updated this
                this.scrTextCache.TryAdd(cacheKey, scrText);

                // return the object
                return scrText;
            }

            return null;
        }

        protected virtual ScrText CreateScrText(string ptUsername, ProjectName projectName)
        {
            var associatedUser = new SFParatextUser(ptUsername);
            return new ScrText(projectName, associatedUser);
        }

        private string GetNameFromSettings(string settingsFilePath)
        {
            string contents = FileSystemService.FileReadText(settingsFilePath);
            XElement root = XElement.Parse(contents);
            XElement nameElem = root.Element("Name");
            return nameElem == null || nameElem.Value == "" ? null : nameElem.Value;
        }
    }
}
