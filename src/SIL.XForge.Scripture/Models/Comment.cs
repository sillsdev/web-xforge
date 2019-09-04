using System;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class Comment : IOwnedData
    {
        public string DataId { get; set; }
        public string OwnerRef { get; set; }
        public string SyncUserRef { get; set; }
        public string Text { get; set; }
        public DateTime DateModified { get; set; }
        public DateTime DateCreated { get; set; }
    }
}
