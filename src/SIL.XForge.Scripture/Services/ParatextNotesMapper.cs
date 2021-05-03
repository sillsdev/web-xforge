using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class is used to produce two types of changes:
    /// (1) The Paratext notes changelist in XML used to update the Paratext project on the Scripture Forge sync folder.
    /// (2) The Paratext note thread changes from the Paratext project used to update the Scripture Forge database.
    /// This class ensures that the mapping between answers/comments and PT notes remains stable over time by recording
    /// the PT user for each answer/comment. In order to not expose the actual PT usernames in the questions and
    /// comments data, the PT user for a answer/comment is recorded as an opaque id. This class maintains the mapping
    /// of ids to PT usernames in the project entity.
    /// </summary>
    public class ParatextNotesMapper : IParatextNotesMapper
    {
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IParatextService _paratextService;
        private readonly IStringLocalizer<SharedResource> _localizer;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly Dictionary<string, SyncUser> _idToSyncUser = new Dictionary<string, SyncUser>();
        private readonly Dictionary<string, SyncUser> _usernameToSyncUser = new Dictionary<string, SyncUser>();
        private readonly Dictionary<string, string> _userIdToUsername = new Dictionary<string, string>();

        private UserSecret _currentUserSecret;
        private string _currentParatextUsername;
        private SFProjectSecret _projectSecret;
        private HashSet<string> _ptProjectUsersWhoCanWriteNotes;

        public ParatextNotesMapper(IRepository<UserSecret> userSecrets, IParatextService paratextService,
            IStringLocalizer<SharedResource> localizer, IOptions<SiteOptions> siteOptions)
        {
            _userSecrets = userSecrets;
            _paratextService = paratextService;
            _localizer = localizer;
            _siteOptions = siteOptions;
        }

        public List<SyncUser> NewSyncUsers { get; } = new List<SyncUser>();

        public async Task InitAsync(UserSecret currentUserSecret, SFProjectSecret projectSecret, List<User> ptUsers,
            string paratextProjectId)
        {
            _currentUserSecret = currentUserSecret;
            _currentParatextUsername = _paratextService.GetParatextUsername(currentUserSecret);
            _projectSecret = projectSecret;
            _idToSyncUser.Clear();
            _usernameToSyncUser.Clear();
            foreach (SyncUser syncUser in projectSecret.SyncUsers)
            {
                _idToSyncUser[syncUser.Id] = syncUser;
                _usernameToSyncUser[syncUser.ParatextUsername] = syncUser;
            }
            _ptProjectUsersWhoCanWriteNotes = new HashSet<string>();
            IReadOnlyDictionary<string, string> roles = await _paratextService.GetProjectRolesAsync(currentUserSecret,
                paratextProjectId);
            var ptRolesCanWriteNote = new HashSet<string> { SFProjectRole.Administrator, SFProjectRole.Translator,
                SFProjectRole.Consultant, SFProjectRole.WriteNote };
            foreach (User user in ptUsers)
            {
                // Populate the list with all Paratext users belonging to the project and who can write notes
                if (roles.TryGetValue(user.ParatextId, out string role) && ptRolesCanWriteNote.Contains(role))
                    _ptProjectUsersWhoCanWriteNotes.Add(user.Id);
            }
        }

        public async Task<XElement> GetNotesChangelistAsync(XElement oldNotesElem,
            IEnumerable<IDocument<Question>> questionsDocs)
        {
            var version = (string)oldNotesElem.Attribute("version");
            Dictionary<string, XElement> oldCommentElems = GetPTCommentElements(oldNotesElem);

            var notesElem = new XElement("notes", new XAttribute("version", version));
            foreach (IDocument<Question> questionDoc in questionsDocs)
            {
                var answerSyncUserIds = new List<(int, string)>();
                var commentSyncUserIds = new List<(int, int, string)>();
                Question question = questionDoc.Data;
                for (int j = 0; j < question.Answers.Count; j++)
                {
                    Answer answer = question.Answers[j];
                    string threadId = $"ANSWER_{answer.DataId}";
                    var threadElem = new XElement("thread", new XAttribute("id", threadId),
                        new XElement("selection",
                            new XAttribute("verseRef", question.VerseRef.ToString()),
                            new XAttribute("startPos", 0),
                            new XAttribute("selectedText", "")));
                    var answerPrefixContents = new List<object>();
                    // Questions that have empty texts will show in Paratext notes that it is audio-only
                    string qText = string.IsNullOrEmpty(question.Text)
                        ? _localizer[SharedResource.Keys.AudioOnlyQuestion, _siteOptions.Value.Name] : question.Text;
                    answerPrefixContents.Add(new XElement("span", new XAttribute("style", "bold"), qText));
                    if (!string.IsNullOrEmpty(answer.ScriptureText))
                    {
                        string scriptureRef = answer.VerseRef.ToString();
                        string scriptureText = $"{answer.ScriptureText.Trim()} ({scriptureRef})";
                        answerPrefixContents.Add(new XElement("span", new XAttribute("style", "italic"),
                            scriptureText));
                    }
                    string answerSyncUserId = await AddCommentIfChangedAsync(oldCommentElems, threadElem,
                        answer, answerPrefixContents);
                    if (answer.SyncUserRef == null)
                        answerSyncUserIds.Add((j, answerSyncUserId));

                    for (int k = 0; k < answer.Comments.Count; k++)
                    {
                        Comment comment = answer.Comments[k];
                        string commentSyncUserId = await AddCommentIfChangedAsync(oldCommentElems, threadElem,
                            comment);
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

            AddDeletedNotes(notesElem, oldCommentElems.Values);

            return notesElem;
        }

        /// <summary> Get the change objects from the up-to-date Comments in Paratext. </summary>
        public IEnumerable<ParatextNoteThreadChange> PTCommentThreadChanges(
            IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs,
            IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads,
            Paratext.Data.ProjectComments.CommentTags commentTags)
        {
            List<string> matchedThreadIds = new List<string>();
            List<ParatextNoteThreadChange> changes = new List<ParatextNoteThreadChange>();
            foreach (var threadDoc in noteThreadDocs)
            {
                List<string> matchedCommentIds = new List<string>();
                ParatextNoteThreadChange threadChange = new ParatextNoteThreadChange(threadDoc.Data.DataId,
                    threadDoc.Data.VerseRef.ToString(), threadDoc.Data.SelectedText, threadDoc.Data.ContextBefore,
                    threadDoc.Data.ContextAfter, threadDoc.Data.StartPosition);
                // Find the corresponding comment thread
                var existingThread = commentThreads.SingleOrDefault(ct => ct.Id == threadDoc.Data.DataId);
                if (existingThread == null)
                {
                    // No corresponding Paratext comment thread
                    continue;
                }
                matchedThreadIds.Add(existingThread.Id);
                foreach (ParatextNote note in threadDoc.Data.Notes)
                {
                    var matchedComment = GetMatchingCommentFromNote(note, existingThread);
                    if (matchedComment != null)
                    {
                        matchedCommentIds.Add(matchedComment.Id);
                        ChangeType changeType = GetCommentChangeType(matchedComment, note);
                        if (changeType != ChangeType.None)
                            threadChange.AddChange(CreateNoteFromComment(matchedComment, commentTags), changeType);
                    }
                }
                // Add new Comments to note thread change
                var ptCommentIds = existingThread.Comments.Select(c => c.Id);
                var newCommentIds = ptCommentIds.Except(matchedCommentIds);
                foreach (string commentId in newCommentIds)
                {
                    threadChange.AddChange(CreateNoteFromComment(existingThread.Comments
                        .Single(c => c.Id == commentId), commentTags), ChangeType.Added);
                }
                if (threadChange.HasChange)
                    changes.Add(threadChange);
            }
            var ptThreadIds = commentThreads.Select(ct => ct.Id);
            var newThreadIds = ptThreadIds.Except(matchedThreadIds);
            foreach (string threadId in newThreadIds)
            {
                Paratext.Data.ProjectComments.CommentThread thread = commentThreads.Single(ct => ct.Id == threadId);
                Paratext.Data.ProjectComments.Comment info = thread.Comments[0];

                ParatextNoteThreadChange newThread =
                    new ParatextNoteThreadChange(threadId, info.VerseRefStr, info.SelectedText, info.ContextBefore,
                    info.ContextAfter, info.StartPosition);
                foreach (var comm in thread.Comments)
                {
                    newThread.AddChange(CreateNoteFromComment(comm, commentTags), ChangeType.Added);
                }
                changes.Add(newThread);
            }
            return changes;
        }

        /// <summary>
        /// Get the comment change lists from the up-to-date note thread docs in the Scripture Forge mongo database.
        /// </summary>
        public List<List<Paratext.Data.ProjectComments.Comment>> SFNotesToCommentChangeList(
            IEnumerable<IDocument<ParatextNoteThread>> noteThreadDocs,
            IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads,
            Paratext.Data.ProjectComments.CommentTags commentTags)
        {
            List<List<Paratext.Data.ProjectComments.Comment>> changes =
                new List<List<Paratext.Data.ProjectComments.Comment>>();
            foreach (IDocument<ParatextNoteThread> threadDoc in noteThreadDocs)
            {
                List<Paratext.Data.ProjectComments.Comment> thread = new List<Paratext.Data.ProjectComments.Comment>();
                var existingThread = commentThreads.SingleOrDefault(ct => ct.Id == threadDoc.Data.DataId);
                foreach (ParatextNote note in threadDoc.Data.Notes)
                {
                    var matchedComment = existingThread == null ? null : GetMatchingCommentFromNote(note, existingThread);
                    if (matchedComment != null)
                    {
                        var comment = (Paratext.Data.ProjectComments.Comment)matchedComment.Clone();
                        bool commentUpdated = false;
                        if (note.Content != comment.Contents?.InnerXml)
                        {
                            if (comment.Contents == null)
                                comment.AddTextToContent("", false);
                            comment.Contents.InnerXml = note.Content;
                            commentUpdated = true;
                        }
                        if (note.Deleted && !comment.Deleted)
                        {
                            comment.Deleted = true;
                            commentUpdated = true;
                        }
                        if (commentUpdated)
                        {
                            thread.Add(comment);
                        }
                    }
                    else
                    {
                        // new comment added
                        _idToSyncUser.TryGetValue(note.SyncUserRef, out SyncUser syncUser);
                        string username = syncUser == null ? _currentParatextUsername : syncUser.ParatextUsername;
                        SFParatextUser ptUser = new SFParatextUser(username);
                        var comment = new Paratext.Data.ProjectComments.Comment(ptUser)
                        {
                            VerseRefStr = threadDoc.Data.VerseRef.ToString(),
                            SelectedText = threadDoc.Data.SelectedText,
                            ContextBefore = threadDoc.Data.ContextBefore,
                            ContextAfter = threadDoc.Data.ContextAfter,
                            StartPosition = threadDoc.Data.StartPosition
                        };
                        ExtractNoteToComment(note, comment, commentTags);
                        thread.Add(comment);
                    }
                }
                if (thread.Count() > 0)
                    changes.Add(thread);
            }
            return changes;
        }

        /// <summar>
        /// Get the Paratext Comment elements from a project that are associated with Community Checking answers.
        /// </summary>
        private Dictionary<string, XElement> GetPTCommentElements(XElement ptNotesElement)
        {
            var ptCommentElems = new Dictionary<string, XElement>();
            // collect already pushed Paratext notes
            foreach (XElement threadElem in ptNotesElement.Elements("thread"))
            {
                var threadId = (string)threadElem.Attribute("id");
                if (!threadId.StartsWith("ANSWER_"))
                    continue;
                foreach (XElement commentElem in threadElem.Elements("comment"))
                {
                    var deleted = (bool?)commentElem.Attribute("deleted") ?? false;
                    if (!deleted)
                    {
                        string key = GetCommentKey(threadId, commentElem);
                        ptCommentElems[key] = commentElem;
                    }
                }
            }
            return ptCommentElems;
        }

        private Dictionary<string, XElement> GetThreadSelectionElements(XElement ptNotesElement)
        {
            // Example of a selection element: <selection verseRef="MAT 1:3" startPos="0" selectedText="note text." />
            var ptThreadElements = new Dictionary<string, XElement>();
            foreach (XElement threadElem in ptNotesElement.Elements("thread"))
            {
                var threadId = (string)threadElem.Attribute("id");
                ptThreadElements[threadId] = threadElem.Element("selection");
            }
            return ptThreadElements;
        }

        private async Task<string> AddCommentIfChangedAsync(Dictionary<string, XElement> oldCommentElems,
            XElement threadElem, Comment comment, IReadOnlyList<object> prefixContent = null)
        {
            (string syncUserId, string user, bool canWritePTNoteOnProject) = await GetSyncUserAsync(comment.SyncUserRef,
                comment.OwnerRef);

            var commentElem = new XElement("comment");
            commentElem.Add(new XAttribute("user", user));
            // if the user is not a Paratext user on the project, then set external user id
            if (!canWritePTNoteOnProject)
                commentElem.Add(new XAttribute("extUser", comment.OwnerRef));
            commentElem.Add(new XAttribute("date", FormatCommentDate(comment.DateCreated)));
            var contentElem = new XElement("content");
            // Responses that have empty texts will show in Paratext notes that it is audio-only
            string responseText = string.IsNullOrEmpty(comment.Text)
                ? _localizer[SharedResource.Keys.AudioOnlyResponse, _siteOptions.Value.Name] : comment.Text;
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

            var threadId = (string)threadElem.Attribute("id");
            string key = GetCommentKey(threadId, commentElem);
            if (IsCommentNewOrChanged(oldCommentElems, key, commentElem))
                threadElem.Add(commentElem);
            oldCommentElems.Remove(key);
            return syncUserId;
        }

        private void AddDeletedNotes(XElement notesElem, IEnumerable<XElement> commentsToDelete)
        {
            foreach (XElement oldCommentElem in commentsToDelete)
            {
                XElement oldThreadElem = oldCommentElem.Parent;
                var threadId = (string)oldThreadElem.Attribute("id");
                XElement threadElem = notesElem.Elements("thread")
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
        private async Task<(string SyncUserId, string ParatextUsername, bool CanWritePTNoteOnProject)> GetSyncUserAsync(
            string syncUserRef, string ownerRef)
        {
            // if the owner is a PT user, then get the PT username
            if (!_userIdToUsername.TryGetValue(ownerRef, out string paratextUsername))
            {
                if (_ptProjectUsersWhoCanWriteNotes.Contains(ownerRef))
                {
                    Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(ownerRef);
                    if (attempt.TryResult(out UserSecret userSecret))
                        paratextUsername = _paratextService.GetParatextUsername(userSecret);
                    // cache the results
                    _userIdToUsername[ownerRef] = paratextUsername;
                }
                else
                {
                    paratextUsername = null;
                }
            }

            bool canWritePTNoteOnProject = paratextUsername != null;

            SyncUser syncUser;
            // check if comment has already been synced before
            if (syncUserRef == null || !_idToSyncUser.TryGetValue(syncUserRef, out syncUser))
            {
                // the comment has never been synced before (or syncUser is missing)
                // if the owner is not a PT user on the project, then use the current user's PT username
                if (paratextUsername == null)
                    paratextUsername = _currentParatextUsername;
                FindOrCreateSyncUser(paratextUsername, out syncUser);
            }
            return (syncUser.Id, syncUser.ParatextUsername, canWritePTNoteOnProject);
        }

        private bool IsCommentNewOrChanged(Dictionary<string, XElement> oldCommentElems, string key,
            XElement commentElem)
        {
            return !oldCommentElems.TryGetValue(key, out XElement oldCommentElem)
                || !XNode.DeepEquals(oldCommentElem.Element("content"), commentElem.Element("content"));
        }

        private void FindOrCreateSyncUser(string paratextUsername, out SyncUser syncUser)
        {
            if (!_usernameToSyncUser.TryGetValue(paratextUsername, out syncUser))
            {
                // the PT user has never been associated with a comment, so generate a new sync user id and add it
                // to the NewSyncUsers property
                syncUser = new SyncUser
                {
                    Id = ObjectId.GenerateNewId().ToString(),
                    ParatextUsername = paratextUsername
                };
                _idToSyncUser[syncUser.Id] = syncUser;
                _usernameToSyncUser[syncUser.ParatextUsername] = syncUser;
                NewSyncUsers.Add(syncUser);
            }
        }

        private ParatextNote CreateNoteFromComment(Paratext.Data.ProjectComments.Comment comment,
            Paratext.Data.ProjectComments.CommentTags commentTags)
        {
            FindOrCreateSyncUser(comment.User, out SyncUser syncUser);
            var tag = comment.TagsAdded == null || comment.TagsAdded.Length == 0
                ? null
                : commentTags.Get(int.Parse(comment.TagsAdded[0]));
            return new ParatextNote
            {
                DataId = $"{comment.Thread}:{syncUser.Id}:{comment.Date}",
                ThreadId = comment.Thread,
                ExtUserId = comment.ExternalUser,
                // The owner is unknown at this point and is determined when submitting the ops to the note thread docs
                OwnerRef = "",
                SyncUserRef = syncUser.Id,
                Content = comment.Contents?.InnerXml,
                DateCreated = DateTime.Parse(comment.Date),
                DateModified = DateTime.Parse(comment.Date),
                Deleted = comment.Deleted,
                TagIcon = tag?.Icon
            };
        }

        /// <summary> Get the corresponding Comment from a note. </summary>
        private Paratext.Data.ProjectComments.Comment GetMatchingCommentFromNote(ParatextNote note,
            Paratext.Data.ProjectComments.CommentThread thread)
        {
            if (_idToSyncUser.TryGetValue(note.SyncUserRef, out SyncUser su))
            {
                string date = new DateTimeOffset(note.DateCreated).ToString("o");
                // Comment ids are generated using the Paratext username. Since we do not want to transparently
                // store a username to a note in SF we construct the intended Comment id at runtime.
                string commentId = string.Format("{0}/{1}/{2}", note.ThreadId, su.ParatextUsername, date);
                return thread.Comments.SingleOrDefault(c => c.Id == commentId);
            }
            return null;
        }

        private ChangeType GetCommentChangeType(Paratext.Data.ProjectComments.Comment comment, ParatextNote note)
        {
            if (comment.Deleted != note.Deleted)
                return ChangeType.Deleted;
            // If the content does not match it has been updated in Paratext
            if (comment.Contents?.InnerXml != note.Content)
                return ChangeType.Updated;
            return ChangeType.None;
        }

        private void ExtractNoteToComment(ParatextNote note, Paratext.Data.ProjectComments.Comment comment,
            Paratext.Data.ProjectComments.CommentTags commentTags)
        {

            comment.Thread = note.ThreadId;
            comment.Date = new DateTimeOffset(note.DateCreated).ToString("o");
            comment.Deleted = note.Deleted;

            comment.AddTextToContent("", false);
            comment.Contents.InnerXml = note.Content;
            if (!_userIdToUsername.TryGetValue(note.OwnerRef, out string n))
                comment.ExternalUser = note.OwnerRef;
            if (note.TagIcon != null)
            {
                var commentTag = new Paratext.Data.ProjectComments.CommentTag(null, note.TagIcon);
                comment.TagsAdded = new[] { commentTags.FindMatchingTag(commentTag).ToString() };
            }
        }

        private string GetCommentKey(string threadId, XElement commentElem)
        {
            var user = (string)commentElem.Attribute("user");
            FindOrCreateSyncUser(user, out SyncUser syncUser);
            var extUser = (string)commentElem.Attribute("extUser") ?? "";
            var date = (string)commentElem.Attribute("date");
            return $"{threadId}|{syncUser.Id}|{extUser}|{date}";
        }

        /// <summary> Formats a DateTime object to a string that is compatible with a Paratext Comment. </summary>
        private string FormatCommentDate(DateTime date)
        {
            return new DateTimeOffset(date).ToString("o");
        }
    }
}
