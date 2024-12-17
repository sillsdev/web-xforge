using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class is used to produce two types of changes:
/// (1) The Paratext notes changelist in XML used to update the Paratext project on the Scripture Forge sync folder.
/// (2) The Paratext note thread changes from the Paratext project used to update the Scripture Forge database.
/// This class ensures that the mapping between answers/comments and PT notes remains stable over time by recording
/// the PT user for each answer/comment. In order to not expose the actual PT usernames in the questions and
/// comments data, the PT user for a answer/comment is recorded as an opaque id. This class maintains the mapping
/// of ids to PT usernames in the project entity.
/// </summary>
public class ParatextNotesMapper(
    IRepository<UserSecret> userSecrets,
    IParatextService paratextService,
    IUserService userService,
    IStringLocalizer<SharedResource> localizer,
    IOptions<SiteOptions> siteOptions,
    IGuidService guidService
) : IParatextNotesMapper
{
    private UserSecret? _currentUserSecret;
    private string? _currentParatextUsername;
    private HashSet<string> _ptProjectUsersWhoCanWriteNotes = [];

    public void Init(UserSecret currentUserSecret, IReadOnlyList<ParatextProjectUser> users)
    {
        _currentUserSecret = currentUserSecret;
        _currentParatextUsername = paratextService.GetParatextUsername(currentUserSecret);
        HashSet<string> ptRolesCanWriteNote =
        [
            SFProjectRole.Administrator,
            SFProjectRole.Translator,
            SFProjectRole.Consultant,
        ];

        // Populate the list with all Paratext users belonging to the project and who can write notes
        _ptProjectUsersWhoCanWriteNotes = users
            .Where(u => ptRolesCanWriteNote.Contains(u.Role))
            .Select(u => u.Id)
            .ToHashSet();
    }

    public async Task<XElement> GetNotesChangelistAsync(
        XElement oldNotesElem,
        IEnumerable<IDocument<Question>> questionsDocs,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        Dictionary<string, string> userRoles,
        string answerExportMethod,
        int checkingNoteTagId
    )
    {
        // Usernames of SF community checker users. Paratext users are mapped to null.
        Dictionary<string, string> checkerUsernames = [];
        var version = (string)oldNotesElem.Attribute("version") ?? "1.1";
        Dictionary<string, XElement> oldCommentElems = GetOldCommentElements(oldNotesElem, ptProjectUsers);
        List<XElement> commentsToDelete = [];

        var notesElem = new XElement("notes", new XAttribute("version", version));
        if (answerExportMethod != CheckingAnswerExport.None)
        {
            foreach (IDocument<Question> questionDoc in questionsDocs)
            {
                var answerSyncUserIds = new List<(int, string)>();
                var commentSyncUserIds = new List<(int, int, string)>();
                Question question = questionDoc.Data;
                for (int j = 0; j < question.Answers.Count; j++)
                {
                    Answer answer = question.Answers[j];
                    if (answer.Status != AnswerStatus.Exportable && answerExportMethod != CheckingAnswerExport.All)
                    {
                        continue;
                    }
                    string threadId = $"ANSWER_{answer.DataId}";
                    var threadElem = new XElement(
                        "thread",
                        new XAttribute("id", threadId),
                        new XElement(
                            "selection",
                            new XAttribute("verseRef", question.VerseRef.ToString()),
                            new XAttribute("startPos", 0),
                            new XAttribute("selectedText", "")
                        )
                    );
                    var answerPrefixContents = new List<object>();

                    // Questions that have empty texts will show in Paratext notes that it is audio-only
                    string qText = string.IsNullOrEmpty(question.Text)
                        ? localizer[SharedResource.Keys.AudioOnlyQuestion, siteOptions.Value.Name]
                        : question.Text;
                    answerPrefixContents.Add(new XElement("span", new XAttribute("style", "bold"), qText));
                    if (!string.IsNullOrEmpty(answer.ScriptureText))
                    {
                        string scriptureRef = answer.VerseRef?.ToString();
                        string scriptureText = $"{answer.ScriptureText.Trim()} ({scriptureRef})";
                        answerPrefixContents.Add(
                            new XElement("span", new XAttribute("style", "italic"), scriptureText)
                        );
                    }
                    string? username = await TryGetCommunityCheckerUsername(
                        answer.OwnerRef,
                        userRoles,
                        checkerUsernames
                    );
                    if (!string.IsNullOrEmpty(username))
                        answerPrefixContents.Add($"[{username} - {siteOptions.Value.Name}]");

                    string answerSyncUserId = await UpdateThreadElemAsync(
                        oldCommentElems,
                        commentsToDelete,
                        threadElem,
                        answer,
                        ptProjectUsers,
                        answer.Deleted,
                        answerPrefixContents,
                        checkingNoteTagId,
                        true
                    );
                    if (answer.SyncUserRef == null)
                        answerSyncUserIds.Add((j, answerSyncUserId));

                    for (int k = 0; k < answer.Comments.Count; k++)
                    {
                        Comment comment = answer.Comments[k];
                        var commentPrefixContents = new List<object>();
                        string? commentUsername = await TryGetCommunityCheckerUsername(
                            comment.OwnerRef,
                            userRoles,
                            checkerUsernames
                        );
                        if (!string.IsNullOrEmpty(commentUsername))
                            commentPrefixContents.Add($"[{commentUsername} - {siteOptions.Value.Name}]");

                        string commentSyncUserId = await UpdateThreadElemAsync(
                            oldCommentElems,
                            commentsToDelete,
                            threadElem,
                            comment,
                            ptProjectUsers,
                            answer.Deleted || comment.Deleted,
                            commentPrefixContents
                        );
                        if (comment.SyncUserRef == null)
                            commentSyncUserIds.Add((j, k, commentSyncUserId));
                    }
                    if (threadElem.Elements("comment").Any())
                        notesElem.Add(threadElem);
                }
                // set SyncUserRef property on answers and comments that need it
                await questionDoc.SubmitJson0OpAsync(op =>
                {
                    foreach ((int aIndex, string syncUserId) in answerSyncUserIds)
                        op.Set(q => q.Answers[aIndex].SyncUserRef, syncUserId);

                    foreach ((int aIndex, int cIndex, string syncUserId) in commentSyncUserIds)
                        op.Set(q => q.Answers[aIndex].Comments[cIndex].SyncUserRef, syncUserId);
                });
            }
        }

        AddDeletedNotes(notesElem, commentsToDelete);
        return notesElem;
    }

    /// <summary>
    /// Get the Paratext Comment elements from a project that are associated with Community Checking answers.
    /// </summary>
    private Dictionary<string, XElement> GetOldCommentElements(
        XContainer ptNotesElement,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        var oldCommentElems = new Dictionary<string, XElement>();
        // collect already pushed Paratext notes
        foreach (XElement threadElem in ptNotesElement.Elements("thread"))
        {
            var threadId = (string)threadElem.Attribute("id");
            if (threadId?.StartsWith("ANSWER_") == true)
            {
                foreach (XElement commentElem in threadElem.Elements("comment"))
                {
                    var deleted = (bool?)commentElem.Attribute("deleted") ?? false;
                    if (!deleted)
                    {
                        string key = GetCommentKey(threadId, commentElem, ptProjectUsers);
                        oldCommentElems[key] = commentElem;
                    }
                }
            }
        }
        return oldCommentElems;
    }

    private async Task<string> UpdateThreadElemAsync(
        Dictionary<string, XElement> oldCommentElems,
        ICollection<XElement> commentsToDelete,
        XElement threadElem,
        Comment comment,
        Dictionary<string, ParatextUserProfile> ptProjectUsers,
        bool isDeleted,
        IReadOnlyCollection<object>? prefixContent = null,
        int tagId = NoteTag.notSetId,
        bool setCheckingTag = false
    )
    {
        (string syncUserId, string user, bool canWritePtNotes) = await GetSyncUserAsync(
            comment.SyncUserRef,
            comment.OwnerRef,
            ptProjectUsers
        );
        XElement commentElem = ExtractCommentElem(comment, prefixContent, user, canWritePtNotes, tagId);
        var threadId = (string)threadElem.Attribute("id");
        if (threadId == null)
            return syncUserId;

        string key = GetCommentKey(threadId, commentElem, ptProjectUsers);
        // if the answer was deleted, then all comments must be deleted
        if (isDeleted)
            AddDeletedComment(oldCommentElems, key, commentsToDelete);
        else
            AddCommentIfChanged(oldCommentElems, key, commentElem, threadElem, setCheckingTag);
        return syncUserId;
    }

    private static void AddCommentIfChanged(
        Dictionary<string, XElement> oldCommentElems,
        string commentKey,
        XElement commentElem,
        XElement threadElem,
        bool setCheckingTag
    )
    {
        if (IsCommentNewOrChanged(oldCommentElems, commentKey, commentElem, setCheckingTag))
            threadElem.Add(commentElem);

        oldCommentElems.Remove(commentKey);
    }

    private static void AddDeletedComment(
        Dictionary<string, XElement> oldCommentElems,
        string commentKey,
        ICollection<XElement> commentsToDelete
    )
    {
        if (oldCommentElems.TryGetValue(commentKey, out XElement oldCommentElem))
        {
            commentsToDelete.Add(oldCommentElem);
            oldCommentElems.Remove(commentKey);
        }
    }

    private XElement ExtractCommentElem(
        Comment comment,
        IReadOnlyCollection<object> prefixContent,
        string user,
        bool canWritePtNotes,
        int tagId
    )
    {
        var commentElem = new XElement("comment");
        commentElem.Add(new XAttribute("user", user));
        // if the user is not a Paratext user on the project, then set external user id
        if (!canWritePtNotes)
            commentElem.Add(new XAttribute("extUser", comment.OwnerRef));
        commentElem.Add(new XAttribute("date", FormatCommentDate(comment.DateCreated)));
        var contentElem = new XElement("content");
        // Responses that have empty texts will show in Paratext notes that it is audio-only
        string responseText = string.IsNullOrEmpty(comment.Text)
            ? localizer[SharedResource.Keys.AudioOnlyResponse, siteOptions.Value.Name]
            : comment.Text;
        if (prefixContent == null || prefixContent.Count == 0)
        {
            contentElem.Add(responseText);
        }
        else
        {
            foreach (object paraContent in prefixContent)
                contentElem.Add(new XElement("p", paraContent));
            contentElem.Add(new XElement("p", responseText));
        }
        commentElem.Add(contentElem);
        if (tagId != NoteTag.notSetId)
        {
            var tagsAddedElem = new XElement("tagAdded", tagId);
            commentElem.Add(tagsAddedElem);
        }
        return commentElem;
    }

    private static void AddDeletedNotes(XContainer notesElem, IEnumerable<XElement> commentsToDelete)
    {
        foreach (XElement oldCommentElem in commentsToDelete)
        {
            XElement oldThreadElem = oldCommentElem.Parent!;
            var threadId = (string)oldThreadElem.Attribute("id");
            XElement threadElem = notesElem
                .Elements("thread")
                .FirstOrDefault(e => (string)e.Attribute("id") == threadId);
            if (threadElem == null)
            {
                threadElem = new XElement(oldThreadElem);
                threadElem.Elements("comment").Remove();
                notesElem.Add(threadElem);
            }
            XElement commentElem = new XElement(oldCommentElem);
            commentElem.SetAttributeValue("deleted", true);
            commentElem.SetAttributeValue("versionNbr", null);
            threadElem.Add(commentElem);
        }
    }

    /// <summary>
    /// Gets the Paratext user for a comment from the specified sync user id and owner id.
    /// </summary>
    private async Task<(string SyncUserId, string ParatextUsername, bool CanWritePtNoteOnProject)> GetSyncUserAsync(
        string? syncUserRef,
        string ownerRef,
        Dictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        // if the owner is a PT user who can write notes, then get the PT username
        string paratextUsername = null;
        if (_ptProjectUsersWhoCanWriteNotes.Contains(ownerRef))
        {
            Attempt<UserSecret> attempt = await userSecrets.TryGetAsync(ownerRef);
            if (attempt.TryResult(out UserSecret userSecret))
                paratextUsername = paratextService.GetParatextUsername(userSecret);
        }

        bool canWritePtNoteOnProject = paratextUsername != null;

        ParatextUserProfile ptProjectUser =
            syncUserRef == null ? null : ptProjectUsers.Values.SingleOrDefault(s => s.OpaqueUserId == syncUserRef);
        // check if comment has already been synced before
        if (ptProjectUser == null)
        {
            // the comment has never been synced before (or syncUser is missing)
            // if the owner is not a PT user on the project, then use the current user's PT username
            paratextUsername ??= _currentParatextUsername;
            ptProjectUser = FindOrCreateParatextUser(paratextUsername!, ptProjectUsers);
        }
        return (ptProjectUser.OpaqueUserId, ptProjectUser.Username, canWritePtNoteOnProject);
    }

    private static bool IsCommentNewOrChanged(
        IReadOnlyDictionary<string, XElement> oldCommentElems,
        string key,
        XContainer commentElem,
        bool expectNoteTagSet
    )
    {
        if (
            !oldCommentElems.TryGetValue(key, out XElement oldCommentElem)
            || !XNode.DeepEquals(oldCommentElem.Element("content"), commentElem.Element("content"))
        )
            return true;
        return expectNoteTagSet && !oldCommentElem.Elements("tagAdded").Any();
    }

    private ParatextUserProfile FindOrCreateParatextUser(
        string paratextUsername,
        IDictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        if (!ptProjectUsers.TryGetValue(paratextUsername, out ParatextUserProfile ptProjectUser))
        {
            // the PT user has never been associated with a comment, so generate a new sync user id and add it
            // to the NewSyncUsers property
            ptProjectUser = new ParatextUserProfile
            {
                OpaqueUserId = guidService.NewObjectId(),
                Username = paratextUsername,
            };
            // Add the sync user to the dictionary
            ptProjectUsers.Add(paratextUsername, ptProjectUser);
        }
        return ptProjectUser;
    }

    /// <summary>
    /// Gets the username for a community checker, or null if the user has a paratext role on the project.
    /// </summary>
    private async Task<string?> TryGetCommunityCheckerUsername(
        string userId,
        IReadOnlyDictionary<string, string> userRoles,
        IDictionary<string, string> checkerUsernames
    )
    {
        if (checkerUsernames.TryGetValue(userId, out string username))
            return username;

        if (userRoles.TryGetValue(userId, out string role) && SFProjectRole.IsParatextRole(role))
        {
            // map users with paratext roles to null
            checkerUsernames.Add(userId, null);
            return null;
        }

        if (_currentUserSecret == null)
        {
            return null;
        }

        // the user is an SF community checker
        username = await userService.GetUsernameFromUserId(_currentUserSecret.Id, userId);
        checkerUsernames.Add(userId, username);
        return username;
    }

    private string GetCommentKey(
        string threadId,
        XElement commentElem,
        IDictionary<string, ParatextUserProfile> ptProjectUsers
    )
    {
        var user = (string)commentElem.Attribute("user");
        ParatextUserProfile ptProjectUser = FindOrCreateParatextUser(user!, ptProjectUsers);
        var extUser = (string)commentElem.Attribute("extUser") ?? "";
        var date = (string)commentElem.Attribute("date");
        return $"{threadId}|{ptProjectUser.OpaqueUserId}|{extUser}|{date}";
    }

    /// <summary> Formats a DateTime object to a string that is compatible with a Paratext Comment. </summary>
    private static string FormatCommentDate(DateTime date) => new DateTimeOffset(date).ToString("o");
}
