using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Controllers
{
    [AllowAnonymous]
    public class DefaultController : Controller
    {
        private readonly IOptions<AuthOptions> _authOptions;

        public DefaultController(IOptions<AuthOptions> authOptions)
        {
            _authOptions = authOptions;
        }

        public IActionResult Home()
        {
            return View();
        }

        public IActionResult Index()
        {
            return View();
        }

        public override void OnActionExecuting(ActionExecutingContext context)
        {
            ViewData["Domain"] = _authOptions.Value.Domain;
            ViewData["ClientId"] = _authOptions.Value.FrontendClientId;
        }
    }
}
