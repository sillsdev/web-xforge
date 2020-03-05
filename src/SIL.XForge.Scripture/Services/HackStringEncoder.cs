using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Paratext.Data;
using Paratext.Data.Encodings;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>StringsEncoder class doesn't work on dotnet core because it assumes code page 1252 is available.
    /// On dotnet core, code page 1252 will never return from Encodings.GetEncodings(),
    /// but StringsEncoder assumes it does.</summary>
    public class HackStringEncoder : StringEncoder
    {
        public HackStringEncoder()
        {

        }

        public override string ShortName => "utf8";

        public override string LongName => "utf8";

        public override string Convert(byte[] data, out string errorMessage)
        {
            errorMessage = "";
            return Encoding.UTF8.GetString(data, 0, data.Length);
        }

        public override byte[] Convert(string text, out string errorMessage)
        {
            errorMessage = "";
            return Encoding.UTF8.GetBytes(text.ToArray(), 0, text.Length);
        }

        public override void InstallInProject(ScrText scrText)
        {

        }

        protected override bool Equals(StringEncoder other)
        {
            return other != null && other.LongName == this.LongName;
        }

        protected override bool Equals(int codePage)
        {
            return true;
        }
    }
}
