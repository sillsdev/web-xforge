using System.IO;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class MockCommentTags : CommentTags
    {
        public MockCommentTags(ScrText scrText) : base(scrText) { }

        public CommentTags.CommentTagList TagsList
        {
            set => list = value;
        }

        public static MockCommentTags GetCommentTags(string username, string ptProjectId)
        {
            var scrtextDir = Path.Combine(Path.GetTempPath(), ptProjectId, "target");
            var associatedPtUser = new SFParatextUser(username);
            ProjectName projectName = new ProjectName() { ProjectPath = scrtextDir, ShortName = "Proj" };
            MockScrText scrText = new MockScrText(associatedPtUser, projectName);
            return new MockCommentTags(scrText);
        }

        internal void InitializeTagList(int[] tagIds)
        {
            CommentTag[] tags = new CommentTag[tagIds.Length];
            for (int i = 0; i < tagIds.Length; i++)
            {
                int tagId = tagIds[i];
                tags[i] = new CommentTag($"tag{tagId}", $"icon{tagId}", tagId);
            }
            var tagsList = new CommentTagList();
            tagsList.SerializedData = tags;
            TagsList = tagsList;
        }

        protected override void ReadFromDisk()
        {
            // Skip calling ReadFromDisk in base class
        }
    }
}
