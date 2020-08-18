using System;

namespace PtdaSyncAll
{
    /// <summary>
    /// Simple logger functionality, that can be mocked.
    /// </summary>
    public class ProgramLogger : IProgramLogger
    {
        private readonly int _processId;
        public ProgramLogger(int processId)
        {
            _processId = processId;
        }
        /// <summary>
        /// Write message to standard output, prefixed by time and program name.
        /// </summary>
        public void Log(string message, bool finalNewline = true)
        {
            string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            string programName = "PtdaSyncAll";
            string output = $"{when} {programName}[{_processId}]: {message}";
            if (finalNewline)
            {
                Console.WriteLine(output);
            }
            else
            {
                Console.Write(output);
            }
        }
    }
}
