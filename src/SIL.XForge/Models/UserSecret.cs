namespace SIL.XForge.Models
{
    public class UserSecret : IEntity
    {
        public string Id { get; set; }

        public Tokens ParatextTokens { get; set; }
    }
}
