public class Notification
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Content { get; set; } = "";
    public NotificationType Type { get; set; }
    public NotificationScope Scope { get; set; }
    public string[]? PageIds { get; set; }
    public DateTime ExpirationDate { get; set; }
    public DateTime CreationDate { get; set; }
}

public enum NotificationType
{
    Obtrusive,
    Unobtrusive
}

public enum NotificationScope
{
    Global,
    Page
}
