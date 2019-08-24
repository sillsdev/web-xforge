using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Pages
{
    public class RegisterModel : PageModel
    {
        [BindProperty]
        [Required(ErrorMessage = "Name is required")]
        public string Name { get; set; }
        [BindProperty]
        [Required(ErrorMessage = "Email is required")]
        [EmailAddress]
        public string Email { get; set; }
        [BindProperty]
        public string Role { get; set; }
        [BindProperty]
        public string Message { get; set; }

        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IEmailService _emailService;

        public RegisterModel(IOptions<SiteOptions> siteOptions, IEmailService emailService)
        {
            _siteOptions = siteOptions;
            _emailService = emailService;
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
