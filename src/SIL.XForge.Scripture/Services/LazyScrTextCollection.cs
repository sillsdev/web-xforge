using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace SIL.XForge.Scripture.Services
{
    public class LazyScrTextCollection
    {
        private readonly string _username;
        private readonly string _userDir;

        public LazyScrTextCollection(string userPath, string username)
        {
            _userDir = userPath;
            _username = username;
        }

        /// <summary> Path of directory containing users with projects. </summary>
        public string SettingsDirectory
        {
            get { return _userDir; }
        }

        public ScrText Find(string projectFolderPath)
        {
            if (!Directory.Exists(projectFolderPath))
                return null;

            string settingsFile = Path.Combine(projectFolderPath, ProjectSettings.fileName);
            if (!File.Exists(settingsFile))
                return null;

            // ENHANCE: this could be improved by the use of a weak cache. (and/or MRU cache)

            var pn = new ProjectName();
            string nameLine = File.ReadAllLines(settingsFile).FirstOrDefault(line => line.Contains("<Name>"));
            MatchCollection mc = Regex.Matches(nameLine, @"<Name>(\S+)</Name>");
            foreach (Match match in mc)
            {
                pn.ShortName = match.Groups[1].Value;
                break;
            }

            pn.ProjectPath = projectFolderPath;
            return new MultiUserScrText(_userDir, _username, pn);
        }

        /// <summary> Get a ScrText from the data for a paratext project with the project ID </summary>
        public ScrText FindById(string projectId)
        {
            if (!Directory.Exists(_userDir))
                return null;
            var projectFolderPaths = Directory.EnumerateDirectories(_userDir);

            foreach (string projectFolderPath in projectFolderPaths)
            {
                var settingFile = Path.Combine(projectFolderPath, ProjectSettings.fileName);
                if (!File.Exists(settingFile))
                    continue;

                var guidLine = File.ReadAllLines(settingFile).FirstOrDefault((line) => line.Contains("Guid"));
                if (guidLine == null)
                    continue;
                if (!guidLine.Contains(projectId))
                    continue;

                return Find(projectFolderPath);
            }
            return null;
        }
    }
}
