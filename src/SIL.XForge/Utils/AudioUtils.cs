using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

namespace SIL.XForge.Utils
{
    /// <summary>
    /// A utility class to convert audio files to mp3 format. This requires LAME mp3 encoder and ffmpeg installed
    /// on this machine.
    /// </summary>
    public static class AudioUtils
    {
        public static async Task<string> ConvertToMp3Async(string filePath, string ffmpegPath)
        {
            if (string.Equals(Path.GetExtension(filePath), ".mp3", StringComparison.InvariantCultureIgnoreCase))
                return filePath;
            string mp3FilePath = Path.ChangeExtension(filePath, ".mp3");
            if (File.Exists(mp3FilePath))
                File.Delete(mp3FilePath);
            var process = new Process()
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = ffmpegPath,
                    Arguments = $"-i \"{filePath}\" \"{mp3FilePath}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            process.Start();
            await process.WaitForExitAsync();
            if (process.ExitCode != 0)
                throw new Exception($"Error: Could not convert {filePath} to mp3");
            File.Delete(filePath);
            return mp3FilePath;
        }

        private static Task WaitForExitAsync(this Process process)
        {
            var tcs = new TaskCompletionSource<object>();
            process.EnableRaisingEvents = true;
            process.Exited += (sender, args) => tcs.TrySetResult(null);
            return tcs.Task;
        }
    }
}
