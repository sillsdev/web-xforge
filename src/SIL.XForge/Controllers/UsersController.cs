using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers
{
    [Authorize]
    [Route(XForgeConstants.CommandApiNamespace + "/" + RootDataTypes.Users)]
    [ApiController]
    public class UsersController : ControllerBase
    {
        private readonly IUserAccessor _userAccessor;
        private readonly IUserService _userService;

        public UsersController(IUserAccessor userAccessor, IUserService userService)
        {
            _userAccessor = userAccessor;
            _userService = userService;
        }

        [HttpPost("{id}/avatar")]
        [RequestSizeLimit(100_000_000)]
        public async Task<IActionResult> UploadAvatarAsync(string id, [FromForm] IFormFile file)
        {
            if (_userAccessor.Role == SystemRoles.User && id != _userAccessor.UserId)
                return Forbid();

            using (Stream stream = file.OpenReadStream())
            {
                Uri uri = await _userService.SaveAvatarAsync(id, file.FileName, stream);
                return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
            }
        }
    }
}
