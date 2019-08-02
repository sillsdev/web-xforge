using System;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Realtime.Json0
{
    public static class Json0Extensions
    {
        public static async Task SubmitJson0OpAsync<T>(this IDocument<T> doc, Action<Json0OpBuilder<T>> build)
            where T : Json0Snapshot
        {
            if (!doc.IsLoaded)
                throw new InvalidOperationException("The document has not been loaded.");

            var builder = new Json0OpBuilder<T>(doc.Data);
            build(builder);
            if (builder.Op.Count > 0)
                await doc.SubmitOpAsync(builder.Op);
        }
    }
}
