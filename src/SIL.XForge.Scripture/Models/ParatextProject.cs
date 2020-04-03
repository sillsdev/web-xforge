using System.Text;

namespace SIL.XForge.Scripture.Models
{
    /// <summary>Description of a project on the Paratext server.</summary>
    public class ParatextProject
    {
        /// <summary> Id of PT project on Paratext servers. </summary>
        public string ParatextId { get; set; }
        public string Name { get; set; }
        public string ShortName { get; set; }
        public string LanguageTag { get; set; }
        /// <summary> Id of corresponding SF project. </summary>
        public string ProjectId { get; set; }
        /// <summary>
        /// If the requesting user has access to the PT project, but not yet to a corresponding SF project, and has
        /// permission to connect a SF project to the PT project. The SF project may or may not yet already exist.
        /// </summary>
        public bool IsConnectable { get; set; }
        /// <summary>
        /// If the requesting user has access to both the PT project and the corresponding SF project.
        /// </summary>
        public bool IsConnected { get; set; }

        /// <summary> Descriptive string of object's properties, for debugging. </summary>
        public override string ToString()
        {
            StringBuilder message = new StringBuilder();
            foreach (string item in new string[] { ParatextId, Name, ShortName, LanguageTag, ProjectId,
                IsConnectable.ToString(), IsConnected.ToString() })
            {
                message.Append(item);
                message.Append(',');
            }
            return message.ToString();
        }
    }
}
