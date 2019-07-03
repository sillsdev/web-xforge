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

namespace SIL.XForge.Scripture.Services
{
    public class ParatextNotesMapper
    {
        private readonly IRepository<UserEntity> _users;
        private readonly IParatextService _paratextService;
        private readonly Dictionary<string, SyncUser> _idToSyncUser = new Dictionary<string, SyncUser>();
        private readonly Dictionary<string, SyncUser> _usernameToSyncUser = new Dictionary<string, SyncUser>();
        private readonly Dictionary<string, string> _userIdToUsername = new Dictionary<string, string>();

        private UserEntity _user;
        private string _paratextUsername;
        private SFProjectEntity _project;

        public ParatextNotesMapper(IRepository<UserEntity> users, IParatextService paratextService)
        {
            _users = users;
            _paratextService = paratextService;
        }

        public List<SyncUser> NewSyncUsers { get; } = new List<SyncUser>();

        public void Init(UserEntity user, SFProjectEntity project)
        {
            _user = user;
            _paratextUsername = _paratextService.GetParatextUsername(user);
            _project = project;
            _idToSyncUser.Clear();
            _usernameToSyncUser.Clear();
            foreach (SyncUser syncUser in project.SyncUsers)
            {
                _idToSyncUser[syncUser.Id] = syncUser;
                _usernameToSyncUser[syncUser.ParatextUsername] = syncUser;
            }
        }

        public async Task<XElement> ToNotesXmlAsync(XElement oldNotesElem,
            IEnumerable<IDocument<List<Question>>> chapterQuestionsDocs,
            IEnumerable<IDocument<List<Comment>>> chapterCommentsDocs)
        {
            var version = (string)oldNotesElem.Attribute("version");
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

            var notesElem = new XElement("notes", new XAttribute("version", version));
            var chapterDocs = chapterQuestionsDocs.Zip(chapterCommentsDocs, (qs, cs) => (qs, cs));
            foreach ((IDocument<List<Question>> questionsDoc, IDocument<List<Comment>> commentsDoc) in chapterDocs)
            {
                List<Json0Op> questionsOp = Json0Op.New();
                List<Json0Op> commentsOp = Json0Op.New();
                var commentsLookup = commentsDoc.Data.Select((c, i) => new { Comment = c, Index = i })
                    .ToLookup(c => c.Comment.AnswerRef);
                for (int i = 0; i < questionsDoc.Data.Count; i++)
                {
                    Question question = questionsDoc.Data[i];
                    for (int j = 0; j < question.Answers.Count; j++)
                    {
                        Answer answer = question.Answers[j];
                        string threadId = $"ANSWER_{answer.Id}";
                        var threadElem = new XElement("thread", new XAttribute("id", threadId),
                            new XElement("selection",
                                new XAttribute("verseRef", question.ScriptureStart.ToString()),
                                new XAttribute("startPos", 0),
                                new XAttribute("selectedText", "")));
                        string answerSyncUserId = await AddCommentAsync(oldCommentElems, threadElem, answer.OwnerRef,
                            answer.SyncUserRef, answer.DateCreated,
                            new XElement("span", new XAttribute("style", "italic"), question.Text), answer.Text);
                        if (answer.SyncUserRef == null)
                        {
                            questionsOp.ObjectInsert(
                                new object[] { i, nameof(Question.Answers), j, nameof(Answer.SyncUserRef) },
                                answerSyncUserId);
                        }

                        foreach (var c in commentsLookup[answer.Id])
                        {
                            string commentSyncUserId = await AddCommentAsync(oldCommentElems, threadElem,
                                c.Comment.OwnerRef, c.Comment.SyncUserRef, c.Comment.DateCreated, c.Comment.Text);
                            if (c.Comment.SyncUserRef == null)
                            {
                                commentsOp.ObjectInsert(new object[] { c.Index, nameof(Comment.SyncUserRef) },
                                    commentSyncUserId);
                            }
                        }
                        if (threadElem.Elements("comment").Any())
                            notesElem.Add(threadElem);
                    }
                }
                if (questionsOp.Count > 0)
                    await questionsDoc.SubmitOpAsync(questionsOp);
                if (commentsOp.Count > 0)
                    await commentsDoc.SubmitOpAsync(commentsOp);
            }

            foreach (XElement oldCommentElem in oldCommentElems.Values)
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
            return notesElem;
        }

        private async Task<string> AddCommentAsync(Dictionary<string, XElement> oldCommentElems, XElement threadElem,
            string ownerRef, string syncUserRef, DateTime dateCreated, params object[] content)
        {
            (string syncUserId, string user, bool isParatextUser) = await GetSyncUserAsync(syncUserRef, ownerRef);

            var commentElem = new XElement("comment");
            commentElem.Add(new XAttribute("user", user));
            if (!isParatextUser)
                commentElem.Add(new XAttribute("extUser", ownerRef));
            commentElem.Add(new XAttribute("date", dateCreated.ToString("o").Replace("Z", "+00:00")));
            var contentElem = new XElement("content");
            if (content.Length == 1)
            {
                contentElem.Add(content[0]);
            }
            else
            {
                foreach (object paraContent in content)
                    contentElem.Add(new XElement("p", paraContent));
            }
            commentElem.Add(contentElem);

            var threadId = (string)threadElem.Attribute("id");
            string key = GetCommentKey(threadId, commentElem);
            if (IsCommentChanged(oldCommentElems, key, commentElem))
                threadElem.Add(commentElem);
            oldCommentElems.Remove(key);
            return syncUserId;
        }

        private async Task<(string, string, bool)> GetSyncUserAsync(string syncUserRef, string ownerRef)
        {
            if (!_userIdToUsername.TryGetValue(ownerRef, out string paratextUsername))
            {
                UserEntity user = await _users.GetAsync(ownerRef);
                if (user.ParatextId != null)
                    paratextUsername = _paratextService.GetParatextUsername(user);
                _userIdToUsername[ownerRef] = paratextUsername;
            }

            bool isParatextUser = paratextUsername != null;

            SyncUser syncUser;
            if (syncUserRef != null)
            {
                syncUser = _idToSyncUser[syncUserRef];
            }
            else
            {
                if (paratextUsername == null)
                    paratextUsername = _paratextUsername;
                if (!_usernameToSyncUser.TryGetValue(paratextUsername, out syncUser))
                {
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

        private bool IsCommentChanged(Dictionary<string, XElement> oldCommentElems, string key, XElement commentElem)
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
