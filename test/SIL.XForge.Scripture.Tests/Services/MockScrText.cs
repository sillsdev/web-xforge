using System;
using System.Collections.Generic;
using Paratext.Data;
using Paratext.Data.ProjectSettingsAccess;
using SIL.Scripture;

// TODO: Copied from PT vcs. Ok?   Then modified :)

namespace Paratext.Base
{
    /// <summary>
    /// Mock which stored text data in keys such as "GEN" or "GEN 3"
    /// </summary>
    public class MockScrText : ScrText
    {


        public MockScrText()
        {
            _settings = new MockProjectSettings(this);
        }

        public Dictionary<string, string> Data = new Dictionary<string, string>();


        /// <summary>
        /// Return text of specified chapter or book.
        /// Returns "" if the chapter or book is not found or chapterization problem
        /// </summary>
        /// <param name="vref">Specify book or chapter. Verse number is ignored.</param>
        /// <param name="singleChapter">True to get a single chapter.</param>
        /// <param name="doMapIn">true to do mapping (normally true)</param>
        /// <returns>Text of book or chapter</returns>
        public override string GetText(VerseRef vref, bool singleChapter, bool doMapIn)
        {
            string usfm;
            if (Data.TryGetValue(singleChapter ? vref.Book + " " + vref.Chapter : vref.Book, out usfm))
                return usfm;
            return "";
        }


        public ProjectSettings _settings;
        public override ProjectSettings Settings => _settings;
        public override ScrStylesheet DefaultStylesheet => new MockScrStylesheet("/home/vagrant/src/web-xforge/src/SIL.XForge.Scripture/usfm.sty");
        public override string Directory => "/home/vagrant/src/web-xforge/test/SIL.XForge.Scripture.Tests";
    }
}
