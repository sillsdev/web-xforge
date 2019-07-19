namespace SIL.XForge.Models
{
    /// <summary>
    /// This model is used to store user data that we don't want to leak to the front-end. This is stored in a separate
    /// collection.
    /// </summary>
    public class UserSecret : IIdentifiable
    {
        public string Id { get; set; }

        public Tokens ParatextTokens { get; set; }
    }
}
