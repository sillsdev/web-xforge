using Paratext.Data;
using System.Collections.Generic;
using System.IO;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> A user specific <see cref="ScrText"/>. </summary>
    public class MultiUserScrText : ScrText
    {
        // Should be a path to a directory unique to each user
        string _path;
        string _userName;


        public MultiUserScrText(string path, string userName, ProjectName pn) : base(pn, true, false, false)
        {
            System.Console.WriteLine($"path = {path}");
            _path = path;
            _userName = userName;
            Load(false);
        }

        public override IEnumerable<string> GetStandardStylesheet(string styleSheetName)
        {
            string path = Path.Combine(MultiUserLazyScrTextCollection.Get(_userName).SettingsDirectory, styleSheetName);

            if (!File.Exists(path))
                path = Path.Combine(MultiUserLazyScrTextCollection.Get(_userName).SettingsDirectory,
                    Settings.TranslationInfo.Type.StandardStyleSheetName());

            return File.ReadAllLines(path);
        }
    }



}

