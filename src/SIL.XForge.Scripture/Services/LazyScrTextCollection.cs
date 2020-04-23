using System;
using System.ComponentModel;
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

            string fullProjectPath = GetProjectPath(projectId, textType);
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
            using (Stream stream = FileSystemService.OpenFile(settingsFilePath, FileMode.Open))
            using (XmlReader reader = XmlReader.Create(stream))
            {
                while (reader.Read())
                {
                    if (reader.NodeType == XmlNodeType.Element)
                    {
                        if (string.Equals(reader.Name, "name", StringComparison.InvariantCultureIgnoreCase))
                        {
                            reader.Read();
                            return reader.Value != "" ? reader.Value : null;
                        }
                    }
                }
            }
            return null;
        }

        private string GetProjectPath(string projectId, Models.TextType textType)
        {
            string textTypeDir;
            switch (textType)
            {
                case Models.TextType.Target:
                    textTypeDir = "target";
                    break;
                case Models.TextType.Source:
                    textTypeDir = "source";
                    break;
                default:
                    throw new InvalidEnumArgumentException(nameof(textType), (int)textType, typeof(Models.TextType));
            }
            return Path.Combine(SettingsDirectory, projectId, textTypeDir);
        }
    }
}
