using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.Users;
using SIL.Xml;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Formats CommentThreads to and from XML.
/// </summary>
/// <remarks>
/// This file is copied from Paratext DataAccessServer, with the following alterations:
///  * ParseNotes takes an XElement for input rather than a String
///  * Additional null checking
///  * Code reformatting
/// </remarks>
public static class NotesFormatter
{
    private const string NotesSchemaVersion = "1.1";

    #region Public methods
    /// <summary>
    /// Formats the specified CommentThreads as XML.
    /// </summary>
    public static string FormatNotes(IEnumerable<CommentThread> threads)
    {
        XElement topElem = new XElement("notes");
        topElem.Add(new XAttribute("version", NotesSchemaVersion));
        foreach (CommentThread thread in threads.Where(t => t.ActiveComments.Any()))
            topElem.Add(FormatThread(thread));
        return topElem.ToString();
    }

    /// <summary>
    /// Parses the XML into a nested list of Comments - each inner list is the data for a thread.
    /// </summary>
    /// <param name="noteXml">The Note XML Element</param>
    /// <param name="ptUser">ParatextUser to use when creating any new Comments.</param>
    /// <returns>Nested list of comments</returns>
    /// <remarks>
    /// This code assumes that the XML passes the validation of the notes XML schema.
    /// This is the inverse of <see cref="FormatNotes"/>, except the thread type is not parsed from the XML.
    /// </remarks>
    public static List<List<Comment>> ParseNotes(XElement noteXml, ParatextUser ptUser) =>
        noteXml.Elements("thread").Select(threadElem => ParseThread(threadElem, ptUser)).ToList();

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
        if (comment.ExternalUser is not null)
            commentElem.Add(new XAttribute("extUser", comment.ExternalUser));
        if (comment.Deleted)
            commentElem.Add(new XAttribute("deleted", "true"));
        if (comment.TagsAdded is not null)
        {
            foreach (string tagAdded in comment.TagsAdded)
            {
                commentElem.Add(new XElement("tagAdded", tagAdded));
            }
        }

        commentElem.Add(FormatContent(comment.Contents));
        return commentElem;
    }

    private static XElement FormatContent(XmlElement? commentContents)
    {
        XElement contentElem = new XElement("content");
        if (commentContents is null)
            contentElem.Add(new XElement("p", string.Empty));
        else
        {
            foreach (XmlNode node in commentContents.ChildNodes)
                if (node.Name == "p")
                    contentElem.Add(FormatParagraph(node));
                else if (node.NodeType == XmlNodeType.Text && node.Value is not null)
                    contentElem.Add(new XText(node.Value));
        }

        return contentElem;
    }

    private static XElement FormatParagraph(XmlNode paraNode)
    {
        XElement paraElem = new XElement("p");
        if (paraNode.ChildNodes.Count == 1 && paraNode.FirstChild?.NodeType == XmlNodeType.Text)
            paraElem.Value = paraNode.InnerText;
        else
        {
            foreach (XmlNode node in paraNode.ChildNodes)
            {
                if (node.NodeType == XmlNodeType.Text)
                {
                    paraElem.Add(new XText(node.InnerText));
                }
                else if (node.Name is "bold" or "italic")
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
    private static List<Comment> ParseThread(XElement threadElem, ParatextUser ptUser)
    {
        List<Comment> result = [];
        Comment comment = null;
        foreach (var commentElem in threadElem.Elements("comment"))
        {
            if (comment is null)
            {
                comment = new Comment(ptUser);
                XAttribute threadId = threadElem.Attribute("id");
                if (threadId is not null)
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
        string commentDate = commentElem.Attribute("date")?.Value;
        if (commentDate is not null)
            comment.Date = commentDate;
        comment.ExternalUser = commentElem.Attribute("extUser")?.Value;
        comment.Deleted = commentElem.Attribute("deleted")?.Value == "true";
        if (commentElem.Elements("tagAdded").Any())
            comment.TagsAdded = commentElem.Elements("tagAdded").Select(t => t.Value).ToArray();
        ParseContents(commentElem.Element("content"), comment);
    }

    private static void ParseContents(XElement? contentElem, Comment comment)
    {
        string contents;
        if (contentElem is null)
        {
            contents = string.Empty;
        }
        else if (contentElem.FirstNode?.NodeType == XmlNodeType.Text)
        {
            contents = ((XText)contentElem.FirstNode).Value;
        }
        else
        {
            StringBuilder sb = new StringBuilder();
            foreach (var paraElem in contentElem.Elements("p"))
                ParseParagraph(paraElem, sb);
            contents = sb.ToString();
        }

        comment.AddTextToContent(string.Empty, false);
        comment.Contents.InnerXml = contents;
    }

    private static void ParseParagraph(XElement paraElem, StringBuilder sb)
    {
        var p = new XElement("p");
        foreach (var node in paraElem.Nodes())
        {
            if (node is XText text)
                p.Add(text);
            else
            {
                XElement elem = (XElement)node;
                if (elem.Name == "span")
                {
                    string[] styles = ["bold", "italic"];
                    var style = styles.SingleOrDefault(s => s == elem.Attribute("style")?.Value) ?? "span";
                    p.Add(new XElement(style, elem.GetInnerText()));
                }
                else if (elem.Name == "lang")
                {
                    var languageElement = new XElement("language", elem.GetInnerText());
                    var languageName = elem.Attribute("name")?.Value ?? "en";
                    languageElement.Add(new XAttribute("name", languageName));
                    p.Add(languageElement);
                }
            }
        }
        sb.Append(p.GetOuterXml());
    }

    private static void ParseSelection(XElement? selElem, Comment comment)
    {
        if (selElem is null)
            return;
        comment.SelectedText = selElem.Attribute("selectedText")?.Value ?? string.Empty;
        comment.VerseRefStr = selElem.Attribute("verseRef")?.Value;
        comment.StartPosition = int.Parse(selElem.Attribute("startPos")?.Value ?? "0");
        comment.ContextBefore = selElem.Attribute("beforeContext")?.Value ?? string.Empty;
        comment.ContextAfter = selElem.Attribute("afterContext")?.Value ?? string.Empty;
    }
    #endregion
}
