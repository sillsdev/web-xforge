using NUnit.Framework;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SfScrTextCollectionTests
    {
        [Test]
        public void SetsSettingsDirectory()
        {
            var env = new TestEnvironment();
            Reflection.ReflectionHelper.CallMethod(env.Subject, "InitializeInternal", "/srv/scriptureforge/projects",
                false);
            string dir = Reflection.ReflectionHelper.GetProperty(env.Subject, "SettingsDirectoryInternal") as string;
            Assert.That(dir, Is.EqualTo("/srv/scriptureforge/projects"));
        }

        private class TestEnvironment
        {
            public SfScrTextCollection Subject;

            public TestEnvironment()
            {
                Subject = new SfScrTextCollection();
            }
        }
    }
}
