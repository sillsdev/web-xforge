using Paratext.Data;
using Paratext.Data.Users;
using System.Collections.Generic;
using System.IO;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> A user specific <see cref="ScrText"/>. </summary>
    public class MultiUserScrText : ScrText
    {
        // A path to a directory unique to each user
        private readonly string _path;
        private readonly string _username;

        public MultiUserScrText(string path, string username, ProjectName pn) : base(pn, true, false, false)
        {
            _path = path;
            _username = username;
            Load(false);
        }

        internal string Username
        {
            get { return _username; }
        }

        public override IEnumerable<string> GetStandardStylesheet(string styleSheetName)
        {
            string path = Path.Combine(MultiUserLazyScrTextCollection.Get(_username).SettingsDirectory, styleSheetName);

            if (!File.Exists(path))
                path = Path.Combine(MultiUserLazyScrTextCollection.Get(_username).SettingsDirectory,
                    Settings.TranslationInfo.Type.StandardStyleSheetName());

            return File.ReadAllLines(path);
        }

        /// <summary> Use a user-specific Scripture Forge implementation of ProjectPermissionManager. </summary>
        protected override PermissionManager CreatePermissionManager()
        {
            return new MultiUserPermissionManager(this);
        }
    }
}
