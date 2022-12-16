using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Services;
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
        private readonly IUserService _userService;
        private readonly IStringLocalizer<SharedResource> _localizer;
        private readonly IOptions<SiteOptions> _siteOptions;
        private UserSecret _currentUserSecret;
        private string _currentParatextUsername;
        private SFProjectSecret _projectSecret;
        private IGuidService _guidService;
        private HashSet<string> _ptProjectUsersWhoCanWriteNotes;

        public ParatextNotesMapper(
            IRepository<UserSecret> userSecrets,
            IParatextService paratextService,
            IUserService userService,
            IStringLocalizer<SharedResource> localizer,
            IOptions<SiteOptions> siteOptions,
            IGuidService guidService
        )
        {
            _userSecrets = userSecrets;
            _paratextService = paratextService;
            _userService = userService;
            _localizer = localizer;
            _siteOptions = siteOptions;
            _guidService = guidService;
        }

        public async Task InitAsync(
            UserSecret currentUserSecret,
            SFProjectSecret projectSecret,
            List<User> ptUsers,
            SFProject project,
            CancellationToken token
        )
        {
            _currentUserSecret = currentUserSecret;
            _currentParatextUsername = _paratextService.GetParatextUsername(currentUserSecret);
            _projectSecret = projectSecret;
            _ptProjectUsersWhoCanWriteNotes = new HashSet<string>();
            IReadOnlyDictionary<string, string> roles = await _paratextService.GetProjectRolesAsync(
                currentUserSecret,
                project,
                token
            );
            var ptRolesCanWriteNote = new HashSet<string>
            {
                SFProjectRole.Administrator,
                SFProjectRole.Translator,
                SFProjectRole.Consultant,
                SFProjectRole.WriteNote
            };
            foreach (User user in ptUsers)
            {
                // Populate the list with all Paratext users belonging to the project and who can write notes
                if (roles.TryGetValue(user.ParatextId, out string role) && ptRolesCanWriteNote.Contains(role))
                    _ptProjectUsersWhoCanWriteNotes.Add(user.Id);
            }
        }

        public async Task<XElement> GetNotesChangelistAsync(
            XElement oldNotesElem,
            IEnumerable<IDocument<Question>> questionsDocs,
            Dictionary<string, ParatextUserProfile> ptProjectUsers,
            Dictionary<string, string> userRoles,
            string answerExportMethod
        )
        {
            // Usernames of SF community checker users. Paratext users are mapped to null.
            Dictionary<string, string> checkerUsernames = new Dictionary<string, string>();
            var version = (string)oldNotesElem.Attribute("version");
            Dictionary<string, XElement> oldCommentElems = GetOldCommentElements(oldNotesElem, ptProjectUsers);

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
                            ? _localizer[SharedResource.Keys.AudioOnlyQuestion, _siteOptions.Value.Name]
                            : question.Text;
                        answerPrefixContents.Add(new XElement("span", new XAttribute("style", "bold"), qText));
                        if (!string.IsNullOrEmpty(answer.ScriptureText))
                        {
                            string scriptureRef = answer.VerseRef.ToString();
                            string scriptureText = $"{answer.ScriptureText.Trim()} ({scriptureRef})";
                            answerPrefixContents.Add(
                                new XElement("span", new XAttribute("style", "italic"), scriptureText)
                            );
                        }
                        string username = await TryGetCommunityCheckerUsername(
                            answer.OwnerRef,
                            userRoles,
                            checkerUsernames
                        );
                        if (!string.IsNullOrEmpty(username))
                            answerPrefixContents.Add($"[{username} - {_siteOptions.Value.Name}]");

                        string answerSyncUserId = await AddCommentIfChangedAsync(
                            oldCommentElems,
                            threadElem,
                            answer,
                            ptProjectUsers,
                            answerPrefixContents
                        );
                        if (answer.SyncUserRef == null)
                            answerSyncUserIds.Add((j, answerSyncUserId));

                        for (int k = 0; k < answer.Comments.Count; k++)
                        {
                            Comment comment = answer.Comments[k];
                            var commentPrefixContents = new List<object>();
                            string commentUsername = await TryGetCommunityCheckerUsername(
                                comment.OwnerRef,
                                userRoles,
                                checkerUsernames
                            );
                            if (!string.IsNullOrEmpty(commentUsername))
                                commentPrefixContents.Add($"[{commentUsername} - {_siteOptions.Value.Name}]");
                            string commentSyncUserId = await AddCommentIfChangedAsync(
                                oldCommentElems,
                                threadElem,
                                comment,
                                ptProjectUsers,
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

            AddDeletedNotes(notesElem, oldCommentElems.Values);
            return notesElem;
        }

        /// <summar>
        /// Get the Paratext Comment elements from a project that are associated with Community Checking answers.
        /// </summary>
        private Dictionary<string, XElement> GetOldCommentElements(
            XElement ptNotesElement,
            Dictionary<string, ParatextUserProfile> ptProjectUsers
        )
        {
            var oldCommentElems = new Dictionary<string, XElement>();
            // collect already pushed Paratext notes
            foreach (XElement threadElem in ptNotesElement.Elements("thread"))
            {
                var threadId = (string)threadElem.Attribute("id");
                if (threadId.StartsWith("ANSWER_"))
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

        private async Task<string> AddCommentIfChangedAsync(
            Dictionary<string, XElement> oldCommentElems,
            XElement threadElem,
            Comment comment,
            Dictionary<string, ParatextUserProfile> ptProjectUsers,
            IReadOnlyList<object> prefixContent = null
        )
        {
            (string syncUserId, string user, bool canWritePTNoteOnProject) = await GetSyncUserAsync(
                comment.SyncUserRef,
                comment.OwnerRef,
                ptProjectUsers
            );

            var commentElem = new XElement("comment");
            commentElem.Add(new XAttribute("user", user));
            // if the user is not a Paratext user on the project, then set external user id
            if (!canWritePTNoteOnProject)
                commentElem.Add(new XAttribute("extUser", comment.OwnerRef));
            commentElem.Add(new XAttribute("date", FormatCommentDate(comment.DateCreated)));
            var contentElem = new XElement("content");
            // Responses that have empty texts will show in Paratext notes that it is audio-only
            string responseText = string.IsNullOrEmpty(comment.Text)
                ? _localizer[SharedResource.Keys.AudioOnlyResponse, _siteOptions.Value.Name]
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

            var threadId = (string)threadElem.Attribute("id");
            string key = GetCommentKey(threadId, commentElem, ptProjectUsers);
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
        private async Task<(string SyncUserId, string ParatextUsername, bool CanWritePTNoteOnProject)> GetSyncUserAsync(
            string syncUserRef,
            string ownerRef,
            Dictionary<string, ParatextUserProfile> ptProjectUsers
        )
        {
            // if the owner is a PT user who can write notes, then get the PT username
            string paratextUsername = null;
            if (_ptProjectUsersWhoCanWriteNotes.Contains(ownerRef))
            {
                Attempt<UserSecret> attempt = await _userSecrets.TryGetAsync(ownerRef);
                if (attempt.TryResult(out UserSecret userSecret))
                    paratextUsername = _paratextService.GetParatextUsername(userSecret);
            }

            bool canWritePTNoteOnProject = paratextUsername != null;

            ParatextUserProfile ptProjectUser =
                syncUserRef == null ? null : ptProjectUsers.Values.SingleOrDefault(s => s.OpaqueUserId == syncUserRef);
            // check if comment has already been synced before
            if (ptProjectUser == null)
            {
                // the comment has never been synced before (or syncUser is missing)
                // if the owner is not a PT user on the project, then use the current user's PT username
                if (paratextUsername == null)
                    paratextUsername = _currentParatextUsername;
                ptProjectUser = FindOrCreateParatextUser(paratextUsername, ptProjectUsers);
            }
            return (ptProjectUser.OpaqueUserId, ptProjectUser.Username, canWritePTNoteOnProject);
        }

        private bool IsCommentNewOrChanged(
            Dictionary<string, XElement> oldCommentElems,
            string key,
            XElement commentElem
        )
        {
            return !oldCommentElems.TryGetValue(key, out XElement oldCommentElem)
                || !XNode.DeepEquals(oldCommentElem.Element("content"), commentElem.Element("content"));
        }

        private ParatextUserProfile FindOrCreateParatextUser(
            string paratextUsername,
            Dictionary<string, ParatextUserProfile> ptProjectUsers
        )
        {
            if (!ptProjectUsers.TryGetValue(paratextUsername, out ParatextUserProfile ptProjectUser))
            {
                // the PT user has never been associated with a comment, so generate a new sync user id and add it
                // to the NewSyncUsers property
                ptProjectUser = new ParatextUserProfile
                {
                    OpaqueUserId = _guidService.NewObjectId(),
                    Username = paratextUsername
                };
                // Add the sync user to the dictionary
                ptProjectUsers.Add(paratextUsername, ptProjectUser);
            }
            return ptProjectUser;
        }

        /// <summary>
        /// Gets the username for a community checker, or null if the user has a paratext role on the project.
        /// </summary>
        private async Task<string> TryGetCommunityCheckerUsername(
            string userId,
            Dictionary<string, string> userRoles,
            Dictionary<string, string> checkerUsernames
        )
        {
            string username;
            if (checkerUsernames.TryGetValue(userId, out username))
                return username;

            if (userRoles.TryGetValue(userId, out string role) && SFProjectRole.IsParatextRole(role))
            {
                // map users with paratext roles to null
                checkerUsernames.Add(userId, null);
                return null;
            }

            // the user is an SF community checker
            username = await _userService.GetUsernameFromUserId(_currentUserSecret.Id, userId);
            checkerUsernames.Add(userId, username);
            return username;
        }

        private string GetCommentKey(
            string threadId,
            XElement commentElem,
            Dictionary<string, ParatextUserProfile> ptProjectUsers
        )
        {
            var user = (string)commentElem.Attribute("user");
            ParatextUserProfile ptProjectUser = FindOrCreateParatextUser(user, ptProjectUsers);
            var extUser = (string)commentElem.Attribute("extUser") ?? "";
            var date = (string)commentElem.Attribute("date");
            return $"{threadId}|{ptProjectUser.OpaqueUserId}|{extUser}|{date}";
        }

        /// <summary> Formats a DateTime object to a string that is compatible with a Paratext Comment. </summary>
        private string FormatCommentDate(DateTime date)
        {
            return new DateTimeOffset(date).ToString("o");
        }
    }
}
