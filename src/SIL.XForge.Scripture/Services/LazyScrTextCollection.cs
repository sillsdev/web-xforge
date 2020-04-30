using System.IO;
using System.Xml.Linq;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.XForge.Services;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class LazyScrTextCollection : IScrTextCollection
    {
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
        }

        /// <summary>
        /// Get a ScrText for a given user from the data for a paratext project with the target project ID and type.
        /// </summary>
        /// <param name="username"> The username of the user retrieving the ScrText. </param>
        /// <param name="projectId"> The ID of the target project. </param>
        /// <param name="textType"> Target or Source. </param>
        public ScrText FindById(string username, string projectId, Models.TextType textType)
        {
            if (projectId == null)
                return null;
            string baseProjectPath = Path.Combine(SettingsDirectory, projectId);
            if (!FileSystemService.DirectoryExists(baseProjectPath))
                return null;

            string fullProjectPath = Path.Combine(baseProjectPath, TextTypeUtils.DirectoryName(textType));
            string settingsFile = Path.Combine(fullProjectPath, ProjectSettings.fileName);
            if (!FileSystemService.FileExists(settingsFile))
                return null;

            string name = GetNameFromSettings(settingsFile);
            if (name != null)
                return CreateScrText(username, new ProjectName()
                {
                    ProjectPath = fullProjectPath,
                    ShortName = name
                });
            return null;
        }

        protected virtual ScrText CreateScrText(string username, ProjectName projectName)
        {
            return new MultiUserScrText(SettingsDirectory, username, projectName);
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
