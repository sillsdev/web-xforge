using NUnit.Framework;
using Paratext.Data;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SFScrTextCollectionTests
{
    [Test]
    public void SetsSettingsDirectory()
    {
        ScrTextCollection.Implementation = new SFScrTextCollection();
        ScrTextCollection.Initialize("/srv/scriptureforge/projects");
        string dir = ScrTextCollection.SettingsDirectory;
        Assert.That(dir, Is.EqualTo("/srv/scriptureforge/projects"));
    }
}
