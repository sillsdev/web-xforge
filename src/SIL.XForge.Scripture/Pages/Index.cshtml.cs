using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Pages
{
    public class IndexModel : PageModel
    {
        [BindProperty]
        [Required(ErrorMessage = "Enter your name")]
        [RegularExpression(@"[A-Za-z0-9\s-']+", ErrorMessage = "Letters and numbers only")]
        public string Name { get; set; }
        [BindProperty]
        [Required(ErrorMessage = "Enter your email address")]
        [RegularExpression("^[a-zA-Z0-9.+_-]+@[a-zA-Z0-9.-]+[.]+[a-zA-Z]{2,}$", ErrorMessage = "Enter a valid email address")]
        public string Email { get; set; }
        [BindProperty]
        [Required(ErrorMessage = "Select your language project role")]
        public string Role { get; set; }
        [BindProperty]
        [Required(ErrorMessage = "Let us know why you want to use Scripture Forge")]
        public string Message { get; set; }

        private readonly IOptions<SiteOptions> _siteOptions;

        private readonly IEmailService _emailService; private readonly IOptions<AuthOptions> _authOptions;

        public IndexModel(IOptions<AuthOptions> authOptions, IOptions<SiteOptions> siteOptions, IEmailService emailService)
        {
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
            await _emailService.SendEmailAsync(email, "Register for SFv2 Beta", body);
            return RedirectToPage("/registerSuccess");
        }
    }
}
