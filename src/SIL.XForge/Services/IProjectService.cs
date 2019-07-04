using System;
using System.IO;
using System.Threading.Tasks;
using JsonApiDotNetCore.Services;
using SIL.XForge.Models;

namespace SIL.XForge.Services
{
    public interface IProjectService<T> : IResourceService<T, string> where T : ProjectResource
    {
        Task<Uri> SaveAudioAsync(string id, string name, Stream inputStream);
    }
}
