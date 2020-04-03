using Paratext.Data;
using Paratext.Data.Users;
using System.Collections.Generic;
using System.IO;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> A <see cref="ScrText"/> in a multi user environment. </summary>
    public class MultiUserScrText : ScrText
    {
        private readonly string _projectDir;

        public MultiUserScrText(string projectDir, string username, ProjectName pn) : base(pn, true, false, false)
        {
            _projectDir = projectDir;
            Username = username;
            Load(false);
        }

        public string Username { get; private set; }

        public override IEnumerable<string> GetStandardStylesheet(string styleSheetName)
        {
            string path = Path.Combine(_projectDir, styleSheetName);

            if (!File.Exists(path))
                path = Path.Combine(_projectDir, Settings.TranslationInfo.Type.StandardStyleSheetName());

            return File.ReadAllLines(path);
        }

        /// <summary> Use a user-specific Scripture Forge implementation of ProjectPermissionManager. </summary>
        protected override PermissionManager CreatePermissionManager()
        {
            return new MultiUserPermissionManager(this);
        }
    }
}
