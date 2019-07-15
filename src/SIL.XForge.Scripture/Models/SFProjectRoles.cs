using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Models
{
    public class SFProjectRoles : ProjectRoles
    {
        public const string Administrator = "pt_administrator";
        public const string Translator = "pt_translator";
        public const string Consultant = "pt_consultant";
        public const string Observer = "pt_observer";
        public const string Read = "pt_read";
        public const string WriteNote = "pt_write_note";
        public const string SFReviewer = "sf_reviewer";

        public static SFProjectRoles Instance { get; } = new SFProjectRoles();

        private SFProjectRoles()
        {
            var observerRights = new HashSet<Right>
            {
                new Right(SFDomain.Texts, Operation.View),

                new Right(SFDomain.Questions, Operation.View),

                new Right(SFDomain.Answers, Operation.View),

                new Right(SFDomain.Comments, Operation.View),

                new Right(SFDomain.Likes, Operation.View),
            };
            Rights[Observer] = observerRights;

            var sfReviewerRights = new HashSet<Right>(observerRights)
            {
                new Right(SFDomain.Answers, Operation.Create),
                new Right(SFDomain.Answers, Operation.EditOwn),
                new Right(SFDomain.Answers, Operation.DeleteOwn),

                new Right(SFDomain.Comments, Operation.Create),
                new Right(SFDomain.Comments, Operation.EditOwn),
                new Right(SFDomain.Comments, Operation.DeleteOwn),

                new Right(SFDomain.Likes, Operation.Create),
                new Right(SFDomain.Likes, Operation.DeleteOwn)
            };
            Rights[SFReviewer] = sfReviewerRights;
            Rights[Consultant] = sfReviewerRights;

            var translatorRights = new HashSet<Right>(sfReviewerRights)
            {
                new Right(SFDomain.Texts, Operation.Edit)
            };
            Rights[Translator] = translatorRights;

            var administratorRights = new HashSet<Right>(translatorRights)
            {
                new Right(SFDomain.Questions, Operation.Create),
                new Right(SFDomain.Questions, Operation.Edit),
                new Right(SFDomain.Questions, Operation.Delete),

                new Right(SFDomain.Answers, Operation.Edit),
                new Right(SFDomain.Answers, Operation.Delete),

                new Right(SFDomain.Comments, Operation.Edit),
                new Right(SFDomain.Comments, Operation.Delete),

                new Right(SFDomain.Likes, Operation.Delete)
            };
            Rights[Administrator] = administratorRights;
        }
    }
}
