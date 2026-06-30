using UnityEditor;
using Newtonsoft.Json.Linq;

namespace McpUnity.Tools
{
    /// <summary>
    /// FORK (unity-mcp-orchestrator, Phase 5b): report the editor's compile/update state so
    /// the orchestrator can wait for a domain reload to fully settle before attaching a
    /// freshly-compiled MonoBehaviour (the type isn't resolvable mid-reload).
    /// </summary>
    public class EditorStatusTool : McpToolBase
    {
        public EditorStatusTool()
        {
            Name = "editor_status";
            Description = "Reports whether the editor is currently compiling or updating (post-reload readiness)";
        }

        public override JObject Execute(JObject parameters)
        {
            return new JObject
            {
                ["success"] = true,
                ["type"] = "text",
                ["isCompiling"] = EditorApplication.isCompiling,
                ["isUpdating"] = EditorApplication.isUpdating,
                ["isPlaying"] = EditorApplication.isPlaying,
                ["ready"] = !EditorApplication.isCompiling && !EditorApplication.isUpdating
            };
        }
    }
}
