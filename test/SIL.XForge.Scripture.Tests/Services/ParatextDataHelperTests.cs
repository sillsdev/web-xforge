using System;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Repository;
using SIL.WritingSystems;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextDataHelperTests
{
    private const string ParatextUser01 = "ParatextUser01";

    [Test]
    public void CommitVersionedText_Success()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = new MockScrText(new SFParatextUser(ParatextUser01), new ProjectName());
        scrText.CachedGuid = HexId.CreateNew();
        scrText.Permissions.CreateFirstAdminUser();

        // SUT
        Assert.DoesNotThrow(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    [Test]
    public void CommitVersionedText_ThrowsExceptionIfObserver()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = new MockScrText(new SFParatextUser(ParatextUser01), new ProjectName());
        scrText.Permissions.CreateUser(ParatextUser01); // A user is an observer by default

        // SUT
        Assert.Throws<InvalidOperationException>(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            // Ensure that the SLDR is initialized for LanguageID.Code to be retrieved correctly
            if (!Sldr.IsInitialized)
                Sldr.Initialize(true);

            // Setup Mercurial for tests
            Hg.DefaultRunnerCreationFunc = (_, _, _) => new MockHgRunner();
            Hg.Default = new MockHg();
            VersionedText.AllCommitsDisabled = true;
        }

        public ParatextDataHelper Service { get; } = new ParatextDataHelper();
    }
}
