using NUnit.Framework;
using NSubstitute;
using System.Linq;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class TransceleratorServiceTests
    {
        private const string Project01 = "project01";

        [Test]
        public void TransceleratorService_HasQuestions()
        {
            var env = new TestEnvironment();
            env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            env.FileSystemService.EnumerateFiles(Arg.Any<string>()).Returns(
                new string[] { "Just some file.xml" }
            );
            Assert.False(env.Service.HasQuestions(Project01));

            env.FileSystemService.EnumerateFiles(Arg.Any<string>()).Returns(
                new string[] { "Just some file.xml", "Translated Checking Questions for MAT.xml" }
            );
            Assert.True(env.Service.HasQuestions(Project01));
        }

        [Test]
        public void TransceleratorService_Questions()
        {
            var env = new TestEnvironment();
            env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            env.FileSystemService.EnumerateFiles(Arg.Any<string>()).Returns(
                new string[] { "Translated Checking Questions for GEN.xml" }
            );
            env.FileSystemService.FileReadText(Arg.Any<string>()).Returns(env.XmlFileText("1.1"));

            var questions = env.Service.Questions(Project01).ToArray();
            Assert.AreEqual(questions.Length, 1);
            Assert.AreEqual(questions[0].Book, "GEN");
            Assert.AreEqual(questions[0].StartChapter, "1");
            Assert.AreEqual(questions[0].StartVerse, "1");
            Assert.AreEqual(questions[0].EndChapter, "2");
            Assert.AreEqual(questions[0].EndVerse, "3");
            Assert.AreEqual(questions[0].Text, "What are the main events recorded in this passage?");
            Assert.AreEqual(questions[0].Answer, "");
            Assert.AreEqual(questions[0].Id, "Tell [me] the main events recorded in this passage.");
        }

        [Test]
        public void TransceleratorService_Questions_VersionError()
        {
            var env = new TestEnvironment();
            env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);
            env.FileSystemService.EnumerateFiles(Arg.Any<string>()).Returns(
                new string[] { "Translated Checking Questions for GEN.xml" }
            );
            env.FileSystemService.FileReadText(Arg.Any<string>()).Returns(env.XmlFileText("1.0"));
            Assert.Throws<DataNotFoundException>(() => env.Service.Questions(Project01));
            env.FileSystemService.FileReadText(Arg.Any<string>()).Returns(env.XmlFileText("1.1.0"));
            Assert.DoesNotThrow(() => env.Service.Questions(Project01));
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                FileSystemService = Substitute.For<IFileSystemService>();
                IOptions<SiteOptions> siteOptions = Microsoft.Extensions.Options.Options.Create(
                    new SiteOptions() { SiteDir = "scriptureforge" }
                );
                Service = new TransceleratorService(FileSystemService, siteOptions);
            }
            public TransceleratorService Service { get; }
            public IFileSystemService FileSystemService { get; }
            public string XmlFileText(string version)
            {
                return @"<?xml version=""1.0"" encoding=""utf-8""?>
<ComprehensionCheckingQuestionsForBook xml:lang=""en"" version=""" + version + @""" book=""GEN"">
	<Question id=""Tell [me] the main events recorded in this passage."" overview=""true"" startChapter=""1"" endChapter=""2"" startVerse=""1"" endVerse=""3"">
		<Q>
			<StringAlt xml:lang=""en"">What are the main events recorded in this passage?</StringAlt>
			<StringAlt xml:lang=""en-US"">Tell [me] the main events recorded in this passage.</StringAlt>
			<StringAlt xml:lang=""es"">Cuénta[me] los principales acontecimientos de este pasaje.</StringAlt>
		</Q>
		<Answers>
			<A>
				<StringAlt xml:lang=""en-US"">Example English answer</StringAlt>
				<StringAlt xml:lang=""es"">Example Spanish answer</StringAlt>
				<StringAlt xml:lang=""fr"">Example French answer</StringAlt>
			</A>
		</Answers>
		<Notes>
			<N>
				<StringAlt xml:lang=""en-US"">Associated English note</StringAlt>
			</N>
		</Notes>
	</Question>
</ComprehensionCheckingQuestionsForBook>";
            }
        }
    }
}
