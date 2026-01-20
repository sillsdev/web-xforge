using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Repository;
using SIL.WritingSystems;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextDataHelperTests
{
    private const string DefaultStylesheetFileName = "usfm.sty";
    private const string ParatextUser01 = "ParatextUser01";
    private const string ResourceId01 = "9bb76cd3e5a7f9b4";

    [Test]
    public void CommitVersionedText_Success()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        scrText.Permissions.CreateFirstAdminUser();

        // SUT
        Assert.DoesNotThrow(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    [Test]
    public void CommitVersionedText_ThrowsExceptionIfObserver()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        scrText.Permissions.CreateUser(ParatextUser01); // A user is an observer by default

        // SUT
        Assert.Throws<InvalidOperationException>(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    [Test]
    public async Task MigrateResourceIfRequired_DoesNotMigrateIfNotRequired()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, false);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null);

        env.MockFileSystemService.DidNotReceive().MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateLanguage()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        const string languageCode = "grc";
        LanguageId languageId = LanguageId.FromEthnologueCode(languageCode);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith("ldml.xml"))).Returns(true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".ldml"))).Returns(false);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, languageId);

        Assert.AreEqual(languageCode, scrText.Settings.LanguageID.Code);
        env.MockFileSystemService.Received()
            .MoveFile(Arg.Is<string>(p => p.EndsWith("ldml.xml")), Arg.Is<string>(p => p.EndsWith(".ldml")));
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateStylesheet()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        Assert.IsEmpty(scrText.Settings.DefaultStylesheetFileName);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null);

        Assert.AreEqual(DefaultStylesheetFileName, scrText.Settings.DefaultStylesheetFileName);
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateVersification()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        scrText.Settings.SetSetting(Setting.Versification, 17);

        string projectVrsFilePath = Path.Combine(scrText.FullPath, "oth11.vrs");
        env.MockFileSystemService.EnumerateFiles(Arg.Any<string>(), "*.vrs").Returns([projectVrsFilePath]);

        // Populate the project versification file
        const string projectVrsFileContents =
            "# Project Versification File\r\n#\r\nPS2 1:20\r\nPS2 1:1-20 = PSA 151:1-20";
        await using MemoryStream projectVrsStream = new MemoryStream(
            Encoding.UTF8.GetBytes(projectVrsFileContents),
            false
        );
        projectVrsStream.Position = 0;
        env.MockFileSystemService.OpenFile(projectVrsFilePath, FileMode.Open, FileAccess.Read, FileShare.Read)
            .Returns(projectVrsStream);

        // Return a writable stream for the custom versification file
        string customVrsFilePath = Path.Combine(scrText.FullPath, ParatextVersificationTable.customVersFilename);
        await using NonDisposingMemoryStream customVrsStream = new NonDisposingMemoryStream();
        env.MockFileSystemService.OpenFile(customVrsFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None)
            .Returns(customVrsStream);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null);

        customVrsStream.Position = 0;
        const string expected = $"# Project Versification File\r\n\r\nPS2 1:20 END\r\nPS2 1:1-20 = PSA 151:1-20\r\n";
        string actual = Encoding.UTF8.GetString(customVrsStream.ToArray());
        Assert.AreEqual(expected, actual);
        Assert.AreEqual("1", scrText.Settings.GetSetting(Setting.Versification));
        customVrsStream.ForceDispose();
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateVersification_WithCustomVersification()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        scrText.Settings.SetSetting(Setting.Versification, 17);

        string customVrsFilePath = Path.Combine(scrText.FullPath, ParatextVersificationTable.customVersFilename);
        string projectVrsFilePath = Path.Combine(scrText.FullPath, "oth11.vrs");
        env.MockFileSystemService.EnumerateFiles(Arg.Any<string>(), "*.vrs")
            .Returns([customVrsFilePath, projectVrsFilePath]);

        // Populate the custom versification file
        env.MockFileSystemService.FileExists(customVrsFilePath).Returns(true);
        const string customVrsFileContents = "# Custom Versification File\r\nJUD 1:50";
        env.MockFileSystemService.FileReadText(customVrsFilePath).Returns(customVrsFileContents);
        await using NonDisposingMemoryStream customVrsStream = new NonDisposingMemoryStream();
        env.MockFileSystemService.OpenFile(customVrsFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None)
            .Returns(customVrsStream);

        // Populate the project versification file
        const string projectVrsFileContents =
            "# Project Versification File\r\n#\r\nPS2 1:20\r\nPS2 1:1-20 = PSA 151:1-20";
        await using MemoryStream projectVrsStream = new MemoryStream(
            Encoding.UTF8.GetBytes(projectVrsFileContents),
            false
        );
        projectVrsStream.Position = 0;
        env.MockFileSystemService.OpenFile(projectVrsFilePath, FileMode.Open, FileAccess.Read, FileShare.Read)
            .Returns(projectVrsStream);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null);

        customVrsStream.Position = 0;
        const string expected =
            $"# Project Versification File\r\n\r\nPS2 1:20 END\r\nPS2 1:1-20 = PSA 151:1-20\r\n{customVrsFileContents}";
        string actual = Encoding.UTF8.GetString(customVrsStream.ToArray());
        Assert.AreEqual(expected, actual);
        Assert.AreEqual("1", scrText.Settings.GetSetting(Setting.Versification));
        customVrsStream.ForceDispose();
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateVersification_MissingVersificationFile()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        const int versification = 17;
        scrText.Settings.SetSetting(Setting.Versification, versification);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null);

        Assert.AreEqual(versification.ToString(), scrText.Settings.GetSetting(Setting.Versification));
    }

    private class TestEnvironment
    {
        private readonly string _syncDir = Path.GetTempPath();

        public TestEnvironment()
        {
            // Ensure that the SLDR is initialized for LanguageID.Code to be retrieved correctly
            if (!Sldr.IsInitialized)
                Sldr.Initialize(true);

            // Setup Mercurial for tests
            Hg.DefaultRunnerCreationFunc = (_, _, _) => new MockHgRunner();
            Hg.Default = new MockHg();
            VersionedText.AllCommitsDisabled = true;

            // Set up the service
            MockFileSystemService = Substitute.For<IFileSystemService>();
            Service = new ParatextDataHelper(MockFileSystemService);
        }

        public IFileSystemService MockFileSystemService { get; }

        public ParatextDataHelper Service { get; }

        /// <summary>
        /// Gets a mock scripture text for testing.
        /// </summary>
        /// <param name="paratextId">The Paratext project identifier.</param>
        /// <param name="paratext7">Optional. If <c>true</c>, the project should be in Paratext 7.0 format.</param>
        /// <returns>The mock scripture text.</returns>
        public MockScrText GetScrText(string paratextId, bool paratext7 = false)
        {
            string scrTextDir = Path.Join(_syncDir, paratextId, "target");
            ProjectName projectName = new ProjectName { ProjectPath = scrTextDir, ShortName = "Proj" };
            var scrText = new MockScrText(new SFParatextUser(ParatextUser01), projectName)
            {
                CachedGuid = HexId.FromStr(paratextId),
            };
            scrText.Settings.LanguageID = LanguageId.English;
            scrText.Settings.FileNamePostPart = ".SFM";
            if (!paratext7)
            {
                scrText.Settings.DefaultStylesheetFileName = DefaultStylesheetFileName;
            }

            return scrText;
        }
    }
}
