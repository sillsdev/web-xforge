using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IAudioService
{
    Task ConvertToMp3Async(string inputPath, string outputPath);
    Task<bool> IsMp3DataAsync(Stream stream);
}
