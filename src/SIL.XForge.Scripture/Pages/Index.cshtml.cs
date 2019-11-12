using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Pages
{
    // see https://www.learnrazorpages.com/security/request-verification#opting-out
    [IgnoreAntiforgeryToken(Order = 1001)]
    public class IndexModel : PageModel
    {
        [BindProperty]
        [Required(ErrorMessage = SharedResource.Keys.NameMissing)]
        [RegularExpression(@"^ *[\S]+( +[\S]+)* *$", ErrorMessage = SharedResource.Keys.NameMissing)]
        public string Name { get; set; }
        [BindProperty]
        [Required(ErrorMessage = SharedResource.Keys.EmailMissing)]
        [RegularExpression("^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$", ErrorMessage = SharedResource.Keys.EmailBad)]
        public string Email { get; set; }
        [BindProperty]
        [Required(ErrorMessage = SharedResource.Keys.RoleMissing)]
        public string Role { get; set; }
        [BindProperty]
        [Required(ErrorMessage = SharedResource.Keys.MessageMissing)]
        public string Message { get; set; }

        private readonly IHostingEnvironment _env;
        private readonly IOptions<AuthOptions> _authOptions;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IEmailService _emailService;

        public IndexModel(IHostingEnvironment env, IOptions<AuthOptions> authOptions, IOptions<SiteOptions> siteOptions,
            IEmailService emailService)
        {
            _env = env;
            _authOptions = authOptions;
            _siteOptions = siteOptions;
            _emailService = emailService;
        }

        public void OnGet()
        {
            ViewData["Domain"] = _authOptions.Value.Domain;
            ViewData["ClientId"] = _authOptions.Value.FrontendClientId;
            ViewData["Audience"] = _authOptions.Value.Audience;
            ViewData["Scope"] = _authOptions.Value.Scope;
        }

        public async Task<IActionResult> OnPostAsync()
        {
            if (!ModelState.IsValid || string.IsNullOrWhiteSpace(Name) || string.IsNullOrWhiteSpace(Email))
            {
                return Page();
            }
            if (Message == null)
            {
                Message = "";
            }
            string body = $"Name: {Name.Trim()}\nEmail: {Email.Trim()}\nRole: {Role}\nMessage: {Message.Trim()}\n";
            string email = _siteOptions.Value.IssuesEmail;
            string subjectPrefix = "";
            if (_env.IsDevelopment())
                subjectPrefix = "Dev: ";
            else if (_env.IsStaging())
                subjectPrefix = "QA: ";
            else if (!_env.IsProduction())
                subjectPrefix = "Test: ";
            string subject = subjectPrefix + "Register for SFv2 Beta";
            await _emailService.SendEmailAsync(email, subject, body);
            return RedirectToPage("/registerSuccess");
        }
    }
}
