using System.Collections.Generic;
using NSubstitute;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Users;
using PtxUtils;
using SIL.Scripture;
using SIL.WritingSystems;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Mock which stored text data in keys such as "GEN" or "GEN 3"
    /// </summary>
    public class MockScrText : ScrText
    {
        public MockScrText(ParatextUser associatedPtUser, ProjectName projectName) : base(associatedPtUser)
        {
            this.projectName = projectName;
            _settings = new MockProjectSettings(this);
            // ScrText sets its cachedGuid from the settings Guid. Here we are doing it the other way around.
            // Some tests may need both MockScrText.Guid and MockScrText.Settings.Guid to be set.
            _language = new MockScrLanguage(this);
        }

        public HexId CachedGuid
        {
            set
            {
                cachedGuid = value;
                Settings.Guid = value;
            }
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
        public override string GetText(VerseRef vref, bool singleChapter, bool doMapIn) =>
            Data.TryGetValue(singleChapter ? vref.Book + " " + vref.Chapter : vref.Book, out string usfm)
                ? usfm
                : string.Empty;

        protected override ProjectFileManager CreateFileManager()
        {
            ProjectFileManager fileManager = Substitute.For<ProjectFileManager>(this, null);
            fileManager.IsWritable.Returns(true);
            return fileManager;
        }

        protected override PermissionManager CreatePermissionManager()
        {
            return new ComparableProjectPermissionManager(this);
        }

        public override ProjectSettings Settings => _settings;
        public override ScrStylesheet DefaultStylesheet => new MockScrStylesheet("./usfm.sty");
        public override string Directory => projectName.ProjectPath;
        public override string Name => projectName.ShortName;
        public override ScrLanguage Language => _language;
        private readonly ScrLanguage _language;
        private readonly ProjectSettings _settings;
    }

    /// <summary>
    /// Replaces a ScrLanguage for use in testing. Does not use the file system to save/load data.
    /// </summary>
    class MockScrLanguage : ScrLanguage
    {
        internal MockScrLanguage(ScrText scrText) : base(null, ProjectNormalization.Undefined, scrText) { }

        protected override WritingSystemDefinition LoadWsDef(ScrText scrText)
        {
            // Don't load anything from disk for testing and just return the one we already have
            return wsDef;
        }
    }
}
