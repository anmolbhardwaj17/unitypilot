using System;
using UnityEngine;
using UnityEditor;
using Newtonsoft.Json.Linq;
using McpUnity.Unity;

namespace McpUnity.Tools
{
    /// <summary>
    /// FORK (unity-mcp-orchestrator, Phase 5a): create a primitive GameObject.
    /// Upstream has no primitive-creation tool, and execute_menu_item("GameObject/3D
    /// Object/Cube") blocks the main thread in batch mode (wedging the bridge), so we
    /// create primitives directly via GameObject.CreatePrimitive.
    /// </summary>
    public class CreatePrimitiveTool : McpToolBase
    {
        public CreatePrimitiveTool()
        {
            Name = "create_primitive";
            Description = "Creates a primitive GameObject (Cube, Sphere, Capsule, Cylinder, Plane, Quad) in the active scene";
        }

        public override JObject Execute(JObject parameters)
        {
            string type = parameters["primitiveType"]?.ToObject<string>()
                          ?? parameters["type"]?.ToObject<string>();
            string name = parameters["name"]?.ToObject<string>();

            if (string.IsNullOrEmpty(type))
            {
                return McpUnitySocketHandler.CreateErrorResponse(
                    "Required parameter 'primitiveType' not provided", "validation_error");
            }

            if (!Enum.TryParse<PrimitiveType>(type, true, out var primitive))
            {
                return McpUnitySocketHandler.CreateErrorResponse(
                    $"Invalid primitiveType '{type}'. Expected Cube, Sphere, Capsule, Cylinder, Plane, or Quad.",
                    "validation_error");
            }

            GameObject go = GameObject.CreatePrimitive(primitive);
            if (!string.IsNullOrEmpty(name)) go.name = name;
            Undo.RegisterCreatedObjectUndo(go, $"Create {primitive}");

            return new JObject
            {
                ["success"] = true,
                ["type"] = "text",
                ["message"] = $"Created {primitive} '{go.name}'",
                ["name"] = go.name,
                ["instanceId"] = go.GetInstanceID()
            };
        }
    }
}
