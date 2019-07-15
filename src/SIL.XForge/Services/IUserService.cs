using System;
using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Services
{
    public interface IUserService
    {
        Task<Uri> SaveAvatarAsync(string id, string name, Stream inputStream);
    }
}
