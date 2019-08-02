using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class QuestionList : Json0Snapshot
    {
        public List<Question> Questions { get; set; } = new List<Question>();
    }
}
