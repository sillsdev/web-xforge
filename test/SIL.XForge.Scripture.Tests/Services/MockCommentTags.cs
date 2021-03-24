using Paratext.Data;
using Paratext.Data.ProjectComments;

namespace SIL.XForge.Scripture.Services
{
    public class MockCommentTags : CommentTags
    {
        public MockCommentTags(ScrText scrText) : base(scrText)
        {
        }

        public CommentTags.CommentTagList TagsList
        {
            set { list = value; }
        }

        public void InitializeTagList(int[] tagIds)
        {
            CommentTag[] tags = new CommentTag[tagIds.Length];
            for (int i = 0; i < tagIds.Length; i++)
            {
                int tagId = tagIds[i];
                tags[i] = new Paratext.Data.ProjectComments.CommentTag($"tag{tagId}", $"icon{tagId}", tagId);
            }
            var list = new CommentTags.CommentTagList();
            list.SerializedData = tags;
            TagsList = list;
        }

        protected override void ReadFromDisk()
        {
            // Skip calling ReadFromDisk in base class
        }
    }
}
