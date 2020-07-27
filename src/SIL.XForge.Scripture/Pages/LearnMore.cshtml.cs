using System.Reflection;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Localization;

namespace SIL.XForge.Scripture.Pages
{
    public class LearnMoreModel : PageModel
    {
        public IStringLocalizer Localizer { get; }

        public LearnMoreModel(IStringLocalizerFactory localizerFactory)
        {
            Localizer = localizerFactory.Create("Pages.LearnMore", Assembly.GetExecutingAssembly().GetName().Name);
        }
    }
}
