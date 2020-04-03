using System;
using System.IO;
using System.Xml;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.XForge.Services;

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
        /// Get a ScrText for a given user from the data for a paratext project with the project ID.
        /// </summary>
        public ScrText FindById(string username, string projectId)
        {
            if (!FileSystemService.DirectoryExists(SettingsDirectory))
                return null;
            var projectFolderPaths = FileSystemService.EnumerateDirectories(SettingsDirectory);
            foreach (string projectFolderPath in projectFolderPaths)
            {
                string settingsFile = Path.Combine(projectFolderPath, ProjectSettings.fileName);
                if (!FileSystemService.FileExists(settingsFile))
                    continue;

                bool found = CanFindProjectSettings(settingsFile, projectId, out string name);

                if (found)
                    return CreateScrText(username, new ProjectName()
                    {
                        ProjectPath = projectFolderPath,
                        ShortName = name
                    });
            }
            return null;
        }

        protected virtual ScrText CreateScrText(string username, ProjectName projectName)
        {
            return new MultiUserScrText(SettingsDirectory, username, projectName);
        }

        private bool CanFindProjectSettings(string settingsFilePath, string projectId, out string name)
        {
            bool foundMatchingProjectId = false;
            name = null;
            using (Stream stream = FileSystemService.OpenFile(settingsFilePath, FileMode.Open))
            {
                using (XmlReader reader = XmlReader.Create(stream))
                {
                    while (reader.Read())
                    {
                        if (reader.NodeType == XmlNodeType.Element)
                        {
                            if (string.Equals(reader.Name, "guid", StringComparison.InvariantCultureIgnoreCase))
                            {
                                reader.Read();
                                foundMatchingProjectId = reader.Value == projectId;
                                if (name == null)
                                    continue;
                                return foundMatchingProjectId;
                            }
                            else if (string.Equals(reader.Name, "name", StringComparison.InvariantCultureIgnoreCase))
                            {
                                reader.Read();
                                name = reader.Value;
                                if (foundMatchingProjectId)
                                    return true;
                            }
                        }
                    }
                }
            }
            return foundMatchingProjectId;
        }
    }
}
