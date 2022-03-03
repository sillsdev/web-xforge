using System;
using System.Collections.Generic;
using System.IO;
using System.Security;
using System.Text.Json;
using System.Web;
using System.Xml.Linq;
using System.Xml.XPath;
using HtmlAgilityPack;

namespace UpdateHelp
{
    class Program
    {
        /// <summary>
        /// Updates RoboHelp 2019 files translated from en to the target language.
        /// Currently only HTML files are translated in Crowdin. Use the HTML files to:
        ///     Update idata files
        ///     Update TOC files
        ///     Replace search with Google Search
        ///     Remove unused buttons and inputs
        /// </summary>
        /// <example>
        /// Assumes the user has ~/src/web-sf-helps/src/en/ folder and AWS console app setup locally
        /// Pull the latest help from AWS S3:
        /// <code>
        ///     cd ~/src/web-sf-helps/src/en/
        ///     aws s3 sync s3://help.scriptureforge.org/en . --exact-timestamps
        /// </code>
        /// If changes exist, this means the English helps have been updated and the changed HTML files
        ///     will need to be uploaded to Crowdin
        ///
        /// Delete the contents of <c>targetDir</c> except for the Google search console file (google<number>.html)
        ///     where targetDir is the target language folder e.g. /es/
        /// Copy /en/ to <c>targetDir</c> folder
        /// Copy Google search console site verification HTML file to <c>targetDir</c> folder
        ///     if it does not already exist in <c>targetDir</c>
        /// Copy translated target HTML files and menu_[target].json from Crowdin to the <c>targetDir</c> folder
        /// Run this program, <c>dotnet run es write</c> (change 'es' for a different language)
        /// Push to help AWS S3:
        /// <code>
        ///     cd ~/src/web-sf-helps/src/es/
        ///     aws s3 sync . s3://help.scriptureforge.org/es
        /// </code>
        /// </example>
        static void Main(string[] args)
        {
            string target = args.Length >= 1 ? args[0] : "es";
            bool doWrite = ((args.Length >= 2 ? args[1] : "") == "write");

            string userDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string helpDir = Path.Combine(userDir, "src", "web-sf-helps", "src");
            string source = "en";
            string sourceDir = Path.Combine(helpDir, source);
            string sourceWhxDir = Path.Combine(sourceDir, "whxdata");
            string parentFolderOfThisFile = Path.GetDirectoryName(Directory.GetCurrentDirectory());
            string sourceMenuJsonPath = Path.Combine(parentFolderOfThisFile, $"menu_{source}.json");
            string targetDir = Path.Combine(helpDir, target);
            string targetWhxDir = Path.Combine(targetDir, "whxdata");
            string targetMenuJsonPath = Path.Combine(targetDir, $"menu_{target}.json");

            // See https://programmablesearchengine.google.com/ to create an engine for each language.
            // For the new language, copy existing setup from another language, including these 2 settings:
            // - Look and feel > Layout > Two column
            // - Search features > Advanced > Websearch Settings > Link Target > "rh_default_topic_frame_name"
            // Copy the search engine ID for the new language into the dictionary below.
            // Create a property for the language in https://search.google.com/search-console,
            // download verification HTML file to targetDir folder and verify site.
            var searchEngineIDs = new Dictionary<string, string>()
            {
                { "es", "9f727aa1dd179dd6d" },
                { "fr", "7da597faaebed6cc7" },
                { "pt_BR", "40bf11d4080246d99" }
            };

            Console.WriteLine("Update Help files.\n");

            ExitIfNoFolder(helpDir);
            ExitIfNoFolder(sourceDir);
            ExitIfNoFolder(sourceWhxDir);
            ExitIfNoFile(sourceMenuJsonPath);
            ExitIfNoFolder(targetDir);
            ExitIfNoFolder(targetWhxDir);
            ExitIfNoFile(targetMenuJsonPath);
            if (!doWrite)
                TestModeWarning();

            Dictionary<string, string> translations = ExtractHtmlTranslations(sourceDir, targetDir);
            AddMenuTranslations(translations, sourceMenuJsonPath, targetMenuJsonPath);

            UpdateIdataFiles(sourceWhxDir, targetWhxDir, translations, doWrite);
            UpdateTocFiles(sourceWhxDir, targetWhxDir, translations, doWrite);

            bool canReplaceSearch = searchEngineIDs.TryGetValue(target, out string searchEngineID);
            if (canReplaceSearch)
                ReplaceSearch(targetDir, searchEngineID, doWrite);
            RemoveUnusedButtonsAndSearch(targetDir, !canReplaceSearch, doWrite);

            Console.WriteLine("\nFinished Help Update.");
        }

        static void ExitIfNoFolder(string path)
        {
            if (!Directory.Exists(path))
            {
                Console.WriteLine($"Required folder doesn't exist: {path}");
                Environment.Exit(1);
            }
        }

        static void ExitIfNoFile(string path)
        {
            if (!File.Exists(path))
            {
                Console.WriteLine($"Required file doesn't exist: {path}");
                Environment.Exit(1);
            }
        }

        static void TestModeWarning()
        {
            ConsoleColor savedForegroundColor = Console.ForegroundColor;
            Console.ForegroundColor = ConsoleColor.Red;
            Console.Write("Test Mode ONLY");
            Console.ForegroundColor = savedForegroundColor;
            Console.WriteLine(" - no files are changed. Run `UpdateHelp <language> write` to change files.\n");
        }

        /// <summary>
        /// Extract translations from all HTML files.
        /// </summary>
        static Dictionary<string, string> ExtractHtmlTranslations(string sourcePath, string targetPath)
        {
            var result = new Dictionary<string, string>();
            var sourceFileToTitles = new Dictionary<string, string>();
            var sourceFileToHeadings = new Dictionary<string, string>();
            try
            {
                string[] sourceFiles = Directory.GetFiles(sourcePath, "*.htm", SearchOption.AllDirectories);
                Console.WriteLine($"There are {sourceFiles.Length} HTML source files.");
                foreach (string file in sourceFiles)
                {
                    string relativeFile = Path.GetRelativePath(sourcePath, file);
                    string sourceTitle = GetHtmlTitle(file);
                    if (sourceTitle != "")
                        sourceFileToTitles.Add(relativeFile, sourceTitle);
                    string sourceHeading = GetHtmlHeading(file);
                    if (sourceHeading != "")
                        sourceFileToHeadings.Add(relativeFile, sourceHeading);
                }

                string[] targetFiles = Directory.GetFiles(targetPath, "*.htm", SearchOption.AllDirectories);
                foreach (string file in targetFiles)
                {
                    string relativeFile = Path.GetRelativePath(targetPath, file);
                    string targetTitle = GetHtmlTitle(file);
                    if (targetTitle != "" && sourceFileToTitles.TryGetValue(relativeFile, out string sourceTitle))
                        result.Add(sourceTitle, targetTitle);
                    string targetHeading = GetHtmlHeading(file);
                    if (targetHeading != "" && sourceFileToHeadings.TryGetValue(relativeFile, out string sourceHeading))
                        result.TryAdd(sourceHeading, targetHeading);
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"The ExtractTranslations process failed: {e.ToString()}");
            }

            return result;
        }

        /// <summary>
        /// Add menu translations from menu_[target].json file.
        /// </summary>
        static void AddMenuTranslations(Dictionary<string, string> translations, string sourceMenuPath,
            string targetMenuPath)
        {
            string sourceMenuJson = File.ReadAllText(sourceMenuPath);
            string targetMenuJson = File.ReadAllText(targetMenuPath);
            using (JsonDocument sourceMenuDoc = JsonDocument.Parse(sourceMenuJson))
            using (JsonDocument targetMenuDoc = JsonDocument.Parse(targetMenuJson))
            {
                var sourceMenuItems = new Dictionary<string, string>();
                foreach (JsonProperty property in sourceMenuDoc.RootElement.EnumerateObject())
                    ExtractJsonStringsAndKeys(property.Name, property.Value, sourceMenuItems);
                var targetMenuItems = new Dictionary<string, string>();
                foreach (JsonProperty property in targetMenuDoc.RootElement.EnumerateObject())
                    ExtractJsonStringsAndKeys(property.Name, property.Value, targetMenuItems);
                foreach (var targetMenuItem in targetMenuItems)
                    if (sourceMenuItems.TryGetValue(targetMenuItem.Key, out string sourceMenuItem))
                        translations.TryAdd(sourceMenuItem, targetMenuItem.Value);
            }
        }

        /// <summary>
        /// Recursively extract the strings and associated keys from the JSON element.
        /// </summary>
        static void ExtractJsonStringsAndKeys(string key, JsonElement element, Dictionary<string, string> items)
        {
            if (element.ValueKind == JsonValueKind.String)
                items.Add(key, element.GetString());
            else if (element.ValueKind == JsonValueKind.Object)
                foreach (JsonProperty property in element.EnumerateObject())
                    ExtractJsonStringsAndKeys(property.Name, property.Value, items);
        }

        /// <summary>
        /// Get the heading text from HTML file.
        /// </summary>
        static string GetHtmlHeading(string file)
        {
            string result = "";
            var doc = new HtmlDocument();
            doc.Load(file);
            HtmlNode heading = doc.DocumentNode.SelectSingleNode("//body/h1") ??
                doc.DocumentNode.SelectSingleNode("//body/h2");

            if (heading != null)
            {
                result = heading.InnerText ?? "";
                result = result.Replace("\n", "");
                result = result.Replace("  ", " ");
                result = result.Trim();
            }

            return result;
        }

        /// <summary>
        /// Get the title text from HTML file.
        /// </summary>
        static string GetHtmlTitle(string file)
        {
            string result = "";
            var doc = new HtmlDocument();
            doc.Load(file);
            HtmlNode title = doc.DocumentNode.SelectSingleNode("//title");

            if (title != null)
            {
                result = title.InnerText ?? "";
                result = result.Replace("\n", "");
                result = result.Replace("  ", " ");
                result = result.Trim();
            }

            return result;
        }

        /// <summary>
        /// Find all idata???.js files, extract the containing XML, and parse and extract the topics.
        /// Replace translated topic names in all idata???.js and idata???.new.js files.
        /// </summary>
        static void UpdateIdataFiles(string sourcePath, string targetPath, Dictionary<string, string> translations,
            bool doWrite)
        {
            try
            {
                string[] files = Directory.GetFiles(sourcePath, "idata???.js");
                Console.WriteLine($"There are {files.Length} idata source files.");
                Func<string, string> topicTextInIdata = topicName => $"<topic name=\\\"{topicName}\\\"";
                Func<string, string> topicTextInIdataNew = topicName => $"\"type\":\"topic\",\"name\":\"{topicName}\"";
                var topicUrlsByName = new Dictionary<string, string>();
                foreach (string file in files)
                {
                    XDocument doc = XDocument.Parse(GetBufferXmlFromFile(file));
                    ExtractXmlElementAttributes(doc, "topic", "name", "url", topicUrlsByName);
                    if (doWrite)
                    {
                        string idataFilePath = Path.Combine(targetPath, Path.GetFileName(file));
                        ReplaceTranslationsInFile(idataFilePath, topicTextInIdata, topicUrlsByName.Keys, translations);
                        string idataNewFilePath = Path.Combine(targetPath,
                            Path.GetFileNameWithoutExtension(file) + ".new" + Path.GetExtension(file));
                        ReplaceTranslationsInFile(idataNewFilePath, topicTextInIdataNew, topicUrlsByName.Keys,
                            translations);
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"The UpdateIdataFiles process failed: {e.ToString()}");
            }
        }

        /// <summary>
        /// Find all toc???.js files, extract the containing XML, and parse and extract the books.
        /// Replace translated book names in all toc???.js and toc???.new.js files.
        /// </summary>
        static void UpdateTocFiles(string sourcePath, string targetPath, Dictionary<string, string> translations,
            bool doWrite)
        {
            try
            {
                string[] files = Directory.GetFiles(sourcePath, "toc???.js");
                Console.WriteLine($"There are {files.Length} toc source files.");
                Func<string, string> bookTextInToc =
                    bookName => $"<book name=\\\"{SecurityElement.Escape(bookName)}\\\"";
                Func<string, string> bookTextInTocNew =
                    bookName => $"\"type\":\"book\",\"name\":\"{HttpUtility.JavaScriptStringEncode(bookName)}\"";
                Func<string, string> itemTextInToc =
                    itemName => $"<item name=\\\"{SecurityElement.Escape(itemName)}\\\"";
                Func<string, string> itemTextInTocNew =
                    itemName => $"\"type\":\"item\",\"name\":\"{HttpUtility.JavaScriptStringEncode(itemName)}\"";
                var bookSrcsByName = new Dictionary<string, string>();
                var itemUrlsByName = new Dictionary<string, string>();
                foreach (string file in files)
                {
                    XDocument doc = XDocument.Parse(GetBufferXmlFromFile(file));
                    ExtractXmlElementAttributes(doc, "book", "name", "src", bookSrcsByName);
                    ExtractXmlElementAttributes(doc, "item", "name", "url", itemUrlsByName);
                    if (doWrite)
                    {
                        string tocFilePath = Path.Combine(targetPath, Path.GetFileName(file));
                        ReplaceTranslationsInFile(tocFilePath, bookTextInToc, bookSrcsByName.Keys, translations);
                        ReplaceTranslationsInFile(tocFilePath, itemTextInToc, itemUrlsByName.Keys, translations);
                        string tocNewFilePath = Path.Combine(targetPath,
                            Path.GetFileNameWithoutExtension(file) + ".new" + Path.GetExtension(file));
                        ReplaceTranslationsInFile(tocNewFilePath, bookTextInTocNew, bookSrcsByName.Keys, translations);
                        ReplaceTranslationsInFile(tocNewFilePath, itemTextInTocNew, itemUrlsByName.Keys, translations);
                    }
                }
            }
            catch (Exception e)
            {
                Console.WriteLine($"The UpdateTocFiles process failed: {e.ToString()}");
            }
        }

        /// <summary>
        /// Replace search with Google Programmable Search in target index.htm.
        /// </summary>
        static void ReplaceSearch(string targetPath, string searchEngineID, bool doWrite)
        {
            string file = Path.Combine(targetPath, "index.htm");
            var doc = new HtmlDocument();
            doc.Load(file);
            HtmlNode head = doc.DocumentNode.SelectSingleNode("//head");
            HtmlNode searchBarDiv = doc.DocumentNode.SelectSingleNode("//div[@class='searchbar left-pane']");
            HtmlNode searchInputDiv = doc.DocumentNode.SelectSingleNode("//div[@class='search-input']");
            HtmlNode searchResultsDiv = doc.DocumentNode.SelectSingleNode("//div[@class='searchresults left-pane']");

            HtmlNode node = HtmlNode.CreateNode("<style>body.media-desktop div.searchresults.search-sidebar " +
                "a.gs-title { color: #1155CC; }</style>");
            if (head.FirstChild.Name == "style")
                head.FirstChild.Remove();
            head.PrependChild(node);

            node = HtmlNode.CreateNode(
                $"<script async src=\"https://cse.google.com/cse.js?cx={searchEngineID}\"></script>");
            if (searchBarDiv.FirstChild.Name == "script")
                searchBarDiv.FirstChild.Remove();
            searchBarDiv.PrependChild(node);

            searchInputDiv.RemoveAllChildren();
            node = HtmlNode.CreateNode("<div style=\"margin: 10px\"><div class=\"gcse-searchbox\"></div></div>");
            searchInputDiv.AppendChild(node);

            searchResultsDiv.RemoveAllChildren();
            searchResultsDiv.AppendChild(HtmlNode.CreateNode("<div class=\"gcse-searchresults\"></div>"));

            if (doWrite)
                doc.Save(file);
        }

        /// <summary>
        /// Remove unused buttons (idx/glo/filter/?fts) and extra search field for desktop from target index.htm.
        /// </summary>
        static void RemoveUnusedButtonsAndSearch(string targetPath, bool removeSearchButton, bool doWrite)
        {
            string file = Path.Combine(targetPath, "index.htm");
            var doc = new HtmlDocument();
            doc.Load(file);
            HtmlNode idxButton = doc.DocumentNode.SelectSingleNode("//a[@class='idx']");
            HtmlNode gloButton = doc.DocumentNode.SelectSingleNode("//a[@class='glo']");
            HtmlNode filterButton = doc.DocumentNode.SelectSingleNode("//a[@class='filter']");
            HtmlNode searchButton = doc.DocumentNode.SelectSingleNode("//a[@class='fts']");
            HtmlNode searchbarExtraInput =
                doc.DocumentNode.SelectSingleNode("//div[@class='searchbar-extra']");
            if (idxButton != null)
                idxButton.Remove();
            if (gloButton != null)
                gloButton.Remove();
            if (filterButton != null)
                filterButton.Remove();
            if (removeSearchButton && searchButton != null)
                searchButton.Remove();
            if (searchbarExtraInput != null)
                searchbarExtraInput.Remove();

            if (doWrite)
                doc.Save(file);
        }

        /// <summary>
        /// Get the containing XML in idata???.js or toc???.js, etc file.
        /// </summary>
        static string GetBufferXmlFromFile(string file)
        {
            string result = "";
            try
            {
                using (var sr = new StreamReader(file))
                {
                    string end = "\";";
                    string start = "gXMLBuffer =\"";
                    result = sr.ReadToEnd();
                    if (result.EndsWith(end))
                        result = result.Remove(result.Length - end.Length);
                    if (result.StartsWith(start))
                        result = result.Substring(start.Length);
                    result = result.Replace("\\\"", "\"");
                }
            }
            catch (IOException e)
            {
                Console.WriteLine("The XML Buffer file could not be read:");
                Console.WriteLine(e.Message);
            }

            return result;
        }

        /// <summary>
        /// Extract 2 specified attributes on a particular element from XML.
        /// </summary>
        static void ExtractXmlElementAttributes(XDocument doc, string elementName, string attr1Name, string att2Name,
            Dictionary<string, string> attr2ByAttr1)
        {
            IEnumerable<XElement> elementList = doc.XPathSelectElements($"//{elementName}");
            foreach (XElement element in elementList)
            {
                string attr1 = element.Attribute(attr1Name).Value;
                string attr2 = element.Attribute(att2Name).Value;
                if (attr2ByAttr1.TryGetValue(attr1, out string savedAttr2))
                {
                    if (savedAttr2 == attr2)
                        return;
                    throw new Exception($"Same {elementName} '{attr1Name}' ({attr1}) but different '{att2Name}' " +
                        $"({savedAttr2} {attr2})");
                }
                attr2ByAttr1.Add(attr1, attr2);
            }
        }

        /// <summary>
        /// Replace translatable text in the specified file using the expression function.
        /// </summary>
        static void ReplaceTranslationsInFile(string filePath, Func<string, string> textExpression,
            Dictionary<string, string>.KeyCollection sources, Dictionary<string, string> translations)
        {
            string text = File.ReadAllText(filePath);
            foreach (string source in sources)
            {
                if (translations.TryGetValue(source, out string translation))
                    text = text.Replace(textExpression(source), textExpression(translation));
            }
            File.WriteAllText(filePath, text);
        }
    }
}
