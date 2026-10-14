using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IAudioService
{
    /// <summary>
    /// Converts an audio file to MP3.
    /// </summary>
    /// <param name="inputPath">The path of the file to convert.</param>
    /// <param name="outputPath">The path to the output file. This must end in <c>.mp3</c>.</param>
    /// <returns>An asynchronous task.</returns>
    Task ConvertToMp3Async(string inputPath, string outputPath);

    /// <summary>
    /// Determines if a file is an MP# file by reading the header.
    /// </summary>
    /// <param name="path">The path to the MP3 file.</param>
    /// <returns><c>true</c> if the file is an MP3 file; otherwise, <c>false</c>.</returns>
    Task<bool> IsMp3FileAsync(string path);
}
