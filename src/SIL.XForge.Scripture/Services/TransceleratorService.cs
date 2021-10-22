using System.IO;
using System.Xml;
using System.Linq;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Services;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class TransceleratorService : ITransceleratorService
    {
        private readonly IFileSystemService _fileService;
        private readonly IOptions<SiteOptions> _siteOptions;
        public TransceleratorService(IFileSystemService fileService, IOptions<SiteOptions> siteOptions)
        {
            _fileService = fileService;
            _siteOptions = siteOptions;
        }

        public IEnumerable<TransceleratorQuestion> Questions(string paratextId)
        {
            IEnumerable<XmlElement> docs = QuestionFiles(paratextId).Select(file => ReadFileAsXml(file).DocumentElement);
            // Check that the schema version declared in the file is at least 1.1 (coresponding to Transcelerator version 1.5.2)
            if (docs.Any(doc => doc.Attributes["version"] == null || !VersionSatisfies(doc.Attributes["version"].Value, new int[] { 1, 1 })))
            {
                throw new DataNotFoundException("Transcelerator version unsupported");
            }
            return docs.SelectMany<XmlElement, TransceleratorQuestion>(doc =>
                {
                    string book = doc.Attributes["book"].Value;
                    string lang = doc.Attributes["xml:lang"].Value;
                    return doc.SelectNodes("Question").Cast<XmlNode>()
                        .Select(q =>
                            new TransceleratorQuestion()
                            {
                                Book = book,
                                StartChapter = AttributeText(q, "startChapter"),
                                StartVerse = AttributeText(q, "startVerse"),
                                EndChapter = AttributeText(q, "endChapter"),
                                EndVerse = AttributeText(q, "endVerse"),
                                Text = NodeTextOfLanguage(q.SelectNodes("Q/StringAlt").Cast<XmlNode>(), lang),
                                Id = AttributeText(q, "id")
                            }
                        );
                }
            );
        }

        private IEnumerable<string> QuestionFiles(string paratextId)
        {
            string pathToFiles = Path.Combine(
                _siteOptions.Value.SiteDir, "sync", paratextId, "target", "pluginData", "Transcelerator", "Transcelerator"
            );
            string fileRegex = "Translated Checking Questions for \\w+\\.xml$";
            return _fileService.DirectoryExists(pathToFiles)
                ? _fileService.EnumerateFiles(pathToFiles).Where(file => Regex.IsMatch(file, fileRegex))
                : new string[] { };
        }

        private XmlDocument ReadFileAsXml(string file)
        {
            XmlDocument xml = new XmlDocument();
            // Load it as a string and THEN parse, rather than using xml.Load(path) because the file is UTF-8 but the
            // XML declaration incorrectly specifies UTF-16.
            xml.LoadXml(_fileService.FileReadText(file));
            return xml;
        }

        private string NodeTextOfLanguage(IEnumerable<XmlNode> nodes, string lang)
        {
            return nodes.Where(node => lang.Equals(node.Attributes["xml:lang"].Value))
                .Select(node => node.InnerText)
                .DefaultIfEmpty("").SingleOrDefault();
        }

        private string AttributeText(XmlNode node, string attributeName)
        {
            XmlAttribute attribute = node.Attributes[attributeName];
            return attribute == null ? null : attribute.Value;
        }

        /// <summary>
        /// Determines whether a version string of integers separated by dots (e.g. major.minor.patch) is greater than
        /// or equal to an array of integers (e.g. "1.2" would satisfy [1, 1]).
        /// </summary>
        private bool VersionSatisfies(string version, int[] numbersToSatisfy)
        {
            string[] versionStrings = version.Split(".");
            for (int i = 0; i < versionStrings.Length && i < numbersToSatisfy.Length; i++)
            {
                if (!int.TryParse(versionStrings[i], out int number) || number < numbersToSatisfy[i])
                {
                    return false;
                }
                if (number > numbersToSatisfy[i])
                {
                    return true;
                }
            }
            return versionStrings.Length >= numbersToSatisfy.Length;
        }
    }
}
