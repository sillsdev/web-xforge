using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class CommentList : Json0Snapshot
    {
        public List<Comment> Comments { get; set; } = new List<Comment>();
    }
}
