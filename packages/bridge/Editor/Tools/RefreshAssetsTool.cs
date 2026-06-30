using UnityEditor;
using Newtonsoft.Json.Linq;

namespace McpUnity.Tools
{
    /// <summary>
    /// FORK (unity-mcp-orchestrator, Phase 5a): import assets the orchestrator copied
    /// into the project on disk by refreshing the AssetDatabase. This is the Unity-side
    /// half of the hybrid import_assets (file IO happens in the Node orchestrator).
    /// </summary>
    public class RefreshAssetsTool : McpToolBase
    {
        public RefreshAssetsTool()
        {
            Name = "refresh_assets";
            Description = "Refreshes the AssetDatabase so files added on disk are imported by Unity";
        }

        public override JObject Execute(JObject parameters)
        {
            AssetDatabase.Refresh();
            return new JObject
            {
                ["success"] = true,
                ["type"] = "text",
                ["message"] = "AssetDatabase refreshed"
            };
        }
    }
}
