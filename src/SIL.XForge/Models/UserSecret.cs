namespace SIL.XForge.Models
{
    /// <summary>
    /// This model is used to store user data that we don't want to leak to the front-end. This is stored in a separate
    /// collection.
    /// </summary>
    public class UserSecret : IIdentifiable
    {
        /// <summary>
        /// SF user ID of the user that these secrets pertain to. (This is not a different set of IDs for
        /// specifically user secrets.)
        /// </summary>
        public string Id { get; set; }

        public Tokens ParatextTokens { get; set; }
    }
}
