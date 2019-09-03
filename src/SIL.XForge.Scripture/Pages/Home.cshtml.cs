using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Pages
{
    public class HomepageModel : PageModel
    {
        private readonly IOptions<AuthOptions> _authOptions;

        public HomepageModel(IOptions<AuthOptions> authOptions)
        {
            _authOptions = authOptions;
        }

        public void OnGet()
        {
            ViewData["Domain"] = _authOptions.Value.Domain;
            ViewData["ClientId"] = _authOptions.Value.FrontendClientId;
            ViewData["Audience"] = _authOptions.Value.Audience;
            ViewData["Scope"] = _authOptions.Value.Scope;
        }
    }
}
