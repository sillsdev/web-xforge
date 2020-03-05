// This file is copied from Paratext DataAccessServer
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using SIL.Xml;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Formats CommentThreads as XML.
    /// </summary>
    public static class NotesFormatter
    {
        public const string notesSchemaVersion = "1.1";

        #region Public methods
        /// <summary>
        /// Formats the specified CommentThreads as XML.
        /// </summary>
        public static string FormatNotes(IEnumerable<CommentThread> threads)
        {
            XElement topElem = new XElement("notes");
            topElem.Add(new XAttribute("version", notesSchemaVersion));
            foreach (CommentThread thread in threads.Where(t => t.ActiveComments.Any()))
                topElem.Add(FormatThread(thread));
            string result = topElem.ToString();
            return result;
        }

        /// <summary>
        /// Parses the XML into a nested list of Comments - each inner list is the data for a thread.
        /// </summary>
        /// <param name="noteXml"></param>
        /// <returns>Nested list of comments</returns>
        /// <remarks>This code assumes that the XML passes the validation of the notes XML schema.</remarks>
        public static List<List<Comment>> ParseNotes(string noteXml)
        {
            List<List<Comment>> result = new List<List<Comment>>();
            XDocument doc = XDocument.Parse(noteXml);
            foreach (var threadElem in doc.Root.Elements("thread"))
            {
                result.Add(ParseThread(threadElem));
            }
            return result;
        }

        #endregion

        #region Private helper methods for formatting
        private static XElement FormatThread(CommentThread thread)
        {
            XElement threadElem = new XElement("thread");
            threadElem.Add(new XAttribute("id", thread.Id));
            if (thread.Type == NoteType.Conflict)
                threadElem.Add(new XAttribute("type", "conflict"));
            threadElem.Add(FormatSelection(thread.ScriptureSelection));
            foreach (Comment comment in thread.ActiveComments)
                threadElem.Add(FormatComment(comment));

            return threadElem;
        }

        private static XElement FormatComment(Comment comment)
        {
            XElement commentElem = new XElement("comment");
            commentElem.Add(new XAttribute("user", comment.User));
            commentElem.Add(new XAttribute("date", comment.Date));
            if (comment.ExternalUser != null)
                commentElem.Add(new XAttribute("extUser", comment.ExternalUser));
            if (comment.Deleted)
                commentElem.Add(new XAttribute("deleted", "true"));
            if (comment.VersionNumber != 0)
                commentElem.Add(new XAttribute("versionNbr", comment.VersionNumber.ToString()));
            commentElem.Add(FormatContent(comment.Contents));
            return commentElem;
        }

        private static XElement FormatContent(XmlElement commentContents)
        {
            XElement contentElem = new XElement("content");
            if (commentContents == null)
                contentElem.Add(new XElement("p", ""));
            else
            {
                foreach (XmlNode node in commentContents.ChildNodes)
                    if (node.Name == "p")
                        contentElem.Add(FormatParagraph(node));
                    else if (node.NodeType == XmlNodeType.Text)
                        contentElem.Add(new XText(node.Value));
            }
            return contentElem;
        }

        private static XElement FormatParagraph(XmlNode paraNode)
        {
            XElement paraElem = new XElement("p");
            if (paraNode.ChildNodes.Count == 1)
                paraElem.Value = paraNode.InnerText;
            else
            {
                foreach (XmlNode node in paraNode.ChildNodes)
                {
                    if (node.NodeType == XmlNodeType.Text)
                    {
                        paraElem.Add(new XText(node.InnerText));
                    }
                    else if (node.Name == "bold" || node.Name == "italic")
                    {
                        XElement spanElem = new XElement("span");
                        spanElem.Add(new XAttribute("style", node.Name));
                        spanElem.Value = node.InnerText;
                        paraElem.Add(spanElem);
                    }
                    else if (node.Name == "language")
                    {
                        XElement langElem = new XElement("lang");
                        langElem.Add(new XAttribute("name", node.GetStringAttribute("name")));
                        langElem.Value = node.InnerText;
                        paraElem.Add(langElem);
                    }
                }
            }
            return paraElem;
        }
        private static XElement FormatSelection(ScriptureSelection selection)
        {
            XElement selElem = new XElement("selection");
            selElem.Add(new XAttribute("verseRef", selection.VerseRef.ToString()));
            selElem.Add(new XAttribute("startPos", selection.StartPosition.ToString()));
            selElem.Add(new XAttribute("selectedText", selection.SelectedText));
            if (!string.IsNullOrEmpty(selection.ContextBefore))
                selElem.Add(new XAttribute("beforeContext", selection.ContextBefore));
            if (!string.IsNullOrEmpty(selection.ContextAfter))
                selElem.Add(new XAttribute("afterContext", selection.ContextAfter));

            return selElem;
        }
        #endregion

        #region Private helper methods for parsing
        private static List<Comment> ParseThread(XElement threadElem)
        {
            List<Comment> result = new List<Comment>();
            Comment comment = null;
            foreach (var commentElem in threadElem.Elements("comment"))
            {
                if (comment == null)
                {
                    comment = new Comment();
                    XAttribute threadId = threadElem.Attribute("id");
                    if (threadId != null)
                        comment.Thread = threadId.Value;
                    ParseSelection(threadElem.Element("selection"), comment);
                }
                else
                {
                    comment = (Comment)comment.Clone();
                }
                result.Add(comment);
                ParseComment(commentElem, comment);
            }
            return result;
        }

        private static void ParseComment(XElement commentElem, Comment comment)
        {
            comment.User = commentElem.Attribute("user")?.Value;
            comment.Date = commentElem.Attribute("date")?.Value;
            comment.ExternalUser = commentElem.Attribute("extUser")?.Value;
            comment.Deleted = commentElem.Attribute("deleted")?.Value == "true";
            string verStr = commentElem.Attribute("versionNbr")?.Value;
            int verNbr;
            if (!string.IsNullOrEmpty(verStr) && int.TryParse(verStr, out verNbr))
                comment.VersionNumber = verNbr;

            ParseContents(commentElem.Element("content"), comment);
        }

        private static void ParseContents(XElement contentElem, Comment comment)
        {
            string contents;
            if (contentElem.FirstNode.NodeType == XmlNodeType.Text)
            {
                contents = ((XText)contentElem.FirstNode).Value;
            }
            else
            {
                StringBuilder bldr = new StringBuilder();
                foreach (var paraElem in contentElem.Elements("p"))
                    ParseParagraph(paraElem, bldr);
                contents = bldr.ToString();
            }
            comment.AddTextToContent("", false);
            comment.Contents.InnerXml = contents;
        }

        private static void ParseParagraph(XElement paraElem, StringBuilder bldr)
        {
            bldr.Append("<p>");
            foreach (var node in paraElem.Nodes())
            {
                if (node is XText)
                    bldr.Append(((XText)node).Value);
                else
                {
                    XElement elem = (XElement)node;
                    if (elem.Name == "span")
                    {
                        string style = elem.Attribute("style")?.Value ?? "bold";
                        bldr.Append($"<{style}>");
                        bldr.Append(elem.GetInnerText());
                        bldr.Append($"</{style}>");
                    }
                    else if (elem.Name == "lang")
                    {
                        string name = elem.Attribute("name")?.Value ?? "en";
                        bldr.Append($"<language name=\"{name}\">");
                        bldr.Append(elem.GetInnerText());
                        bldr.Append("</language>");

                    }
                }
            }
            bldr.Append("</p>");
        }

        private static void ParseSelection(XElement selElem, Comment comment)
        {
            comment.SelectedText = selElem.Attribute("selectedText")?.Value ?? "";
            comment.VerseRefStr = selElem.Attribute("verseRef")?.Value;
            comment.StartPosition = int.Parse(selElem.Attribute("startPos")?.Value ?? "0");
            comment.ContextBefore = selElem.Attribute("beforeContext")?.Value ?? "";
            comment.ContextAfter = selElem.Attribute("afterContext")?.Value ?? "";
        }
        #endregion
    }
}
