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
        private Paratext.Data.ProjectComments.CommentTags _commentTags;

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
            string paratextProjectId, Paratext.Data.ProjectComments.CommentTags commentTags)
        {
            _currentUserSecret = currentUserSecret;
            _currentParatextUsername = _paratextService.GetParatextUsername(currentUserSecret);
            _projectSecret = projectSecret;
            _commentTags = commentTags;
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
            Dictionary<string, XElement> oldCommentElems = GetPTCommentElements(oldNotesElem, true);

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

        /// <summary> Get a list of changes that can be used to update ParatextNoteThread docs in the SF DB. </summary>
        public IEnumerable<ParatextNoteThreadChange> GetNoteThreadChangesFromPT(XElement ptNotesElem,
            IEnumerable<IDocument<ParatextNoteThread>> noteThreads)
        {
            Dictionary<string, XElement> ptCommentElems = GetPTCommentElements(ptNotesElem, false);
            List<ParatextNoteThreadChange> changes = new List<ParatextNoteThreadChange>();
            // Loop through all note thread docs
            foreach (IDocument<ParatextNoteThread> threadDoc in noteThreads)
            {
                ParatextNoteThreadChange threadChange = new ParatextNoteThreadChange(
                    threadDoc.Data.DataId, threadDoc.Data.VerseRef.ToString(), threadDoc.Data.SelectedText);
                foreach (ParatextNote comment in threadDoc.Data.Notes)
                {
                    string key = GetCommentKey(threadDoc.Data.DataId, comment.SyncUserRef, comment.ExtUserId,
                        comment.DateCreated);
                    if (ptCommentElems.TryGetValue(key, out XElement existingCommentElem))
                    {
                        if (existingCommentElem.Element("content").Value != comment.Content)
                        {
                            ParatextNote note = GetNoteFromCommentElement(existingCommentElem, threadDoc.Data.DataId);
                            threadChange.AddChange(note, ChangeType.Updated);
                        }
                        ptCommentElems.Remove(key);
                    }
                    else if (!comment.Deleted)
                    {
                        comment.Deleted = true;
                        threadChange.AddChange(comment, ChangeType.Deleted);
                    }
                }
                if (threadChange.HasChange)
                {
                    changes.Add(threadChange);
                }
            }
            Dictionary<string, XElement> threadSelectionElems = GetThreadSelectionElements(ptNotesElem);
            // Add all new Paratext Comments to the note thread changes
            foreach (string key in ptCommentElems.Keys)
            {
                string threadId = GetThreadIdFromCommentKey(key);
                threadSelectionElems.TryGetValue(threadId, out XElement selection);
                if (ptCommentElems.TryGetValue(key, out XElement addedComment) && addedComment != null)
                {
                    ParatextNote note = GetNoteFromCommentElement(addedComment, threadId);
                    string verseRef = selection?.Attribute("verseRef")?.Value;
                    string selectedText = selection?.Attribute("selectedText")?.Value;
                    // Add the note to the corresponding thread change object or add to a new thread change object
                    AddNoteToThreadChanges(note, verseRef, selectedText, changes);
                }
            }
            return changes;
        }

        /// <summar>
        /// Get the Paratext Comment elements from a project, filtering for
        /// community checking question notes if specified.
        /// </summary>
        private Dictionary<string, XElement> GetPTCommentElements(XElement ptNotesElement, bool questionNotes)
        {
            var ptCommentElems = new Dictionary<string, XElement>();
            // collect already pushed Paratext notes
            foreach (XElement threadElem in ptNotesElement.Elements("thread"))
            {
                var threadId = (string)threadElem.Attribute("id");
                if (questionNotes && !threadId.StartsWith("ANSWER_"))
                    continue;
                if (!questionNotes && threadId.StartsWith("ANSWER_"))
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

        private ParatextNote GetNoteFromCommentElement(XElement commentElem, string threadId)
        {
            string user = commentElem.Attribute("user")?.Value;
            FindOrCreateSyncUser(user, out SyncUser syncUser);
            string date = commentElem.Attribute("date")?.Value;
            string extUser = commentElem.Attribute("extUser")?.Value;
            string versionNbr = commentElem.Attribute("versionNbr")?.Value;
            bool deleted = commentElem.Attribute("deleted")?.Value == "true";
            int version = 0;
            if (versionNbr != null && int.TryParse(versionNbr, out int nbr))
                version = nbr;

            // Add the Paratext Comment tag icon to the note
            string tagAdded = commentElem.Attribute("tagAdded")?.Value;
            int tagId = Paratext.Data.ProjectComments.CommentTag.toDoTagId;
            if (tagAdded != null && int.TryParse(tagAdded, out int t))
                tagId = t;
            string tagIcon = _commentTags.Get(tagId).Icon;
            return new ParatextNote
            {
                DataId = $"{threadId}:{syncUser.Id}:{date}",
                ThreadId = threadId,
                ExtUserId = extUser,
                // The owner is unknown at this point and is determined when submitting the ops to the note thread docs
                OwnerRef = "",
                SyncUserRef = syncUser.Id,
                Content = (string)commentElem.Element("content")?.Value,
                DateCreated = DateTime.Parse(date),
                DateModified = DateTime.Parse(date),
                VersionNumber = version,
                Deleted = commentElem.Attribute("deleted")?.Value == "true",
                TagIcon = tagIcon
            };
        }

        private void AddNoteToThreadChanges(ParatextNote note, string verseRef, string selectedText,
            List<ParatextNoteThreadChange> threadChanges)
        {
            ParatextNoteThreadChange noteThreadChange = threadChanges.Find(c => c.ThreadId == note.ThreadId);
            if (noteThreadChange == null)
            {
                // The note belongs to a new thread
                noteThreadChange = new ParatextNoteThreadChange(note.ThreadId, verseRef, selectedText);
                noteThreadChange.AddChange(note, ChangeType.Added);
                threadChanges.Add(noteThreadChange);
                return;
            }
            noteThreadChange.AddChange(note, ChangeType.Added);
        }

        private string GetCommentKey(string threadId, XElement commentElem)
        {
            var user = (string)commentElem.Attribute("user");
            FindOrCreateSyncUser(user, out SyncUser syncUser);
            var extUser = (string)commentElem.Attribute("extUser") ?? "";
            var date = (string)commentElem.Attribute("date");
            var dateString = ToUtcString(date);

            return $"{threadId}|{syncUser.Id}|{extUser}|{dateString}";
        }

        private string GetCommentKey(string threadId, string syncUser, string extUser, DateTime date)
        {
            string dateString = ToUtcString(date);
            return $"{threadId}|{syncUser}|{extUser}|{dateString}";
        }

        private string GetThreadIdFromCommentKey(string commentKey)
        {
            return commentKey.Split('|')[0];
        }

        private string ToUtcString(string date)
        {
            return DateTimeOffset.Parse(date).ToString("u");
        }

        private string ToUtcString(DateTime date)
        {
            return new DateTimeOffset(date).ToString("u");
        }

        /// <summary> Formats a DateTime object to a string that is compatible with a Paratext Comment. </summary>
        private string FormatCommentDate(DateTime date)
        {
            return date.ToString("o").Replace("Z", "+00:00");
        }
    }
}
