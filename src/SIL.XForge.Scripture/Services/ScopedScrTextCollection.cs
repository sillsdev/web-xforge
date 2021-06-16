using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml.Linq;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.ObjectModel;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// A class that can be used to get a ScrText using a simple cache. This class is not
    /// related by inheritance or type to ScrTextCollection, and should be disposed of when
    /// the <see cref="ScrText"/> objects retrieved by it are no longer in use.
    /// </summary>
    public class ScopedScrTextCollection : DisposableBase, IScrTextCollection
    {
        /// <summary>
        /// The file system service.
        /// </summary>
        private readonly IFileSystemService _fileSystemService;

        /// <summary>
        /// The projects path.
        /// </summary>
        private readonly string _projectsPath;

        /// <summary>
        /// The ScrText objects dictionary, with the project id and Paratext user id as the key.
        /// </summary>
        private readonly Dictionary<string, ScrText> _scrTextsByProjectIdAndUserId = new Dictionary<string, ScrText>();

        /// <summary>
        /// Initializes a new instance of the <see cref="ScopedScrTextCollection" /> class.
        /// </summary>
        /// <param name="fileSystemService">The file system service.</param>
        /// <param name="projectsPath">
        /// The projects path. If not specified, this will be set to <see cref="ScrTextCollection.SettingsDirectory"/>.
        /// </param>
        public ScopedScrTextCollection(IFileSystemService fileSystemService, string projectsPath = null)
        {
            _fileSystemService = fileSystemService;
            _projectsPath = projectsPath;
        }

        /// <summary>
        /// Get a ScrText for a given user from the data for a paratext project with the target project ID and type.
        /// </summary>
        /// <param name="ptUsername"> The username of the user retrieving the ScrText. </param>
        /// <param name="projectId"> The ID of the target project. </param>
        public ScrText FindById(string ptUsername, string projectId)
        {
            lock (_scrTextsByProjectIdAndUserId)
            {
                if (_scrTextsByProjectIdAndUserId.TryGetValue(GetScrTextKey(ptUsername, projectId), out ScrText scrText))
                {
                    return scrText;
                }

                if (projectId == null)
                    return null;
                string projectsPath = _projectsPath ?? ScrTextCollection.SettingsDirectory;
                string baseProjectPath = Path.Combine(projectsPath, projectId);
                if (!_fileSystemService.DirectoryExists(baseProjectPath))
                    return null;

                string fullProjectPath = Path.Combine(baseProjectPath, "target");
                string settingsFile = Path.Combine(fullProjectPath, ProjectSettings.fileName);
                if (!_fileSystemService.FileExists(settingsFile))
                {
                    // If this is an older project (most likely a resource), there will be an SSF file
                    settingsFile = _fileSystemService.EnumerateFiles(fullProjectPath, "*.ssf").FirstOrDefault();

                    // We couldn't find the xml or ssf file
                    if (settingsFile == null)
                    {
                        return null;
                    }
                }

                string name = GetNameFromSettings(settingsFile);
                if (name != null)
                {
                    ScrText newScrText = CreateScrText(ptUsername, new ProjectName()
                    {
                        ProjectPath = fullProjectPath,
                        ShortName = name
                    });

                    // Cache this object
                    _scrTextsByProjectIdAndUserId.TryAdd(GetScrTextKey(ptUsername, projectId), newScrText);

                    // return the object
                    return newScrText;
                }

                return null;
            }
        }

        protected virtual ScrText CreateScrText(string ptUsername, ProjectName projectName)
        {
            var associatedUser = new SFParatextUser(ptUsername);
            return new ScrText(projectName, associatedUser);
        }

        /// <inheritdoc />
        protected override void DisposeManagedResources()
        {
            base.DisposeManagedResources();
            lock (_scrTextsByProjectIdAndUserId)
            {
                foreach (string key in _scrTextsByProjectIdAndUserId.Keys)
                {
                    if (_scrTextsByProjectIdAndUserId.TryGetValue(key, out ScrText scrText))
                    {
                        scrText.Dispose();
                        _scrTextsByProjectIdAndUserId.Remove(key);
                    }
                }
            }
        }

        /// <summary>
        /// Gets the key for the <see cref="ScrText" /> dictionary.
        /// </summary>
        /// <param name="ptUsername">The Paratext username.</param>
        /// <param name="projectId">The project identifier.</param>
        /// <returns>
        /// The key for the dictionary.
        /// </returns>
        private string GetScrTextKey(string ptUsername, string projectId)
            => $"{projectId}_{ptUsername}";

        private string GetNameFromSettings(string settingsFilePath)
        {
            string contents = _fileSystemService.FileReadText(settingsFilePath);
            XElement root = XElement.Parse(contents);
            XElement nameElem = root.Element("Name");
            return nameElem == null || nameElem.Value == "" ? null : nameElem.Value;
        }
    }
}
