using System;
using System.IO;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;

namespace SIL.XForge.Services
{
    public class UserService : IUserService
    {
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;

        public UserService(IRealtimeService realtimeService, IOptions<SiteOptions> siteOptions)
        {
            _realtimeService = realtimeService;
            _siteOptions = siteOptions;
        }

        public async Task<Uri> SaveAvatarAsync(string id, string name, Stream inputStream)
        {
            string avatarsDir = Path.Combine(_siteOptions.Value.SharedDir, "avatars");
            if (!Directory.Exists(avatarsDir))
                Directory.CreateDirectory(avatarsDir);
            string fileName = id + Path.GetExtension(name);
            string path = Path.Combine(avatarsDir, fileName);
            using (var fileStream = new FileStream(path, FileMode.Create))
                await inputStream.CopyToAsync(fileStream);
            // add a timestamp to the query part of the URL, this forces the browser to NOT use the previously cached
            // image when a new avatar image is uploaded
            var uri = new Uri(_siteOptions.Value.Origin,
                $"/assets/avatars/{fileName}?t={DateTime.UtcNow.ToFileTime()}");
            using (IConnection conn = await _realtimeService.ConnectAsync())
            {
                IDocument<User> userDoc = conn.Get<User>(RootDataTypes.Users, id);
                await userDoc.FetchAsync();
                await userDoc.SubmitJson0OpAsync(op => op.Set(u => u.AvatarUrl, uri.PathAndQuery));
            }
            return uri;
        }
    }
}
