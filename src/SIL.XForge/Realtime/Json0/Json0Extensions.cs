using System;
using System.Threading.Tasks;

namespace SIL.XForge.Realtime.Json0
{
    public static class Json0Extensions
    {
        public static async Task SubmitJson0OpAsync<TData>(this IDocument<TData> doc,
            Action<Json0OpBuilder<TData>> build)
        {
            if (!doc.IsLoaded)
                throw new InvalidOperationException("The document has not been loaded.");

            var builder = new Json0OpBuilder<TData>(doc.Data);
            build(builder);
            if (builder.Op.Count > 0)
                await doc.SubmitOpAsync(builder.Op);
        }
    }
}
