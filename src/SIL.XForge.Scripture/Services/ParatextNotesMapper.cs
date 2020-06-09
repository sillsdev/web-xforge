using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using MongoDB.Bson;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class is used to produce the Paratext notes changelist XML for a book based on the current notes XML. The
    /// class ensures that the mapping between answers/comments and PT notes remains stable over time by recording the
    /// PT user for each answer/comment. In order to not expose the actual PT usernames in the questions and comments
    /// data, the PT user for a answer/comment is recorded as an opaque id. This class maintains the mapping of ids to
    /// PT usernames in the project entity.
    /// </summary>
    public class ParatextNotesMapper : IParatextNotesMapper
    {
        private readonly IRepository<UserSecret> _userSecrets;
        private readonly IParatextService _paratextService;
        private readonly Dictionary<string, SyncUser> _idToSyncUser = new Dictionary<string, SyncUser>();
        private readonly Dictionary<string, SyncUser> _usernameToSyncUser = new Dictionary<string, SyncUser>();
        private readonly Dictionary<string, string> _userIdToUsername = new Dictionary<string, string>();

        private UserSecret _currentUserSecret;
        private string _currentParatextUsername;
        private SFProjectSecret _projectSecret;

        public ParatextNotesMapper(IRepository<UserSecret> userSecrets, IParatextService paratextService)
        {
            _userSecrets = userSecrets;
            _paratextService = paratextService;
        }

        public List<SyncUser> NewSyncUsers { get; } = new List<SyncUser>();

        public void Init(UserSecret currentUserSecret, SFProjectSecret projectSecret)
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
        }

        public async Task<XElement> GetNotesChangelistAsync(XElement oldNotesElem,
            IEnumerable<IDocument<Question>> questionsDocs)
        {
            var version = (string)oldNotesElem.Attribute("version");
            Dictionary<string, XElement> oldCommentElems = GetOldCommentElements(oldNotesElem);

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
                    answerPrefixContents.Add(new XElement("span", new XAttribute("style", "bold"), question.Text));
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

        private Dictionary<string, XElement> GetOldCommentElements(XElement oldNotesElem)
        {
            var oldCommentElems = new Dictionary<string, XElement>();
            // collect already pushed Paratext notes
            foreach (XElement threadElem in oldNotesElem.Elements("thread"))
            {
                var threadId = (string)threadElem.Attribute("id");
                if (threadId.StartsWith("ANSWER_"))
                {
                    foreach (XElement commentElem in threadElem.Elements("comment"))
                    {
                        var deleted = (bool?)commentElem.Attribute("deleted") ?? false;
                        if (!deleted)
                        {
                            string key = GetCommentKey(threadId, commentElem);
                            oldCommentElems[key] = commentElem;
                        }
                    }
                }
            }
            return oldCommentElems;
        }

        private async Task<string> AddCommentIfChangedAsync(Dictionary<string, XElement> oldCommentElems,
            XElement threadElem, Comment comment, IReadOnlyList<object> prefixContent = null)
        {
            (string syncUserId, string user, bool isParatextUser) = await GetSyncUserAsync(comment.SyncUserRef,
                comment.OwnerRef);

            var commentElem = new XElement("comment");
            commentElem.Add(new XAttribute("user", user));
            // if the user isn't a PT user, then set external user id
            if (!isParatextUser)
                commentElem.Add(new XAttribute("extUser", comment.OwnerRef));
            commentElem.Add(new XAttribute("date", comment.DateCreated.ToString("o").Replace("Z", "+00:00")));
            var contentElem = new XElement("content");
            if (prefixContent == null || prefixContent.Count == 0)
            {
                contentElem.Add(comment.Text);
            }
            else
            {
                foreach (object paraContent in prefixContent)
                    contentElem.Add(new XElement("p", paraContent));
                contentElem.Add(new XElement("p", comment.Text));
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
        private async Task<(string SyncUserId, string ParatextUsername, bool IsParatextUser)> GetSyncUserAsync(
            string syncUserRef, string ownerRef)
        {
            // if the owner is a PT user, then get the PT username
            if (!_userIdToUsername.TryGetValue(ownerRef, out string paratextUsername))
            {
                Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(ownerRef);
                if (attempt.TryResult(out UserSecret userSecret))
                    paratextUsername = _paratextService.GetParatextUsername(userSecret);
                // cache the results
                _userIdToUsername[ownerRef] = paratextUsername;
            }

            bool isParatextUser = paratextUsername != null;

            SyncUser syncUser;
            // check if comment has already been synced before
            if (syncUserRef == null || !_idToSyncUser.TryGetValue(syncUserRef, out syncUser))
            {
                // the comment has never been synced before (or syncUser is missing)
                // if the owner is not a PT user, then use the current user's PT username
                if (paratextUsername == null)
                    paratextUsername = _currentParatextUsername;
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
            return (syncUser.Id, syncUser.ParatextUsername, isParatextUser);
        }

        private bool IsCommentNewOrChanged(Dictionary<string, XElement> oldCommentElems, string key,
            XElement commentElem)
        {
            return !oldCommentElems.TryGetValue(key, out XElement oldCommentElem)
                || !XNode.DeepEquals(oldCommentElem.Element("content"), commentElem.Element("content"));
        }

        private string GetCommentKey(string threadId, XElement commentElem)
        {
            var user = (string)commentElem.Attribute("user");
            var extUser = (string)commentElem.Attribute("extUser") ?? "";
            var date = (string)commentElem.Attribute("date");
            return $"{threadId}|{user}|{extUser}|{date}";
        }
    }
}
